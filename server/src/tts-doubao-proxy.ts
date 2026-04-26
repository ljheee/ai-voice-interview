import { WebSocketServer, WebSocket } from 'ws'

const DEFAULT_SPEAKER = 'zh_female_taozi_conversation_v4_wvae_bigtts'

const CONNECT_TIMEOUT = 10000

function buildTtsUrl(speaker: string): string {
  return (
    'wss://ws-samantha.doubao.com/samantha/audio/tts' +
    `?speaker=${encodeURIComponent(speaker)}` +
    '&format=aac&speech_rate=0&pitch=0' +
    '&version_code=20800&language=zh&device_platform=web' +
    '&aid=497858&real_aid=497858&pkg_type=release_version' +
    '&device_id=7616216604401780224&pc_version=3.15.1' +
    '&web_id=7627108056602248710&tea_uuid=7627108056602248710' +
    '&region=&sys_region=&samantha_web=1&use-olympus-account=1'
  )
}

export function attachDoubaoTtsProxy(): WebSocketServer {
  const wss = new WebSocketServer({ noServer: true })

  wss.on('connection', (clientWs: WebSocket) => {
    let upstream: WebSocket | null = null
    const pending: string[] = []
    let authed = false
    let connectTimeout: NodeJS.Timeout | null = null

    clientWs.on('message', (data, isBinary) => {
      if (!authed) {
        try {
          const msg = JSON.parse(data.toString())
          if (msg.type !== 'auth' || !msg.cookie) {
            clientWs.close(4001, 'First message must be auth')
            return
          }
          authed = true
          const speaker = typeof msg.speaker === 'string' && msg.speaker ? msg.speaker : DEFAULT_SPEAKER

          upstream = new WebSocket(buildTtsUrl(speaker), {
            headers: {
              Cookie: msg.cookie,
              Origin: 'https://www.doubao.com',
              'User-Agent':
                'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
            },
          })
          upstream.binaryType = 'nodebuffer'

          connectTimeout = setTimeout(() => {
            console.error('[tts-doubao-proxy] connection timeout')
            if (clientWs.readyState === WebSocket.OPEN) {
              clientWs.send(JSON.stringify({ event: 'error', message: 'Connection timeout' }))
              clientWs.close(4003, 'Connection timeout')
            }
            if (upstream?.readyState === WebSocket.CONNECTING) {
              upstream.terminate()
            }
          }, CONNECT_TIMEOUT)

          upstream.on('open', () => {
            if (connectTimeout) {
              clearTimeout(connectTimeout)
              connectTimeout = null
            }
            if (clientWs.readyState === WebSocket.OPEN) {
              clientWs.send(JSON.stringify({ event: 'open' }))
            }
            for (const text of pending) upstream!.send(text)
            pending.length = 0
          })

          upstream.on('message', (frame, frameIsBinary) => {
            if (clientWs.readyState !== WebSocket.OPEN) return
            if (frameIsBinary) {
              clientWs.send(frame, { binary: true })
            } else {
              clientWs.send(frame.toString())
            }
          })

          upstream.on('close', (code) => {
            if (clientWs.readyState === WebSocket.OPEN) clientWs.close(code)
          })

          upstream.on('error', (err) => {
            console.error('[tts-doubao-proxy] upstream error:', err.message)
            if (clientWs.readyState === WebSocket.OPEN) {
              clientWs.send(JSON.stringify({ event: 'error', message: err.message }))
              clientWs.close(4002, 'Upstream error')
            }
          })
        } catch {
          clientWs.close(4001, 'Invalid auth message')
        }
        return
      }

      // 已鉴权:转发 JSON 控制消息(text / finish)给豆包
      if (isBinary) return
      const text = data.toString()
      if (upstream?.readyState === WebSocket.OPEN) {
        upstream.send(text)
      } else {
        pending.push(text)
      }
    })

    clientWs.on('close', () => {
      if (connectTimeout) {
        clearTimeout(connectTimeout)
        connectTimeout = null
      }
      if (upstream?.readyState === WebSocket.OPEN) upstream.close(1000)
    })

    clientWs.on('error', (err) => {
      console.error('[tts-doubao-proxy] client error:', err.message)
      if (upstream?.readyState === WebSocket.OPEN) upstream.close(1000)
    })
  })

  return wss
}
