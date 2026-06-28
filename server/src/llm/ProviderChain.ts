import OpenAI from 'openai'
import { loadProviderConfigs } from './types'

const HEDGE_DELAY    = 15_000  // fire backup request after 15s of no first chunk
const REQUEST_TIMEOUT = 30_000  // hard timeout per individual request (streaming)
const REPORT_TIMEOUT  = 120_000 // longer timeout for report generation (non-streaming, complex prompt)

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

// ─── Hedged streaming race ────────────────────────────────────────────────────
//
// Strategy: start primary request immediately. If no first chunk arrives within
// HEDGE_DELAY ms, fire a backup request to the next provider in parallel.
// Whichever stream yields its first chunk first "wins" — the other is aborted.
// This halves perceived latency on slow providers without waiting for full timeout.

interface StreamCandidate {
  name: string
  client: OpenAI
  model: string
  messages: OpenAI.Chat.ChatCompletionMessageParam[]
  abortController: AbortController
}

async function* raceStreams(
  candidates: StreamCandidate[]
): AsyncGenerator<string> {
  if (candidates.length === 0) throw new Error('No candidates')

  // Each candidate gets a channel: an async queue of chunks + done/error signals
  type Msg = { chunk: string } | { done: true } | { error: unknown }
  const channels: Array<{ queue: Msg[]; resolve: (() => void) | null }> = []

  function makeChannel(idx: number) {
    const ch = { queue: [] as Msg[], resolve: null as (() => void) | null }
    channels[idx] = ch

    const candidate = candidates[idx]
    ;(async () => {
      try {
        const stream = await candidate.client.chat.completions.create(
          {
            model: candidate.model,
            stream: true,
            messages: candidate.messages,
          },
          { signal: candidate.abortController.signal }
        )
        console.log(`[LLM] hedged: provider "${candidate.name}" stream started`)
        for await (const chunk of stream) {
          if (candidate.abortController.signal.aborted) break
          const text = chunk.choices[0]?.delta?.content ?? ''
          if (text) {
            ch.queue.push({ chunk: text })
            ch.resolve?.()
          }
        }
        ch.queue.push({ done: true })
        ch.resolve?.()
      } catch (err) {
        if (!candidate.abortController.signal.aborted) {
          ch.queue.push({ error: err })
          ch.resolve?.()
        }
      }
    })()

    return ch
  }

  // Start primary immediately
  makeChannel(0)

  let hedgeTimer: ReturnType<typeof setTimeout> | null = null
  let hedgeFired = false
  let winnerIdx = -1

  // Wait for next message from any active channel
  async function nextMsg(): Promise<{ idx: number; msg: Msg }> {
    return new Promise((resolve) => {
      function check() {
        for (let i = 0; i < channels.length; i++) {
          if (channels[i]?.queue.length) {
            const msg = channels[i].queue.shift()!
            resolve({ idx: i, msg })
            return
          }
        }
        // Nothing ready — register resolvers on all active channels
        for (let i = 0; i < channels.length; i++) {
          if (channels[i]) {
            channels[i].resolve = () => { channels[i].resolve = null; check() }
          }
        }
      }
      check()
    })
  }

  try {
    while (true) {
      // Fire hedge if primary hasn't responded yet
      if (!hedgeFired && winnerIdx === -1 && candidates.length > 1) {
        if (!hedgeTimer) {
          hedgeTimer = setTimeout(() => {
            if (winnerIdx === -1) {
              console.log(`[LLM] hedged: no first chunk after ${HEDGE_DELAY}ms, firing backup`)
              hedgeFired = true
              makeChannel(1)
            }
          }, HEDGE_DELAY)
        }
      }

      const { idx, msg } = await nextMsg()

      if ('error' in msg) {
        console.warn(`[LLM] hedged: provider "${candidates[idx].name}" errored:`, msg.error)
        // If this was the winner, we have a problem — propagate
        if (winnerIdx === idx) throw msg.error
        // Otherwise just ignore — other stream may still win
        delete (channels as Record<number, unknown>)[idx]
        if (Object.keys(channels).length === 0) throw msg.error
        continue
      }

      if ('done' in msg) {
        if (winnerIdx === idx) {
          // Winner finished cleanly
          break
        }
        // Non-winner finished (shouldn't happen if aborted, but handle gracefully)
        delete (channels as Record<number, unknown>)[idx]
        continue
      }

      // Got a real chunk
      if (winnerIdx === -1) {
        // First chunk ever — this stream wins
        winnerIdx = idx
        if (hedgeTimer) { clearTimeout(hedgeTimer); hedgeTimer = null }
        console.log(`[LLM] hedged: provider "${candidates[idx].name}" won the race`)
        // Abort all other candidates
        for (let i = 0; i < candidates.length; i++) {
          if (i !== idx) {
            candidates[i].abortController.abort()
            delete (channels as Record<number, unknown>)[i]
          }
        }
      }

      if (idx === winnerIdx) {
        yield msg.chunk
      }
      // Chunks from non-winner after abort — discard
    }
  } finally {
    if (hedgeTimer) clearTimeout(hedgeTimer)
    // Abort any still-running streams
    for (const c of candidates) c.abortController.abort()
  }
}

// ─── ProviderChain ────────────────────────────────────────────────────────────

export class ProviderChain {
  private configs = loadProviderConfigs()

  async *streamResponse(systemPrompt: string, userText: string): AsyncGenerator<string> {
    if (this.configs.length === 0) throw new Error('No LLM providers configured')

    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user',   content: userText },
    ]

    // Build candidates: primary = configs[0], hedge = configs[1] (if exists)
    // If only one provider, hedge fires the same provider again (self-hedge)
    const hedgeConfig = this.configs[1] ?? this.configs[0]
    const candidates: StreamCandidate[] = [
      {
        name: this.configs[0].name,
        client: new OpenAI({
          apiKey: this.configs[0].apiKey,
          baseURL: this.configs[0].baseUrl,
          timeout: REQUEST_TIMEOUT,
          ...(this.configs[0].userAgent ? { defaultHeaders: { 'User-Agent': this.configs[0].userAgent } } : {}),
        }),
        model: this.configs[0].model,
        messages,
        abortController: new AbortController(),
      },
      {
        name: hedgeConfig.name,
        client: new OpenAI({
          apiKey: hedgeConfig.apiKey,
          baseURL: hedgeConfig.baseUrl,
          timeout: REQUEST_TIMEOUT,
          ...(hedgeConfig.userAgent ? { defaultHeaders: { 'User-Agent': hedgeConfig.userAgent } } : {}),
        }),
        model: hedgeConfig.model,
        messages,
        abortController: new AbortController(),
      },
    ]

    let lastErr: unknown
    try {
      yield* raceStreams(candidates)
      return
    } catch (err) {
      lastErr = err
      console.error('[LLM] hedged race failed, trying remaining providers:', err)
    }

    // Fallback: try any remaining providers sequentially
    for (const cfg of this.configs.slice(2)) {
      try {
        const client = new OpenAI({
          apiKey: cfg.apiKey,
          baseURL: cfg.baseUrl,
          timeout: REQUEST_TIMEOUT,
          ...(cfg.userAgent ? { defaultHeaders: { 'User-Agent': cfg.userAgent } } : {}),
        })
        console.log(`[LLM] fallback: trying provider "${cfg.name}"`)
        const stream = await client.chat.completions.create({ model: cfg.model, stream: true, messages })
        for await (const chunk of stream) {
          const text = chunk.choices[0]?.delta?.content ?? ''
          if (text) yield text
        }
        return
      } catch (err) {
        console.error(`[LLM] fallback provider "${cfg.name}" failed:`, err)
        lastErr = err
      }
    }

    throw lastErr ?? new Error('All LLM providers failed')
  }

  async generateContent(
    systemPrompt: string,
    userPrompt: string,
    options?: { timeout?: number; maxTokens?: number }
  ): Promise<string> {
    const timeout = options?.timeout ?? REPORT_TIMEOUT
    let lastErr: unknown
    for (const cfg of this.configs) {
      try {
        const client = new OpenAI({
          apiKey: cfg.apiKey,
          baseURL: cfg.baseUrl,
          timeout,
          ...(cfg.userAgent ? { defaultHeaders: { 'User-Agent': cfg.userAgent } } : {}),
        })
        const response = await client.chat.completions.create({
          model: cfg.model,
          stream: false,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user',   content: userPrompt },
          ],
          max_tokens: options?.maxTokens,
        })
        return response.choices[0]?.message?.content?.trim() ?? ''
      } catch (err) {
        console.error(`[LLM] provider "${cfg.name}" failed, trying next:`, err)
        lastErr = err
      }
    }
    throw lastErr ?? new Error('All LLM providers failed')
  }
}
