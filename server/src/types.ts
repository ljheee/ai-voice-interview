// ─── Interview stages ─────────────────────────────────────────────────────────

export type InterviewStage = 'intro' | 'project' | 'skill' | 'closing'

// ─── Question / Session ───────────────────────────────────────────────────────

export interface CandidateQuestion {
  id: string
  content: string
  companies: string[]
  frequency: number
  category: string
  difficulty: 'easy' | 'medium' | 'hard'
  tags: string[]
}

export interface InterviewSession {
  sessionId: string
  askedIds: string[]
  coveredTopics: string[]
  pendingTopics: string[]
  turnCount: number
  startedAt: number
  totalMinutes: number
  resumeText?: string
  skipIntro: boolean
  currentStage: InterviewStage
  stageStartedAt: number   // timestamp (ms) when current stage was entered
  totalScore: number
  // next_focus from last AI thinking — used to query Supabase on next turn
  nextFocus?: string
  // Conversation history for report generation
  history: Array<{ role: 'ai' | 'user'; text: string }>
}

// ─── LLM output ───────────────────────────────────────────────────────────────

export type LLMAction =
  | { action: 'follow_up'; intro: string }
  | { action: 'next_question'; selected_id: string; intro: string }

export interface ThinkingPayload {
  action: 'follow_up' | 'next_question'
  selected_id?: string
  current_stage: InterviewStage
  user_answer_analysis: string
  next_focus: string
  score_delta: number
  covered_topics: string[]
  pending_topics: string[]
}

// ─── Evaluation report ────────────────────────────────────────────────────────

export interface TopicScore {
  topic: string
  score: number      // 0-10
  comment: string
}

export interface EvaluationReport {
  overall_score: number          // 0-100
  summary: string                // 2-3 sentences overall assessment
  strengths: string[]            // what the candidate did well
  improvements: string[]         // what to work on
  topic_scores: TopicScore[]     // per-topic breakdown
  covered_topics: string[]
  total_turns: number
  duration_min: number
  is_fallback?: boolean          // true when LLM generation failed and we used hardcoded shell
}

// ─── WebSocket messages ───────────────────────────────────────────────────────

// Client → Server
export type ClientMessage =
  | { type: 'session_init'; sessionId: string; totalMinutes?: number; resumeText?: string; skipIntro?: boolean }
  | { type: 'user_turn'; sessionId: string; text: string }
  | { type: 'session_end'; sessionId: string }

// Server → Client
export type ServerMessage =
  | { type: 'session_ready' }
  | { type: 'thinking'; payload: ThinkingPayload }
  | { type: 'sentence'; text: string }
  | { type: 'turn_end'; askedIds: string[] }
  | { type: 'report'; report: EvaluationReport }
  | { type: 'error'; message: string }
