'use client'

import { getAudioContext, type SentenceHint } from './azureTTS'
import type { TTSProvider } from './TTSProvider'

// Murf rate: -50 to +50 (0 = normal)
const RATE_MAP: Record<SentenceHint, number> = {
  first:    -10,
  question:   0,
  default:    0,
}

const TIMEOUT_MS = 8000   // 8s per attempt
const MAX_RETRIES = 1     // 1 retry on timeout, then fallback

/**
 * Murf TTS provider — calls murf.ai directly from the browser.
 * Murf supports CORS, so no backend proxy needed.
 * API key is stored in localStorage (same pattern as Azure).
 * Retry policy: timeout after 8s, retry once, then throw to trigger SpeechSynthesis fallback.
 */
export class MurfTTSProvider implements TTSProvider {
  readonly maxConcurrent = 5  // Murf free tier: 5 concurrent limit

  constructor(private apiKey: string) {}

  async synthesize(text: string, hint: SentenceHint): Promise<AudioBuffer> {
    if (!this.apiKey) throw new Error('no-murf-key')

    let lastErr: unknown
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        return await this._fetchOnce(text, hint)
      } catch (err) {
        lastErr = err
        // Don't retry auth/client errors — they won't recover
        if (err instanceof Response || (err instanceof Error && /40[134]/.test(err.message))) {
          break
        }
        // Timeout or network error: retry
      }
    }
    throw lastErr
  }

  private async _fetchOnce(text: string, hint: SentenceHint): Promise<AudioBuffer> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)

    try {
      const response = await fetch('https://kr.api.murf.ai/v1/speech/stream', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'api-key': this.apiKey,
        },
        body: JSON.stringify({
          voiceId: 'Tao',
          style: 'Conversational',
          text: text.trim(),
          rate: RATE_MAP[hint],
          locale: 'zh-CN',
          model: 'FALCON',
          format: 'MP3',
          sampleRate: 24000,
          channelType: 'MONO',
        }),
        signal: controller.signal,
      })

      if (!response.ok) {
        throw new Error(`Murf TTS failed: ${response.status} ${response.statusText}`)
      }

      const arrayBuffer = await response.arrayBuffer()
      const audioContext = getAudioContext()
      return audioContext.decodeAudioData(arrayBuffer)
    } finally {
      clearTimeout(timer)
    }
  }
}
