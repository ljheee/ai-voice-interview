/**
 * STT (Speech-to-Text) provider interface.
 * Implementations: WebSpeechSTT (Chrome only, online), WhisperONNXSTT (all browsers, offline).
 */
export interface STTProvider {
  /** Start recording/recognition */
  start(): void
  /** Stop recording/recognition */
  stop(): void
  /** Register event handler */
  on(event: 'interim' | 'final' | 'thinking' | 'error', handler: (text: string) => void): void
  /** Unregister event handler */
  off(event: 'interim' | 'final' | 'thinking' | 'error', handler: (text: string) => void): void
}
