import { Router } from 'express'
import https from 'https'
import http from 'http'

const router = Router()

const MURF_URL = 'https://global.api.murf.ai/v1/speech/stream'

/**
 * POST /tts/murf
 * Body: { text: string, hint: 'first'|'question'|'default', rate?: number }
 * Proxies to Murf API and streams MP3 bytes back to the browser.
 * Keeps the API key server-side.
 */
router.post('/murf', async (req, res) => {
  const apiKey = process.env.MURF_API_KEY
  if (!apiKey) {
    res.status(503).json({ error: 'MURF_API_KEY not configured' })
    return
  }

  const { text, rate = 0 } = req.body as { text: string; rate?: number }
  if (!text?.trim()) {
    res.status(400).json({ error: 'text is required' })
    return
  }

  const payload = JSON.stringify({
    voiceId: 'Tao',
    style: 'Conversational',
    text: text.trim(),
    rate,
    locale: 'zh-CN',
    model: 'FALCON',
    format: 'MP3',
    sampleRate: 24000,
    channelType: 'MONO',
  })

  const url = new URL(MURF_URL)
  const options = {
    hostname: url.hostname,
    path: url.pathname,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'api-key': apiKey,
      'Content-Length': Buffer.byteLength(payload),
    },
  }

  const mod = url.protocol === 'https:' ? https : http
  const proxyReq = mod.request(options, (proxyRes) => {
    if (proxyRes.statusCode !== 200) {
      res.status(proxyRes.statusCode ?? 502).json({
        error: `Murf API error: ${proxyRes.statusCode} ${proxyRes.statusMessage}`,
      })
      return
    }
    res.setHeader('Content-Type', 'audio/mpeg')
    proxyRes.pipe(res)
  })

  proxyReq.on('error', (err) => {
    console.error('[TTS] Murf proxy error:', err)
    if (!res.headersSent) res.status(502).json({ error: String(err) })
  })

  proxyReq.write(payload)
  proxyReq.end()
})

export default router
