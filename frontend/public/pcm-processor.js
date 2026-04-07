/**
 * AudioWorklet processor: captures raw PCM Float32 from microphone
 * and posts fixed-size chunks back to the main thread.
 *
 * Runs in the AudioWorkletGlobalScope (separate thread from main JS).
 * Each process() call delivers 128 samples; we accumulate until we
 * reach the requested chunkSize, then post the chunk.
 */
class PCMProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super()
    this._chunkSize = options.processorOptions?.chunkSize ?? 24000 // default 1.5s @ 16kHz
    this._buffer = new Float32Array(this._chunkSize)
    this._offset = 0
  }

  process(inputs) {
    const input = inputs[0]?.[0]  // first input, first channel (mono)
    if (!input) return true

    let srcOffset = 0
    while (srcOffset < input.length) {
      const remaining = this._chunkSize - this._offset
      const toCopy = Math.min(remaining, input.length - srcOffset)

      this._buffer.set(input.subarray(srcOffset, srcOffset + toCopy), this._offset)
      this._offset += toCopy
      srcOffset += toCopy

      if (this._offset >= this._chunkSize) {
        // Post a copy (transferable) to main thread
        const chunk = this._buffer.slice(0)
        this.port.postMessage({ type: 'chunk', chunk }, [chunk.buffer])
        this._offset = 0
      }
    }

    return true  // keep processor alive
  }
}

registerProcessor('pcm-processor', PCMProcessor)
