'use client'

interface SubtitleProps {
  /** Interim text — shown while user is speaking (grayed out) */
  interim: string
  /** Final text — last confirmed utterance */
  final: string
}

/**
 * Real-time subtitle display.
 * Shows interim results in gray (still being recognized),
 * and final results in white/dark (confirmed).
 */
export function Subtitle({ interim, final }: SubtitleProps) {
  const displayText = interim || final

  if (!displayText) {
    return (
      <div className="min-h-[3rem] flex items-center justify-center">
        <span className="text-gray-400 text-sm">按住说话…</span>
      </div>
    )
  }

  return (
    <div className="min-h-[3rem] flex items-center justify-center px-4">
      <p
        className={`text-center text-base leading-relaxed transition-colors duration-200 ${
          interim ? 'text-gray-400' : 'text-gray-900'
        }`}
      >
        {displayText}
      </p>
    </div>
  )
}
