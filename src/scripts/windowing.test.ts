import { describe, expect, it } from 'vitest'
import {
  countWhisperChunks,
  countWindows,
  dropOverlapDuplicates,
  findQuietCut,
  mergeSegments,
  offsetSegments,
  repairTimings,
  SAMPLE_RATE,
  whisperHopSec,
  WHISPER_CHUNK_SEC,
  WHISPER_STRIDE_SEC
} from './windowing'
import type { TranscriptSegment } from './types'

function segment(start: number, end: number, text = 'hello'): TranscriptSegment {
  return { start, end, text }
}

/** Builds PCM that is loud everywhere except a silent gap. */
function pcmWithSilence(durationSec: number, gapStartSec: number, gapEndSec: number) {
  const pcm = new Float32Array(durationSec * SAMPLE_RATE)
  for (let i = 0; i < pcm.length; i++) {
    const sec = i / SAMPLE_RATE
    const silent = sec >= gapStartSec && sec < gapEndSec
    pcm[i] = silent ? 0 : Math.sin(i * 0.05) * 0.8
  }
  return pcm
}

describe('findQuietCut', () => {
  it('moves the cut into a nearby silent gap', () => {
    const pcm = pcmWithSilence(60, 32, 33)
    const cut = findQuietCut(pcm, 0, 30)
    expect(cut).toBeGreaterThanOrEqual(32)
    expect(cut).toBeLessThanOrEqual(33)
  })

  it('stays within the search radius', () => {
    const pcm = pcmWithSilence(600, 500, 501)
    const cut = findQuietCut(pcm, 0, 300, 15)
    expect(cut).toBeGreaterThanOrEqual(285)
    expect(cut).toBeLessThanOrEqual(315)
  })

  it('respects the absolute offset of the buffer', () => {
    const pcm = pcmWithSilence(60, 32, 33)
    const cut = findQuietCut(pcm, 600, 630)
    expect(cut).toBeGreaterThanOrEqual(632)
    expect(cut).toBeLessThanOrEqual(633)
  })

  it('clamps to the available audio when the buffer is short', () => {
    const pcm = pcmWithSilence(3, 1, 2)
    const cut = findQuietCut(pcm, 0, 10)
    expect(cut).toBeLessThanOrEqual(3)
    expect(cut).toBeGreaterThanOrEqual(0)
  })
})

describe('offsetSegments', () => {
  it('shifts segment and word timings', () => {
    const input: TranscriptSegment[] = [
      { start: 1, end: 2, text: 'hi', words: [{ start: 1, end: 1.5, text: 'hi' }] }
    ]
    const [shifted] = offsetSegments(input, 600)
    expect(shifted!.start).toBe(601)
    expect(shifted!.end).toBe(602)
    expect(shifted!.words![0]!.start).toBe(601)
    expect(shifted!.words![0]!.end).toBe(601.5)
  })

  it('returns the same array when there is nothing to shift', () => {
    const input = [segment(0, 1)]
    expect(offsetSegments(input, 0)).toBe(input)
  })
})

describe('dropOverlapDuplicates', () => {
  it('drops segments whose midpoint is inside the replayed audio', () => {
    const segments = [segment(0, 1.5), segment(1.5, 3), segment(3, 5)]
    const kept = dropOverlapDuplicates(segments, 2)
    // 0–1.5 is fully replayed audio, so it goes. 1.5–3 straddles the seam but is
    // mostly new (midpoint 2.25), so it stays.
    expect(kept).toHaveLength(2)
    expect(kept[0]!.start).toBe(1.5)
    expect(kept[1]!.start).toBe(3)
  })

  it('keeps a segment that merely starts inside the overlap', () => {
    const segments = [segment(1, 9)]
    expect(dropOverlapDuplicates(segments, 2)).toHaveLength(1)
  })

  it('is a no-op for the first window', () => {
    const segments = [segment(0, 1)]
    expect(dropOverlapDuplicates(segments, 0)).toBe(segments)
  })
})

describe('mergeSegments', () => {
  it('removes a repeated sentence at the seam', () => {
    const existing = [segment(0, 10, 'the cat sat')]
    const incoming = [segment(0.4, 10.2, 'The cat sat.'), segment(11, 14, 'then left')]
    const merged = mergeSegments(existing, incoming)
    expect(merged).toHaveLength(2)
    expect(merged[1]!.text).toBe('then left')
  })

  it('keeps identical text that is far apart in time', () => {
    const existing = [segment(0, 2, 'yes')]
    const incoming = [segment(60, 62, 'yes')]
    expect(mergeSegments(existing, incoming)).toHaveLength(2)
  })

  it('handles empty inputs', () => {
    expect(mergeSegments([], [segment(0, 1)])).toHaveLength(1)
    const existing = [segment(0, 1)]
    expect(mergeSegments(existing, [])).toBe(existing)
  })
})

describe('repairTimings', () => {
  it('fills a missing end with the next start', () => {
    const segments = [
      { start: 0, end: null as unknown as number, text: 'a' },
      { start: 5, end: 7, text: 'b' }
    ]
    const [first] = repairTimings(segments, 600)
    expect(first!.end).toBe(5)
  })

  it('falls back to the window duration for a trailing segment', () => {
    const segments = [{ start: 590, end: null as unknown as number, text: 'a' }]
    const [only] = repairTimings(segments, 600)
    expect(only!.end).toBe(600)
  })

  it('never produces an end before the start', () => {
    const segments = [{ start: 10, end: 4, text: 'a' }]
    const [only] = repairTimings(segments, 600)
    expect(only!.end).toBeGreaterThanOrEqual(only!.start)
  })
})

describe('countWindows', () => {
  it('splits a duration into whole windows', () => {
    expect(countWindows(600, 600)).toBe(1)
    expect(countWindows(601, 600)).toBe(2)
    expect(countWindows(3 * 3600, 600)).toBe(18)
  })

  it('returns one window for unknown durations', () => {
    expect(countWindows(0, 600)).toBe(1)
    expect(countWindows(Number.NaN, 600)).toBe(1)
  })
})

function referenceChunkCount(durationSec: number, chunkSec: number, strideSec: number) {
  const jump = chunkSec - 2 * strideSec
  let count = 0
  let offset = 0

  while (true) {
    count++
    if (offset + chunkSec >= durationSec) return count
    offset += jump
  }
}

describe('countWhisperChunks', () => {
  it('matches the transformers.js pipeline loop', () => {
    for (const strideSec of [WHISPER_STRIDE_SEC, 5]) {
      for (const durationSec of [1, 30, 31, 60, 120, 600, 3600]) {
        expect(countWhisperChunks(durationSec, WHISPER_CHUNK_SEC, strideSec)).toBe(
          referenceChunkCount(durationSec, WHISPER_CHUNK_SEC, strideSec)
        )
      }
    }
  })

  it('uses one pass for at most one chunk', () => {
    expect(countWhisperChunks(1)).toBe(1)
    expect(countWhisperChunks(WHISPER_CHUNK_SEC)).toBe(1)
  })

  it('reduces passes for a ten-minute window', () => {
    expect(countWhisperChunks(600, 30, 3)).toBe(25)
    expect(countWhisperChunks(600, 30, 5)).toBe(30)
  })

  it('does not reduce passes for one minute', () => {
    expect(countWhisperChunks(60, 30, 3)).toBe(3)
    expect(countWhisperChunks(60, 30, 5)).toBe(3)
  })

  it('rejects a stride that cannot advance', () => {
    expect(() => whisperHopSec(30, 15)).toThrow(/half the chunk length/)
    expect(() => whisperHopSec(30, 16)).toThrow(/half the chunk length/)
  })

  it('returns one pass for an unknown duration', () => {
    expect(countWhisperChunks(0)).toBe(1)
    expect(countWhisperChunks(Number.NaN)).toBe(1)
  })
})
