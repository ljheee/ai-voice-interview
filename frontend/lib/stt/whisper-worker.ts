/**
 * Whisper ONNX inference — runs in a dedicated Web Worker.
 * The main thread is never blocked by model inference.
 *
 * Main → Worker messages:
 *   { type: 'load', modelServerOrigin: string }
 *   { type: 'transcribe', id: string, pcm: Float32Array }
 *
 * Worker → Main messages:
 *   { type: 'ready' }
 *   { type: 'result', id: string, text: string }
 *   { type: 'error',  id: string, message: string }
 */

// @xenova/transformers works in Web Workers — it uses `self` not `window`
import { pipeline, env } from '@xenova/transformers'
import '../ort-init'  // sets ort.env.wasm.wasmPaths = '/' before model loads

type TranscribePipeline = Awaited<ReturnType<typeof pipeline>>

let asr: TranscribePipeline | null = null

async function loadModel(modelServerOrigin: string) {
  env.allowLocalModels = true
  env.allowRemoteModels = true
  env.localModelPath = `${modelServerOrigin}/models/`
  env.useBrowserCache = true

  asr = await pipeline('automatic-speech-recognition', 'Xenova/whisper-small', {
    quantized: true,
  })
  self.postMessage({ type: 'ready' })
}

self.onmessage = async (e: MessageEvent) => {
  const msg = e.data as
    | { type: 'load'; modelServerOrigin: string }
    | { type: 'transcribe'; id: string; pcm: Float32Array }

  if (msg.type === 'load') {
    try {
      await loadModel(msg.modelServerOrigin)
    } catch (err) {
      self.postMessage({ type: 'error', id: 'load', message: String(err) })
    }
    return
  }

  if (msg.type === 'transcribe') {
    if (!asr) {
      self.postMessage({ type: 'error', id: msg.id, message: 'model not loaded' })
      return
    }
    try {
      const result = await (asr as any)(msg.pcm, { language: 'chinese', task: 'transcribe' })
      self.postMessage({ type: 'result', id: msg.id, text: result.text?.trim() ?? '' })
    } catch (err) {
      self.postMessage({ type: 'error', id: msg.id, message: String(err) })
    }
  }
}
