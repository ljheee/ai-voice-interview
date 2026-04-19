'use client'

import { useEffect, useRef } from 'react'

interface SubtitleProps {
  /** Interim text — shown while user is speaking (grayed out) */
  interim: string
  /** Final text — last confirmed utterance */
  final: string
}

/**
 * Real-time subtitle display.
 * - Fixed height container — never pushes the PTT button down
 * - Text anchored to bottom: new content appears at bottom, old scrolls up
 * - Interim results shown in gray, final in dark
 */
export function Subtitle({ interim, final }: SubtitleProps) {
  const displayText = interim || final
  const containerRef = useRef<HTMLDivElement>(null)

  // Auto-scroll to bottom whenever text changes
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight
    }
  }, [displayText])

  return (
    <div className="h-24 overflow-hidden flex flex-col justify-end">
      {!displayText ? (
        <p className="text-gray-400 text-sm text-center pb-1">按住说话…</p>
      ) : (
        <div ref={containerRef} className="overflow-y-auto max-h-24 px-1">
          <p
            className={`text-base leading-relaxed transition-colors duration-200 ${
              interim ? 'text-gray-400' : 'text-gray-900'
            }`}
          >
            {displayText}
          </p>
        </div>
      )}
    </div>
  )
}
