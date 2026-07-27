import type { Transcript, TranscriptSegment } from './types'

export type ExportFormat = 'srt' | 'vtt' | 'json' | 'txt' | 'csv'

/** `01:02:03,456` for SRT, `01:02:03.456` for VTT. */
export function formatTimestamp(seconds: number, separator: ',' | '.' = ','): string {
  const safe = Number.isFinite(seconds) && seconds > 0 ? seconds : 0
  const totalMs = Math.round(safe * 1000)
  const ms = totalMs % 1000
  const totalSeconds = (totalMs - ms) / 1000
  const secs = totalSeconds % 60
  const totalMinutes = (totalSeconds - secs) / 60
  const mins = totalMinutes % 60
  const hours = (totalMinutes - mins) / 60

  const pad = (value: number, size = 2) => String(value).padStart(size, '0')
  return `${pad(hours)}:${pad(mins)}:${pad(secs)}${separator}${pad(ms, 3)}`
}

/** `1:02:03` / `2:03`, for on-screen timecodes. */
export function formatClock(seconds: number): string {
  const safe = Number.isFinite(seconds) && seconds > 0 ? Math.floor(seconds) : 0
  const secs = safe % 60
  const mins = Math.floor(safe / 60) % 60
  const hours = Math.floor(safe / 3600)
  const pad = (value: number) => String(value).padStart(2, '0')
  return hours > 0 ? `${hours}:${pad(mins)}:${pad(secs)}` : `${mins}:${pad(secs)}`
}

export function toSrt(segments: TranscriptSegment[]): string {
  return (
    segments
      .map((segment, index) =>
        [
          index + 1,
          `${formatTimestamp(segment.start)} --> ${formatTimestamp(segment.end)}`,
          segment.text.trim()
        ].join('\n')
      )
      .join('\n\n') + '\n'
  )
}

export function toVtt(segments: TranscriptSegment[]): string {
  const cues = segments
    .map((segment) =>
      [
        `${formatTimestamp(segment.start, '.')} --> ${formatTimestamp(segment.end, '.')}`,
        segment.text.trim()
      ].join('\n')
    )
    .join('\n\n')
  return `WEBVTT\n\n${cues}\n`
}

export function toPlainText(segments: TranscriptSegment[]): string {
  return segments.map((segment) => segment.text.trim()).join('\n') + '\n'
}

export function toCsv(segments: TranscriptSegment[]): string {
  const rows = segments.map((segment) =>
    [segment.start.toFixed(3), segment.end.toFixed(3), csvCell(segment.text.trim())].join(',')
  )
  return ['start,end,text', ...rows].join('\n') + '\n'
}

function csvCell(value: string): string {
  return `"${value.replace(/"/g, '""')}"`
}

export function toJson(transcript: Transcript): string {
  return JSON.stringify(transcript, null, 2) + '\n'
}

export function serialize(transcript: Transcript, format: ExportFormat): string {
  switch (format) {
    case 'srt':
      return toSrt(transcript.segments)
    case 'vtt':
      return toVtt(transcript.segments)
    case 'txt':
      return toPlainText(transcript.segments)
    case 'csv':
      return toCsv(transcript.segments)
    case 'json':
      return toJson(transcript)
  }
}

const MIME_TYPES: Record<ExportFormat, string> = {
  srt: 'application/x-subrip',
  vtt: 'text/vtt',
  json: 'application/json',
  txt: 'text/plain',
  csv: 'text/csv'
}

/** Strips the original extension so `talk.mp3` becomes `talk.srt`. */
export function exportFileName(sourceName: string, format: ExportFormat): string {
  const base = sourceName.replace(/\.[^./\\]+$/, '') || 'transcript'
  return `${base}.${format}`
}

export function downloadTranscript(transcript: Transcript, format: ExportFormat) {
  const blob = new Blob([serialize(transcript, format)], {
    type: `${MIME_TYPES[format]};charset=utf-8`
  })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = exportFileName(transcript.meta.fileName, format)
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function countWords(segments: TranscriptSegment[]): number {
  return segments.reduce((total, segment) => {
    const words = segment.text.trim().split(/\s+/).filter(Boolean)
    return total + words.length
  }, 0)
}
