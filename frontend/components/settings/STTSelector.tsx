'use client'

import { useState, useEffect } from 'react'
import { useSettingsStore, type STTEngine } from '@/lib/store/settingsStore'
import { WebSpeechSTT } from '@/lib/stt/WebSpeechSTT'

/**
 * STT engine selector for settings page.
 * Persisted to localStorage via Zustand persist middleware.
 */
export function STTSelector() {
  const { sttEngine, setSttEngine } = useSettingsStore()
  // Defer browser API check to client side to avoid SSR/hydration mismatch
  const [webSpeechSupported, setWebSpeechSupported] = useState(true)
  useEffect(() => { setWebSpeechSupported(WebSpeechSTT.isSupported()) }, [])

  const options: { value: STTEngine; label: string; desc: string; available: boolean }[] = [
    {
      value: 'webspeech',
      label: 'Chrome 语音识别',
      desc: 'Google ASR，实时流式字幕，仅限 Chrome，需联网',
      available: webSpeechSupported,
    },
    {
      value: 'whisper',
      label: 'Whisper (本地)',
      desc: '浏览器本地运行，支持所有浏览器，离线可用，首次加载约 150MB',
      available: true,
    },
  ]

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-gray-700">语音识别引擎</p>
      <div className="space-y-2">
        {options.map((opt) => (
          <label
            key={opt.value}
            className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
              !opt.available
                ? 'opacity-40 cursor-not-allowed'
                : sttEngine === opt.value
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-gray-200 hover:border-gray-300'
            }`}
          >
            <input
              type="radio"
              name="sttEngine"
              value={opt.value}
              checked={sttEngine === opt.value}
              disabled={!opt.available}
              onChange={() => setSttEngine(opt.value)}
              className="mt-0.5"
            />
            <div>
              <p className="text-sm font-medium text-gray-900">{opt.label}</p>
              <p className="text-xs text-gray-500 mt-0.5">{opt.desc}</p>
              {opt.value === 'webspeech' && !opt.available && (
                <p className="text-xs text-red-500 mt-0.5">当前浏览器不支持</p>
              )}
            </div>
          </label>
        ))}
      </div>
    </div>
  )
}
