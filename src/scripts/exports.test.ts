import { describe, expect, it } from 'vitest'
import {
  countWords,
  exportFileName,
  formatClock,
  formatTimestamp,
  serialize,
  toCsv,
  toSrt,
  toVtt
} from './exports'
import type { Transcript, TranscriptSegment } from './types'

const segments: TranscriptSegment[] = [
  { start: 0, end: 2.5, text: 'Hola, qué tal.' },
  { start: 2.5, end: 3661.25, text: 'Second one' }
]

const transcript: Transcript = {
  meta: {
    fileName: 'podcast.mp3',
    fileSize: 123,
    durationSec: 3661.25,
    model: 'Xenova/whisper-base',
    task: 'transcribe',
    language: null,
    detectedLanguage: 'es',
    device: 'wasm',
    wordTimestamps: false,
    createdAt: 0
  },
  segments
}

describe('formatTimestamp', () => {
  it('formats hours, minutes, seconds and milliseconds', () => {
    expect(formatTimestamp(0)).toBe('00:00:00,000')
    expect(formatTimestamp(3661.25)).toBe('01:01:01,250')
  })

  it('supports the VTT separator', () => {
    expect(formatTimestamp(1.5, '.')).toBe('00:00:01.500')
  })

  it('clamps invalid values to zero', () => {
    expect(formatTimestamp(Number.NaN)).toBe('00:00:00,000')
    expect(formatTimestamp(-4)).toBe('00:00:00,000')
  })

  it('rounds milliseconds without leaking into the next second', () => {
    expect(formatTimestamp(59.9999)).toBe('00:01:00,000')
  })
})

describe('formatClock', () => {
  it('omits the hour when it is zero', () => {
    expect(formatClock(75)).toBe('1:15')
    expect(formatClock(3675)).toBe('1:01:15')
  })
})

describe('toSrt', () => {
  it('numbers cues from one and uses comma separators', () => {
    const srt = toSrt(segments)
    expect(srt).toContain('1\n00:00:00,000 --> 00:00:02,500\nHola, qué tal.')
    expect(srt).toContain('2\n00:00:02,500 --> 01:01:01,250\nSecond one')
    expect(srt.endsWith('\n')).toBe(true)
  })
})

describe('toVtt', () => {
  it('starts with the WEBVTT header', () => {
    expect(toVtt(segments).startsWith('WEBVTT\n\n')).toBe(true)
  })
})

describe('toCsv', () => {
  it('quotes cells and escapes inner quotes', () => {
    const csv = toCsv([{ start: 0, end: 1, text: 'she said "hi", loudly' }])
    expect(csv).toContain('"she said ""hi"", loudly"')
    expect(csv.split('\n')[0]).toBe('start,end,text')
  })
})

describe('serialize', () => {
  it('produces valid JSON including metadata', () => {
    const parsed = JSON.parse(serialize(transcript, 'json'))
    expect(parsed.meta.model).toBe('Xenova/whisper-base')
    expect(parsed.segments).toHaveLength(2)
  })

  it('produces one line per segment as plain text', () => {
    expect(serialize(transcript, 'txt').trim().split('\n')).toHaveLength(2)
  })
})

describe('exportFileName', () => {
  it('swaps the extension', () => {
    expect(exportFileName('podcast.mp3', 'srt')).toBe('podcast.srt')
    expect(exportFileName('my.long.name.wav', 'vtt')).toBe('my.long.name.vtt')
  })

  it('handles names without an extension', () => {
    expect(exportFileName('recording', 'txt')).toBe('recording.txt')
  })
})

describe('countWords', () => {
  it('counts words across segments', () => {
    expect(countWords(segments)).toBe(5)
  })

  it('ignores empty segments', () => {
    expect(countWords([{ start: 0, end: 1, text: '   ' }])).toBe(0)
  })
})
