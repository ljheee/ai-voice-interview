'use client'

import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type STTEngine = 'webspeech' | 'whisper'
export type TTSEngine = 'murf' | 'azure' | 'system'

interface SettingsState {
  // Voice
  sttEngine: STTEngine
  setSttEngine: (engine: STTEngine) => void
  ttsEngine: TTSEngine
  murfApiKey: string
  setMurfApiKey: (key: string) => void
  azureTTSKey: string
  azureTTSRegion: string
  setAzureTTS: (key: string, region: string) => void
  setTTSEngine: (engine: TTSEngine) => void

  // Interview profile (set on setup page, used by filterCandidates)
  targetCompanies: string[]    // e.g. ["字节", "阿里"]
  targetSkillTags: string[]    // e.g. ["Redis", "分布式"]
  totalInterviewMinutes: number
  resumeText: string
  skipIntro: boolean
  useQuestionBank: boolean     // whether to fetch from Supabase question bank
  supabaseUrl: string          // Supabase project URL
  supabaseAnonKey: string      // Supabase anon/role key
  setInterviewProfile: (
    companies: string[],
    skillTags: string[],
    totalMinutes: number,
    resumeText: string,
    skipIntro: boolean,
    useQuestionBank: boolean,
    supabaseUrl: string,
    supabaseAnonKey: string,
  ) => void
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      sttEngine: 'webspeech',
      setSttEngine: (engine) => set({ sttEngine: engine }),
      ttsEngine: 'murf',
      setTTSEngine: (engine) => set({ ttsEngine: engine }),
      murfApiKey: '',
      setMurfApiKey: (key) => set({ murfApiKey: key }),
      azureTTSKey: '',
      azureTTSRegion: 'eastasia',
      setAzureTTS: (key, region) => set({ azureTTSKey: key, azureTTSRegion: region }),

      targetCompanies: [],
      targetSkillTags: [],
      totalInterviewMinutes: 90,
      resumeText: '',
      skipIntro: false,
      useQuestionBank: false,
      supabaseUrl: '',
      supabaseAnonKey: '',
      setInterviewProfile: (companies, skillTags, totalMinutes, resumeText, skipIntro, useQuestionBank, supabaseUrl, supabaseAnonKey) =>
        set({ targetCompanies: companies, targetSkillTags: skillTags, totalInterviewMinutes: totalMinutes, resumeText, skipIntro, useQuestionBank, supabaseUrl, supabaseAnonKey }),
    }),
    { name: 'ai-interview-settings' }
  )
)
