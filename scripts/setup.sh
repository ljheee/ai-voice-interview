#!/usr/bin/env bash
# scripts/setup.sh
# Run after `npm install` in frontend/ to copy large binary assets that are
# excluded from git into the right places.
#
# Called automatically via frontend/package.json "postinstall".
# Can also be run manually: bash scripts/setup.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$SCRIPT_DIR/.."
FRONTEND="$ROOT/frontend"

echo "📦 setup: copying binary assets..."

# ─── 1. onnxruntime-web wasm files → frontend/public/ ────────────────────────
# These are loaded at runtime by VAD and Whisper. Next.js serves /public as
# static files, so they must live there (not in node_modules).
ORT_DIST="$FRONTEND/node_modules/onnxruntime-web/dist"
PUBLIC="$FRONTEND/public"

if [ ! -d "$ORT_DIST" ]; then
  echo "⚠️  onnxruntime-web not found — run npm install in frontend/ first"
  exit 1
fi

for f in \
  ort-wasm-simd-threaded.wasm \
  ort-wasm-simd-threaded.mjs \
  ort-wasm-simd-threaded.asyncify.wasm \
  ort-wasm-simd-threaded.asyncify.mjs \
  ort-wasm-simd-threaded.jsep.wasm \
  ort-wasm-simd-threaded.jsep.mjs \
  ort-wasm-simd-threaded.jspi.wasm \
  ort-wasm-simd-threaded.jspi.mjs
do
  cp "$ORT_DIST/$f" "$PUBLIC/$f"
done
echo "  ✓ ort wasm files → frontend/public/"

# ─── 2. VAD assets → frontend/public/ ────────────────────────────────────────
VAD_DIST="$FRONTEND/node_modules/@ricky0123/vad-web/dist"

if [ ! -d "$VAD_DIST" ]; then
  echo "⚠️  @ricky0123/vad-web not found — run npm install in frontend/ first"
  exit 1
fi

cp "$VAD_DIST/silero_vad.onnx"           "$PUBLIC/silero_vad.onnx"
cp "$VAD_DIST/vad.worklet.bundle.min.js" "$PUBLIC/vad.worklet.bundle.min.js"
echo "  ✓ VAD assets → frontend/public/"

# ─── 3. ort jsep files → .next/static/chunks/ (dev server) ──────────────────
# webpack hard-codes dynamic import paths to /_next/static/chunks/.
# OrtStaticPlugin in next.config.mjs handles this at build time, but for the
# very first `next dev` run the .next/ dir may not exist yet — pre-create it.
CHUNKS="$FRONTEND/.next/static/chunks"
mkdir -p "$CHUNKS"
cp "$ORT_DIST/ort-wasm-simd-threaded.jsep.mjs"  "$CHUNKS/"
cp "$ORT_DIST/ort-wasm-simd-threaded.jsep.wasm" "$CHUNKS/"
echo "  ✓ ort jsep files → frontend/.next/static/chunks/"

# ─── 4. pdf.js worker → frontend/public/ ─────────────────────────────────────
# Loaded by pdfjs-dist at runtime when parsing uploaded PDFs. Self-hosting
# avoids a CDN dependency (and ad-blockers / network policies that break it).
PDFJS_DIST="$FRONTEND/node_modules/pdfjs-dist/build"

if [ ! -f "$PDFJS_DIST/pdf.worker.min.mjs" ]; then
  echo "⚠️  pdfjs-dist not found — run npm install in frontend/ first"
  exit 1
fi

cp "$PDFJS_DIST/pdf.worker.min.mjs" "$PUBLIC/pdf.worker.min.mjs"
echo "  ✓ pdf.worker.min.mjs → frontend/public/"

echo "✅ setup complete"
