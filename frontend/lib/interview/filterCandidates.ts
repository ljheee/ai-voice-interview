import type { Question } from '../api'
import type { CandidateQuestion } from '../types'

/**
 * Client-side candidate question filter.
 * Pure function — no network, runs before session_init and on each state_update.
 */
export function filterCandidates(
  questions: Question[],
  askedIds: string[],
  targetTags?: string[],
  targetCompanies?: string[]
): CandidateQuestion[] {
  return questions
    .filter((q) => !askedIds.includes(q.id))
    .filter((q) => !targetTags?.length || q.tags.some((t) => targetTags.includes(t)))
    .filter((q) => !targetCompanies?.length || q.companies.some((c) => targetCompanies.includes(c)))
    .sort((a, b) => b.frequency - a.frequency)
    .slice(0, 8)
    .map((q) => ({
      id: q.id,
      content: q.title,
      companies: q.companies,
      frequency: q.frequency,
      category: q.categories[0] ?? '',
      difficulty: q.difficulty,
      tags: q.tags,
    }))
}
