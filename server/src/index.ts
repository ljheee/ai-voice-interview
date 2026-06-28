import { createServer } from 'http'
import path from 'path'
import express from 'express'
import cors from 'cors'
import { WebSocketServer, WebSocket } from 'ws'
import { sessionStore } from './sessionStore'
import { streamInterviewResponse, generateReport } from './llm'
import { attachDoubaoProxy } from './doubao-proxy'
import { attachDoubaoTtsProxy } from './tts-doubao-proxy'
import type { ClientMessage, ServerMessage } from './types'

const app = express()
const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3001

app.use(cors())
app.use(express.json())

// Serve local model files (e.g. Xenova/whisper-small) for browser-side ONNX inference
app.use('/models', express.static(path.join(__dirname, '..', 'public', 'models'), {
  setHeaders: (res) => {
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
  },
}))

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

// ─── HTTP server + WebSocket server ──────────────────────────────────────────

const httpServer = createServer(app)
const wss = new WebSocketServer({ noServer: true })
const doubaoWss = attachDoubaoProxy()
const doubaoTtsWss = attachDoubaoTtsProxy()

httpServer.on('upgrade', (req, socket, head) => {
  const path = req.url?.split('?')[0]
  if (path === '/ws/interview') {
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req))
  } else if (path === '/asr/doubao') {
    doubaoWss.handleUpgrade(req, socket, head, (ws) => doubaoWss.emit('connection', ws, req))
  } else if (path === '/tts/doubao') {
    doubaoTtsWss.handleUpgrade(req, socket, head, (ws) => doubaoTtsWss.emit('connection', ws, req))
  } else {
    socket.destroy()
  }
})

function send(ws: WebSocket, msg: ServerMessage) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg))
  }
}

wss.on('connection', (ws) => {
  ws.on('message', async (raw) => {
    let msg: ClientMessage
    try {
      msg = JSON.parse(raw.toString())
    } catch {
      send(ws, { type: 'error', message: 'Invalid JSON' })
      return
    }

    if (msg.type === 'session_init') {
      sessionStore.create(msg.sessionId, msg.totalMinutes, msg.resumeText, msg.skipIntro)
      send(ws, { type: 'session_ready' })
      return
    }

    if (msg.type === 'session_end') {
      const session = sessionStore.get(msg.sessionId)
      if (!session) {
        send(ws, { type: 'error', message: 'Unknown session' })
        return
      }
      try {
        const report = await generateReport(session, session.history)
        send(ws, { type: 'report', report })
        // Keep the session if we returned a fallback report — the client may
        // ask us to regenerate. Only release when a real LLM-generated report
        // has been delivered.
        if (!report.is_fallback) sessionStore.delete(msg.sessionId)
      } catch (err) {
        console.error('Report generation error:', err)
        send(ws, { type: 'error', message: String(err) })
      }
      return
    }

    if (msg.type === 'user_turn') {
      const session = sessionStore.get(msg.sessionId)
      if (!session) {
        send(ws, { type: 'error', message: 'Unknown session — please refresh' })
        return
      }

      // Server is the source of truth for interview time.
      const elapsedMin = Math.floor((Date.now() - session.startedAt) / 60000)
      const remainingMin = Math.max(0, session.totalMinutes - elapsedMin)
      const shouldCloseGracefully = remainingMin < 3

      // Record user message
      sessionStore.recordTurn(msg.sessionId, 'user', msg.text)

      let aiText = ''
      let streamError: unknown = null

      try {
        for await (const event of streamInterviewResponse(session, msg.text, shouldCloseGracefully)) {
          if (event.type === 'thinking') {
            sessionStore.applyThinking(
              session.sessionId,
              event.payload,
              event.payload.action === 'next_question' ? event.payload.selected_id : undefined
            )
          }
          if (event.type === 'sentence') {
            aiText += event.text
          }
          send(ws, event)
        }
        // Record AI response (aggregate sentences)
        if (aiText.trim()) {
          sessionStore.recordTurn(msg.sessionId, 'ai', aiText.trim())
        }
        const updated = sessionStore.get(msg.sessionId)
        send(ws, { type: 'turn_end', askedIds: updated?.askedIds ?? [] })
      } catch (err) {
        streamError = err
        // Save partial AI response even if stream failed
        if (aiText.trim()) {
          sessionStore.saveIncompleteAI(msg.sessionId, aiText)
        }
        const isTimeout = String(err).includes('timed out') || String(err).includes('timeout')
        if (isTimeout) {
          console.warn('[LLM] request timed out — all providers exhausted')
          send(ws, { type: 'error', message: '面试官暂时无响应，请再说一遍' })
        } else {
          console.error('[LLM] error:', err)
          send(ws, { type: 'error', message: '面试官出现错误，请再说一遍' })
        }
      }
      return
    }
  })

  ws.on('error', (err) => console.error('WS error:', err))
})

httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`)
})
