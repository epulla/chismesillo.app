// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest'
import { createSegmentItem, planSegmentRender, type RenderRequest } from './segmentList'
import type { TranscriptSegment } from './types'

const segment: TranscriptSegment = { start: 80, end: 84, text: '  Hola, qué tal.  ' }

function build(overrides: Partial<Parameters<typeof createSegmentItem>[1]> = {}) {
  const onSeek = vi.fn()
  const item = createSegmentItem(segment, {
    label: ({ time, text }) => `Play from ${time}: ${text}`,
    onSeek,
    ...overrides
  })
  const button = item.querySelector('button')!
  return { item, button, onSeek }
}

describe('createSegmentItem', () => {
  it('renders a list item wrapping a real button', () => {
    const { item, button } = build()
    expect(item.tagName).toBe('LI')
    // A click-handled <li> is invisible to keyboard users; a <button> gets
    // focus, Enter and Space from the platform.
    expect(button.tagName).toBe('BUTTON')
    expect(button.type).toBe('button')
  })

  it('names the row with its timecode and text', () => {
    const { button } = build()
    expect(button.getAttribute('aria-label')).toBe('Play from 1:20: Hola, qué tal.')
  })

  it('hides the duplicated visual text from assistive tech', () => {
    const { button } = build()
    const children = [...button.children]
    expect(children).toHaveLength(2)
    expect(children.every((child) => child.getAttribute('aria-hidden') === 'true')).toBe(true)
  })

  it('shows the trimmed text and formatted timecode', () => {
    const { button } = build()
    expect(button.querySelector('span')?.textContent).toBe('1:20')
    expect(button.querySelector('p')?.textContent).toBe('Hola, qué tal.')
  })

  it('seeks to the segment start when activated', () => {
    const { button, onSeek } = build()
    button.click()
    expect(onSeek).toHaveBeenCalledWith(80)
  })

  it('is reachable in the tab order', () => {
    const { button } = build()
    document.body.append(button)
    button.focus()
    expect(document.activeElement).toBe(button)
    expect(button.hasAttribute('disabled')).toBe(false)
  })
})

describe('planSegmentRender', () => {
  const request = (overrides: Partial<RenderRequest> = {}): RenderRequest => ({
    incremental: true,
    query: '',
    renderedQuery: '',
    renderedCount: 10,
    total: 14,
    ...overrides
  })

  // The whole point: a four-hour run must not rebuild thousands of rows per window.
  it('appends only the new segments during an unfiltered run', () => {
    expect(planSegmentRender(request())).toEqual({ mode: 'append', from: 10 })
  })

  it('rebuilds when the caller is not adding to an existing transcript', () => {
    expect(planSegmentRender(request({ incremental: false }))).toEqual({
      mode: 'replace',
      from: 0
    })
  })

  // The DOM holds filtered rows, so its indices no longer line up with the array.
  it('rebuilds while a search filter is active', () => {
    expect(planSegmentRender(request({ query: 'hola' })).mode).toBe('replace')
  })

  it('rebuilds when the DOM still reflects an older query', () => {
    expect(planSegmentRender(request({ renderedQuery: 'hola' })).mode).toBe('replace')
    expect(planSegmentRender(request({ renderedQuery: null })).mode).toBe('replace')
  })

  // Segments only ever get appended, so a shrink means something reset underneath
  // us — a new file, or a restored transcript. Appending would duplicate rows.
  it('rebuilds when the transcript shrank', () => {
    expect(planSegmentRender(request({ total: 4, renderedCount: 10 })).mode).toBe('replace')
  })

  it('rebuilds an empty transcript rather than appending nothing', () => {
    expect(planSegmentRender(request({ total: 0, renderedCount: 0 })).mode).toBe('replace')
  })

  it('appends nothing when there is nothing new, without rebuilding', () => {
    expect(planSegmentRender(request({ total: 10, renderedCount: 10 }))).toEqual({
      mode: 'append',
      from: 10
    })
  })
})
