'use client'

import type { STTProvider } from './STTProvider'

type STTEvent = 'interim' | 'final' | 'thinking'

// Web Speech API types not fully in standard TS DOM lib
interface ISpeechRecognitionResult {
  readonly isFinal: boolean
  readonly length: number
  [index: number]: { transcript: string }
}

interface ISpeechRecognitionEvent {
  readonly resultIndex: number
  readonly results: { length: number; [index: number]: ISpeechRecognitionResult }
}

interface ISpeechRecognition extends EventTarget {
  lang: string
  interimResults: boolean
  continuous: boolean
  maxAlternatives: number
  start(): void
  stop(): void
  abort(): void
  onresult: ((event: ISpeechRecognitionEvent) => void) | null
  onerror: ((event: { error: string }) => void) | null
  onend: (() => void) | null
}

declare global {
  interface Window {
    SpeechRecognition?: new () => ISpeechRecognition
    webkitSpeechRecognition?: new () => ISpeechRecognition
  }
}

/**
 * STT via webkitSpeechRecognition (Chrome only).
 *
 * Key design: each start() creates a FRESH SpeechRecognition instance.
 * stop() calls abort() immediately — no waiting for the browser to fire
 * a final result (which can take 10-20s in continuous mode).
 * Instead, the last accumulated interim transcript is promoted to final.
 *
 * This gives sub-100ms response on release vs the default 10-20s delay.
 */
export class WebSpeechSTT implements STTProvider {
  private handlers = new Map<STTEvent, Set<(text: string) => void>>([
    ['interim', new Set<(text: string) => void>()],
    ['final', new Set<(text: string) => void>()],
    ['thinking', new Set<(text: string) => void>()],
  ])

  // Accumulates interim text during a single start/stop session
  private lastInterim = ''
  // Accumulates native finals fired by WebSpeech during continuous mode
  // (browser auto-finalizes on silence; we collect them so nothing is lost on PTT release)
  private accumulatedFinal = ''
  private recognition: ISpeechRecognition | null = null

  private get SpeechRecognitionCtor() {
    if (typeof window === 'undefined') return null
    return window.SpeechRecognition ?? window.webkitSpeechRecognition ?? null
  }

  start(): void {
    const Ctor = this.SpeechRecognitionCtor
    if (!Ctor) {
      console.warn('WebSpeechSTT: SpeechRecognition not supported')
      return
    }

    // Always create a fresh instance — avoids state leakage between sessions
    this.lastInterim = ''
    this.accumulatedFinal = ''
    const rec = new Ctor()
    rec.lang = 'zh-CN'
    rec.interimResults = true
    rec.continuous = true
    rec.maxAlternatives = 1

    rec.onresult = (event: ISpeechRecognitionEvent) => {
      let interim = ''
      let final = ''

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const t = event.results[i][0].transcript
        if (event.results[i].isFinal) {
          final += t
        } else {
          interim += t
        }
      }

      if (interim) {
        this.lastInterim = interim
        this.emit('interim', interim)
      }
      // Browser fired a native final (silence detected in continuous mode).
      // Accumulate it — do NOT emit yet. The full transcript will be emitted
      // in onend (after PTT release / abort), combining all accumulated finals
      // with any trailing interim.
      if (final) {
        this.accumulatedFinal += (this.accumulatedFinal ? ' ' : '') + final
        this.lastInterim = ''
      }
    }

    rec.onerror = (event) => {
      // 'no-speech' and 'aborted' are expected — not real errors
      if (event.error !== 'no-speech' && event.error !== 'aborted') {
        console.error('WebSpeechSTT error:', event.error)
      }
    }

    rec.onend = () => {
      // Called after abort() — combine any accumulated native finals with
      // the last interim to produce the complete transcript
      const combined = (this.accumulatedFinal + ' ' + this.lastInterim).trim()
      this.accumulatedFinal = ''
      this.lastInterim = ''
      if (combined) {
        this.emit('final', combined)
      }
    }

    this.recognition = rec
    rec.start()
  }

  stop(): void {
    if (!this.recognition) return
    const rec = this.recognition
    this.recognition = null
    // abort() terminates immediately; onend fires synchronously (or in next microtask)
    // which promotes lastInterim → final
    rec.abort()
  }

  on(event: STTEvent, handler: (text: string) => void): void {
    this.handlers.get(event)?.add(handler)
  }

  off(event: STTEvent, handler: (text: string) => void): void {
    this.handlers.get(event)?.delete(handler)
  }

  private emit(event: STTEvent, text: string): void {
    this.handlers.get(event)?.forEach((h) => h(text))
  }

  static isSupported(): boolean {
    if (typeof window === 'undefined') return false
    return !!(window.SpeechRecognition ?? window.webkitSpeechRecognition)
  }
}
