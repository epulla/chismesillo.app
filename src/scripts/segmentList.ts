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

export type RenderPlan = {
  /** `append` adds rows to what is already there; `replace` rebuilds the list. */
  mode: 'append' | 'replace'
  /** Index into the full segment array to start building from, for `append`. */
  from: number
}

export type RenderRequest = {
  /** Whether the caller is adding to a transcript rather than reacting to input. */
  incremental: boolean
  /** The active search query, already normalised. */
  query: string
  /** The query the DOM currently reflects; null before anything was rendered. */
  renderedQuery: string | null
  /** How many segments are currently in the DOM. */
  renderedCount: number
  /** How many segments exist now. */
  total: number
}

/**
 * Decides whether new segments can be appended or the whole list has to be rebuilt.
 *
 * Rebuilding after every window is what made a four-hour file crawl: the list ends
 * up with thousands of rows and was being thrown away and recreated ~48 times.
 * Appending is only safe when the DOM already shows an unfiltered list that is a
 * prefix of the current segments — any filter, any shrink, and the rows on screen
 * no longer line up with the array, so the safe answer is to start over.
 *
 * Kept pure and separate because getting this wrong shows up as a transcript that
 * silently duplicates or drops rows, which no type check would catch.
 */
export function planSegmentRender({
  incremental,
  query,
  renderedQuery,
  renderedCount,
  total
}: RenderRequest): RenderPlan {
  const canAppend =
    incremental && query === '' && renderedQuery === '' && total >= renderedCount && total > 0

  if (!canAppend) return { mode: 'replace', from: 0 }
  return { mode: 'append', from: renderedCount }
}
