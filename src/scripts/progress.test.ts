import { describe, expect, it } from 'vitest'
import { progressPercent, progressStats } from './progress'

describe('progressPercent', () => {
  it('uses a preparation baseline when duration is unknown', () => {
    expect(progressPercent(0, 0)).toBe(5)
  })

  it('rounds completed audio to a percentage', () => {
    expect(progressPercent(30, 60)).toBe(50)
  })

  it('reserves 100 percent for the completed state', () => {
    expect(progressPercent(60, 60)).toBe(99)
    expect(progressPercent(90, 60)).toBe(99)
  })
})

describe('progressStats', () => {
  it('waits for positive elapsed and transcribed time', () => {
    expect(progressStats(30, 60, 0)).toBeNull()
    expect(progressStats(0, 60, 30)).toBeNull()
  })

  it('calculates realtime factor and remaining time', () => {
    expect(progressStats(60, 600, 30)).toEqual({ factor: 2, remainingSec: 270 })
  })

  it('omits remaining time after the audio is complete', () => {
    expect(progressStats(60, 60, 30)).toEqual({ factor: 2, remainingSec: null })
    expect(progressStats(90, 60, 30)).toEqual({ factor: 3, remainingSec: null })
  })

  it('keeps the estimate finite at a near-zero rate', () => {
    const stats = progressStats(Number.MIN_VALUE, 60, 1)
    expect(stats).not.toBeNull()
    expect(Number.isFinite(stats!.remainingSec)).toBe(true)
  })
})
