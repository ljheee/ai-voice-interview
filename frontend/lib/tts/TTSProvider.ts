'use client'

import type { SentenceHint } from './azureTTS'

/**
 * Strategy interface for TTS providers.
 * Each provider fetches audio for a text+hint and returns a decoded AudioBuffer.
 * Throws on failure — TTSQueue handles fallback to SpeechSynthesis.
 */
export interface TTSProvider {
  synthesize(text: string, hint: SentenceHint): Promise<AudioBuffer>
  /** Max concurrent requests to this provider (default: unlimited) */
  maxConcurrent?: number
}
