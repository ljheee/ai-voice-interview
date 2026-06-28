import type { InterviewSession, ThinkingPayload, InterviewStage } from './types'

const store = new Map<string, InterviewSession>()

// Configuration from environment
const MAX_HISTORY_ROUNDS = parseInt(process.env.MAX_HISTORY_ROUNDS || '20', 10)
const SESSION_TTL_MS = parseInt(process.env.SESSION_TTL_HOURS || '2', 10) * 60 * 60 * 1000
const CLEANUP_INTERVAL_MS = parseInt(process.env.CLEANUP_INTERVAL_MIN || '10', 10) * 60 * 1000

// Evict sessions older than SESSION_TTL_MS
setInterval(() => {
  const cutoff = Date.now() - SESSION_TTL_MS
  let cleaned = 0
  for (const [id, s] of store) {
    if (s.startedAt < cutoff) {
      store.delete(id)
      cleaned++
    }
  }
  if (cleaned > 0) {
    console.log(`[SessionStore] Cleaned ${cleaned} expired sessions, remaining: ${store.size}`)
  }
}, CLEANUP_INTERVAL_MS)

export const sessionStore = {
  create(
    sessionId: string,
    totalMinutes = 90,
    resumeText?: string,
    skipIntro = false,
  ): InterviewSession {
    const session: InterviewSession = {
      sessionId,
      askedIds: [],
      coveredTopics: [],
      pendingTopics: [],
      turnCount: 0,
      startedAt: Date.now(),
      stageStartedAt: Date.now(),
      totalMinutes,
      resumeText,
      skipIntro,
      currentStage: skipIntro ? 'project' : 'intro',
      totalScore: 0,
      history: [],
    }
    store.set(sessionId, session)
    return session
  },

  /** Record a conversation turn */
  recordTurn(sessionId: string, role: 'ai' | 'user', text: string) {
    const s = store.get(sessionId)
    if (!s) return
    const newHistory = [...s.history, { role, text }]
    // Keep only last N rounds to control memory usage
    if (newHistory.length > MAX_HISTORY_ROUNDS) {
      newHistory.splice(0, newHistory.length - MAX_HISTORY_ROUNDS)
    }
    store.set(sessionId, {
      ...s,
      history: newHistory,
    })
  },

  get(sessionId: string): InterviewSession | undefined {
    return store.get(sessionId)
  },

  /** Apply thinking payload to advance session state for next turn */
  applyThinking(sessionId: string, thinking: ThinkingPayload, selectedId?: string) {
    const s = store.get(sessionId)
    if (!s) return

    // Stage advances monotonically — ignore LLM regressions
    const STAGE_ORDER: Record<InterviewStage, number> = { intro: 0, project: 1, skill: 2, closing: 3 }
    const nextStage: InterviewStage =
      thinking.current_stage && STAGE_ORDER[thinking.current_stage] >= STAGE_ORDER[s.currentStage]
        ? thinking.current_stage
        : s.currentStage

    store.set(sessionId, {
      ...s,
      turnCount: s.turnCount + 1,
      totalScore: s.totalScore + thinking.score_delta,
      askedIds: selectedId ? [...s.askedIds, selectedId] : s.askedIds,
      coveredTopics: [...new Set([...s.coveredTopics, ...thinking.covered_topics])],
      pendingTopics: thinking.pending_topics,
      currentStage: nextStage,
      stageStartedAt: nextStage !== s.currentStage ? Date.now() : s.stageStartedAt,
      nextFocus: thinking.next_focus || s.nextFocus,
    })
  },

  delete(sessionId: string) {
    store.delete(sessionId)
  },

  /** Save incomplete AI response (for graceful close when time is up) */
  saveIncompleteAI(sessionId: string, partialText: string) {
    const s = store.get(sessionId)
    if (!s || !partialText.trim()) return
    store.set(sessionId, {
      ...s,
      history: [...s.history, { role: 'ai', text: `[结束前] ${partialText.trim()}` }],
    })
  },

}
