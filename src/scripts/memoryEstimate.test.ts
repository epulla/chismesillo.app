import { describe, expect, it } from 'vitest'
import { estimateWindowBytes } from './memoryEstimate'
import { MODELS } from './models'
import { countWhisperChunks } from './windowing'

const MB = 1024 * 1024

describe('estimateWindowBytes', () => {
  it('grows with the window size', () => {
    const five = estimateWindowBytes(5 * 60, 80).total
    const ten = estimateWindowBytes(10 * 60, 80).total
    const twenty = estimateWindowBytes(20 * 60, 80).total

    expect(ten).toBeGreaterThan(five)
    expect(twenty).toBeGreaterThan(ten)
  })

  // large-v3 doubled the mel filterbank, so turbo pays twice as much for the
  // features as every other model at the same window size.
  it('charges the 128-bin models more than the 80-bin ones', () => {
    const wide = estimateWindowBytes(10 * 60, 128)
    const narrow = estimateWindowBytes(10 * 60, 80)

    expect(wide.featureBytes / narrow.featureBytes).toBeCloseTo(128 / 80, 5)
    expect(wide.total).toBeGreaterThan(narrow.total)
  })

  it('splits the total into the three terms it counts', () => {
    const estimate = estimateWindowBytes(10 * 60, 80)
    expect(estimate.total).toBe(estimate.decodeBytes + estimate.pcmBytes + estimate.featureBytes)
  })

  /**
   * Sanity bounds, not exact figures. At the default 5 minutes we want tens of
   * megabytes; at the slider's maximum, hundreds. If either lands an order of
   * magnitude away, the formula drifted from what the code actually allocates and
   * the label in the UI is quietly lying.
   */
  it('lands in a sane magnitude at the slider bounds', () => {
    const smallest = estimateWindowBytes(2 * 60, 80).total
    const largest = estimateWindowBytes(20 * 60, 128).total

    expect(smallest).toBeGreaterThan(10 * MB)
    expect(smallest).toBeLessThan(60 * MB)
    expect(largest).toBeGreaterThan(200 * MB)
    expect(largest).toBeLessThan(600 * MB)
  })

  it('never returns a negative or NaN total for odd input', () => {
    for (const windowSec of [0, -60, 1]) {
      const estimate = estimateWindowBytes(windowSec, 80)
      expect(Number.isFinite(estimate.total)).toBe(true)
      expect(estimate.total).toBeGreaterThanOrEqual(0)
    }
  })

  /**
   * This file used to keep its own copy of the chunk and stride constants and kept
   * quoting stride 5 after the pipeline moved to 3, so the label was overcharging by
   * a fifth. Pin the feature term to the counter the pipeline loop actually uses.
   */
  it('counts the same sub-chunks as the pipeline', () => {
    for (const minutes of [2, 5, 20]) {
      const windowSec = minutes * 60
      const { featureBytes } = estimateWindowBytes(windowSec, 80)
      expect(featureBytes).toBe(countWhisperChunks(windowSec) * 80 * 3000 * 4)
    }
  })

  it('can price every model in the catalogue', () => {
    for (const model of MODELS) {
      expect(estimateWindowBytes(5 * 60, model.melBins).total).toBeGreaterThan(0)
    }
  })
})
