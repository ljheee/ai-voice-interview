'use client'

import { useEffect, useRef } from 'react'
import '@/lib/ort-init'  // must be before any onnxruntime-web usage

interface UseVADFallbackOptions {
  /** Only active while recording is true */
  recording: boolean
  /**
   * Set to true when using WebSpeechSTT (Chrome).
   * Set to false (Whisper mode) to disable VAD entirely.
   */
  enabled: boolean
  /**
   * Called when VAD detects silence start (user stopped speaking).
   * The caller should start a countdown timer here.
   */
  onSilenceStart: () => void
  /**
   * Called when VAD detects speech resumed during countdown.
   * The caller should cancel the countdown timer here.
   */
  onSilenceCancel: () => void
}

interface VADInstance {
  start: () => void
  pause: () => void
  destroy: () => void
}

/**
 * VAD-based silence detection (Silero VAD via @ricky0123/vad-web).
 *
 * Behaviour:
 * - While user is pressing PTT (recording=true), VAD monitors audio.
 * - When silence is detected → fires onSilenceStart (caller starts countdown).
 * - When speech resumes   → fires onSilenceCancel (caller cancels countdown).
 * - PTT auto-release is handled by the caller's countdown, NOT by VAD directly.
 *   This ensures the physical button always takes priority.
 *
 * The VAD instance is created once and reused — model loads only on first use.
 * Only used in WebSpeechSTT mode.
 */
export function useVADFallback({ recording, enabled, onSilenceStart, onSilenceCancel }: UseVADFallbackOptions) {
  const vadRef = useRef<VADInstance | null>(null)
  const loadingRef = useRef(false)
  const onSilenceStartRef = useRef(onSilenceStart)
  const onSilenceCancelRef = useRef(onSilenceCancel)
  onSilenceStartRef.current = onSilenceStart
  onSilenceCancelRef.current = onSilenceCancel

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
          positiveSpeechThreshold: 0.92,
          negativeSpeechThreshold: 0.70,
          minSpeechFrames: 5,
          redemptionFrames: 25,  // ~1.25s of silence before firing onSpeechEnd
          workletURL: '/vad.worklet.bundle.min.js',
          modelURL: '/silero_vad.onnx',
          // Silence confirmed → start countdown
          onSpeechEnd: () => {
            if (recording) onSilenceStartRef.current()
          },
          // Voice resumed → cancel countdown
          onSpeechStart: () => {
            onSilenceCancelRef.current()
          },
          // Misfire (too short to count) → also cancel countdown
          onVADMisfire: () => {
            onSilenceCancelRef.current()
          },
        })

        vadRef.current = vad
        loadingRef.current = false

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

  // Start/pause VAD based on recording state
  useEffect(() => {
    if (!enabled || !vadRef.current) return
    if (recording) {
      vadRef.current.start()
    } else {
      vadRef.current.pause()
    }
  }, [recording, enabled])
}
