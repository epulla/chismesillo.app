/** A single word with its own timing, only present when word timestamps are on. */
export type TranscriptWord = {
  start: number
  end: number
  text: string
}

/** A chunk of speech with timings relative to the start of the whole file. */
export type TranscriptSegment = {
  start: number
  end: number
  text: string
  words?: TranscriptWord[]
}

export type TranscriptMeta = {
  fileName: string
  fileSize: number
  durationSec: number
  model: string
  task: 'transcribe' | 'translate'
  language: string | null
  detectedLanguage: string | null
  device: 'webgpu' | 'wasm'
  wordTimestamps: boolean
  createdAt: number
}

export type Transcript = {
  meta: TranscriptMeta
  segments: TranscriptSegment[]
}

/** One decoded slice of audio handed from the audio worker to the ASR worker. */
export type AudioWindow = {
  index: number
  /** Absolute timestamp (seconds) of `pcm[0]` within the source file. */
  startSec: number
  /**
   * Absolute timestamp up to which the previous window already produced text.
   * Segments starting before this are duplicates from the overlap and get dropped.
   */
  overlapUntilSec: number
  endSec: number
  pcm: Float32Array
  isLast: boolean
}
