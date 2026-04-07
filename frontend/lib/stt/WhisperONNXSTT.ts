'use client'

import type { STTProvider } from './STTProvider'

type STTEvent = 'interim' | 'final' | 'thinking'

const SAMPLE_RATE = 16000
const CHUNK_SECONDS = 1.5
const CHUNK_SAMPLES = SAMPLE_RATE * CHUNK_SECONDS  // 24000 samples per chunk

/**
 * STT via ONNX Whisper running locally in the browser.
 *
 * Architecture:
 * - AudioWorkletNode captures raw PCM Float32 on the audio thread
 * - Whisper inference runs in a dedicated Web Worker (never blocks main thread)
 * - interim: transcribes the latest 1.5s chunk every CHUNK_SECONDS
 * - final: stop() returns immediately; worker finishes last chunk async,
 *          then emits 'final' — UI is never blocked
 *
 * Worker readiness: if the model is still loading when stop() is called,
 * _emitFinalAsync waits for workerReady before sending the PCM.
 */
export class WhisperONNXSTT implements STTProvider {
  private handlers = new Map<STTEvent, Set<(text: string) => void>>([
    ['interim', new Set<(text: string) => void>()],
    ['final', new Set<(text: string) => void>()],
    ['thinking', new Set<(text: string) => void>()],
  ])

  private worker: Worker | null = null
  private workerReady = false
  private pendingResolvers = new Map<string, (text: string) => void>()
  private reqCounter = 0

  private isRunning = false
  private accumulatedText = ''
  private inferring = false
  private sessionId = 0   // incremented on each start(); _emitFinalAsync checks it

  // Audio capture
  private audioContext: AudioContext | null = null
  private workletRegistered = false          // addModule only once per AudioContext
  private sourceNode: MediaStreamAudioSourceNode | null = null
  private workletNode: AudioWorkletNode | null = null
  private stream: MediaStream | null = null

  // PCM buffer for chunks not yet sent to worker
  private pendingChunks: Float32Array[] = []
  private interimTimer: ReturnType<typeof setInterval> | null = null

  // ── Worker lifecycle ────────────────────────────────────────────────────────

  private _ensureWorker(): Worker {
    if (this.worker) return this.worker

    const w = new Worker(new URL('./whisper-worker.ts', import.meta.url), { type: 'module' })

    w.onmessage = (e) => {
      const msg = e.data as
        | { type: 'ready' }
        | { type: 'result'; id: string; text: string }
        | { type: 'error'; id: string; message: string }

      if (msg.type === 'ready') {
        this.workerReady = true
        return
      }
      if (msg.type === 'result' || msg.type === 'error') {
        const resolve = this.pendingResolvers.get(msg.id)
        if (resolve) {
          this.pendingResolvers.delete(msg.id)
          resolve(msg.type === 'result' ? msg.text : '')
        }
      }
    }

    w.onerror = (e) => console.error('WhisperWorker error:', e)

    const modelServerOrigin = process.env.NEXT_PUBLIC_MODEL_SERVER ?? 'http://localhost:3001'
    w.postMessage({ type: 'load', modelServerOrigin })

    this.worker = w
    return w
  }

  /** Preload model — call once on app init to warm up the worker */
  async preload(): Promise<void> {
    this._ensureWorker()
    await this._waitWorkerReady()
  }

  private _waitWorkerReady(): Promise<void> {
    if (this.workerReady) return Promise.resolve()
    return new Promise<void>((resolve) => {
      const check = setInterval(() => {
        if (this.workerReady) { clearInterval(check); resolve() }
      }, 100)
    })
  }

  // ── Inference via worker ────────────────────────────────────────────────────

  /**
   * Send PCM to worker for transcription.
   * If worker is not ready yet, waits up to 30s before giving up.
   */
  private async _transcribePCM(float32: Float32Array): Promise<string> {
    if (float32.length < 1600) return ''  // < 0.1s, skip

    // Wait for worker to be ready (model loading on first use)
    if (!this.workerReady) {
      const timeout = 30_000
      const start = Date.now()
      while (!this.workerReady) {
        if (Date.now() - start > timeout) {
          console.warn('WhisperONNXSTT: worker not ready after 30s, dropping chunk')
          return ''
        }
        await new Promise((r) => setTimeout(r, 100))
      }
    }

    if (!this.worker) return ''

    const id = String(++this.reqCounter)
    return new Promise<string>((resolve) => {
      this.pendingResolvers.set(id, resolve)
      // Transfer buffer ownership to worker (zero-copy)
      this.worker!.postMessage({ type: 'transcribe', id, pcm: float32 }, [float32.buffer])
    })
  }

  // ── STTProvider interface ───────────────────────────────────────────────────

  start(): void {
    if (this.isRunning) return
    this._ensureWorker()
    this.isRunning = true
    this.sessionId++
    this.accumulatedText = ''
    this.pendingChunks = []
    this.inferring = false
    this._startCapture()
  }

  stop(): void {
    if (!this.isRunning) return
    this.isRunning = false

    if (this.interimTimer) {
      clearInterval(this.interimTimer)
      this.interimTimer = null
    }

    // Disconnect audio graph immediately — mic released, UI can update
    this.workletNode?.disconnect()
    this.sourceNode?.disconnect()
    this.stream?.getTracks().forEach((t) => t.stop())
    this.workletNode = null
    this.sourceNode = null
    this.stream = null

    // Snapshot state before clearing
    const accumulated = this.accumulatedText
    const remaining = this.pendingChunks.splice(0)
    this.accumulatedText = ''
    this.pendingChunks = []

    // Emit final asynchronously — worker does the last inference off main thread.
    // stop() returns immediately so the UI (button, cursor) updates right away.
    this._emitFinalAsync(accumulated, remaining, this.sessionId)
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

  // ── Final emission (async, off main thread) ─────────────────────────────────

  private async _emitFinalAsync(accumulated: string, remaining: Float32Array[], sid: number): Promise<void> {
    // Yield to event loop — lets React flush setPressed(false) before
    // the worker result triggers another state update
    await new Promise((r) => setTimeout(r, 0))

    // Signal that async inference is in progress — page.tsx uses this to
    // keep vadStatus='processing' and reset the fallback timer
    this.emit('thinking', '')

    // Wait for any in-flight interim inference to finish
    while (this.inferring) {
      await new Promise((r) => setTimeout(r, 30))
    }

    // Transcribe remaining audio (the tail chunk not covered by interim)
    let tailText = ''
    if (remaining.length > 0) {
      const pcm = this._concat(remaining)
      tailText = await this._transcribePCM(pcm)  // waits for worker if not ready
    }

    // If start() was called again while we were waiting, this result is stale — discard
    if (sid !== this.sessionId) return

    const full = [accumulated, tailText].filter(Boolean).join('')
    if (full.trim()) {
      this.emit('final', full.trim())
    }
    // If still empty (silence / very short utterance), page's 2s fallback resets vadStatus
  }

  // ── Audio capture ───────────────────────────────────────────────────────────

  private async _startCapture(): Promise<void> {
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: true })

      // Reuse AudioContext across sessions to avoid repeated creation overhead
      if (!this.audioContext || this.audioContext.state === 'closed') {
        this.audioContext = new AudioContext({ sampleRate: SAMPLE_RATE })
        this.workletRegistered = false  // new context needs fresh registration
      } else if (this.audioContext.state === 'suspended') {
        await this.audioContext.resume()
      }

      // addModule only once per AudioContext instance
      if (!this.workletRegistered) {
        await this.audioContext.audioWorklet.addModule('/pcm-processor.js')
        this.workletRegistered = true
      }

      this.workletNode = new AudioWorkletNode(this.audioContext, 'pcm-processor', {
        processorOptions: { chunkSize: CHUNK_SAMPLES },
      })

      this.workletNode.port.onmessage = (e) => {
        if (!this.isRunning) return
        if (e.data?.type === 'chunk') {
          this.pendingChunks.push(e.data.chunk as Float32Array)
        }
      }

      this.sourceNode = this.audioContext.createMediaStreamSource(this.stream)
      this.sourceNode.connect(this.workletNode)

      // Interim: every 1.5s, send latest chunks to worker
      this.interimTimer = setInterval(async () => {
        if (this.pendingChunks.length === 0 || this.inferring || !this.isRunning) return
        this.inferring = true
        const chunks = this.pendingChunks.splice(0)
        const pcm = this._concat(chunks)
        const text = await this._transcribePCM(pcm)
        this.inferring = false
        if (text && this.isRunning) {
          this.accumulatedText += text
          this.emit('interim', this.accumulatedText)
        }
      }, CHUNK_SECONDS * 1000)

    } catch (err) {
      console.error('WhisperONNXSTT: failed to start capture', err)
    }
  }

  private _concat(arrays: Float32Array[]): Float32Array {
    const total = arrays.reduce((n, a) => n + a.length, 0)
    const result = new Float32Array(total)
    let offset = 0
    for (const a of arrays) {
      result.set(a, offset)
      offset += a.length
    }
    return result
  }
}
