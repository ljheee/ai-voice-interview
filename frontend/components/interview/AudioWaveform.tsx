'use client'

interface AudioWaveformProps {
  /** Whether AI is currently speaking */
  active: boolean
}

/**
 * Animated waveform bars shown while AI is speaking TTS audio.
 * Pure CSS animation — no Web Audio API required.
 */
export function AudioWaveform({ active }: AudioWaveformProps) {
  if (!active) return null

  return (
    <div className="flex items-center justify-center gap-1 h-8" aria-label="AI 正在说话">
      {[0, 1, 2, 3, 4].map((i) => (
        <div
          key={i}
          className="w-1 bg-blue-500 rounded-full animate-bounce"
          style={{
            height: `${16 + (i % 3) * 8}px`,
            animationDelay: `${i * 0.1}s`,
            animationDuration: '0.8s',
          }}
        />
      ))}
    </div>
  )
}
