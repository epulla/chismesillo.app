import { describe, expect, it } from 'vitest'
import { persistIntervalMs } from './store'

/**
 * Only the interval policy is covered here. Everything else in store.ts is a thin
 * IndexedDB wrapper, and Node has no IndexedDB.
 */
describe('persistIntervalMs', () => {
  it('leaves short transcripts on the original ten second floor', () => {
    expect(persistIntervalMs(0)).toBe(10_000)
    expect(persistIntervalMs(2000)).toBe(10_000)
  })

  it('never drops below the floor or above the cap', () => {
    for (let count = 0; count <= 40_000; count += 500) {
      expect(persistIntervalMs(count)).toBeGreaterThanOrEqual(10_000)
      expect(persistIntervalMs(count)).toBeLessThanOrEqual(60_000)
    }
  })

  it('backs off as the transcript grows', () => {
    let previous = 0
    for (let count = 0; count <= 40_000; count += 500) {
      const interval = persistIntervalMs(count)
      expect(interval).toBeGreaterThanOrEqual(previous)
      previous = interval
    }
    expect(persistIntervalMs(40_000)).toBe(60_000)
  })
})
