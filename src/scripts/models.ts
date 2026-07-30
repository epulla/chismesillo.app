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
    webgpuSize: '200 MB',
    wasmSize: '280 MB',
    requiresWebGPU: false
  },
  {
    key: 'tiny',
    id: 'Xenova/whisper-tiny',
    webgpuSize: '120 MB',
    wasmSize: '150 MB',
    requiresWebGPU: false
  },
  {
    key: 'small',
    id: 'Xenova/whisper-small',
    webgpuSize: '560 MB',
    wasmSize: '930 MB',
    requiresWebGPU: false
  },
  {
    key: 'turbo',
    id: 'onnx-community/whisper-large-v3-turbo',
    webgpuSize: '1.5 GB',
    wasmSize: '3 GB',
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
 * WebGPU: fp32 encoder + q4 decoder for the Xenova models. Turbo follows the
 * upstream WebGPU demo and uses fp16 for its otherwise 2.4 GB encoder.
 *
 * WASM: fp32 everywhere. Quantized ONNX weights are known to break on the CPU
 * backend (missing dequant scales on Firefox, unimplemented q4 kernels elsewhere),
 * so the CPU path trades download size for actually working.
 */
export function dtypeFor(
  device: 'webgpu',
  modelId: string
): { readonly encoder_model: 'fp16' | 'fp32'; readonly decoder_model_merged: 'q4' }
export function dtypeFor(device: 'wasm', modelId: string): 'fp32'
export function dtypeFor(
  device: 'webgpu' | 'wasm',
  modelId: string
): { readonly encoder_model: 'fp16' | 'fp32'; readonly decoder_model_merged: 'q4' } | 'fp32'
export function dtypeFor(device: 'webgpu' | 'wasm', modelId: string) {
  if (device === 'webgpu') {
    const encoder_model = findModel(modelId)?.key === 'turbo' ? 'fp16' : 'fp32'
    return { encoder_model, decoder_model_merged: 'q4' } as const
  }
  return 'fp32' as const
}

/** WebGPU-only models must never trigger a multi-gigabyte CPU reload. */
export function allowsCpuFallback(modelId: string): boolean {
  return !findModel(modelId)?.requiresWebGPU
}
