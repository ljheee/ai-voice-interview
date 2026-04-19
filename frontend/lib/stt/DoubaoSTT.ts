'use client'

import type { STTProvider } from './STTProvider'

type STTEvent = 'interim' | 'final' | 'thinking' | 'error'

export class DoubaoSTT implements STTProvider {
  private cookie: string
  private wsUrl: string
  private ws: WebSocket | null = null
  private audioCtx: AudioContext | null = null
  private processor: ScriptProcessorNode | null = null
  private mediaStream: MediaStream | null = null
  private handlers = new Map<STTEvent, Set<(text: string) => void>>([
    ['interim', new Set<(text: string) => void>()],
    ['final', new Set<(text: string) => void>()],
    ['thinking', new Set<(text: string) => void>()],
    ['error', new Set<(text: string) => void>()],
  ])
  private lastText = ''

  constructor(cookie: string, serverUrl = 'ws://localhost:3001') {
    this.cookie = cookie
    this.wsUrl = `${serverUrl}/asr/doubao`
  }

  on(event: STTEvent, handler: (text: string) => void) {
    this.handlers.get(event)?.add(handler)
  }

  off(event: STTEvent, handler: (text: string) => void) {
    this.handlers.get(event)?.delete(handler)
  }

  private emit(event: STTEvent, text: string) {
    this.handlers.get(event)?.forEach((h) => h(text))
  }

  start() {
    if (this.ws) return
    this.lastText = ''

    this.ws = new WebSocket(this.wsUrl)
    const ws = this.ws

    ws.onopen = async () => {
      // Send cookie as first control message before any PCM data
      ws.send(JSON.stringify({ type: 'auth', cookie: this.cookie }))

      try {
        this.mediaStream = await navigator.mediaDevices.getUserMedia({
          audio: { sampleRate: 16000, channelCount: 1, echoCancellation: true },
        })
      } catch {
        this.emit('error', '麦克风权限被拒绝')
        this.cleanup()
        return
      }

      this.audioCtx = new AudioContext({ sampleRate: 16000 })
      const src = this.audioCtx.createMediaStreamSource(this.mediaStream)
      this.processor = this.audioCtx.createScriptProcessor(4096, 1, 1)

      this.processor.onaudioprocess = (e) => {
        if (ws.readyState !== WebSocket.OPEN) return
        const f32 = e.inputBuffer.getChannelData(0)
        const i16 = new Int16Array(f32.length)
        for (let i = 0; i < f32.length; i++) {
          const s = Math.max(-1, Math.min(1, f32[i]))
          i16[i] = s < 0 ? s * 0x8000 : s * 0x7fff
        }
        ws.send(i16.buffer)
      }

      src.connect(this.processor)
      this.processor.connect(this.audioCtx.destination)
    }

    ws.onmessage = (e) => {
      if (typeof e.data !== 'string') return
      let msg: { event?: string; result?: { Text?: string } }
      try { msg = JSON.parse(e.data) } catch { return }

      if (msg.event === 'open') return

      if (msg.event === 'result' && msg.result?.Text) {
        this.lastText = msg.result.Text
        this.emit('interim', this.lastText)
      }

      if (msg.event === 'finish') {
        this.emit('final', this.lastText)
        this.lastText = ''
        if (this.ws?.readyState === WebSocket.OPEN) this.ws.close(1000)
      }

      if (msg.event === 'error') {
        this.emit('error', '豆包 ASR 错误')
      }
    }

    ws.onerror = () => this.emit('error', '连接豆包 ASR 失败')

    ws.onclose = () => this.cleanup()
  }

  stop() {
    if (!this.ws) return
    // Stop mic to flush remaining audio, but keep WS open until doubao sends 'finish'
    if (this.processor) { this.processor.disconnect(); this.processor = null }
    if (this.audioCtx) { this.audioCtx.close(); this.audioCtx = null }
    if (this.mediaStream) { this.mediaStream.getTracks().forEach((t) => t.stop()); this.mediaStream = null }
    // Doubao sends 'finish' after detecting end-of-speech; close WS then
    // Fallback: force-close after 3s if finish never arrives
    const ws = this.ws
    setTimeout(() => {
      if (ws.readyState === WebSocket.OPEN) {
        if (this.lastText) this.emit('final', this.lastText)
        ws.close(1000)
      }
    }, 3000)
  }

  private cleanup() {
    if (this.processor) { this.processor.disconnect(); this.processor = null }
    if (this.audioCtx) { this.audioCtx.close(); this.audioCtx = null }
    if (this.mediaStream) { this.mediaStream.getTracks().forEach((t) => t.stop()); this.mediaStream = null }
    this.ws = null
  }
}
