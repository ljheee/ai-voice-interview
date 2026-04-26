'use client'

import { getAudioContext, type SentenceHint } from './azureTTS'
import type { TTSProvider } from './TTSProvider'

const SYNTH_TIMEOUT_MS = 30000

/**
 * Doubao TTS provider — connects to local server proxy at /tts/doubao,
 * which authenticates via doubao.com cookie (same as DoubaoSTT) and bridges
 * to wss://ws-samantha.doubao.com/samantha/audio/tts.
 *
 * Server streams back AAC frames per sentence; we accumulate all frames until
 * the upstream closes (code 1000), then decode the concatenated AAC blob.
 */
export class DoubaoTTSProvider implements TTSProvider {
  readonly maxConcurrent = 3

  constructor(
    private cookie: string,
    private serverUrl = 'ws://localhost:3001',
    private speaker = 'zh_female_taozi_conversation_v4_wvae_bigtts',
  ) {}

  synthesize(text: string, _hint: SentenceHint): Promise<AudioBuffer> {
    if (!this.cookie) return Promise.reject(new Error('no-doubao-cookie'))
    return openSession(this.cookie, this.speaker, this.serverUrl, text)
  }
}

function openSession(
  cookie: string,
  speaker: string,
  serverUrl: string,
  text: string,
): Promise<AudioBuffer> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`${serverUrl}/tts/doubao`)
    ws.binaryType = 'arraybuffer'

    const chunks: ArrayBuffer[] = []
    let upstreamOpened = false
    let settled = false

    const finish = (err: Error | null) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      try { ws.close() } catch {}
      if (err) return reject(err)
      if (chunks.length === 0) return reject(new Error('doubao-tts-no-audio'))
      const blob = new Blob(chunks.map((b) => new Uint8Array(b)), { type: 'audio/aac' })
      blob.arrayBuffer()
        .then((buf) => getAudioContext().decodeAudioData(buf))
        .then(resolve, reject)
    }

    const timer = setTimeout(() => finish(new Error('doubao-tts-timeout')), SYNTH_TIMEOUT_MS)

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: 'auth', cookie, speaker }))
    }

    ws.onmessage = (e) => {
      if (typeof e.data !== 'string') {
        chunks.push(e.data as ArrayBuffer)
        return
      }
      let payload: { event?: string; code?: number; message?: string }
      try { payload = JSON.parse(e.data) } catch { return }

      if (payload.event === 'open' && !upstreamOpened) {
        upstreamOpened = true
        ws.send(JSON.stringify({ event: 'text', text }))
        ws.send(JSON.stringify({ event: 'finish' }))
        return
      }
      if (payload.event === 'error') {
        finish(new Error(`doubao-tts: ${payload.message || 'upstream error'}`))
        return
      }
      if (typeof payload.code === 'number' && payload.code !== 0) {
        finish(new Error(`doubao-tts code=${payload.code} ${payload.message || ''}`))
      }
    }

    ws.onerror = () => finish(new Error('doubao-tts-ws-error'))

    ws.onclose = (ev) => {
      if (ev.code === 1000) finish(null)
      else finish(new Error(`doubao-tts-closed-${ev.code}`))
    }
  })
}
