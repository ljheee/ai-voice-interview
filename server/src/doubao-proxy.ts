import { WebSocketServer, WebSocket } from 'ws'

const DOUBAO_WS_URL =
  'wss://ws-samantha.doubao.com/samantha/audio/asr' +
  '?version_code=20800&language=zh&device_platform=web' +
  '&aid=497858&real_aid=497858&pkg_type=release_version' +
  '&device_id=7616216604401780224&pc_version=3.14.2' +
  '&web_id=7627108056602248710&tea_uuid=7627108056602248710' +
  '&region=&sys_region=&samantha_web=1&use-olympus-account=1' +
  '&format=pcm'

const MAX_PENDING_SIZE = 50 // 最多缓存50个chunk，防止内存泄漏
const CONNECT_TIMEOUT = 10000 // 10秒连接超时

export function attachDoubaoProxy(): WebSocketServer {
  const wss = new WebSocketServer({ noServer: true })

  wss.on('connection', (clientWs: WebSocket) => {
    let doubaoWs: WebSocket | null = null
    const pending: Buffer[] = []
    let authed = false
    let connectTimeout: NodeJS.Timeout | null = null

    clientWs.on('message', (data, isBinary) => {
      // First message must be the auth control message carrying the cookie
      if (!authed) {
        try {
          const msg = JSON.parse(data.toString())
          if (msg.type !== 'auth' || !msg.cookie) {
            clientWs.close(4001, 'First message must be auth')
            return
          }
          authed = true
          doubaoWs = new WebSocket(DOUBAO_WS_URL, {
            headers: {
              Cookie: msg.cookie,
              Origin: 'https://www.doubao.com',
              'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
            },
          })
          doubaoWs.binaryType = 'nodebuffer'

          // 连接超时处理
          connectTimeout = setTimeout(() => {
            console.error('[doubao-proxy] connection timeout')
            if (clientWs.readyState === WebSocket.OPEN) {
              clientWs.send(JSON.stringify({ event: 'error', message: 'Connection timeout' }))
              clientWs.close(4003, 'Connection timeout')
            }
            if (doubaoWs?.readyState === WebSocket.CONNECTING) {
              doubaoWs.terminate()
            }
          }, CONNECT_TIMEOUT)

          doubaoWs.on('open', () => {
            if (connectTimeout) {
              clearTimeout(connectTimeout)
              connectTimeout = null
            }
            clientWs.send(JSON.stringify({ event: 'open' }))
            // Flush any PCM that arrived before doubao WS was ready
            for (const chunk of pending) doubaoWs!.send(chunk)
            pending.length = 0
          })

          doubaoWs.on('message', (upstream) => {
            const text = upstream.toString()
            if (clientWs.readyState === WebSocket.OPEN) clientWs.send(text)
          })

          doubaoWs.on('close', (code) => {
            if (clientWs.readyState === WebSocket.OPEN) clientWs.close(code)
          })

          doubaoWs.on('error', (err) => {
            console.error('[doubao-proxy] upstream error:', err.message)
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

      // Subsequent messages are raw PCM binary
      if (!isBinary) return
      if (doubaoWs?.readyState === WebSocket.OPEN) {
        doubaoWs.send(data)
      } else if (pending.length < MAX_PENDING_SIZE) {
        pending.push(data as Buffer)
      } else {
        // pending 已满，丢弃最旧的数据
        pending.shift()
        pending.push(data as Buffer)
      }
    })

    clientWs.on('close', () => {
      if (connectTimeout) {
        clearTimeout(connectTimeout)
        connectTimeout = null
      }
      if (doubaoWs?.readyState === WebSocket.OPEN) doubaoWs.close(1000)
    })

    clientWs.on('error', (err) => {
      console.error('[doubao-proxy] client error:', err.message)
      if (doubaoWs?.readyState === WebSocket.OPEN) doubaoWs.close(1000)
    })
  })

  return wss
}
