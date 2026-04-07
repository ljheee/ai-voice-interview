'use client'

import { useEffect, useRef, useCallback, useState } from 'react'
import type { ServerMessage, ThinkingPayload, CandidateQuestion, EvaluationReport } from '../types'

const WS_URL =
  process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:3001/ws/interview'

interface Handlers {
  onThinking: (payload: ThinkingPayload) => void
  onSentence: (text: string) => void
  onTurnEnd: (askedIds: string[]) => void
  onReport: (report: EvaluationReport) => void
  onError: (message: string) => void
}

export type WSStatus = 'connecting' | 'ready' | 'error' | 'closed'

export function useInterviewWS(
  sessionId: string,
  candidateQuestions: CandidateQuestion[],
  handlers: Handlers,
  totalMinutes = 90,
  resumeText = '',
  skipIntro = false
) {
  const wsRef = useRef<WebSocket | null>(null)
  const handlersRef = useRef(handlers)
  handlersRef.current = handlers

  const [status, setStatus] = useState<WSStatus>('connecting')

  useEffect(() => {
    if (!sessionId) return

    // `ignore` is set to true in the cleanup function.
    // In React 18 Strict Mode (dev), effects run twice: mount → cleanup → mount.
    // We use this flag so the onclose handler can detect a Strict-Mode "fake unmount"
    // and immediately reconnect instead of staying stuck in 'connecting'.
    let ignore = false

    function connect() {
      const ws = new WebSocket(WS_URL)
      wsRef.current = ws
      setStatus('connecting')

      ws.onopen = () => {
        if (ignore) { ws.close(1000, 'unmount'); return }
        ws.send(JSON.stringify({
          type: 'session_init',
          sessionId,
          candidateQuestions,
          totalMinutes,
          resumeText: resumeText || undefined,
          skipIntro: skipIntro || undefined,
        }))
      }

      ws.onmessage = (event) => {
        if (ignore) return
        const msg: ServerMessage = JSON.parse(event.data)
        switch (msg.type) {
          case 'session_ready':
            setStatus('ready')
            break
          case 'thinking':
            handlersRef.current.onThinking(msg.payload)
            break
          case 'sentence':
            handlersRef.current.onSentence(msg.text)
            break
          case 'turn_end':
            handlersRef.current.onTurnEnd(msg.askedIds)
            break
          case 'report':
            handlersRef.current.onReport(msg.report)
            break
          case 'error':
            handlersRef.current.onError(msg.message)
            break
        }
      }

      ws.onerror = () => { if (!ignore) setStatus('error') }

      ws.onclose = (e) => {
        if (ignore) return  // Strict Mode fake-unmount: the second mount will reconnect
        setStatus('closed')
        if (e.code !== 1000) {
          setTimeout(() => setStatus('connecting'), 2000)
        }
      }
    }

    connect()

    return () => {
      ignore = true
      const ws = wsRef.current
      if (!ws) return
      if (ws.readyState === WebSocket.CONNECTING) {
        // Can't close while connecting — onopen will detect ignore=true and close
        return
      }
      ws.close(1000, 'unmount')
    }
  }, [sessionId]) // eslint-disable-line react-hooks/exhaustive-deps

  const sendUserTurn = useCallback(
    (text: string) => {
      wsRef.current?.send(JSON.stringify({ type: 'user_turn', sessionId, text }))
    },
    [sessionId]
  )

  const sendSessionEnd = useCallback(() => {
    wsRef.current?.send(JSON.stringify({ type: 'session_end', sessionId }))
  }, [sessionId])

  return { sendUserTurn, sendSessionEnd, status }
}
