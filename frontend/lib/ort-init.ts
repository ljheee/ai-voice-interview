/**
 * onnxruntime-web WASM path initializer.
 *
 * Must be imported BEFORE any code that uses onnxruntime-web (VAD, Whisper).
 * Sets wasmPaths to '/' so Next.js serves the files from /public instead of
 * the webpack chunk directory (/_next/static/chunks/), which causes 404s.
 *
 * Import order matters: this module sets env.wasm.wasmPaths at module
 * evaluation time, before ort initializes its internal WASM loader.
 */
import { env } from 'onnxruntime-web'

// Point to /public — files are copied there from node_modules/onnxruntime-web/dist/
env.wasm.wasmPaths = '/'
