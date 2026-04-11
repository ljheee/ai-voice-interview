'use client'

import { getAudioContext, type SentenceHint } from './azureTTS'
import type { TTSProvider } from './TTSProvider'

interface TTSTask {
  text: string
  hint: SentenceHint
  // Resolves to AudioBuffer if provider succeeded, null if no provider or fetch failed.
  // Never rejects — errors are swallowed here and handled as null in _playNext.
  audioPromise: Promise<AudioBuffer | null>
}

/**
 * TTS playback queue.
 * - Parallel prefetch: all TTS requests fire immediately on push()
 * - Sequential playback: awaits each task's audioPromise in order (no skipping)
 * - Fallback: if provider fails or is absent, degrades to SpeechSynthesis (never skips)
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
    // If the idle debounce timer is already running (queue drained, waiting to fire),
    // do NOT cancel it — just update the callback so the timer fires the new one.
    // Only cancel the timer if new audio is being pushed (handled in push()).
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

    // audioPromise always resolves (never rejects) — null means "use SpeechSynthesis fallback"
    const audioPromise: Promise<AudioBuffer | null> = this.provider
      ? this._fetch(text, hint)
      : Promise.resolve(null)

    const task: TTSTask = { text, hint, audioPromise }
    this.queue.push(task)
    // If idle debounce timer is pending, cancel it — we're not actually idle
    if (this.idleTimer) {
      clearTimeout(this.idleTimer)
      this.idleTimer = null
    }
    if (!this.playing) {
      this.playing = true  // set before async _playNext to prevent concurrent calls
      this._playNext()
    }
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

  /** True if playing or has items queued (i.e. audio is not yet fully done) */
  get isActive(): boolean {
    return this.playing || this.queue.length > 0
  }

  get hasProvider(): boolean {
    return this.provider !== null
  }

  // Returns null on failure instead of rejecting — callers treat null as "use fallback"
  private async _fetch(text: string, hint: SentenceHint): Promise<AudioBuffer | null> {
    if (!this.provider) return null
    await this.acquireSlot()
    try {
      return await this.provider.synthesize(text, hint)
    } catch {
      return null
    } finally {
      this.releaseSlot()
    }
  }

  private async _playNext(): Promise<void> {
    // Single loop — never recurse, never call _playNext() from within _playNext().
    // playing=true is set by push() before calling us, so no concurrent entry possible.
    while (this.queue.length > 0) {
      const task = this.queue.shift()!
      const audioBuffer = await task.audioPromise  // always resolves, never rejects

      if (audioBuffer) {
        // Provider succeeded — play via AudioContext
        try {
          const audioContext = getAudioContext()
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
          // AudioContext playback failed — fall through to SpeechSynthesis below
          await this._speakFallback(task)
        }
      } else {
        // No provider or fetch failed — use SpeechSynthesis
        await this._speakFallback(task)
      }
    }

    // Queue drained
    this.playing = false
    if (this.idleCallback) {
      const cb = this.idleCallback
      this.idleCallback = null
      this.idleTimer = setTimeout(() => {
        this.idleTimer = null
        cb()
      }, IDLE_DEBOUNCE_MS)
    }
  }

  private _speakFallback(task: TTSTask): Promise<void> {
    return new Promise<void>((resolve) => {
      const utter = new SpeechSynthesisUtterance(task.text)
      utter.lang = 'zh-CN'
      utter.rate = task.hint === 'first' ? 0.8 : task.hint === 'question' ? 0.85 : 0.9
      // Safety timeout: estimate ~300ms per Chinese character, min 2s, max 15s.
      const timeoutMs = Math.min(15000, Math.max(2000, task.text.length * 300))
      const timer = setTimeout(resolve, timeoutMs)
      utter.onend = () => { clearTimeout(timer); resolve() }
      utter.onerror = () => { clearTimeout(timer); resolve() }
      speechSynthesis.speak(utter)
    })
  }
}
