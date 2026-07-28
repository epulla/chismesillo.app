import { formatClock } from './exports'
import type { TranscriptSegment } from './types'

type Options = {
  /** Accessible name for the row, e.g. "Play from 1:20: <text>". */
  label: (vars: { time: string; text: string }) => string
  onSeek: (startSec: number) => void
}

/**
 * One transcript row. This is a real `<button>` rather than a click-handled `<li>`
 * so it is reachable by keyboard and announced as actionable — Enter and Space come
 * from the native element, no key handling needed.
 */
export function createSegmentItem(segment: TranscriptSegment, options: Options): HTMLLIElement {
  const time = formatClock(segment.start)
  const text = segment.text.trim()

  const item = document.createElement('li')

  const button = document.createElement('button')
  button.type = 'button'
  button.className =
    'flex w-full cursor-pointer gap-3 rounded-field px-2 py-1.5 text-left transition-colors hover:bg-base-200 focus-visible:bg-base-200'
  button.setAttribute('aria-label', options.label({ time, text }))

  const timecode = document.createElement('span')
  timecode.className = 'timecode shrink-0 pt-0.5'
  timecode.textContent = time
  // The timecode is repeated in the button's aria-label; don't read it twice.
  timecode.setAttribute('aria-hidden', 'true')

  const body = document.createElement('p')
  body.className = 'text-sm leading-relaxed'
  body.textContent = text
  body.setAttribute('aria-hidden', 'true')

  button.append(timecode, body)
  button.addEventListener('click', () => options.onSeek(segment.start))
  item.append(button)

  return item
}
