export type ProgressStats = {
  factor: number
  remainingSec: number | null
}

export function progressPercent(transcribedSec: number, durationSec: number): number {
  if (!durationSec) return 5
  return Math.min(99, Math.round((transcribedSec / durationSec) * 100))
}

export function progressStats(
  transcribedSec: number,
  durationSec: number,
  elapsedSec: number
): ProgressStats | null {
  if (!(elapsedSec > 0) || !(transcribedSec > 0)) return null

  const factor = transcribedSec / elapsedSec
  const audioLeftSec = durationSec - transcribedSec
  const remainingSec = audioLeftSec / Math.max(factor, 0.01)

  return {
    factor,
    remainingSec: audioLeftSec > 0 && remainingSec > 1 ? remainingSec : null
  }
}
