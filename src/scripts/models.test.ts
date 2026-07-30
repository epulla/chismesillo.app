import { describe, expect, it } from 'vitest'
import { allowsCpuFallback, DEFAULT_MODEL_ID, dtypeFor, findModel, MODELS } from './models'

function sizeInMb(size: string): number {
  const [value, unit] = size.split(' ')
  return Number(value) * (unit === 'GB' ? 1024 : 1)
}

describe('models', () => {
  it('declares parseable download sizes for every device', () => {
    for (const model of MODELS) {
      expect(model.webgpuSize).toMatch(/^\d+(?:\.\d+)? (?:MB|GB)$/)
      expect(model.wasmSize).toMatch(/^\d+(?:\.\d+)? (?:MB|GB)$/)
    }
  })

  it('reports smaller WebGPU downloads because the decoder is quantized', () => {
    for (const model of MODELS) {
      expect(sizeInMb(model.webgpuSize)).toBeLessThan(sizeInMb(model.wasmSize))
    }
  })

  it('resolves the default model and rejects an unknown id', () => {
    expect(findModel(DEFAULT_MODEL_ID)).toBeDefined()
    expect(findModel('unknown')).toBeUndefined()
  })

  it('uses unique model keys', () => {
    expect(new Set(MODELS.map((model) => model.key)).size).toBe(MODELS.length)
  })
})

describe('dtypeFor', () => {
  it('uses fp16 only for the turbo WebGPU encoder', () => {
    for (const model of MODELS) {
      const dtype = dtypeFor('webgpu', model.id)
      expect(dtype.encoder_model).toBe(model.key === 'turbo' ? 'fp16' : 'fp32')
      expect(dtype.decoder_model_merged).toBe('q4')
    }
  })

  it('uses fp32 for every WASM model', () => {
    for (const model of MODELS) {
      expect(dtypeFor('wasm', model.id)).toBe('fp32')
    }
    expect(dtypeFor('wasm', 'unknown')).toBe('fp32')
  })
})

describe('allowsCpuFallback', () => {
  it('blocks fallback for WebGPU-only models', () => {
    expect(allowsCpuFallback('onnx-community/whisper-large-v3-turbo')).toBe(false)
  })

  it('allows fallback for CPU-capable and unknown models', () => {
    expect(allowsCpuFallback(DEFAULT_MODEL_ID)).toBe(true)
    expect(allowsCpuFallback('unknown')).toBe(true)
  })
})
