import type { InterviewSession, ThinkingPayload, EvaluationReport, CandidateQuestion } from './types'
import { ProviderChain } from './llm/ProviderChain'
import { queryQuestionsByFocus } from './supabaseQuery'

const providerChain = new ProviderChain()

// ─── Prompt builder ───────────────────────────────────────────────────────────

const STAGE_BUDGETS: Record<string, (total: number) => number> = {
  intro:   (_total) => 5,
  project: (total)  => Math.round(total * 0.35),
  skill:   (total)  => Math.round(total * 0.45),
  closing: (_total) => 5,
}

const STAGE_INSTRUCTIONS: Record<string, string> = {
  intro: `当前阶段：【自我介绍】（约3分钟）
- 请候选人做自我介绍，聆听并适度追问（如：您刚才提到了X，能展开说说吗？）
- 不要在此阶段出技术题
- 候选人介绍完毕或约3分钟后，将 current_stage 输出为 "project" 进入下一阶段`,

  project: `当前阶段：【项目经历】
- 针对候选人简历中的项目，考察：真实性、项目复杂度、候选人具体贡献、技术决策、项目价值与收益
- 适当探索软素质：工作方法、遇到困难的处理方式、团队协作、沟通能力
- 充分考察后，将 current_stage 输出为 "skill" 进入技能考察`,

  skill: `当前阶段：【技能考察】
- {SKILL_SOURCE_INSTRUCTION}
- 适当穿插软素质考察：学习方法、技术判断力、时间管理
- 剩余时间 < 10 分钟时，将 current_stage 输出为 "closing" 开始收尾`,

  closing: `当前阶段：【收尾】
- 感谢候选人参加面试，说结束语
- 不再出新题，不再追问`,
}

function buildSystemPrompt(session: InterviewSession, candidates: CandidateQuestion[]): string {
  const elapsedMin = Math.floor((Date.now() - session.startedAt) / 60000)
  const remainingMin = Math.max(0, session.totalMinutes - elapsedMin)
  const stageElapsedMin = Math.floor((Date.now() - session.stageStartedAt) / 60000)
  const stageBudgetMin = STAGE_BUDGETS[session.currentStage]?.(session.totalMinutes) ?? 10

  const candidatesText = candidates
    .map(
      (q, i) =>
        `${i + 1}. [ID:${q.id}] ${q.content}\n   公司：${q.companies.join('、')} | 难度：${q.difficulty} | 标签：${q.tags.join(', ')}`
    )
    .join('\n\n')

  const resumeSection = session.resumeText
    ? `\n## 候选人简历\n${session.resumeText}\n`
    : ''

  const hasQuestionBank = !!process.env.QUESTION_SEARCH_URL
  const skillSourceInstruction = candidates.length > 0
    ? '从候选题目中选题，由浅入深考察技术深度；action 使用 next_question 并填写 selected_id'
    : hasQuestionBank
      ? '题库暂无匹配题目，请根据候选人简历和已覆盖话题自主设计技术问题；action 使用 follow_up（selected_id 留空）'
      : '无题库，请根据候选人简历和已覆盖话题自主设计技术问题，由浅入深；action 使用 follow_up（selected_id 留空）'

  const stageInstruction = (STAGE_INSTRUCTIONS[session.currentStage] ?? '')
    .replace('{SKILL_SOURCE_INSTRUCTION}', skillSourceInstruction)

  const candidatesSection = candidatesText
    ? `## 候选题目（与当前考察方向相关，skill 阶段优先使用）\n${candidatesText}`
    : ''

  return `你是一位资深技术面试官，正在对候选人进行 Java 后端技术面试。

## 面试上下文
- 已进行：${elapsedMin} 分钟，剩余：${remainingMin} 分钟
- 本阶段已用：${stageElapsedMin} 分钟 / 建议预算：${stageBudgetMin} 分钟
- 已考察轮次：${session.turnCount}
- 当前阶段：${session.currentStage}
- 已覆盖话题：${session.coveredTopics.join('、') || '无'}
- 待考察话题：${session.pendingTopics.join('、') || '待定'}
- 已问题目 ID：${session.askedIds.join(', ') || '无'}
${resumeSection}
## 当前阶段指令
${stageInstruction}

${candidatesSection}

## 输出格式（严格遵守）
每次回复必须包含两个部分，**顺序固定：先 speech，再 thinking**：

<speech>
用自然口语向候选人说的话，包含过渡语和问题。语气专业但不刻板。不要超过 3 句话。
</speech>
<thinking>
{
  "action": "next_question",
  "selected_id": "题目ID（action=next_question时必填，follow_up时省略此字段）",
  "current_stage": "当前或即将进入的阶段（intro/project/skill/closing）",
  "user_answer_analysis": "10字以内简评",
  "next_focus": "下一步考察方向",
  "score_delta": 1,
  "covered_topics": ["刚刚覆盖的话题"],
  "pending_topics": ["接下来待考察的话题"]
}
</thinking>

## action 说明
- "next_question"：从候选题目中选一道新题，selected_id 必填，记入已问列表（仅 skill 阶段使用）
- "follow_up"：针对当前回答追问，不消耗题库，不填 selected_id

## 注意事项
- <speech> 内容直接对候选人说，会被转成语音，不要包含任何 Markdown 格式
- score_delta 范围 -2 到 +2，根据回答质量给出
- intro/project 阶段 action 用 follow_up，不消耗题库
- 第一轮（turnCount=0）时，按当前阶段指令开场
- 剩余时间 < 3 分钟时，说结束语并感谢候选人，current_stage 输出 "closing"`
}

// ─── Sentence splitter ────────────────────────────────────────────────────────

function extractSentences(text: string): string[] {
  return (text.match(/[^，。？！,?!\n]+[，。？！,?!\n]/g) ?? [])
    .map((s) => s.trim())
    .filter(Boolean)
}

// ─── Thinking block with action ───────────────────────────────────────────────

export interface ThinkingBlock extends ThinkingPayload {
  action: 'follow_up' | 'next_question'
  selected_id?: string
}

// ─── Streaming response generator ────────────────────────────────────────────

export type LLMEvent =
  | { type: 'thinking'; payload: ThinkingBlock }
  | { type: 'sentence'; text: string }

export async function* streamInterviewResponse(
  session: InterviewSession,
  userText: string
): AsyncGenerator<LLMEvent> {
  // Query external question bank for candidates relevant to next_focus (skill stage only)
  let candidates: CandidateQuestion[] = []
  if (session.currentStage === 'skill' && process.env.QUESTION_SEARCH_URL) {
    const focus = session.nextFocus || session.pendingTopics[0] || ''
    candidates = await queryQuestionsByFocus(focus, session.askedIds, 5)
  }

  const systemPrompt = buildSystemPrompt(session, candidates)

  let buffer = ''
  let inSpeech = false
  let speechBuffer = ''
  let speechDone = false

  for await (const chunk of providerChain.streamResponse(systemPrompt, userText)) {
    buffer += chunk

    // ── Phase 1: emit speech sentences as they stream ──
    if (!speechDone) {
      if (!inSpeech) {
        const start = buffer.indexOf('<speech>')
        if (start === -1) continue  // waiting for <speech> opening tag
        speechBuffer = buffer.slice(start + '<speech>'.length)
        inSpeech = true
        // fall through — speechBuffer may already have content
      } else {
        speechBuffer += chunk
      }

      const end = speechBuffer.indexOf('</speech>')
      const working = end !== -1 ? speechBuffer.slice(0, end) : speechBuffer

      // Emit complete sentences, keep trailing fragment
      const lastPunctIdx = working.search(/[^，。？！,?!\n]*$/)
      const fragment = working.slice(lastPunctIdx)
      const complete = working.slice(0, lastPunctIdx)

      for (const s of extractSentences(complete)) {
        yield { type: 'sentence', text: s }
      }

      if (end !== -1) {
        // Flush any trailing fragment before </speech>
        if (fragment.trim()) yield { type: 'sentence', text: fragment.trim() }
        speechDone = true
        // Don't break — keep consuming stream to collect <thinking> block
      } else {
        speechBuffer = fragment
      }
    }

    // ── Phase 2: once speech is done, parse <thinking> block ──
    if (speechDone) {
      const match = buffer.match(/<thinking>([\s\S]*?)<\/thinking>/)
      if (match) {
        try {
          const payload = JSON.parse(match[1].trim()) as ThinkingBlock
          yield { type: 'thinking', payload }
        } catch {
          // Malformed JSON — skip silently
        }
        break  // both blocks collected, done
      }
      // Fallback: stream ended or 600+ chars after </speech> with no <thinking>
      if (buffer.length - (buffer.indexOf('</speech>') + 9) > 600) break
    }
  }

  // Stream ended without </speech> — flush whatever we have
  if (!speechDone) {
    for (const s of extractSentences(speechBuffer)) {
      yield { type: 'sentence', text: s }
    }
    const tail = speechBuffer.replace(/.*[，。？！,?!\n]/s, '').trim()
    if (tail) yield { type: 'sentence', text: tail }
  }
}

// ─── Evaluation report ────────────────────────────────────────────────────────

function fallbackReport(session: InterviewSession, durationMin: number): EvaluationReport {
  return {
    overall_score: Math.max(0, Math.min(100, 50 + session.totalScore * 5)),
    summary: '面试已完成，报告生成时遇到问题，以下为基础数据。',
    strengths: ['完成了完整面试流程'],
    improvements: ['建议多练习技术表达'],
    topic_scores: session.coveredTopics.map((t) => ({ topic: t, score: 6, comment: '已考察' })),
    covered_topics: session.coveredTopics,
    total_turns: session.turnCount,
    duration_min: durationMin,
  }
}

export async function generateReport(session: InterviewSession): Promise<EvaluationReport> {
  const durationMin = Math.floor((Date.now() - session.startedAt) / 60000)

  const prompt = `根据以下面试记录，生成评测报告：

面试时长：${durationMin} 分钟
考察轮次：${session.turnCount}
已覆盖话题：${session.coveredTopics.join('、') || '无'}
累计评分变化：${session.totalScore}
考察过的题目数：${session.askedIds.length}

请输出以下 JSON 格式（不要有任何其他内容）：
{
  "overall_score": <0-100的整数>,
  "summary": "<2-3句总体评价>",
  "strengths": ["<优势1>", "<优势2>"],
  "improvements": ["<待提升1>", "<待提升2>"],
  "topic_scores": [
    { "topic": "<话题名>", "score": <0-10>, "comment": "<简短评语>" }
  ],
  "covered_topics": ${JSON.stringify(session.coveredTopics)},
  "total_turns": ${session.turnCount},
  "duration_min": ${durationMin}
}`

  const REPORT_TIMEOUT = 60_000
  let raw: string
  try {
    raw = await Promise.race([
      (async () => {
        let result = ''
        for await (const chunk of providerChain.streamResponse(
          '你是一位资深技术面试官，需要根据面试记录生成结构化评测报告。只输出合法 JSON，不要包含任何 Markdown 代码块或额外文字。',
          prompt
        )) {
          result += chunk
        }
        return result
      })(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('report timeout')), REPORT_TIMEOUT)
      ),
    ])
  } catch (err) {
    console.warn('[LLM] generateReport failed, using fallback:', err)
    return fallbackReport(session, durationMin)
  }

  // Strip markdown code fences if LLM wraps in ```json ... ```
  const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')

  try {
    return JSON.parse(cleaned) as EvaluationReport
  } catch {
    return fallbackReport(session, durationMin)
  }
}
