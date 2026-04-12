import type { InterviewSession, ThinkingPayload, InterviewStage } from './types'

const store = new Map<string, InterviewSession>()

// Evict sessions older than 2 hours
setInterval(() => {
  const cutoff = Date.now() - 2 * 60 * 60 * 1000
  for (const [id, s] of store) {
    if (s.startedAt < cutoff) store.delete(id)
  }
}, 10 * 60 * 1000)

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
    }
    store.set(sessionId, session)
    return session
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
}
