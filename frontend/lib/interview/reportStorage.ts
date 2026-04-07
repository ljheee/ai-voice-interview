import type { EvaluationReport } from '../types'

const REPORT_KEY = 'ai_interview_report'

export function saveReport(report: EvaluationReport) {
  sessionStorage.setItem(REPORT_KEY, JSON.stringify(report))
}

export function loadReport(): EvaluationReport | null {
  const raw = sessionStorage.getItem(REPORT_KEY)
  return raw ? (JSON.parse(raw) as EvaluationReport) : null
}

export function clearReport() {
  sessionStorage.removeItem(REPORT_KEY)
}
