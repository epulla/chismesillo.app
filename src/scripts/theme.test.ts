import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  contrastRatio,
  CONTRAST_PAIRS,
  FOCUS_RING,
  MUTED_CONTENT,
  relativeLuminance,
  TINTS,
  TOKENS
} from './theme'

const css = readFileSync(new URL('../styles/global.css', import.meta.url), 'utf8')

function block(source: string, opener: string): string {
  const start = source.indexOf(opener)
  if (start < 0) throw new Error(`no block for ${opener}`)

  let depth = 0
  for (let i = source.indexOf('{', start); i < source.length; i++) {
    if (source[i] === '{') depth++
    else if (source[i] === '}' && --depth === 0) return source.slice(start, i + 1)
  }

  throw new Error(`unbalanced block for ${opener}`)
}

function classRulesUsing(value: string): string[] {
  const classNames = new Set<string>()
  for (const match of css.matchAll(/(^|\n)\s*(\.[^{]+)\{([^}]*)\}/g)) {
    const selector = match[2]!
    const body = match[3]!
    if (!body.includes(value)) continue

    for (const classMatch of selector.matchAll(/\.([a-z0-9-]+)/g)) {
      classNames.add(classMatch[1]!)
    }
  }
  return [...classNames]
}

describe('contrastRatio', () => {
  it('is 21 for black on white and 1 for a colour on itself', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 2)
    expect(contrastRatio('#A34E6B', '#A34E6B')).toBeCloseTo(1, 5)
  })

  it('is order independent', () => {
    expect(contrastRatio('#2B2320', '#FBF6F1')).toBeCloseTo(contrastRatio('#FBF6F1', '#2B2320'), 10)
  })

  it('rejects malformed colours', () => {
    expect(() => relativeLuminance('#FFF')).toThrow()
  })
})

// A pastel scheme sits close to its background by definition, so contrast is the
// thing most likely to regress when someone nudges a colour. Every pair the UI can
// actually render is checked rather than spot-checked.
describe('palette contrast', () => {
  it.each(CONTRAST_PAIRS)('$name meets $min:1', ({ fg, bg, min }) => {
    expect(contrastRatio(fg, bg)).toBeGreaterThanOrEqual(min)
  })
})

describe('global.css', () => {
  it.each(Object.entries(TOKENS))('declares --color-%s as %s', (name, value) => {
    expect(css).toContain(`--color-${name}: ${value.toLowerCase()};`)
  })

  it.each(Object.entries(TINTS))('declares the %s tint as %s', (name, value) => {
    expect(css).toContain(`--color-tint-${name}: ${value.toLowerCase()};`)
  })

  it('declares the muted and focus-ring colours', () => {
    expect(css).toContain(`--color-muted-content: ${MUTED_CONTENT.toLowerCase()};`)
    expect(css).toContain(`--color-focus-ring: ${FOCUS_RING.toLowerCase()};`)
  })

  it('ships only the custom theme', () => {
    expect(css).toContain('themes: false;')
    expect(css).toContain("name: 'chismesillo';")
  })

  it('honours prefers-reduced-motion', () => {
    expect(css).toContain('prefers-reduced-motion: reduce')
  })

  it('gives body a stacking context so the backdrop is visible', () => {
    expect(block(css, '  body {')).toContain('isolation: isolate')
  })

  it('disables every looping animation under reduced motion', () => {
    const reducedMotion = block(css, '@media (prefers-reduced-motion: reduce)')

    for (const className of classRulesUsing('infinite')) {
      expect(reducedMotion).toContain(`.${className}`)
    }
  })

  it('stops the ambient backdrop for reduced motion', () => {
    const reducedMotion = block(css, '@media (prefers-reduced-motion: reduce)')

    expect(reducedMotion).toMatch(/\.motion-blob\s*\{[^}]*animation: none !important/s)
  })

  it('pauses the backdrop while transcribing', () => {
    const pauseRule = block(css, 'body[data-transcribing] .motion-blob')

    expect(pauseRule).toContain('animation-play-state: paused')
  })

  it('self-hosts every font so no third-party request is introduced', () => {
    const urls = [...css.matchAll(/url\('([^']+)'\)/g)].map((m) => m[1]!)
    expect(urls.length).toBeGreaterThan(0)
    expect(urls.every((url) => url.startsWith('/fonts/'))).toBe(true)
  })
})
