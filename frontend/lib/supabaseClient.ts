'use client'

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Question } from './api'

// Cache client by url+key so we never create duplicate GoTrueClient instances
let cachedClient: SupabaseClient | null = null
let cachedKey = ''

function getSupabaseClient(url: string, anonKey: string): SupabaseClient {
  const key = `${url}::${anonKey}`
  if (!cachedClient || cachedKey !== key) {
    cachedClient = createClient(url, anonKey, {
      auth: { persistSession: false },
    })
    cachedKey = key
  }
  return cachedClient
}

export interface SupabaseQuestionRow {
  id: string
  title: string
  content: string | null
  follow_ups: string[]
  categories: string[]
  tags: string[]
  difficulty: 'easy' | 'medium' | 'hard'
  frequency: number
  companies: string[]
  source_urls: string[]
  created_at: string
  updated_at: string
}

/**
 * Probe Supabase connectivity by fetching a single row.
 * Returns true if the connection succeeds, false otherwise.
 */
export async function testSupabaseConnection(url: string, anonKey: string): Promise<boolean> {
  if (!url || !anonKey) return false
  try {
    const client = getSupabaseClient(url, anonKey)
    const { error } = await client
      .from('questions_with_companies')
      .select('id')
      .limit(1)
    return !error
  } catch {
    return false
  }
}

export interface ListQuestionsOptions {
  tags?: string[]
  companies?: string[]
  size?: number
}

/**
 * Fetch questions from Supabase, filtered by tags/companies.
 * Returns Question[] in the same shape as the HTTP API.
 * Throws on network/auth error so callers can catch and degrade gracefully.
 */
export async function listQuestionsFromSupabase(
  url: string,
  anonKey: string,
  { tags = [], companies = [], size = 100 }: ListQuestionsOptions = {}
): Promise<Question[]> {
  const client = getSupabaseClient(url, anonKey)

  let query = client
    .from('questions_with_companies')
    .select('id,title,content,follow_ups,categories,tags,difficulty,frequency,companies,source_urls,created_at,updated_at')
    .order('frequency', { ascending: false })
    .limit(size)

  // Filter by tags: row must contain at least one of the selected tags
  if (tags.length > 0) {
    query = query.overlaps('tags', tags)
  }

  // Filter by companies: row must contain at least one of the selected companies
  if (companies.length > 0) {
    query = query.overlaps('companies', companies)
  }

  const { data, error } = await query

  if (error) throw new Error(`Supabase query failed: ${error.message}`)

  return (data as SupabaseQuestionRow[]).map((row) => ({
    id: row.id,
    title: row.title,
    content: row.content ?? undefined,
    follow_ups: row.follow_ups ?? [],
    categories: row.categories ?? [],
    tags: row.tags ?? [],
    difficulty: row.difficulty ?? 'medium',
    frequency: row.frequency ?? 1,
    companies: row.companies ?? [],
    source_urls: row.source_urls ?? [],
    created_at: row.created_at,
    updated_at: row.updated_at,
  }))
}
