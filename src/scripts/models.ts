export type ModelDefinition = {
  key: 'tiny' | 'base' | 'small' | 'turbo'
  id: string
  /** Rough download size on the WebGPU (quantized decoder) path. */
  webgpuSize: string
  /** Rough download size on the CPU path, which uses fp32 weights. */
  wasmSize: string
  requiresWebGPU: boolean
}

export const MODELS: ModelDefinition[] = [
  {
    key: 'base',
    id: 'Xenova/whisper-base',
    webgpuSize: '80 MB',
    wasmSize: '300 MB',
    requiresWebGPU: false
  },
  {
    key: 'tiny',
    id: 'Xenova/whisper-tiny',
    webgpuSize: '40 MB',
    wasmSize: '150 MB',
    requiresWebGPU: false
  },
  {
    key: 'small',
    id: 'Xenova/whisper-small',
    webgpuSize: '250 MB',
    wasmSize: '1 GB',
    requiresWebGPU: false
  },
  {
    key: 'turbo',
    id: 'onnx-community/whisper-large-v3-turbo',
    webgpuSize: '800 MB',
    wasmSize: '1.6 GB',
    requiresWebGPU: true
  }
]

export const DEFAULT_MODEL_ID = 'Xenova/whisper-base'

export function findModel(id: string): ModelDefinition | undefined {
  return MODELS.find((model) => model.id === id)
}

/**
 * dtype per device.
 *
 * WebGPU: fp32 encoder + q4 decoder is the combination the transformers.js Whisper
 * demos ship; it is both fast and numerically stable on GPU.
 *
 * WASM: fp32 everywhere. Quantized ONNX weights are known to break on the CPU
 * backend (missing dequant scales on Firefox, unimplemented q4 kernels elsewhere),
 * so the CPU path trades download size for actually working.
 */
export function dtypeFor(device: 'webgpu' | 'wasm') {
  if (device === 'webgpu') {
    return { encoder_model: 'fp32', decoder_model_merged: 'q4' } as const
  }
  return 'fp32' as const
}
