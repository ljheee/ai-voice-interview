'use client'

import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type STTEngine = 'webspeech' | 'whisper' | 'doubao'
export type TTSEngine = 'murf' | 'azure' | 'doubao' | 'system'

interface SettingsState {
  // Voice
  sttEngine: STTEngine
  setSttEngine: (engine: STTEngine) => void
  doubaoCookie: string
  setDoubaoCookie: (cookie: string) => void
  ttsEngine: TTSEngine
  murfApiKey: string
  setMurfApiKey: (key: string) => void
  azureTTSKey: string
  azureTTSRegion: string
  setAzureTTS: (key: string, region: string) => void
  setTTSEngine: (engine: TTSEngine) => void

  // Interview profile
  targetCompanies: string[]
  targetSkillTags: string[]
  totalInterviewMinutes: number
  resumeText: string
  skipIntro: boolean
  useQuestionBank: boolean
  questionBankUrl: string
  setInterviewProfile: (
    companies: string[],
    skillTags: string[],
    totalMinutes: number,
    resumeText: string,
    skipIntro: boolean,
    useQuestionBank?: boolean,
    questionBankUrl?: string,
  ) => void
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      sttEngine: 'webspeech',
      setSttEngine: (engine) => set({ sttEngine: engine }),
      doubaoCookie: '',
      setDoubaoCookie: (cookie) => set({ doubaoCookie: cookie }),
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
      questionBankUrl: 'http://localhost:8000',
      setInterviewProfile: (companies, skillTags, totalMinutes, resumeText, skipIntro, useQuestionBank, questionBankUrl) =>
        set({ targetCompanies: companies, targetSkillTags: skillTags, totalInterviewMinutes: totalMinutes, resumeText, skipIntro, useQuestionBank: useQuestionBank ?? false, questionBankUrl: questionBankUrl ?? 'http://localhost:8000' }),
    }),
    { name: 'ai-interview-settings' }
  )
)
