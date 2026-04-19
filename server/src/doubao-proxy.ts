import { WebSocketServer, WebSocket } from 'ws'

const DOUBAO_WS_URL =
  'wss://ws-samantha.doubao.com/samantha/audio/asr' +
  '?version_code=20800&language=zh&device_platform=web' +
  '&aid=497858&real_aid=497858&pkg_type=release_version' +
  '&device_id=7616216604401780224&pc_version=3.14.2' +
  '&web_id=7627108056602248710&tea_uuid=7627108056602248710' +
  '&region=&sys_region=&samantha_web=1&use-olympus-account=1' +
  '&format=pcm'

export function attachDoubaoProxy(): WebSocketServer {
  const wss = new WebSocketServer({ noServer: true })

  wss.on('connection', (clientWs: WebSocket) => {
    let doubaoWs: WebSocket | null = null
    const pending: (Buffer | ArrayBuffer | Buffer[])[] = []
    let authed = false

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
          console.log('[doubao-proxy] cookie length:', msg.cookie?.length, 'preview:', msg.cookie?.slice(0, 80))
          doubaoWs = new WebSocket(DOUBAO_WS_URL, {
            headers: {
              Cookie: msg.cookie,
              Origin: 'https://www.doubao.com',
              'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
            },
          })
          doubaoWs.binaryType = 'nodebuffer'

          doubaoWs.on('open', () => {
            clientWs.send(JSON.stringify({ event: 'open' }))
            // Flush any PCM that arrived before doubao WS was ready
            for (const chunk of pending) doubaoWs!.send(chunk)
            pending.length = 0
          })

          doubaoWs.on('message', (upstream) => {
            const text = upstream.toString()
            console.log('[doubao-proxy] upstream msg:', text.slice(0, 200))
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
      } else {
        pending.push(data as Buffer)
      }
    })

    clientWs.on('close', () => {
      if (doubaoWs?.readyState === WebSocket.OPEN) doubaoWs.close(1000)
    })

    clientWs.on('error', (err) => {
      console.error('[doubao-proxy] client error:', err.message)
      if (doubaoWs?.readyState === WebSocket.OPEN) doubaoWs.close(1000)
    })
  })

  return wss
}
