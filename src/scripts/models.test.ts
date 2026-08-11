import { describe, expect, it } from 'vitest'
import { dtypeFor, findModel, MODELS, type Device, type ModelKey } from './models'
import { translatedKey } from './errorKeys'

const DEVICES: Device[] = ['webgpu', 'wasm']
const CAPABILITIES = [{ supportsF16: true }, { supportsF16: false }, {}]

function encoderOf(dtype: ReturnType<typeof dtypeFor>): string {
  return typeof dtype === 'string' ? dtype : dtype.encoder_model
}

function sizeInMb(size: string): number {
  const [value, unit] = size.split(' ')
  return Number(value) * (unit === 'GB' ? 1024 : 1)
}

describe('MODELS', () => {
  it('has unique keys and ids', () => {
    expect(new Set(MODELS.map((model) => model.key)).size).toBe(MODELS.length)
    expect(new Set(MODELS.map((model) => model.id)).size).toBe(MODELS.length)
  })

  it('declares a wasm size exactly for the models that can run on wasm', () => {
    for (const model of MODELS) {
      expect(model.wasmSize === null).toBe(model.requiresWebGPU)
    }
  })

  it('declares parseable download sizes', () => {
    for (const model of MODELS) {
      expect(model.webgpuSize).toMatch(/^\d+(?:\.\d+)? (?:MB|GB)$/)
      if (model.wasmSize) expect(model.wasmSize).toMatch(/^\d+(?:\.\d+)? (?:MB|GB)$/)
    }
  })

  it('reports smaller WebGPU downloads for CPU-capable models', () => {
    for (const model of MODELS) {
      if (model.wasmSize) {
        expect(sizeInMb(model.webgpuSize)).toBeLessThan(sizeInMb(model.wasmSize))
      }
    }
  })
})

describe('dtypeFor', () => {
  /**
   * Nothing in this repo can run inference, so this guards the allocation failure:
   * no device or adapter capability may select turbo's 2.55 GB fp32 encoder.
   */
  it('never resolves an fp32 encoder for a WebGPU-only model', () => {
    for (const model of MODELS.filter((entry) => entry.requiresWebGPU)) {
      for (const device of DEVICES) {
        for (const capabilities of CAPABILITIES) {
          let encoder: string | null = null
          try {
            encoder = encoderOf(dtypeFor(device, model.key, capabilities))
          } catch {
            continue
          }
          expect(encoder).not.toBe('fp32')
        }
      }
    }
  })

  it('uses the fp16 encoder + q4 decoder pair the official turbo demo ships', () => {
    expect(dtypeFor('webgpu', 'turbo', { supportsF16: true })).toEqual({
      encoder_model: 'fp16',
      decoder_model_merged: 'q4'
    })
  })

  it('steps down to a quantized encoder when the adapter lacks shader-f16', () => {
    expect(dtypeFor('webgpu', 'turbo', { supportsF16: false })).toEqual({
      encoder_model: 'q4',
      decoder_model_merged: 'q4'
    })
  })

  it('refuses a WebGPU-only model on wasm with a translatable key', () => {
    expect(() => dtypeFor('wasm', 'turbo')).toThrow()
    try {
      dtypeFor('wasm', 'turbo')
    } catch (error) {
      expect(translatedKey((error as Error).message)).toBe('needsWebgpu')
    }
  })

  it('keeps fp32 weights on wasm for the models that fit', () => {
    for (const model of MODELS.filter((entry) => !entry.requiresWebGPU)) {
      expect(dtypeFor('wasm', model.key)).toBe('fp32')
    }
  })

  it('keeps the fp32 encoder on WebGPU for the small models', () => {
    for (const model of MODELS.filter((entry) => !entry.requiresWebGPU)) {
      expect(dtypeFor('webgpu', model.key)).toEqual({
        encoder_model: 'fp32',
        decoder_model_merged: 'q4'
      })
    }
  })

  it('covers every model key the catalogue declares', () => {
    const keys = MODELS.map((model) => model.key)
    const expected: ModelKey[] = ['tiny', 'base', 'small', 'turbo']
    expect(keys.sort()).toEqual(expected.sort())
  })
})

describe('findModel', () => {
  it('resolves a known id and misses an unknown one', () => {
    expect(findModel('onnx-community/whisper-large-v3-turbo')?.key).toBe('turbo')
    expect(findModel('nope')).toBeUndefined()
  })
})
