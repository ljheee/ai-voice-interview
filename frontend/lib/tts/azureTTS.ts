'use client'

import type { TTSProvider } from './TTSProvider'

export type SentenceHint = 'first' | 'question' | 'default'

export class AzureTTSProvider implements TTSProvider {
  constructor(
    private apiKey: string,
    private region: string,
    private voice = 'zh-CN-XiaoxiaoNeural'
  ) {}

  synthesize(text: string, hint: SentenceHint): Promise<AudioBuffer> {
    return fetchAzureTTS(text, this.apiKey, this.region, this.voice, hint)
  }
}

const PROSODY_MAP: Record<SentenceHint, { rate: string; pitch: string }> = {
  first:    { rate: 'slow',   pitch: '+0st' },  // opening transition — give user time to absorb
  question: { rate: '85%',    pitch: '+4st' },  // question intonation — slight rise
  default:  { rate: 'medium', pitch: '+2st' },  // normal delivery
}

/**
 * Fetch TTS audio from Azure Cognitive Services.
 * Returns an AudioBuffer decoded and ready to play.
 * Throws on failure — caller (TTSQueue) handles fallback.
 */
export async function fetchAzureTTS(
  text: string,
  apiKey: string,
  region: string,
  voice = 'zh-CN-XiaoxiaoNeural',
  hint: SentenceHint = 'default'
): Promise<AudioBuffer> {
  const { rate, pitch } = PROSODY_MAP[hint]
  const ssml = `
<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="zh-CN">
  <voice name="${voice}">
    <prosody rate="${rate}" pitch="${pitch}">${escapeXml(text)}</prosody>
  </voice>
</speak>`.trim()

  const response = await fetch(
    `https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`,
    {
      method: 'POST',
      headers: {
        'Ocp-Apim-Subscription-Key': apiKey,
        'Content-Type': 'application/ssml+xml',
        'X-Microsoft-OutputFormat': 'audio-16khz-128kbitrate-mono-mp3',
      },
      body: ssml,
    }
  )

  if (!response.ok) {
    throw new Error(`Azure TTS failed: ${response.status} ${response.statusText}`)
  }

  const arrayBuffer = await response.arrayBuffer()
  const audioContext = getAudioContext()
  return audioContext.decodeAudioData(arrayBuffer)
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

let _audioContext: AudioContext | null = null

export function getAudioContext(): AudioContext {
  if (!_audioContext || _audioContext.state === 'closed') {
    _audioContext = new AudioContext()
  }
  return _audioContext
}
