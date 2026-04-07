'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useSettingsStore } from '@/lib/store/settingsStore'
import { STTSelector } from '@/components/settings/STTSelector'

const COMPANY_OPTIONS = ['字节跳动', '阿里巴巴', '腾讯', '美团', '京东', '百度', '滴滴', '快手', '拼多多', '华为']
const SKILL_OPTIONS = [
  'Redis', 'MySQL', 'Kafka', '分布式', '并发', 'JVM', 'Spring', 'MyBatis',
  '微服务', 'Docker', '算法', '网络', '操作系统', '设计模式', 'Elasticsearch',
]
const DURATION_OPTIONS = [30, 45, 60, 90]

export default function SetupPage() {
  const router = useRouter()
  const {
    targetCompanies, targetSkillTags, totalInterviewMinutes,
    resumeText: storedResumeText, skipIntro: storedSkipIntro,
    useQuestionBank: storedUseQB, questionBankUrl: storedQBUrl,
    setInterviewProfile, ttsEngine, setTTSEngine,
    murfApiKey, setMurfApiKey, azureTTSKey, azureTTSRegion, setAzureTTS,
  } = useSettingsStore()

  const [companies, setCompanies] = useState<string[]>(targetCompanies)
  const [skills, setSkills] = useState<string[]>(targetSkillTags)
  const [duration, setDuration] = useState(totalInterviewMinutes)
  const [resumeText, setResumeText] = useState(storedResumeText)
  const [skipIntro, setSkipIntro] = useState(storedSkipIntro)
  const [useQuestionBank, setUseQuestionBank] = useState(storedUseQB)
  const [questionBankUrl, setQuestionBankUrl] = useState(storedQBUrl)
  const [fileError, setFileError] = useState('')
  const [fileLoading, setFileLoading] = useState(false)

  function toggle<T>(arr: T[], item: T): T[] {
    return arr.includes(item) ? arr.filter((x) => x !== item) : [...arr, item]
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setFileError('')
    setFileLoading(true)
    try {
      let text = ''
      if (file.name.endsWith('.txt')) {
        text = await file.text()
      } else if (file.name.endsWith('.pdf')) {
        const pdfjsLib = await import('pdfjs-dist')
        pdfjsLib.GlobalWorkerOptions.workerSrc =
          `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`
        const arrayBuffer = await file.arrayBuffer()
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise
        const pages = await Promise.all(
          Array.from({ length: pdf.numPages }, (_, i) =>
            pdf.getPage(i + 1)
              .then((p) => p.getTextContent())
              .then((c) => c.items.map((it) => ('str' in it ? it.str : '')).join(' '))
          )
        )
        text = pages.join('\n')
      } else if (file.name.endsWith('.docx')) {
        const mammoth = await import('mammoth')
        const arrayBuffer = await file.arrayBuffer()
        const result = await mammoth.extractRawText({ arrayBuffer })
        text = result.value
      } else {
        setFileError('仅支持 .txt / .pdf / .docx 格式')
        return
      }
      const trimmed = text.trim()
      if (trimmed.length > 50_000) {
        setFileError('简历文本过长，建议保留关键项目经历（< 5000 字）')
      }
      setResumeText(trimmed)
    } catch {
      setFileError('文件解析失败，请尝试粘贴文本')
    } finally {
      setFileLoading(false)
      // Reset input so same file can be re-uploaded
      e.target.value = ''
    }
  }

  function handleStart() {
    setInterviewProfile(companies, skills, duration, resumeText, skipIntro, useQuestionBank, questionBankUrl)
    router.push('/interview')
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-4 h-14 flex items-center">
        <h1 className="font-bold text-gray-900">面试配置</h1>
      </header>

      <main className="max-w-lg mx-auto px-4 py-8 space-y-6">
        {/* Resume */}
        <section className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 space-y-3">
          <h2 className="font-semibold text-gray-800 text-sm">简历（可选）</h2>
          <p className="text-xs text-gray-400">AI 将据此考察项目经历真实性、复杂度和技能深度</p>
          <textarea
            rows={6}
            placeholder="粘贴简历文本..."
            className="w-full text-sm border border-gray-200 rounded px-3 py-2 resize-y focus:outline-none focus:ring-1 focus:ring-blue-300"
            value={resumeText}
            onChange={(e) => setResumeText(e.target.value)}
          />
          <div className="flex items-center gap-3">
            <label className="text-xs text-blue-600 cursor-pointer hover:text-blue-700 underline-offset-2 hover:underline">
              上传文件（.txt / .pdf / .docx）
              <input
                type="file"
                accept=".txt,.pdf,.docx"
                className="hidden"
                onChange={handleFileUpload}
              />
            </label>
            {fileLoading && <span className="text-xs text-gray-400">解析中…</span>}
            {fileError && <span className="text-xs text-red-500">{fileError}</span>}
            {!fileLoading && !fileError && resumeText && (
              <span className="text-xs text-green-600">{resumeText.length} 字符</span>
            )}
          </div>
        </section>

        {/* Target companies */}
        <section className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 space-y-3">
          <h2 className="font-semibold text-gray-800 text-sm">目标公司</h2>
          <p className="text-xs text-gray-400">选择后优先出现相关高频题</p>
          <div className="flex flex-wrap gap-2">
            {COMPANY_OPTIONS.map((c) => (
              <button
                key={c}
                onClick={() => setCompanies(toggle(companies, c))}
                className={`px-3 py-1 rounded-full text-sm border transition-colors ${
                  companies.includes(c)
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white text-gray-600 border-gray-200 hover:border-blue-300'
                }`}
              >
                {c}
              </button>
            ))}
          </div>
          {companies.length === 0 && (
            <p className="text-xs text-amber-500">未选择时按全库频率排序</p>
          )}
        </section>

        {/* Target skills */}
        <section className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 space-y-3">
          <h2 className="font-semibold text-gray-800 text-sm">技能方向</h2>
          <p className="text-xs text-gray-400">对应简历上的技术栈，AI 优先考察这些方向</p>
          <div className="flex flex-wrap gap-2">
            {SKILL_OPTIONS.map((s) => (
              <button
                key={s}
                onClick={() => setSkills(toggle(skills, s))}
                className={`px-3 py-1 rounded-full text-sm border transition-colors ${
                  skills.includes(s)
                    ? 'bg-green-600 text-white border-green-600'
                    : 'bg-white text-gray-600 border-gray-200 hover:border-green-300'
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </section>

        {/* Duration */}
        <section className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 space-y-3">
          <h2 className="font-semibold text-gray-800 text-sm">面试时长</h2>
          <div className="flex gap-3">
            {DURATION_OPTIONS.map((d) => (
              <button
                key={d}
                onClick={() => setDuration(d)}
                className={`flex-1 py-2 rounded-lg text-sm border transition-colors ${
                  duration === d
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white text-gray-600 border-gray-200 hover:border-blue-300'
                }`}
              >
                {d} 分钟
              </button>
            ))}
          </div>
        </section>

        {/* Skip intro */}
        <section className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={skipIntro}
              onChange={(e) => setSkipIntro(e.target.checked)}
              className="w-4 h-4 rounded border-gray-300 text-blue-600 accent-blue-600"
            />
            <div>
              <p className="text-sm font-medium text-gray-800">跳过自我介绍，直接进入技术考察</p>
              <p className="text-xs text-gray-400 mt-0.5">适合已熟悉岗位要求、想直接练习技术问答的场景</p>
            </div>
          </label>
        </section>

        {/* Question bank */}
        <section className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 space-y-3">
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={useQuestionBank}
              onChange={(e) => setUseQuestionBank(e.target.checked)}
              className="w-4 h-4 rounded border-gray-300 text-blue-600 accent-blue-600"
            />
            <div>
              <p className="text-sm font-medium text-gray-800">使用外部题库</p>
              <p className="text-xs text-gray-400 mt-0.5">关闭时由 LLM 完全自主出题</p>
            </div>
          </label>
          {useQuestionBank && (
            <input
              type="text"
              placeholder="题库 API 地址（如 http://localhost:8000）"
              className="w-full text-sm border border-gray-200 rounded px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-300"
              value={questionBankUrl}
              onChange={(e) => setQuestionBankUrl(e.target.value)}
            />
          )}
        </section>

        {/* Voice settings */}
        <section className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 space-y-4">
          <h2 className="font-semibold text-gray-800 text-sm">语音设置</h2>
          <STTSelector />

          {/* TTS engine selector */}
          <div className="space-y-2">
            <p className="text-sm font-medium text-gray-700">TTS 引擎</p>
            <div className="flex gap-2">
              {(['murf', 'azure', 'system'] as const).map((e) => (
                <button
                  key={e}
                  onClick={() => setTTSEngine(e)}
                  className={`flex-1 py-1.5 rounded-lg text-sm border transition-colors ${
                    ttsEngine === e
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-white text-gray-600 border-gray-200 hover:border-blue-300'
                  }`}
                >
                  {e === 'murf' ? 'Murf' : e === 'azure' ? 'Azure' : '系统'}
                </button>
              ))}
            </div>
            {ttsEngine === 'murf' && (
              <div className="space-y-1">
                <input
                  type="password"
                  placeholder="Murf API Key"
                  className="w-full text-sm border border-gray-200 rounded px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-300"
                  defaultValue={murfApiKey}
                  onBlur={(e) => setMurfApiKey(e.target.value)}
                />
                {!murfApiKey && (
                  <p className="text-xs text-amber-500">未填 Key 将降级到系统语音合成</p>
                )}
              </div>
            )}
          </div>

          {/* Azure TTS config — only shown when azure is selected */}
          {ttsEngine === 'azure' && (
            <div className="space-y-2">
              <input
                type="password"
                placeholder="Azure API Key"
                className="w-full text-sm border border-gray-200 rounded px-3 py-2"
                defaultValue={azureTTSKey}
                onBlur={(e) => setAzureTTS(e.target.value, azureTTSRegion)}
              />
              <input
                type="text"
                placeholder="Region（如 eastasia）"
                className="w-full text-sm border border-gray-200 rounded px-3 py-2"
                defaultValue={azureTTSRegion}
                onBlur={(e) => setAzureTTS(azureTTSKey, e.target.value)}
              />
              {!azureTTSKey && (
                <p className="text-xs text-amber-500">未填 Key 将降级到系统语音合成</p>
              )}
            </div>
          )}
        </section>

        {/* Start button */}
        <button
          onClick={handleStart}
          className="w-full py-3 bg-blue-600 text-white rounded-xl font-semibold text-base hover:bg-blue-700 transition-colors shadow-sm"
        >
          开始面试
        </button>
      </main>
    </div>
  )
}
