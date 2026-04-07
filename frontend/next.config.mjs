import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// ─── OrtStaticPlugin ──────────────────────────────────────────────────────────
// onnxruntime-web dynamically imports ort-wasm-simd-threaded.jsep.mjs at runtime.
// webpack hard-codes the path as /_next/static/chunks/<filename>, but Next.js
// doesn't copy node_modules assets there automatically.
//
// This plugin copies the jsep .mjs and .wasm files into the webpack output
// directory (/.next/static/chunks/) so the hard-coded path resolves correctly
// in both dev (via devServer) and production builds.
class OrtStaticPlugin {
  apply(compiler) {
    const ortDist = path.join(__dirname, 'node_modules', 'onnxruntime-web', 'dist')
    const files = [
      'ort-wasm-simd-threaded.jsep.mjs',
      'ort-wasm-simd-threaded.jsep.wasm',
    ]

    const copyFiles = (outDir) => {
      fs.mkdirSync(outDir, { recursive: true })
      for (const file of files) {
        const src = path.join(ortDist, file)
        const dest = path.join(outDir, file)
        try {
          fs.copyFileSync(src, dest)
        } catch {
          // non-fatal
        }
      }
    }

    // afterEmit: fires after every build/rebuild (dev + prod)
    // outputOptions.path = .next/static/chunks for the client bundle
    compiler.hooks.afterEmit.tapAsync('OrtStaticPlugin', (compilation, callback) => {
      copyFiles(compilation.outputOptions.path)
      callback()
    })

    // watchRun: fires at the start of each incremental rebuild in dev
    compiler.hooks.watchRun.tapAsync('OrtStaticPlugin', (compiler, callback) => {
      if (compiler.outputPath) copyFiles(compiler.outputPath)
      callback()
    })
  }
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: (config, { isServer }) => {
    // Required for Web Workers bundled with webpack 5:
    // the worker global scope uses `self`, not `window`.
    config.output.globalObject = 'self'

    // @xenova/transformers uses onnxruntime-node on server side.
    // We only use it in the browser (WhisperONNXSTT), so exclude node bindings.
    config.resolve.alias = {
      ...config.resolve.alias,
      'onnxruntime-node': false,
      'sharp': false,
    }

    // Suppress "Critical dependency: require function is used in a way in which
    // dependencies cannot be statically extracted" from onnxruntime-web.
    config.ignoreWarnings = [
      ...(config.ignoreWarnings ?? []),
      {
        module: /onnxruntime-web/,
        message: /Critical dependency/,
      },
      {
        module: /@ricky0123\/vad-web/,
        message: /Critical dependency/,
      },
    ]

    // Copy ort jsep files into /_next/static/chunks/ so webpack's hard-coded
    // dynamic import path resolves correctly. Only needed in browser bundle.
    if (!isServer) {
      config.plugins.push(new OrtStaticPlugin())
    }

    return config
  },
}

export default nextConfig
