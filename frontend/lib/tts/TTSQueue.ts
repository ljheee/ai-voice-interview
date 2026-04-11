'use client'

import { getAudioContext, type SentenceHint } from './azureTTS'
import type { TTSProvider } from './TTSProvider'

interface TTSTask {
  text: string
  hint: SentenceHint
  audioPromise: Promise<AudioBuffer>
}

/**
 * TTS playback queue.
 * - Parallel prefetch: all TTS requests fire immediately on push()
 * - Sequential playback: awaits each task's audioPromise in order (no skipping)
 * - Fallback: if provider fails, degrades to SpeechSynthesis (never skips)
 *
 * Why no skipping: In an interview, skipping a sentence breaks semantic context.
 * The user must hear the complete question even if audio quality degrades.
 */
// How long to wait after queue drains before firing onIdle.
// Absorbs the gap between sentences in SpeechSynthesis so the PTT button
// doesn't flicker blue between every sentence.
const IDLE_DEBOUNCE_MS = 800  // system TTS inter-sentence gap can be 300-600ms

export class TTSQueue {
  private queue: TTSTask[] = []
  private playing = false
  private provider: TTSProvider | null
  private activeRequests = 0
  private requestQueue: (() => void)[] = []  // waiters for semaphore
  private idleCallback: (() => void) | null = null
  private idleTimer: ReturnType<typeof setTimeout> | null = null

  constructor(provider: TTSProvider | null) {
    this.provider = provider
  }

  /**
   * Register a callback that fires once when the queue drains to idle.
   * Replaces any previously registered callback.
   * Called at most once — clears itself after firing.
   */
  onIdle(cb: () => void): void {
    this.idleCallback = cb
    // Cancel any pending idle timer when a new callback is registered
    // (happens when a new sentence arrives mid-playback)
    if (this.idleTimer) {
      clearTimeout(this.idleTimer)
      this.idleTimer = null
    }
  }

  private acquireSlot(): Promise<void> {
    const max = this.provider?.maxConcurrent ?? Infinity
    if (this.activeRequests < max) {
      this.activeRequests++
      return Promise.resolve()
    }
    return new Promise((resolve) => {
      this.requestQueue.push(() => { this.activeRequests++; resolve() })
    })
  }

  private releaseSlot(): void {
    this.activeRequests--
    const next = this.requestQueue.shift()
    if (next) next()
  }

  /**
   * Push text to queue. Fires TTS request immediately (parallel prefetch).
   * Playback starts if queue was idle.
   */
  push(text: string, hint: SentenceHint = 'default'): void {
    if (!text.trim()) return
    const task: TTSTask = {
      text,
      hint,
      audioPromise: this._fetch(text, hint),
    }
    this.queue.push(task)
    // If idle debounce timer is pending, cancel it — we're not actually idle
    if (this.idleTimer) {
      clearTimeout(this.idleTimer)
      this.idleTimer = null
    }
    if (!this.playing) this._playNext()
  }

  /** Clear queue and stop current playback */
  clear(): void {
    this.queue = []
    this.requestQueue = []
    this.playing = false
    this.idleCallback = null
    if (this.idleTimer) { clearTimeout(this.idleTimer); this.idleTimer = null }
    if (typeof window !== 'undefined') {
      speechSynthesis.cancel()
    }
  }

  get isPlaying(): boolean {
    return this.playing
  }

  get hasProvider(): boolean {
    return this.provider !== null
  }

  private async _fetch(text: string, hint: SentenceHint): Promise<AudioBuffer> {
    if (!this.provider) return Promise.reject(new Error('no-provider'))
    await this.acquireSlot()
    try {
      return await this.provider.synthesize(text, hint)
    } finally {
      this.releaseSlot()
    }
  }

  private async _playNext(): Promise<void> {
    if (this.queue.length === 0) {
      this.playing = false
      // Debounce the idle callback — absorbs inter-sentence gaps in SpeechSynthesis
      // so the PTT button doesn't flicker between sentences.
      if (this.idleCallback) {
        const cb = this.idleCallback
        this.idleCallback = null
        this.idleTimer = setTimeout(() => {
          this.idleTimer = null
          cb()
        }, IDLE_DEBOUNCE_MS)
      }
      return
    }

    this.playing = true
    const task = this.queue.shift()!

    try {
      const audioBuffer = await task.audioPromise
      const audioContext = getAudioContext()

      // Resume context if suspended (browser autoplay policy)
      if (audioContext.state === 'suspended') {
        await audioContext.resume()
      }

      await new Promise<void>((resolve) => {
        const source = audioContext.createBufferSource()
        source.buffer = audioBuffer
        source.connect(audioContext.destination)
        source.onended = () => resolve()
        source.start()
      })
    } catch {
      // Provider failed — fallback to SpeechSynthesis, never skip
      await new Promise<void>((resolve) => {
        const utter = new SpeechSynthesisUtterance(task.text)
        utter.lang = 'zh-CN'
        utter.rate = task.hint === 'first' ? 0.8 : task.hint === 'question' ? 0.85 : 0.9
        utter.onend = () => resolve()
        utter.onerror = () => resolve()
        speechSynthesis.speak(utter)
      })
    }

    this._playNext()
  }
}
