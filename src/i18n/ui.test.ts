import { describe, expect, it } from 'vitest'
import { clientStrings, ui, useTranslations } from './ui'
import { languages, type Lang } from './locales'

const locales = Object.keys(languages) as Lang[]

function keyPaths(tree: unknown, prefix = ''): string[] {
  if (typeof tree !== 'object' || tree === null) return [prefix]
  return Object.entries(tree).flatMap(([key, value]) =>
    keyPaths(value, prefix ? `${prefix}.${key}` : key)
  )
}

describe('ui translations', () => {
  it('covers both configured locales', () => {
    expect(locales.sort()).toEqual(['en', 'es'])
  })

  // A key added to one tree and forgotten in the other silently falls back to
  // English, which reads as a bug rather than failing loudly.
  it('has identical key sets across locales', () => {
    const [reference, ...rest] = locales.map((lang) => keyPaths(ui[lang]).sort())
    for (const other of rest) expect(other).toEqual(reference)
  })

  it('has no empty strings', () => {
    for (const lang of locales) {
      for (const path of keyPaths(ui[lang])) {
        expect(useTranslations(lang)(path).trim()).not.toBe('')
      }
    }
  })

  it('keeps placeholders consistent between locales', () => {
    const placeholders = (value: string) =>
      [...value.matchAll(/\{(\w+)\}/g)].map((match) => match[1]!).sort()

    for (const path of keyPaths(ui.en)) {
      expect(placeholders(useTranslations('es')(path))).toEqual(
        placeholders(useTranslations('en')(path))
      )
    }
  })
})

describe('clientStrings', () => {
  // createTranslator() returns the key path verbatim when a section was not
  // shipped, so anything app.ts reads at runtime has to be in CLIENT_SECTIONS.
  it('ships the a11y section the client reads at runtime', () => {
    for (const lang of locales) {
      const strings = clientStrings(lang) as Record<string, Record<string, string>>
      expect(strings.a11y?.playSegment).toBeTruthy()
    }
  })

  it('ships the same sections for every locale', () => {
    const [reference, ...rest] = locales.map((lang) => Object.keys(clientStrings(lang)).sort())
    for (const other of rest) expect(other).toEqual(reference)
  })
})
