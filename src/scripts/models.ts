import { TranslatedError } from './errorKeys'

export type ModelKey = 'tiny' | 'base' | 'small' | 'turbo'

export type Device = 'webgpu' | 'wasm'

export type ModelDefinition = {
  key: ModelKey
  id: string
  /** Rough download size on the WebGPU path. */
  webgpuSize: string
  /** Rough download size on the CPU path, or null when the model cannot run there. */
  wasmSize: string | null
  requiresWebGPU: boolean
  /**
   * Mel filterbank bins the feature extractor emits. large-v3 (and therefore turbo)
   * doubled this to 128, which doubles the size of the features held per window —
   * see estimateWindowBytes.
   */
  melBins: 80 | 128
}

export const MODELS: ModelDefinition[] = [
  {
    key: 'base',
    id: 'Xenova/whisper-base',
    webgpuSize: '80 MB',
    wasmSize: '300 MB',
    requiresWebGPU: false,
    melBins: 80
  },
  {
    key: 'tiny',
    id: 'Xenova/whisper-tiny',
    webgpuSize: '40 MB',
    wasmSize: '150 MB',
    requiresWebGPU: false,
    melBins: 80
  },
  {
    key: 'small',
    id: 'Xenova/whisper-small',
    webgpuSize: '250 MB',
    wasmSize: '1 GB',
    requiresWebGPU: false,
    melBins: 80
  },
  {
    key: 'turbo',
    id: 'onnx-community/whisper-large-v3-turbo',
    // fp16 encoder (1.27 GB) + q4 decoder (334 MB). Not the 800 MB this used to
    // claim: that number assumed a quantized encoder we do not ask for.
    webgpuSize: '1.6 GB',
    wasmSize: null,
    requiresWebGPU: true,
    melBins: 128
  }
]

export const DEFAULT_MODEL_ID = 'Xenova/whisper-base'

export function findModel(id: string): ModelDefinition | undefined {
  return MODELS.find((model) => model.id === id)
}

export type DeviceCapabilities = {
  /** Whether the WebGPU adapter reports the `shader-f16` feature. */
  supportsF16?: boolean
}

type WebGpuDtype = {
  readonly encoder_model: 'fp32' | 'fp16' | 'q4'
  readonly decoder_model_merged: 'q4'
}

/**
 * dtype per device and model.
 *
 * The dtype name picks which weight files get downloaded, and those sizes are not
 * proportional to the parameter count. For large-v3-turbo, `fp32` resolves to
 * `encoder_model.onnx` plus a 2.55 GB `encoder_model.onnx_data` sidecar, which
 * transformers.js tries to read into a single contiguous Uint8Array — that is a
 * guaranteed `RangeError: Array buffer allocation failed`, not a slow download.
 * So turbo never gets fp32 on any path.
 *
 * The fp16 encoder + q4 decoder pair is what the official
 * `webml-community/whisper-large-v3-turbo-webgpu` demo ships, so it is the
 * combination with real-world evidence behind it. fp16 needs the `shader-f16`
 * adapter feature; without it we step *down* to q4 (425 MB), never up to fp32.
 *
 * Smaller models keep the fp32 encoder + q4 decoder pair from the transformers.js
 * Whisper demos: fast, numerically stable, and small enough to allocate.
 *
 * WASM: fp32 everywhere. Quantized ONNX weights are known to break on the CPU
 * backend (missing dequant scales on Firefox, unimplemented q4 kernels elsewhere),
 * so the CPU path trades download size for actually working. That trade is what
 * makes turbo impossible there — 2.55 GB of encoder plus 688 MB of decoder — hence
 * the throw rather than a download nobody can finish.
 */
export function dtypeFor(
  device: Device,
  modelKey: ModelKey,
  { supportsF16 = false }: DeviceCapabilities = {}
): WebGpuDtype | 'fp32' {
  if (device === 'webgpu') {
    if (modelKey === 'turbo') {
      return { encoder_model: supportsF16 ? 'fp16' : 'q4', decoder_model_merged: 'q4' } as const
    }
    return { encoder_model: 'fp32', decoder_model_merged: 'q4' } as const
  }

  if (modelKey === 'turbo') throw new TranslatedError('needsWebgpu')

  return 'fp32' as const
}
