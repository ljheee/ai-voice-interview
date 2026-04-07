'use client'

import type { ThinkingPayload } from '@/lib/types'

interface ThinkingPanelProps {
  open: boolean
  thinking: ThinkingPayload | null
  onClose: () => void
}

/**
 * AG-UI: shows the interviewer's internal reasoning in real-time.
 * Desktop: fixed right drawer. Mobile: hidden (toggled via parent).
 */
export function ThinkingPanel({ open, thinking, onClose }: ThinkingPanelProps) {
  return (
    <>
      {/* Overlay on mobile */}
      {open && (
        <div
          className="fixed inset-0 bg-black/20 z-20 lg:hidden"
          onClick={onClose}
        />
      )}

      {/* Drawer */}
      <aside
        className={`
          fixed top-0 right-0 h-full w-72 bg-white border-l border-gray-200
          z-30 flex flex-col shadow-xl
          transition-transform duration-300 ease-in-out
          ${open ? 'translate-x-0' : 'translate-x-full'}
        `}
      >
        <div className="flex items-center justify-between px-4 h-14 border-b border-gray-100 shrink-0">
          <span className="font-semibold text-sm text-gray-700">面试官思考过程</span>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-lg leading-none"
            aria-label="关闭"
          >
            ×
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4 text-sm">
          {!thinking ? (
            <p className="text-gray-400 text-center mt-8">等待第一轮对话…</p>
          ) : (
            <>
              {/* Action badge */}
              <section>
                <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${
                  thinking.action === 'next_question'
                    ? 'bg-purple-100 text-purple-700'
                    : 'bg-blue-100 text-blue-700'
                }`}>
                  {thinking.action === 'next_question'
                    ? `换题 ${thinking.selected_id ? `· ${thinking.selected_id}` : ''}`
                    : '追问'}
                </span>
              </section>

              {/* Analysis */}
              <section>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
                  回答分析
                </p>
                <blockquote className="bg-gray-50 rounded-lg px-3 py-2 text-gray-700 border-l-2 border-gray-300">
                  {thinking.user_answer_analysis}
                </blockquote>
              </section>

              {/* Next focus */}
              <section>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
                  下一步考察方向
                </p>
                <p className="text-blue-600 font-medium">{thinking.next_focus}</p>
              </section>

              {/* Score delta */}
              <section>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
                  本轮评分
                </p>
                <span
                  className={`inline-block px-2 py-0.5 rounded-full text-xs font-bold ${
                    thinking.score_delta > 0
                      ? 'bg-green-100 text-green-700'
                      : thinking.score_delta < 0
                        ? 'bg-red-100 text-red-700'
                        : 'bg-gray-100 text-gray-600'
                  }`}
                >
                  {thinking.score_delta > 0 ? '+' : ''}
                  {thinking.score_delta}
                </span>
              </section>

              {/* Covered topics */}
              {thinking.covered_topics.length > 0 && (
                <section>
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
                    已覆盖
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {thinking.covered_topics.map((t) => (
                      <span
                        key={t}
                        className="px-2 py-0.5 bg-green-100 text-green-700 rounded-full text-xs"
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                </section>
              )}

              {/* Pending topics */}
              {thinking.pending_topics.length > 0 && (
                <section>
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
                    待考察
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {thinking.pending_topics.map((t) => (
                      <span
                        key={t}
                        className="px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full text-xs"
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                </section>
              )}
            </>
          )}
        </div>
      </aside>
    </>
  )
}
