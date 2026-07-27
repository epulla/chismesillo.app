import { describe, expect, it } from 'vitest'
import { DecodeSession } from './decodeSession'
import { SAMPLE_RATE } from './windowing'
import type { AudioWindow } from './types'

/**
 * Builds a 16-bit PCM WAV in memory. Stereo at 44.1 kHz on purpose: the decode
 * session has to downmix to mono and resample to 16 kHz, and this is the one input
 * format mediabunny can handle without WebCodecs (absent in Node), so it exercises
 * the real conversion pipeline rather than a mock.
 */
function makeWav(durationSec: number, sampleRate = 44100, channels = 2): Blob {
  const frames = Math.floor(durationSec * sampleRate)
  const bytesPerFrame = 2 * channels
  const dataSize = frames * bytesPerFrame
  const buffer = new ArrayBuffer(44 + dataSize)
  const view = new DataView(buffer)

  const ascii = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i))
  }

  ascii(0, 'RIFF')
  view.setUint32(4, 36 + dataSize, true)
  ascii(8, 'WAVE')
  ascii(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, channels, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * bytesPerFrame, true)
  view.setUint16(32, bytesPerFrame, true)
  view.setUint16(34, 16, true)
  ascii(36, 'data')
  view.setUint32(40, dataSize, true)

  for (let frame = 0; frame < frames; frame++) {
    const sec = frame / sampleRate
    // A quiet gap every 10 s gives the boundary finder something to aim at.
    const silent = sec % 10 >= 9.5
    const value = silent ? 0 : Math.round(Math.sin(sec * 440 * 2 * Math.PI) * 12000)
    for (let channel = 0; channel < channels; channel++) {
      view.setInt16(44 + frame * bytesPerFrame + channel * 2, value, true)
    }
  }

  return new Blob([buffer], { type: 'audio/wav' })
}

async function drain(session: DecodeSession): Promise<AudioWindow[]> {
  const windows: AudioWindow[] = []
  for (;;) {
    const window = await session.next()
    if (!window) break
    windows.push(window)
    if (window.isLast) break
  }
  return windows
}

describe('DecodeSession', () => {
  it('reports the duration of the source file', async () => {
    const session = new DecodeSession({ file: makeWav(12), windowSec: 60 })
    const info = await session.open()
    expect(info.durationSec).toBeCloseTo(12, 1)
    expect(info.sourceSampleRate).toBe(44100)
    expect(info.sourceChannels).toBe(2)
    session.dispose()
  })

  it('resamples to 16 kHz mono in a single window when the file is short', async () => {
    const session = new DecodeSession({ file: makeWav(12), windowSec: 60 })
    await session.open()
    const windows = await drain(session)

    expect(windows).toHaveLength(1)
    const [only] = windows
    expect(only!.isLast).toBe(true)
    expect(only!.startSec).toBeCloseTo(0, 1)
    // 12 s at 16 kHz, within a sample or two of the resampler's rounding.
    expect(only!.pcm.length / SAMPLE_RATE).toBeCloseTo(12, 1)
    expect(only!.pcm.some((sample) => sample !== 0)).toBe(true)
    session.dispose()
  })

  it('splits a long file into contiguous overlapping windows', async () => {
    const session = new DecodeSession({ file: makeWav(150), windowSec: 30 })
    const info = await session.open()
    const windows = await drain(session)

    expect(windows.length).toBeGreaterThan(2)
    expect(windows[windows.length - 1]!.isLast).toBe(true)

    // Windows must tile the file: each one starts before the previous one ended
    // (that is the deliberate overlap) and the last one reaches the end.
    for (let i = 1; i < windows.length; i++) {
      const previous = windows[i - 1]!
      const current = windows[i]!
      expect(current.startSec).toBeLessThan(previous.endSec)
      expect(current.startSec).toBeGreaterThan(previous.startSec)
      expect(current.overlapUntilSec).toBeCloseTo(previous.endSec, 3)
    }

    const last = windows[windows.length - 1]!
    expect(last.endSec).toBeCloseTo(info.durationSec, 0)
  })

  it('keeps memory flat by holding at most one window while paused', async () => {
    const session = new DecodeSession({ file: makeWav(200), windowSec: 20 })
    await session.open()

    // Pull one window, then let decoding run unattended for a moment. The gate in
    // `process` must stop it after a single queued window instead of decoding on.
    const first = await session.next()
    expect(first).not.toBeNull()
    await new Promise((resolve) => setTimeout(resolve, 250))

    const buffered = session.debugBufferedSamples()
    const windowSamples = 20 * SAMPLE_RATE
    expect(buffered).toBeLessThanOrEqual(windowSamples * 2)

    session.dispose()
  })

  it('rejects files with no readable audio track', async () => {
    const session = new DecodeSession({
      file: new Blob([new Uint8Array(2048)], { type: 'application/octet-stream' }),
      windowSec: 60
    })
    await expect(session.open()).rejects.toThrow(/decode:unreadable|decode:noAudioTrack/)
    session.dispose()
  })
})
