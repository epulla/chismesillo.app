/**
 * Roughly how much memory one window costs, so the chunk-size slider can show the
 * price of turning it up. Ignores the model weights, which dwarf all of this but
 * do not change with window size.
 */
import { BOUNDARY_SEARCH_SEC, countWhisperChunks, SAMPLE_RATE } from './windowing'

const BYTES_PER_SAMPLE = 4

/** Mel frames a 30 s chunk produces: 3000 at 16 kHz with a 160-sample hop. */
const FRAMES_PER_CHUNK = 3000

export type WindowMemory = {
  decodeBytes: number
  pcmBytes: number
  featureBytes: number
  total: number
}

export function estimateWindowBytes(windowSec: number, melBins: number): WindowMemory {
  const safeWindowSec = Math.max(0, windowSec)

  // emitWindow truncates the pending buffer in place rather than slicing a second
  // copy out of it, so the emitted window is not counted twice here. Without
  // ArrayBuffer.prototype.transfer (Safari < 17.4, Firefox < 122) it falls back to
  // copying and the real peak is one window of PCM higher.
  const pendingSamples = (safeWindowSec + BOUNDARY_SEARCH_SEC) * SAMPLE_RATE
  const windowSamples = safeWindowSec * SAMPLE_RATE
  const decodeBytes = pendingSamples * BYTES_PER_SAMPLE
  const pcmBytes = windowSamples * BYTES_PER_SAMPLE

  // The surprising term: the ASR pipeline builds input_features for *every* 30 s
  // sub-chunk before generating any tokens and holds them all until the window
  // finishes, so this grows with window size and cannot be tuned from outside.
  // Counted by windowing.ts rather than re-derived here: this file used to keep its
  // own copy of the chunk and stride constants, and silently kept quoting stride 5
  // after the pipeline moved to 3.
  const chunks = countWhisperChunks(safeWindowSec)
  const featureBytes = chunks * melBins * FRAMES_PER_CHUNK * BYTES_PER_SAMPLE

  return { decodeBytes, pcmBytes, featureBytes, total: decodeBytes + pcmBytes + featureBytes }
}
