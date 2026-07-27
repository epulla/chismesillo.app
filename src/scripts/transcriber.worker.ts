/**
 * Whisper worker.
 *
 * Hosts the transformers.js ASR pipeline. Inference is heavy WASM/GPU work, so it
 * lives off the main thread and the UI keeps painting while a file transcribes.
 *
 * Device ladder: try WebGPU first, and if either loading or inference blows up,
 * reload on WASM/CPU with fp32 weights and retry the window once. Quantized ONNX
 * weights are unreliable on the CPU backend (missing dequant scales on Firefox,
 * unimplemented q4 kernels elsewhere), hence fp32 down there.
 *
 * Protocol (main -> worker):
 *   { id, type: 'ensure',      payload: { model, forceCpu } }
 *   { id, type: 'transcribe',  payload: { audio, language, task, wordTimestamps } }
 *   { id, type: 'detect',      payload: { audio } }
 *   { id, type: 'reset' }
 */
import {
  env,
  pipeline,
  WhisperTextStreamer,
  type AutomaticSpeechRecognitionPipeline
} from '@huggingface/transformers'
import { dtypeFor } from './models'
import { repairTimings } from './windowing'
import type { TranscriptSegment } from './types'

// Weights come from the Hugging Face CDN and are cached by the browser afterwards.
// Local model files are never looked for: there is no server to serve them.
env.allowLocalModels = false
env.useBrowserCache = true

type Device = 'webgpu' | 'wasm'

type EnsurePayload = { model: string; forceCpu?: boolean }
type TranscribePayload = {
  audio: Float32Array
  language: string | null
  task: 'transcribe' | 'translate'
  wordTimestamps: boolean
}

const post = (message: unknown, transfer: Transferable[] = []) =>
  (self as unknown as Worker).postMessage(message, transfer)

let recognizer: AutomaticSpeechRecognitionPipeline | null = null
let loadedModel = ''
let loadedDevice: Device = 'wasm'

self.onmessage = async (event: MessageEvent) => {
  const { id, type, payload } = event.data ?? {}
  try {
    if (type === 'ensure') {
      const device = await ensureRecognizer(payload as EnsurePayload)
      post({ id, type: 'done', result: { device, model: loadedModel } })
      return
    }

    if (type === 'transcribe') {
      const result = await transcribe(payload as TranscribePayload)
      post({ id, type: 'done', result })
      return
    }

    if (type === 'detect') {
      const language = await detectLanguage((payload as { audio: Float32Array }).audio)
      post({ id, type: 'done', result: { language } })
      return
    }

    if (type === 'reset') {
      await recognizer?.dispose()
      recognizer = null
      loadedModel = ''
      post({ id, type: 'done' })
      return
    }

    throw new Error(`Unknown message type: ${type}`)
  } catch (error) {
    post({ id, type: 'error', error: error instanceof Error ? error.message : String(error) })
  }
}

async function ensureRecognizer({ model, forceCpu }: EnsurePayload): Promise<Device> {
  if (recognizer && loadedModel === model) return loadedDevice

  await recognizer?.dispose()
  recognizer = null

  const webgpuAvailable = !forceCpu && (await hasWebGPU())

  if (webgpuAvailable) {
    try {
      recognizer = await loadPipeline(model, 'webgpu')
      loadedModel = model
      loadedDevice = 'webgpu'
      return 'webgpu'
    } catch (error) {
      console.warn('[asr] WebGPU load failed, falling back to CPU:', error)
      post({ type: 'event', name: 'webgpu-fallback' })
    }
  }

  recognizer = await loadPipeline(model, 'wasm')
  loadedModel = model
  loadedDevice = 'wasm'
  return 'wasm'
}

function loadPipeline(model: string, device: Device) {
  return pipeline('automatic-speech-recognition', model, {
    device,
    dtype: dtypeFor(device),
    progress_callback: (progress: unknown) =>
      post({ type: 'progress', key: 'asr', payload: progress })
  })
}

async function transcribe(payload: TranscribePayload) {
  try {
    return await runInference(payload)
  } catch (error) {
    // A GPU that dies mid-run leaves the pipeline unusable. Rebuild on CPU and
    // give the window one more shot before surfacing the failure.
    if (loadedDevice !== 'webgpu') throw error

    console.warn('[asr] WebGPU inference failed, retrying on CPU:', error)
    post({ type: 'event', name: 'webgpu-fallback' })

    await recognizer?.dispose()
    recognizer = await loadPipeline(loadedModel, 'wasm')
    loadedDevice = 'wasm'

    return runInference(payload)
  }
}

async function runInference({ audio, language, task, wordTimestamps }: TranscribePayload) {
  if (!recognizer) throw new Error('The speech model is not loaded')

  const output = await recognizer(audio, {
    chunk_length_s: 30,
    stride_length_s: 5,
    return_timestamps: wordTimestamps ? 'word' : true,
    language: language ?? undefined,
    task,
    // Reports progress within a window: Whisper splits it into 30 s chunks and the
    // streamer tells us as each one starts, ends, and produces text.
    streamer: buildStreamer()
  })

  const durationSec = audio.length / 16000
  return {
    segments: toSegments(output, wordTimestamps, durationSec),
    text: (output as { text?: string }).text ?? ''
  }
}

/**
 * Streams progress out of a running generation.
 *
 * Note that `chunk_callback` — the option subvid.app passes — no longer exists in
 * transformers.js v4; `WhisperTextStreamer` is the supported route, and it also
 * gives us live text while a window is still being decoded.
 */
function buildStreamer() {
  const parts = recognizer as unknown as {
    tokenizer: ConstructorParameters<typeof WhisperTextStreamer>[0]
    processor?: { feature_extractor?: { config?: { chunk_length?: number } } }
    model?: { config?: { max_source_positions?: number } }
  }

  const chunkLength = parts.processor?.feature_extractor?.config?.chunk_length ?? 30
  const maxSourcePositions = parts.model?.config?.max_source_positions ?? 1500

  return new WhisperTextStreamer(parts.tokenizer, {
    time_precision: chunkLength / maxSourcePositions,
    skip_prompt: true,
    on_chunk_start: (offset: number) =>
      post({ type: 'event', name: 'chunk-start', payload: { offset } }),
    on_chunk_end: (offset: number) =>
      post({ type: 'event', name: 'chunk-end', payload: { offset } }),
    callback_function: (text: string) => post({ type: 'event', name: 'partial', payload: { text } })
  })
}

type WhisperChunk = { text: string; timestamp: [number, number | null] }

/** Normalizes the pipeline output into our segment shape. */
function toSegments(output: unknown, wordTimestamps: boolean, durationSec: number) {
  const chunks = (output as { chunks?: WhisperChunk[] }).chunks ?? []
  const text = (output as { text?: string }).text ?? ''

  if (!chunks.length) {
    return text.trim() ? [{ start: 0, end: durationSec, text: text.trim() }] : []
  }

  if (!wordTimestamps) {
    return repairTimings(
      chunks.map((chunk) => ({
        start: chunk.timestamp[0] ?? 0,
        end: chunk.timestamp[1] as number,
        text: chunk.text.trim()
      })),
      durationSec
    )
  }

  // With word timestamps every chunk is a single word, so group them into
  // sentence-ish segments and keep the words attached.
  return groupWords(chunks, durationSec)
}

const SENTENCE_END = /[.!?…]["'”’)]?$/
const MAX_SEGMENT_SEC = 12

function groupWords(chunks: WhisperChunk[], durationSec: number): TranscriptSegment[] {
  const segments: TranscriptSegment[] = []
  let current: TranscriptSegment | null = null

  for (const chunk of chunks) {
    const word = chunk.text.trim()
    if (!word) continue

    const start: number = chunk.timestamp[0] ?? current?.end ?? 0
    const end: number = chunk.timestamp[1] ?? start

    if (!current) {
      current = { start, end, text: word, words: [{ start, end, text: word }] }
    } else {
      current.end = end
      current.text = `${current.text} ${word}`
      current.words!.push({ start, end, text: word })
    }

    const longEnough = current.end - current.start >= MAX_SEGMENT_SEC
    if (SENTENCE_END.test(word) || longEnough) {
      segments.push(current)
      current = null
    }
  }

  if (current) segments.push(current)
  return repairTimings(segments, durationSec)
}

/**
 * Best-effort language detection: transcribe a short probe with no language forced
 * and read back whichever language Whisper decoded it as. transformers.js does not
 * expose the language token directly, so this stays best-effort by design and the
 * caller simply hides the badge when it returns null.
 */
async function detectLanguage(audio: Float32Array): Promise<string | null> {
  if (!recognizer) return null
  try {
    const probe = audio.length > 30 * 16000 ? audio.slice(0, 30 * 16000) : audio
    const tokenizer = (recognizer as unknown as { tokenizer?: Record<string, unknown> }).tokenizer
    const model = (recognizer as unknown as { model?: Record<string, unknown> }).model
    const processor = (recognizer as unknown as { processor?: Record<string, unknown> }).processor
    if (!tokenizer || !model || !processor) return null

    const extractor = (
      processor as { feature_extractor?: (input: Float32Array) => Promise<unknown> }
    ).feature_extractor
    const features = extractor
      ? await extractor.call(processor, probe)
      : await (processor as unknown as (input: Float32Array) => Promise<unknown>)(probe)

    const generate = (model as { generate?: (options: unknown) => Promise<unknown> }).generate
    if (typeof generate !== 'function') return null

    const output = (await generate.call(model, {
      ...(features as Record<string, unknown>),
      max_new_tokens: 1,
      return_dict_in_generate: false
    })) as { tolist?: () => number[][] } | number[][]

    const ids = Array.isArray(output) ? output : output.tolist?.()
    const first = ids?.[0]?.find((id) => typeof id === 'number')
    if (first === undefined) return null

    const decode = (tokenizer as { decode?: (ids: number[], options: unknown) => string }).decode
    const decoded = decode?.call(tokenizer, [first], { skip_special_tokens: false }) ?? ''
    const match = decoded.match(/<\|([a-z]{2,3})\|>/)
    return match ? match[1]! : null
  } catch (error) {
    console.info('[asr] language detection unavailable:', error)
    return null
  }
}

async function hasWebGPU(): Promise<boolean> {
  const gpu = (navigator as Navigator & { gpu?: { requestAdapter(): Promise<unknown> } }).gpu
  if (!gpu) return false
  try {
    return (await gpu.requestAdapter()) !== null
  } catch {
    return false
  }
}
