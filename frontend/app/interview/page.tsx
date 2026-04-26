'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { PTTButton } from '@/components/interview/PTTButton'
import { Subtitle } from '@/components/interview/Subtitle'
import { AudioWaveform } from '@/components/interview/AudioWaveform'
import { ThinkingPanel } from '@/components/interview/ThinkingPanel'
import { TimerBar } from '@/components/interview/TimerBar'
import { STTSelector } from '@/components/settings/STTSelector'
import { useSettingsStore } from '@/lib/store/settingsStore'
import { WebSpeechSTT } from '@/lib/stt/WebSpeechSTT'
import { WhisperONNXSTT } from '@/lib/stt/WhisperONNXSTT'
import { DoubaoSTT } from '@/lib/stt/DoubaoSTT'
import { TTSQueue } from '@/lib/tts/TTSQueue'
import { AzureTTSProvider } from '@/lib/tts/azureTTS'
import { MurfTTSProvider } from '@/lib/tts/murfTTS'
import { DoubaoTTSProvider } from '@/lib/tts/doubaoTTS'
import { useInterviewWS } from '@/lib/ws/useInterviewWS'
import { useInterviewTimer } from '@/lib/interview/useInterviewTimer'
import { useVADFallback } from '@/lib/interview/useVADFallback'
import { saveReport } from '@/lib/interview/reportStorage'
import { StageIndicator } from '@/components/interview/StageIndicator'
import type { STTProvider } from '@/lib/stt/STTProvider'
import type { ThinkingPayload, CandidateQuestion, InterviewStage } from '@/lib/types'

interface ChatEntry {
  role: 'ai' | 'user'
  text: string
}

export default function InterviewPage() {
  const router = useRouter()
  const {
    sttEngine, doubaoCookie, ttsEngine, murfApiKey, azureTTSKey, azureTTSRegion,
    targetCompanies, targetSkillTags, totalInterviewMinutes,
    resumeText, skipIntro, useQuestionBank, questionBankUrl,
  } = useSettingsStore()

  // ── Setup guard ───────────────────────────────────────────────────────────
  // Redirect to setup if the store hasn't been hydrated with a meaningful config.
  // We check for the persisted key rather than specific values so users who
  // intentionally left companies/skills empty still get through.
  useEffect(() => {
    const stored = localStorage.getItem('ai-interview-settings')
    if (!stored) router.replace('/interview/setup')
  }, [router])

  // ── UI state ──────────────────────────────────────────────────────────────
  const [interimText, setInterimText] = useState('')
  const [finalText, setFinalText] = useState('')
  const [aiSpeaking, setAiSpeaking] = useState(false)
  const [llmThinking, setLlmThinking] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [showThinking, setShowThinking] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const [thinking, setThinking] = useState<ThinkingPayload | null>(null)
  const [vadStatus, setVadStatus] = useState<'idle' | 'recording' | 'processing'>('idle')
  const [ending, setEnding] = useState(false)
  const [wsError, setWsError] = useState<string | null>(null)
  const [pttCountdown, setPttCountdown] = useState<number | null>(null)
  const [chatHistory, setChatHistory] = useState<ChatEntry[]>([])
  const [currentStage, setCurrentStage] = useState<InterviewStage>(
    skipIntro ? 'project' : 'intro'
  )

  // ── Session init ──────────────────────────────────────────────────────────
  const [sessionId] = useState(() => crypto.randomUUID())

  // ── Refs ──────────────────────────────────────────────────────────────────
  const sttRef = useRef<STTProvider | null>(null)
  const ttsQueueRef = useRef<TTSQueue | null>(null)
  const sendUserTurnRef = useRef<(text: string) => void>(() => {})
  const sendSessionEndRef = useRef<() => void>(() => {})
  const handlePTTEndRef = useRef<() => void>(() => {})
  const vadFallbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const countdownIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const vadStatusRef = useRef<'idle' | 'recording' | 'processing'>('idle')
  const aiSentenceBufferRef = useRef<string>('')  // accumulates AI sentences per turn
  const aiTurnSentenceIdxRef = useRef<number>(0)  // sentence index within current AI turn (for SSML hint)

  // ── TTS queue ─────────────────────────────────────────────────────────────
  // Rebuild TTSQueue whenever provider config changes.
  // Also update immediately after Zustand hydrates from localStorage
  // (persist middleware fires a state update after first render).
  useEffect(() => {
    const provider =
      ttsEngine === 'murf'   ? (murfApiKey   ? new MurfTTSProvider(murfApiKey) : null) :
      ttsEngine === 'azure'  ? (azureTTSKey  ? new AzureTTSProvider(azureTTSKey, azureTTSRegion) : null) :
      ttsEngine === 'doubao' ? (doubaoCookie ? new DoubaoTTSProvider(doubaoCookie) : null) :
      null  // 'system' — TTSQueue falls back to SpeechSynthesis
    ttsQueueRef.current = new TTSQueue(provider)
  }, [ttsEngine, murfApiKey, azureTTSKey, azureTTSRegion, doubaoCookie])

  // ── Timer ─────────────────────────────────────────────────────────────────
  const { startTimer, startTurn, stopTurn, state: timerState } = useInterviewTimer({
    totalMinutes: totalInterviewMinutes,
    maxTurnMinutes: 5,
    onTurnOvertime: () => handlePTTEndRef.current(),
    onInterviewEnd: () => handleEndInterview(),
  })

  // ── STT provider ──────────────────────────────────────────────────────────
  useEffect(() => {
    sttRef.current?.stop()
    sttRef.current = null

    const provider: STTProvider =
      sttEngine === 'webspeech' ? new WebSpeechSTT() :
      sttEngine === 'doubao' ? new DoubaoSTT(doubaoCookie) :
      new WhisperONNXSTT()

    provider.on('interim', setInterimText)
    provider.on('error', (errCode) => {
      const msg = errCode === 'network' ? '语音识别网络异常，请检查网络后重试' : `语音识别错误：${errCode}`
      setWsError(msg)
    })
    provider.on('thinking', () => {
      // Whisper worker is still inferring — extend the safety timeout to 15s
      // so "识别中" stays visible while the ONNX model runs inference
      if (vadFallbackTimerRef.current) {
        clearTimeout(vadFallbackTimerRef.current)
        vadFallbackTimerRef.current = null
      }
      vadFallbackTimerRef.current = setTimeout(() => {
        vadFallbackTimerRef.current = null
        if (vadStatusRef.current === 'processing') {
          vadStatusRef.current = 'idle'
          setVadStatus('idle')
        }
      }, 15_000)
    })
    provider.on('final', (text) => {
      console.log('[STT] final received, status:', vadStatusRef.current, 'trimmed:', JSON.stringify(text.trim().slice(0, 50)))

      // Guard: WebSpeech continuous mode fires native finals on silence even while
      // the user is still holding PTT. Ignore them — only process finals that arrive
      // after PTT is released (processing state) or as a genuine stop signal.
      if (vadStatusRef.current === 'recording') {
        console.log('[STT] native final ignored — PTT still held, waiting for release')
        return
      }

      if (vadFallbackTimerRef.current) {
        clearTimeout(vadFallbackTimerRef.current)
        vadFallbackTimerRef.current = null
      }
      setInterimText('')
      setFinalText(text)
      vadStatusRef.current = 'idle'
      setVadStatus('idle')  // final arrived — stop showing 'processing'
      if (text.trim()) {
        setChatHistory((h) => [...h, { role: 'user', text }])
        sendUserTurnRef.current(text)
      } else {
        console.warn('[STT] final text is empty — skipping sendUserTurn')
      }
    })

    sttRef.current = provider
    if (sttEngine === 'whisper') {
      ;(provider as WhisperONNXSTT).preload().catch(console.error)
    }
  }, [sttEngine])

  // ── WebSocket ─────────────────────────────────────────────────────────────
  const { sendUserTurn, sendSessionEnd, status: wsStatus } = useInterviewWS(
    sessionId,
    {
      onThinking: (payload) => {
        setThinking(payload)
        setLlmThinking(false)  // thinking block done, speech is next
        if (payload.current_stage) setCurrentStage(payload.current_stage)
      },
      onSentence: (text) => {
        setLlmThinking(false)
        setAiSpeaking(true)
        aiSentenceBufferRef.current += text

        const idx = aiTurnSentenceIdxRef.current
        aiTurnSentenceIdxRef.current = idx + 1
        const hint = idx === 0 ? 'first' : /[？?]\s*$/.test(text) ? 'question' : 'default'

        ttsQueueRef.current?.push(text, hint)
        ttsQueueRef.current?.onIdle(() => setAiSpeaking(false))
      },
      onTurnEnd: (_askedIds) => {
        setLlmThinking(false)
        aiTurnSentenceIdxRef.current = 0
        // Commit AI turn to history
        const aiText = aiSentenceBufferRef.current.trim()
        if (aiText) setChatHistory((h) => [...h, { role: 'ai', text: aiText }])
        aiSentenceBufferRef.current = ''
        // Re-register onIdle so it fires when TTS finishes this turn's sentences.
        // If TTS is already idle (no sentences were pushed), fire immediately.
        if (ttsQueueRef.current?.isActive) {
          ttsQueueRef.current.onIdle(() => setAiSpeaking(false))
        } else {
          setAiSpeaking(false)
        }
      },
      onReport: (report) => {
        saveReport(report, sessionId)
        router.push('/interview/report')
      },
      onError: (msg) => {
        console.error('WS error:', msg)
        setWsError(msg)
        // Reset thinking state so the UI doesn't stay stuck on "面试官思考中"
        setLlmThinking(false)
        // If we were waiting for the report, unblock the ending state so the
        // user sees the error banner and can retry or navigate away
        setEnding(false)
      },
    },
    totalInterviewMinutes,
    resumeText,
    skipIntro,
  )

  useEffect(() => {
    sendUserTurnRef.current = (text: string) => {
      setLlmThinking(true)  // show 'thinking' as soon as we send to LLM
      sendUserTurn(text)
    }
  }, [sendUserTurn])
  useEffect(() => { sendSessionEndRef.current = sendSessionEnd }, [sendSessionEnd])

  // Clear WS error when connection recovers
  useEffect(() => {
    if (wsStatus === 'ready') setWsError(null)
  }, [wsStatus])

  // ── PTT handlers ──────────────────────────────────────────────────────────
  const hardLimitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clearCountdown = useCallback(() => {
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current)
      countdownIntervalRef.current = null
    }
    setPttCountdown(null)
  }, [])

  const handlePTTStart = useCallback(() => {
    startTimer()
    startTurn()
    setInterimText('')
    setFinalText('')
    setWsError(null)  // clear any previous LLM error on retry
    vadStatusRef.current = 'recording'
    setVadStatus('recording')
    sttRef.current?.start()
    hardLimitTimerRef.current = setTimeout(() => handlePTTEndRef.current(), 300_000)
  }, [startTimer, startTurn])

  const handlePTTEnd = useCallback(() => {
    clearCountdown()
    stopTurn()
    if (hardLimitTimerRef.current) { clearTimeout(hardLimitTimerRef.current); hardLimitTimerRef.current = null }
    vadStatusRef.current = 'processing'
    setVadStatus('processing')
    sttRef.current?.stop()
    // Fallback: keep showing "识别中" until final arrives (handled in STT 'final' callback).
    // This timer is only a last-resort safety net for cases where WebSpeech never fires final
    // (e.g. network error, browser bug). 10s is generous enough to cover normal latency.
    if (vadFallbackTimerRef.current) clearTimeout(vadFallbackTimerRef.current)
    vadFallbackTimerRef.current = setTimeout(() => {
      console.warn('[STT] 10s safety timeout — final never arrived, forcing idle')
      vadFallbackTimerRef.current = null
      if (vadStatusRef.current === 'processing') {
        vadStatusRef.current = 'idle'
        setVadStatus('idle')
      }
    }, 10_000)
  }, [stopTurn, clearCountdown])

  useEffect(() => { handlePTTEndRef.current = handlePTTEnd }, [handlePTTEnd])

  // ── VAD fallback ──────────────────────────────────────────────────────────
  useVADFallback({
    recording: vadStatus === 'recording',
    enabled: sttEngine === 'webspeech',
    onSilenceStart: () => {
      // Start 3-second countdown; auto-release PTT when it hits 0
      clearCountdown()
      setPttCountdown(3)
      let remaining = 3
      countdownIntervalRef.current = setInterval(() => {
        remaining -= 1
        if (remaining <= 0) {
          clearCountdown()
          handlePTTEndRef.current()
        } else {
          setPttCountdown(remaining)
        }
      }, 1000)
    },
    onSilenceCancel: () => {
      clearCountdown()
    },
  })

  // ── Prevent space key scroll ──────────────────────────────────────────────
  useEffect(() => {
    const preventScroll = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        const target = e.target as HTMLElement
        const tag = target?.tagName
        const isEditable = target?.isContentEditable
        if (tag !== 'INPUT' && tag !== 'TEXTAREA' && !isEditable) {
          e.preventDefault()
        }
      }
    }
    // 使用捕获阶段确保在事件到达目标前处理
    document.addEventListener('keydown', preventScroll, { capture: true })
    return () => document.removeEventListener('keydown', preventScroll, { capture: true })
  }, [])

  // ── End interview ─────────────────────────────────────────────────────────
  const handleEndInterview = useCallback(() => {
    if (ending) return
    setEnding(true)
    ttsQueueRef.current?.clear()
    sttRef.current?.stop()
    sendSessionEndRef.current()
  }, [ending])

  // ── WS error / disconnected overlay ──────────────────────────────────────
  // wsError set by onError callback = LLM-level error (WS still alive)
  // showDisconnected = actual WS transport failure
  const showDisconnected = (wsStatus === 'error' || wsStatus === 'closed') && !ending && !wsError

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-4 h-14 flex items-center justify-between shrink-0">
        <h1 className="font-bold text-gray-900 shrink-0">AI 模拟面试</h1>
        <StageIndicator currentStage={currentStage} skipIntro={skipIntro} />
        <div className="flex items-center gap-2">
          <span className={`text-xs px-2 py-0.5 rounded-full ${
            wsStatus === 'ready' ? 'bg-green-100 text-green-700' :
            wsStatus === 'connecting' ? 'bg-yellow-100 text-yellow-700' :
            'bg-red-100 text-red-600'
          }`}>
            {wsStatus === 'ready' ? '已连接' : wsStatus === 'connecting' ? '连接中' : '已断开'}
          </span>
          <button onClick={() => setShowHistory((v) => !v)}
            className="text-xs px-2 py-1 rounded-full bg-gray-100 text-gray-600 hover:bg-gray-200">
            对话记录
          </button>
          <button onClick={() => setShowThinking((v) => !v)}
            className="text-xs px-2 py-1 rounded-full bg-blue-50 text-blue-600 hover:bg-blue-100">
            思考过程
          </button>
          <button onClick={() => setShowSettings((v) => !v)}
            className="text-sm text-gray-500 hover:text-gray-800">
            设置
          </button>
          <button
            onClick={handleEndInterview}
            disabled={ending || wsStatus !== 'ready'}
            className="text-xs px-2 py-1 rounded bg-gray-100 text-gray-600 hover:bg-gray-200 disabled:opacity-40">
            {ending ? '生成报告…' : '结束面试'}
          </button>
        </div>
      </header>

      {/* Settings panel */}
      {showSettings && (
        <div className="bg-white border-b border-gray-200 px-4 py-4 max-w-md mx-auto w-full">
          <STTSelector />
          <div className="mt-4 space-y-2">
            <p className="text-sm font-medium text-gray-700">Azure TTS 配置</p>
            <input type="password" placeholder="API Key"
              className="w-full text-sm border border-gray-200 rounded px-3 py-2"
              defaultValue={azureTTSKey}
              onBlur={(e) => useSettingsStore.getState().setAzureTTS(e.target.value, useSettingsStore.getState().azureTTSRegion)}
            />
            <input type="text" placeholder="Region (e.g. eastasia)"
              className="w-full text-sm border border-gray-200 rounded px-3 py-2"
              defaultValue={azureTTSRegion}
              onBlur={(e) => useSettingsStore.getState().setAzureTTS(useSettingsStore.getState().azureTTSKey, e.target.value)}
            />
            {!azureTTSKey && <p className="text-xs text-amber-600">未配置 Azure Key，TTS 将降级到系统语音合成</p>}
          </div>
        </div>
      )}

      {/* LLM error banner (WS still alive — user can retry) */}
      {wsError && wsStatus === 'ready' && (
        <div className="bg-amber-50 border-b border-amber-200 px-4 py-2 flex items-center justify-between">
          <p className="text-sm text-amber-800">{wsError}</p>
          <button
            onClick={() => setWsError(null)}
            className="text-xs px-2 py-1 text-amber-600 hover:text-amber-800"
          >
            ✕
          </button>
        </div>
      )}

      {/* WS disconnected banner */}
      {showDisconnected && (
        <div className="bg-red-50 border-b border-red-200 px-4 py-3 flex items-center justify-between">
          <p className="text-sm text-red-700">
            {wsError ? `连接错误：${wsError}` : '与面试服务器的连接已断开'}
          </p>
          <button
            onClick={() => window.location.reload()}
            className="text-xs px-3 py-1 bg-red-600 text-white rounded hover:bg-red-700"
          >
            重新连接
          </button>
        </div>
      )}

      {/* Main interview area — fixed layout, button never moves */}
      <main className="flex-1 flex flex-col items-center p-4 pt-6 overflow-hidden">
        {/* Timer — fixed height, only visible after start */}
        <div className="w-full max-w-lg h-6 shrink-0 mb-4">
          {timerState.elapsedSec > 0 && (
            <TimerBar elapsedSec={timerState.elapsedSec} totalSec={timerState.totalSec} />
          )}
        </div>

        {/* Status line — fixed height */}
        <div className="h-8 shrink-0 flex items-center justify-center mb-4">
          {ending ? (
            <p className="text-sm text-gray-400">正在生成评测报告…</p>
          ) : aiSpeaking ? (
            <AudioWaveform active={true} />
          ) : (
            <p className="text-sm text-gray-400">
              {vadStatus === 'recording'
                ? `正在录音… ${timerState.isTurnOvertime ? '（即将自动结束）' : ''}`
                : vadStatus === 'processing' ? '识别中...'
                : llmThinking ? '面试官思考中…'
                : wsError ? '请再说一遍'
                : wsStatus === 'ready' ? '面试官等待中'
                : '正在连接面试服务...'}
            </p>
          )}
        </div>

        {/* Subtitle box — fixed height, text scrolls inside */}
        <div className="w-full max-w-lg bg-white rounded-xl shadow-sm border border-gray-100 p-4 shrink-0 mb-8">
          <Subtitle interim={interimText} final={finalText} />
        </div>

        {/* PTT button — always at same vertical position */}
        <div className="shrink-0">
          <PTTButton
            onPressStart={handlePTTStart}
            onPressEnd={handlePTTEnd}
            disabled={aiSpeaking || wsStatus !== 'ready' || ending || vadStatus === 'processing'}
            countdown={pttCountdown}
          />
        </div>

        <p className="text-xs text-gray-400 mt-4 shrink-0">按住按钮或按空格键开始说话</p>
      </main>

      {/* Chat history drawer */}
      {showHistory && (
        <>
          <div className="fixed inset-0 bg-black/20 z-20 lg:hidden" onClick={() => setShowHistory(false)} />
          <aside className="fixed top-0 left-0 h-full w-72 bg-white border-r border-gray-200 z-30 flex flex-col shadow-xl">
            <div className="flex items-center justify-between px-4 h-14 border-b border-gray-100 shrink-0">
              <span className="font-semibold text-sm text-gray-700">对话记录</span>
              <button onClick={() => setShowHistory(false)} className="text-gray-400 hover:text-gray-600 text-lg">×</button>
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-3">
              {chatHistory.length === 0 ? (
                <p className="text-gray-400 text-sm text-center mt-8">对话开始后显示</p>
              ) : (
                chatHistory.map((entry, i) => (
                  <div key={i} className={`flex ${entry.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[85%] px-3 py-2 rounded-xl text-sm leading-relaxed ${
                      entry.role === 'ai'
                        ? 'bg-blue-50 text-blue-900 rounded-tl-none'
                        : 'bg-gray-100 text-gray-800 rounded-tr-none'
                    }`}>
                      {entry.text}
                    </div>
                  </div>
                ))
              )}
            </div>
          </aside>
        </>
      )}

      {/* AG-UI Thinking Panel */}
      <ThinkingPanel
        open={showThinking}
        thinking={thinking}
        onClose={() => setShowThinking(false)}
      />
    </div>
  )
}
