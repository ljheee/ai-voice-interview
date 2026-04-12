import type { CandidateQuestion } from './types'

interface SearchResult {
  id: string
  title: string
  categories: string[]
  tags: string[]
  difficulty: 'easy' | 'medium' | 'hard'
  frequency: number
  companies: string[]
}

/**
 * Query the external question search API for questions related to `focus`.
 * Configured via QUESTION_SEARCH_URL env var (e.g. https://host/api/questions/search).
 * The endpoint must support ?q=<text>&type=keyword|semantic.
 * Tries semantic first, falls back to keyword on failure.
 * Returns at most `limit` questions, excluding already-asked IDs.
 * Returns [] silently if not configured or request fails.
 */
export async function queryQuestionsByFocus(
  focus: string,
  excludeIds: string[],
  limit = 5,
): Promise<CandidateQuestion[]> {
  const baseUrl = process.env.QUESTION_SEARCH_URL
  if (!baseUrl || !focus.trim()) return []

  const fetchWithType = async (type: 'semantic' | 'keyword'): Promise<SearchResult[] | null> => {
    try {
      const url = `${baseUrl}?q=${encodeURIComponent(focus)}&type=${type}`
      const res = await fetch(url, { signal: AbortSignal.timeout(5000) })
      if (!res.ok) {
        console.warn(`[QuestionBank] ${type} search HTTP ${res.status}`)
        return null
      }
      return await res.json() as SearchResult[]
    } catch (err) {
      console.warn(`[QuestionBank] ${type} search error:`, err)
      return null
    }
  }

  let raw = await fetchWithType('semantic')
  const mode = raw ? 'semantic' : 'keyword'
  if (!raw) raw = await fetchWithType('keyword')
  if (!raw) return []

  const results = raw
    .filter((r) => !excludeIds.includes(r.id))
    .slice(0, limit)
    .map((r) => ({
      id: r.id,
      content: r.title,
      companies: r.companies ?? [],
      frequency: r.frequency ?? 1,
      category: r.categories?.[0] ?? '',
      difficulty: r.difficulty ?? 'medium',
      tags: r.tags ?? [],
    }))

  console.log(`[QuestionBank] ${mode} focus="${focus}" → ${results.length} candidates:`, results.map(r => r.content))
  return results
}
