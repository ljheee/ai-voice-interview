'use client'

import { useEffect, useRef } from 'react'
import '@/lib/ort-init'  // must be before any onnxruntime-web usage

interface UseVADFallbackOptions {
  /** Called when VAD detects end of speech (~3s silence) */
  onSpeechEnd: () => void
  /** Only active while recording is true */
  recording: boolean
  /**
   * Set to true when using WebSpeechSTT (Chrome).
   * WebSpeechSTT already holds the mic; VAD opens its own stream independently.
   * Set to false (Whisper mode) to disable VAD — Whisper's MediaRecorder
   * already owns the mic and fires its own onstop event.
   */
  enabled: boolean
}

interface VADInstance {
  start: () => void
  pause: () => void
  destroy: () => void
}

/**
 * VAD-based PTT fallback (Silero VAD via @ricky0123/vad-web).
 * Auto-releases PTT after ~3s of silence.
 *
 * The VAD instance is created once and reused across PTT presses —
 * model and worklet are loaded only on first use, subsequent presses
 * just call start()/pause() with no network requests.
 *
 * Only used in WebSpeechSTT mode.
 */
export function useVADFallback({ onSpeechEnd, recording, enabled }: UseVADFallbackOptions) {
  const vadRef = useRef<VADInstance | null>(null)
  const loadingRef = useRef(false)
  const onSpeechEndRef = useRef(onSpeechEnd)
  onSpeechEndRef.current = onSpeechEnd

  // Initialize VAD once when enabled becomes true
  useEffect(() => {
    if (!enabled) {
      vadRef.current?.destroy()
      vadRef.current = null
      loadingRef.current = false
      return
    }

    if (vadRef.current || loadingRef.current) return
    loadingRef.current = true

    async function initVAD() {
      try {
        const { MicVAD } = await import('@ricky0123/vad-web')

        const vad = await MicVAD.new({
          positiveSpeechThreshold: 0.90,
          negativeSpeechThreshold: 0.75,
          minSpeechFrames: 3,
          redemptionFrames: 8,
          // Explicitly point to /public files — avoids assetPath() 404s
          workletURL: '/vad.worklet.bundle.min.js',
          modelURL: '/silero_vad.onnx',
          onSpeechEnd: () => onSpeechEndRef.current(),
        })

        vadRef.current = vad
        loadingRef.current = false

        // If recording already started while we were loading, start VAD now
        if (recording) vad.start()
      } catch (err) {
        console.warn('VAD fallback unavailable:', err)
        loadingRef.current = false
      }
    }

    initVAD()

    return () => {
      vadRef.current?.destroy()
      vadRef.current = null
      loadingRef.current = false
    }
  }, [enabled]) // eslint-disable-line react-hooks/exhaustive-deps

  // Start/pause VAD based on recording state — no re-initialization
  useEffect(() => {
    if (!enabled || !vadRef.current) return
    if (recording) {
      vadRef.current.start()
    } else {
      vadRef.current.pause()
    }
  }, [recording, enabled])
}
