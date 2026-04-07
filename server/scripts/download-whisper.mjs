/**
 * Download Xenova/whisper-small quantized model files from hf-mirror.com
 * Output: server/public/models/Xenova/whisper-small/
 *
 * Usage: node scripts/download-whisper.mjs
 */

import { execSync } from 'child_process'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const BASE_URL = 'https://hf-mirror.com/Xenova/whisper-small/resolve/main'
const OUT_DIR = path.join(__dirname, '..', 'public', 'models', 'Xenova', 'whisper-small')

const FILES = [
  'config.json',
  'generation_config.json',
  'preprocessor_config.json',
  'tokenizer.json',
  'tokenizer_config.json',
  'special_tokens_map.json',
  'vocab.json',
  'merges.txt',
  'normalizer.json',
  'added_tokens.json',
  'onnx/encoder_model_quantized.onnx',
  'onnx/decoder_model_merged_quantized.onnx',
]

for (const file of FILES) {
  const dest = path.join(OUT_DIR, file)
  if (fs.existsSync(dest) && fs.statSync(dest).size > 0) {
    console.log(`skip (exists): ${file}`)
    continue
  }
  fs.mkdirSync(path.dirname(dest), { recursive: true })
  const url = `${BASE_URL}/${file}`
  console.log(`Downloading: ${file}`)
  try {
    execSync(`curl -L --progress-bar -o "${dest}" "${url}"`, { stdio: 'inherit' })
  } catch (e) {
    console.error(`Failed: ${file}`, e.message)
    process.exit(1)
  }
}

console.log('\nDone.')
