'use client'

import { useState, useEffect } from 'react'
import { useSettingsStore, type STTEngine } from '@/lib/store/settingsStore'
import { WebSpeechSTT } from '@/lib/stt/WebSpeechSTT'

export function STTSelector() {
  const { sttEngine, setSttEngine, doubaoCookie, setDoubaoCookie } = useSettingsStore()
  const [webSpeechSupported, setWebSpeechSupported] = useState(true)
  const [cookieInput, setCookieInput] = useState(doubaoCookie)

  // 从 localStorage 恢复后，同步到输入框
  useEffect(() => { setCookieInput(doubaoCookie) }, [doubaoCookie])

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
    {
      value: 'doubao',
      label: '豆包 ASR',
      desc: '字节豆包语音识别，流畅稳定，需填入豆包 Cookie',
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
            <div className="flex-1">
              <p className="text-sm font-medium text-gray-900">{opt.label}</p>
              <p className="text-xs text-gray-500 mt-0.5">{opt.desc}</p>
              {opt.value === 'webspeech' && !opt.available && (
                <p className="text-xs text-red-500 mt-0.5">当前浏览器不支持</p>
              )}
            </div>
          </label>
        ))}
      </div>

      {sttEngine === 'doubao' && (
        <div className="mt-3 space-y-1">
          <textarea
            className="w-full text-xs font-mono border border-gray-300 rounded-md p-2 h-20 resize-none focus:outline-none focus:ring-1 focus:ring-blue-500"
            placeholder={`sessionid_ss=xxx...\n打开 doubao.com，F12 → Application → Cookies → sessionid_ss，复制值粘贴到这`}
            value={cookieInput}
            onChange={(e) => setCookieInput(e.target.value)}
            onBlur={() => setDoubaoCookie(cookieInput)}
          />
          {!doubaoCookie && (
            <p className="text-xs text-amber-600">未填入 Cookie，豆包 ASR 将无法使用</p>
          )}
        </div>
      )}
    </div>
  )
}
