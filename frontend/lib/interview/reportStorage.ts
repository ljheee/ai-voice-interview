import type { EvaluationReport } from '../types'

const REPORT_KEY = 'ai_interview_report'
const SESSION_ID_KEY = 'ai_interview_session_id'

export function saveReport(report: EvaluationReport, sessionId?: string) {
  sessionStorage.setItem(REPORT_KEY, JSON.stringify(report))
  if (sessionId) sessionStorage.setItem(SESSION_ID_KEY, sessionId)
}

export function loadReport(): EvaluationReport | null {
  const raw = sessionStorage.getItem(REPORT_KEY)
  return raw ? (JSON.parse(raw) as EvaluationReport) : null
}

export function loadReportSessionId(): string | null {
  return sessionStorage.getItem(SESSION_ID_KEY)
}

export function clearReport() {
  sessionStorage.removeItem(REPORT_KEY)
  sessionStorage.removeItem(SESSION_ID_KEY)
}
