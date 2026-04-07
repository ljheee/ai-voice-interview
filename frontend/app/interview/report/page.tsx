'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { loadReport, clearReport } from '@/lib/interview/reportStorage'
import type { EvaluationReport } from '@/lib/types'

export default function ReportPage() {
  const router = useRouter()
  const [report, setReport] = useState<EvaluationReport | null>(null)

  useEffect(() => {
    const r = loadReport()
    if (!r) { router.replace('/interview/setup'); return }
    setReport(r)
    clearReport()  // prevent stale data on back-navigation
  }, [router])

  if (!report) {
    return (
      <div className="min-h-screen flex items-center justify-center text-gray-400">
        加载报告中…
      </div>
    )
  }

  const scoreColor =
    report.overall_score >= 80 ? 'text-green-600' :
    report.overall_score >= 60 ? 'text-blue-600' :
    'text-amber-600'

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-4 h-14 flex items-center justify-between">
        <h1 className="font-bold text-gray-900">面试评测报告</h1>
        <button
          onClick={() => router.push('/interview/setup')}
          className="text-sm text-blue-600 hover:text-blue-700"
        >
          再次面试
        </button>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-8 space-y-6">
        {/* Overall score */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 flex items-center gap-6">
          <div className={`text-6xl font-bold ${scoreColor}`}>
            {report.overall_score}
          </div>
          <div>
            <p className="text-xs text-gray-400 mb-1">综合评分 / 100</p>
            <p className="text-gray-700 text-sm leading-relaxed">{report.summary}</p>
            <div className="flex gap-4 mt-2 text-xs text-gray-400">
              <span>{report.total_turns} 轮对话</span>
              <span>{report.duration_min} 分钟</span>
              <span>{report.covered_topics.length} 个话题</span>
            </div>
          </div>
        </div>

        {/* Topic scores */}
        {report.topic_scores.length > 0 && (
          <section className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 space-y-3">
            <h2 className="font-semibold text-gray-800 text-sm">话题评分</h2>
            {report.topic_scores.map((ts) => (
              <div key={ts.topic} className="flex items-center gap-3">
                <span className="text-sm text-gray-700 w-28 shrink-0">{ts.topic}</span>
                <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${
                      ts.score >= 8 ? 'bg-green-500' :
                      ts.score >= 6 ? 'bg-blue-500' :
                      'bg-amber-400'
                    }`}
                    style={{ width: `${ts.score * 10}%` }}
                  />
                </div>
                <span className="text-sm font-medium text-gray-600 w-6 text-right">{ts.score}</span>
                <span className="text-xs text-gray-400 flex-1">{ts.comment}</span>
              </div>
            ))}
          </section>
        )}

        {/* Strengths & Improvements */}
        <div className="grid grid-cols-2 gap-4">
          <section className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 space-y-2">
            <h2 className="font-semibold text-green-700 text-sm">优势</h2>
            <ul className="space-y-1">
              {report.strengths.map((s, i) => (
                <li key={i} className="text-sm text-gray-700 flex gap-2">
                  <span className="text-green-500 shrink-0">✓</span>
                  {s}
                </li>
              ))}
            </ul>
          </section>

          <section className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 space-y-2">
            <h2 className="font-semibold text-amber-600 text-sm">待提升</h2>
            <ul className="space-y-1">
              {report.improvements.map((s, i) => (
                <li key={i} className="text-sm text-gray-700 flex gap-2">
                  <span className="text-amber-400 shrink-0">→</span>
                  {s}
                </li>
              ))}
            </ul>
          </section>
        </div>

        {/* Covered topics */}
        {report.covered_topics.length > 0 && (
          <section className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
            <h2 className="font-semibold text-gray-800 text-sm mb-3">已考察话题</h2>
            <div className="flex flex-wrap gap-2">
              {report.covered_topics.map((t) => (
                <span key={t} className="px-2 py-1 bg-blue-50 text-blue-700 rounded-full text-xs">
                  {t}
                </span>
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  )
}
