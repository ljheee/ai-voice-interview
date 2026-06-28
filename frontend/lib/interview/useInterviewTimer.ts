'use client'

import { useEffect, useRef, useState, useCallback } from 'react'

export interface TimerState {
  elapsedSec: number        // total elapsed seconds
  totalSec: number          // configured total (default 90 min)
  turnElapsedSec: number    // seconds since current PTT press started
  isOvertime: boolean       // elapsed > totalSec
  isTurnOvertime: boolean   // turnElapsedSec > maxTurnSec (default 5 min)
  isTimeUp: boolean         // time is up, should gracefully close
  remainingMin: number      // remaining minutes for business logic
}

interface UseInterviewTimerOptions {
  totalMinutes?: number     // default 90
  maxTurnMinutes?: number   // default 5 — auto-release PTT after this
  onTurnOvertime?: () => void   // called once when turn exceeds maxTurnSec
  onInterviewEnd?: () => void   // called once when total time is up
}

export function useInterviewTimer({
  totalMinutes = 90,
  maxTurnMinutes = 5,
  onTurnOvertime,
  onInterviewEnd,
}: UseInterviewTimerOptions = {}) {
  const totalSec = totalMinutes * 60
  const maxTurnSec = maxTurnMinutes * 60

  const [elapsedSec, setElapsedSec] = useState(0)
  const [turnElapsedSec, setTurnElapsedSec] = useState(0)
  const [turnActive, setTurnActive] = useState(false)
  const [isTimeUp, setIsTimeUp] = useState(false)

  const startTimeRef = useRef<number | null>(null)
  const turnStartRef = useRef<number | null>(null)
  const endFiredRef = useRef(false)
  const turnOvertimeFiredRef = useRef(false)
  const timeUpFiredRef = useRef(false)
  // Refs for callbacks — avoids interval teardown/recreate on every render
  const onInterviewEndRef = useRef(onInterviewEnd)
  const onTurnOvertimeRef = useRef(onTurnOvertime)
  onInterviewEndRef.current = onInterviewEnd
  onTurnOvertimeRef.current = onTurnOvertime

  // Global interview timer — starts on first call to startTimer()
  const startTimer = useCallback(() => {
    if (startTimeRef.current !== null) return  // already running
    startTimeRef.current = Date.now()
    endFiredRef.current = false
  }, [])

  // Per-turn timer
  const startTurn = useCallback(() => {
    turnStartRef.current = Date.now()
    turnOvertimeFiredRef.current = false
    setTurnActive(true)
  }, [])

  const stopTurn = useCallback(() => {
    turnStartRef.current = null
    turnOvertimeFiredRef.current = false
    setTurnElapsedSec(0)
    setTurnActive(false)
  }, [])

  // Tick every second
  useEffect(() => {
    const id = setInterval(() => {
      if (startTimeRef.current !== null) {
        const elapsed = Math.floor((Date.now() - startTimeRef.current) / 1000)
        setElapsedSec(elapsed)

        // Set isTimeUp when total time is reached, but don't force end immediately
        // Let current turn complete gracefully (AI will say closing words)
        if (!timeUpFiredRef.current && elapsed >= totalSec) {
          timeUpFiredRef.current = true
          setIsTimeUp(true)
          // Note: Don't call onInterviewEnd here - let it happen after AI closing
        }
      }

      if (turnStartRef.current !== null) {
        const turnElapsed = Math.floor((Date.now() - turnStartRef.current) / 1000)
        setTurnElapsedSec(turnElapsed)

        if (!turnOvertimeFiredRef.current && turnElapsed >= maxTurnSec) {
          turnOvertimeFiredRef.current = true
          onTurnOvertimeRef.current?.()
        }
      }
    }, 1000)

    return () => clearInterval(id)
  }, [totalSec, maxTurnSec])  // stable: only primitive values, callbacks via refs

  const remainingMin = Math.max(0, Math.floor((totalSec - elapsedSec) / 60))

  return {
    startTimer,
    startTurn,
    stopTurn,
    state: {
      elapsedSec,
      totalSec,
      turnElapsedSec,
      isOvertime: elapsedSec >= totalSec,
      isTurnOvertime: turnActive && turnElapsedSec >= maxTurnSec,
      isTimeUp,
      remainingMin,
    } satisfies TimerState,
  }
}
