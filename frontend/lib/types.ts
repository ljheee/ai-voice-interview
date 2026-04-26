// Client-side mirror of server/src/types.ts (WS message types only)
// Do NOT import from the server package — frontend builds independently.

export type InterviewStage = 'intro' | 'project' | 'skill' | 'closing'

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
  score: number
  comment: string
}

export interface EvaluationReport {
  overall_score: number
  summary: string
  strengths: string[]
  improvements: string[]
  topic_scores: TopicScore[]
  covered_topics: string[]
  total_turns: number
  duration_min: number
  is_fallback?: boolean
}

// Server → Client messages
export type ServerMessage =
  | { type: 'session_ready' }
  | { type: 'thinking'; payload: ThinkingPayload }
  | { type: 'sentence'; text: string }
  | { type: 'turn_end'; askedIds: string[] }
  | { type: 'report'; report: EvaluationReport }
  | { type: 'error'; message: string }

// Candidate question shape sent to server on session_init
export interface CandidateQuestion {
  id: string
  content: string
  companies: string[]
  frequency: number
  category: string
  difficulty: 'easy' | 'medium' | 'hard'
  tags: string[]
}
