import type { EvaluationReport } from '../types'

const WS_URL =
  process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:3001/ws/interview'

const REGEN_TIMEOUT_MS = 130_000  // server max is 120s; add a small client buffer

/**
 * Reopen a WS to the interview server and ask for a fresh report on an
 * existing session (server keeps the session alive when its previous report
 * was a fallback). Resolves with the new report or rejects on timeout/error.
 *
 * No session_init is sent — the server already has the session in memory.
 */
export function regenerateReport(sessionId: string): Promise<EvaluationReport> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(WS_URL)
    let settled = false

    const finish = (err: Error | null, report?: EvaluationReport) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      try { ws.close(1000, 'done') } catch {}
      if (err) reject(err); else resolve(report!)
    }

    const timer = setTimeout(
      () => finish(new Error('regenerate-report-timeout')),
      REGEN_TIMEOUT_MS
    )

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: 'session_end', sessionId }))
    }

    ws.onmessage = (event) => {
      type RegenMessage =
        | { type: 'report'; report: EvaluationReport }
        | { type: 'error'; message: string }
      let msg: RegenMessage
      try { msg = JSON.parse(event.data) } catch { return }
      if (msg.type === 'report') finish(null, msg.report)
      else if (msg.type === 'error') finish(new Error(msg.message))
    }

    ws.onerror = () => finish(new Error('regenerate-report-ws-error'))

    ws.onclose = (e) => {
      if (!settled) finish(new Error(`regenerate-report-closed-${e.code}`))
    }
  })
}
