import type { TranscriptSegment } from './types'

export const SAMPLE_RATE = 16000

/** Seconds of audio replayed at the start of the next window so words aren't cut. */
export const OVERLAP_SEC = 2

/** How far from the nominal window edge we may move the cut to land on silence. */
export const BOUNDARY_SEARCH_SEC = 15

/** Whisper's own internal chunking cannot handle less than this; don't emit slivers. */
export const MIN_WINDOW_SEC = 5

/**
 * Finds the quietest point near the end of a window so the cut lands in a pause
 * instead of the middle of a word.
 *
 * `pcm` starts at absolute time `pcmStartSec`. The nominal cut is `targetSec`
 * (absolute). Returns an absolute timestamp within ±`searchSec` of the target,
 * clamped to the available audio.
 */
export function findQuietCut(
  pcm: Float32Array,
  pcmStartSec: number,
  targetSec: number,
  searchSec = BOUNDARY_SEARCH_SEC,
  sampleRate = SAMPLE_RATE
): number {
  const pcmEndSec = pcmStartSec + pcm.length / sampleRate
  const from = Math.max(pcmStartSec, targetSec - searchSec)
  const to = Math.min(pcmEndSec, targetSec + searchSec)
  if (to - from < 0.5) return Math.min(Math.max(targetSec, pcmStartSec), pcmEndSec)

  // 100 ms buckets: fine enough to find a pause, coarse enough to stay cheap.
  const bucketSamples = Math.max(1, Math.round(sampleRate * 0.1))
  const startIndex = Math.floor((from - pcmStartSec) * sampleRate)
  const endIndex = Math.floor((to - pcmStartSec) * sampleRate)

  let bestEnergy = Infinity
  let bestCutSec = targetSec

  for (let offset = startIndex; offset + bucketSamples <= endIndex; offset += bucketSamples) {
    let energy = 0
    for (let i = offset; i < offset + bucketSamples; i++) {
      energy += pcm[i]! * pcm[i]!
    }

    // Nudge toward the nominal target so we don't drift far for a marginal win.
    const bucketCenterSec = pcmStartSec + (offset + bucketSamples / 2) / sampleRate
    const distancePenalty = 1 + Math.abs(bucketCenterSec - targetSec) / (searchSec * 4)
    const score = (energy / bucketSamples) * distancePenalty

    if (score < bestEnergy) {
      bestEnergy = score
      bestCutSec = bucketCenterSec
    }
  }

  return bestCutSec
}

/** Shifts window-relative segment timings into absolute file timings. */
export function offsetSegments(
  segments: TranscriptSegment[],
  offsetSec: number
): TranscriptSegment[] {
  if (offsetSec === 0) return segments
  return segments.map((segment) => ({
    ...segment,
    start: segment.start + offsetSec,
    end: segment.end + offsetSec,
    words: segment.words?.map((word) => ({
      ...word,
      start: word.start + offsetSec,
      end: word.end + offsetSec
    }))
  }))
}

/**
 * Drops segments the previous window already emitted.
 *
 * Everything before `overlapUntilSec` was replayed audio, so Whisper transcribes it
 * a second time. A segment is kept when its midpoint lands after the overlap, which
 * is more forgiving than comparing starts when the two runs disagree slightly on
 * where a sentence begins.
 */
export function dropOverlapDuplicates(
  segments: TranscriptSegment[],
  overlapUntilSec: number
): TranscriptSegment[] {
  if (overlapUntilSec <= 0) return segments
  return segments.filter((segment) => {
    const midpoint = (segment.start + segment.end) / 2
    return midpoint >= overlapUntilSec
  })
}

/**
 * Appends new segments to the running transcript, removing near-identical text at
 * the seam. Whisper sometimes repeats the last sentence of the previous window with
 * slightly different timings, which the midpoint filter alone can miss.
 */
export function mergeSegments(
  existing: TranscriptSegment[],
  incoming: TranscriptSegment[]
): TranscriptSegment[] {
  if (!existing.length) return [...incoming]
  if (!incoming.length) return existing

  const tail = existing[existing.length - 1]!
  const deduped = incoming.filter((segment) => {
    const sameText = normalizeText(segment.text) === normalizeText(tail.text)
    const closeInTime = Math.abs(segment.start - tail.start) < 1.5
    return !(sameText && closeInTime)
  })

  return [...existing, ...deduped]
}

function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Whisper emits `null` for the end timestamp of a trailing chunk it never closed.
 * Fill those in so downstream code can assume real numbers.
 */
export function repairTimings(
  segments: TranscriptSegment[],
  windowDurationSec: number
): TranscriptSegment[] {
  return segments.map((segment, index) => {
    const start = Number.isFinite(segment.start) ? segment.start : 0
    const nextStart = segments[index + 1]?.start
    const fallbackEnd = Number.isFinite(nextStart as number)
      ? (nextStart as number)
      : windowDurationSec
    const end = Number.isFinite(segment.end) && segment.end > start ? segment.end : fallbackEnd
    return { ...segment, start, end: Math.max(end, start) }
  })
}

/** Number of windows a file of `durationSec` will be split into. */
export function countWindows(durationSec: number, windowSec: number): number {
  if (!Number.isFinite(durationSec) || durationSec <= 0) return 1
  return Math.max(1, Math.ceil(durationSec / windowSec))
}
