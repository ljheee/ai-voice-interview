'use client'

import { useEffect, useRef, useState } from 'react'

interface PTTButtonProps {
  onPressStart: () => void
  onPressEnd: () => void
  disabled?: boolean
}

/**
 * Push-to-Talk button.
 * Hold mouse/touch to record, release to trigger STT final.
 * Space key also works for accessibility.
 *
 * All event handlers (including window-level mouseup/touchend/keyup)
 * read state via refs to avoid stale closures.
 */
export function PTTButton({ onPressStart, onPressEnd, disabled = false }: PTTButtonProps) {
  const [pressed, setPressed] = useState(false)
  const pressedRef = useRef(false)

  // Keep latest props accessible from stable window listeners
  const onPressStartRef = useRef(onPressStart)
  const onPressEndRef = useRef(onPressEnd)
  const disabledRef = useRef(disabled)
  onPressStartRef.current = onPressStart
  onPressEndRef.current = onPressEnd
  disabledRef.current = disabled

  // IMPORTANT: Do NOT initialize these with useRef(() => {...}) capturing other refs.
  // In React Strict Mode, the component mounts twice; the second mount creates new
  // pressedRef/disabledRef objects, but a useRef-initialized function would still
  // close over the *first* mount's refs — causing stale reads.
  // Instead, store a plain ref and assign the function body on every render.
  const handleStartRef = useRef<() => void>(null!)
  handleStartRef.current = () => {
    if (disabledRef.current || pressedRef.current) return
    pressedRef.current = true
    setPressed(true)
    onPressStartRef.current()
  }

  const handleEndRef = useRef<() => void>(null!)
  handleEndRef.current = () => {
    if (!pressedRef.current) return
    pressedRef.current = false
    setPressed(false)
    onPressEndRef.current()
  }

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !e.repeat) { e.preventDefault(); handleStartRef.current() }
    }
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') { e.preventDefault(); handleEndRef.current() }
    }
    // Listen on window so release always fires even when:
    // - button becomes disabled mid-press (disabled buttons swallow mouse events)
    // - pointer moves outside the button before release
    const onMouseUp = () => handleEndRef.current()
    const onTouchEnd = () => handleEndRef.current()

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('mouseup', onMouseUp)
    window.addEventListener('touchend', onTouchEnd)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('mouseup', onMouseUp)
      window.removeEventListener('touchend', onTouchEnd)
    }
  }, [])

  const handleStart = () => handleStartRef.current()
  const handleEnd = () => handleEndRef.current()

  return (
    <button
      onMouseDown={handleStart}
      onTouchStart={(e) => { e.preventDefault(); handleStart() }}
      disabled={disabled}
      className={`
        select-none touch-none
        w-24 h-24 rounded-full
        flex items-center justify-center
        text-sm font-semibold text-white
        transition-all duration-150
        shadow-lg
        ${disabled
          ? 'bg-gray-300 cursor-not-allowed'
          : pressed
            ? 'bg-red-500 scale-95 shadow-red-300'
            : 'bg-blue-500 hover:bg-blue-600 active:scale-95'
        }
      `}
      aria-label={pressed ? '录音中…松开结束' : '按住说话（空格键）'}
    >
      {pressed ? (
        <span className="flex flex-col items-center gap-1">
          <span className="w-3 h-3 rounded-full bg-white animate-pulse" />
          <span className="text-xs">松开</span>
        </span>
      ) : (
        <span className="flex flex-col items-center gap-1">
          <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z" />
            <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" />
          </svg>
          <span className="text-xs">说话</span>
        </span>
      )}
    </button>
  )
}
