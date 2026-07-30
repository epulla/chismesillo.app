/**
 * File -> 16 kHz mono float PCM, one window at a time.
 *
 * Memory stays flat no matter how long the file is: mediabunny reads the file
 * lazily from disk, and the `process` hook awaits a gate once a window is ready,
 * which suspends decoding until the consumer pulls it. Kept free of worker globals
 * so it can be driven directly from tests.
 */
import {
  ALL_FORMATS,
  BlobSource,
  BufferTarget,
  Conversion,
  Input,
  Output,
  WavOutputFormat,
  type AudioSample
} from 'mediabunny'
import {
  BOUNDARY_SEARCH_SEC,
  findQuietCut,
  MIN_WINDOW_SEC,
  OVERLAP_SEC,
  SAMPLE_RATE
} from './windowing'
import type { AudioWindow } from './types'

/**
 * Cuts the first `length` samples out of a buffer into an array that owns its own
 * ArrayBuffer, so it can be transferred to another worker.
 *
 * A seam so both strategies get exercised by the suite. `slice` doubles the peak —
 * ~77 MB extra at a 20 minute window; `transfer` truncates in place but detaches
 * the original, which is why the caller copies the overlap tail out first.
 */
export type TruncateHead = (samples: Float32Array, length: number) => Float32Array

type TransferableBuffer = ArrayBuffer & { transfer?: (bytes?: number) => ArrayBuffer }

export const copyTruncate: TruncateHead = (samples, length) => samples.slice(0, length)

export const transferTruncate: TruncateHead = (samples, length) => {
  const buffer = samples.buffer as TransferableBuffer
  // A view into somebody else's buffer, or a runtime without ArrayBuffer.transfer
  // (pre-114 Chrome, pre-17.4 Safari, pre-122 Firefox): copying is the only option.
  if (samples.byteOffset !== 0 || typeof buffer.transfer !== 'function') {
    return copyTruncate(samples, length)
  }
  return new Float32Array(buffer.transfer(length * Float32Array.BYTES_PER_ELEMENT))
}

const defaultTruncate: TruncateHead = transferTruncate

export type OpenPayload = {
  file: File | Blob
  windowSec: number
  /** Injected by tests to drive both truncation strategies. */
  truncate?: TruncateHead
}

export class DecodeSession {
  private readonly file: File | Blob
  private readonly windowSec: number
  private readonly truncate: TruncateHead
  private input: Input | null = null
  private conversion: Conversion | null = null
  private output: Output | null = null

  /** Decoded but not yet windowed samples. */
  private pending: Float32Array[] = []
  private pendingLength = 0
  /** Absolute timestamp of the first sample sitting in `pending`. */
  private pendingStartSec = 0
  /** Absolute timestamp where the previous window's transcript stopped. */
  private lastCutSec = 0
  private windowIndex = 0

  private queued: AudioWindow | null = null
  private deliver: ((window: AudioWindow | null) => void) | null = null
  private resumeDecode: (() => void) | null = null
  private finished = false
  private failure: Error | null = null
  private disposed = false

  constructor({ file, windowSec, truncate = defaultTruncate }: OpenPayload) {
    this.file = file
    this.windowSec = windowSec
    this.truncate = truncate
  }

  async open() {
    const input = new Input({ formats: ALL_FORMATS, source: new BlobSource(this.file) })
    this.input = input

    if (!(await input.canRead())) {
      throw new DecodeError('unreadable')
    }

    const track = await input.getPrimaryAudioTrack()
    if (!track) throw new DecodeError('noAudioTrack')
    if (!(await track.canDecode())) throw new DecodeError('undecodable')

    const durationSec =
      (await input.getDurationFromMetadata().catch(() => null)) ?? (await input.computeDuration())

    // Nothing is encoded: the `process` hook grabs every resampled sample and
    // returns null, so no media data reaches the output and we only pay for
    // decoding. `composable: true` is what makes that legal — it leaves the output
    // lifecycle to us, so the empty output is never finalized (a muxer asked to
    // finalize a track with zero samples asserts).
    const output = new Output({ format: new WavOutputFormat(), target: new BufferTarget() })
    const conversion = await Conversion.init({
      input,
      output,
      composable: true,
      video: { discard: true },
      audio: {
        numberOfChannels: 1,
        sampleRate: SAMPLE_RATE,
        codec: 'pcm-s16',
        process: (sample) => this.consume(sample)
      }
    })

    if (!conversion.isValid) {
      throw new DecodeError('undecodable')
    }

    await output.start()

    this.output = output
    this.conversion = conversion
    this.run()

    return {
      durationSec,
      sourceSampleRate: await track.getSampleRate(),
      sourceChannels: await track.getNumberOfChannels(),
      codec: await track.getCodec()
    }
  }

  /** Drives the conversion to completion in the background. */
  private run() {
    this.conversion!.execute()
      .then(() => this.flushTail())
      .catch((error: unknown) => {
        if (this.disposed) return
        this.failure = error instanceof Error ? error : new Error(String(error))
        this.finished = true
        this.deliver?.(null)
        this.deliver = null
      })
  }

  /** Called by mediabunny for every resampled 16 kHz mono sample. */
  private async consume(sample: AudioSample): Promise<null> {
    if (this.disposed) {
      sample.close()
      return null
    }

    const frames = new Float32Array(sample.allocationSize({ format: 'f32', planeIndex: 0 }) / 4)
    sample.copyTo(frames, { format: 'f32', planeIndex: 0 })
    if (!this.pending.length) this.pendingStartSec = sample.timestamp
    sample.close()

    this.pending.push(frames)
    this.pendingLength += frames.length

    // Wait until there is a full window plus enough slack to hunt for a pause.
    const needed = (this.windowSec + BOUNDARY_SEARCH_SEC) * SAMPLE_RATE
    while (this.pendingLength >= needed) {
      await this.emitWindow()
    }

    return null
  }

  /** Cuts one window out of `pending` at the quietest point near the target. */
  private async emitWindow() {
    const buffer = this.concatPending()
    const targetSec = this.pendingStartSec + this.windowSec
    const cutSec = findQuietCut(buffer, this.pendingStartSec, targetSec)
    const cutIndex = Math.min(
      buffer.length,
      Math.max(
        Math.round(MIN_WINDOW_SEC * SAMPLE_RATE),
        Math.round((cutSec - this.pendingStartSec) * SAMPLE_RATE)
      )
    )

    const startSec = this.pendingStartSec
    const endSec = startSec + cutIndex / SAMPLE_RATE

    // Keep the last couple of seconds as context for the next window. This has to
    // happen *before* the truncation below: the default strategy detaches `buffer`,
    // so reading from it afterwards would throw on an empty array.
    const keepFrom = Math.max(0, cutIndex - OVERLAP_SEC * SAMPLE_RATE)
    const tail = buffer.slice(keepFrom)
    this.pending = tail.length ? [tail] : []
    this.pendingLength = tail.length
    this.pendingStartSec = startSec + keepFrom / SAMPLE_RATE

    const pcm = this.truncate(buffer, cutIndex)

    await this.publish({
      index: this.windowIndex++,
      startSec,
      endSec,
      overlapUntilSec: this.lastCutSec,
      pcm,
      isLast: false
    })

    this.lastCutSec = endSec
  }

  /** Emits whatever is left once decoding ends. */
  private async flushTail() {
    if (this.disposed) return

    if (this.pendingLength > 0) {
      const pcm = this.concatPending()
      const startSec = this.pendingStartSec
      this.pending = []
      this.pendingLength = 0
      await this.publish({
        index: this.windowIndex++,
        startSec,
        endSec: startSec + pcm.length / SAMPLE_RATE,
        overlapUntilSec: this.lastCutSec,
        pcm,
        isLast: true
      })
    }

    this.finished = true
    this.deliver?.(null)
    this.deliver = null
  }

  /**
   * Hands a window to the consumer. If nobody has asked for one yet, decoding
   * blocks here until they do — this is the backpressure that keeps memory flat.
   */
  private publish(window: AudioWindow): Promise<void> {
    if (this.deliver) {
      const deliver = this.deliver
      this.deliver = null
      deliver(window)
      return Promise.resolve()
    }

    this.queued = window
    return new Promise<void>((resolve) => {
      this.resumeDecode = resolve
    })
  }

  next(): Promise<AudioWindow | null> {
    if (this.failure) return Promise.reject(this.failure)

    if (this.queued) {
      const window = this.queued
      this.queued = null
      const resume = this.resumeDecode
      this.resumeDecode = null
      resume?.()
      return Promise.resolve(window)
    }

    if (this.finished) return Promise.resolve(null)

    return new Promise<AudioWindow | null>((resolve, reject) => {
      this.deliver = (window) => {
        if (this.failure) reject(this.failure)
        else resolve(window)
      }
    })
  }

  private concatPending(): Float32Array {
    if (this.pending.length === 1) return this.pending[0]!
    const merged = new Float32Array(this.pendingLength)
    let offset = 0
    for (const chunk of this.pending) {
      merged.set(chunk, offset)
      offset += chunk.length
    }
    this.pending = [merged]
    return merged
  }

  /** Samples currently held in memory. Used by tests to assert backpressure works. */
  debugBufferedSamples(): number {
    return this.pendingLength + (this.queued?.pcm.length ?? 0)
  }

  dispose() {
    this.disposed = true
    this.finished = true
    this.pending = []
    this.pendingLength = 0
    this.queued = null
    this.resumeDecode?.()
    this.resumeDecode = null
    this.deliver?.(null)
    this.deliver = null
    void this.conversion?.cancel().catch(() => {})
    // The output is never finalized: it holds no media data, only the tracks the
    // conversion registered. Cancelling releases it along with the decoders.
    void this.output?.cancel().catch(() => {})
    this.input?.dispose()
    this.input = null
    this.conversion = null
    this.output = null
  }
}

/** Carries an i18n key from `errors.*` so the UI can show a translated message. */
export class DecodeError extends Error {
  constructor(public readonly key: string) {
    super(`decode:${key}`)
  }
}
