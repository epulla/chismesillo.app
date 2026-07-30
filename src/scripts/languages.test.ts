import { describe, expect, it } from 'vitest'
import { foldForSearch, languageName, matchLanguages, WHISPER_LANGUAGES } from './languages'

const codes = (query: string) => matchLanguages(query).map((language) => language.code)

describe('WHISPER_LANGUAGES', () => {
  it('has a unique code, an endonym and an exonym for every entry', () => {
    expect(new Set(WHISPER_LANGUAGES.map((language) => language.code)).size).toBe(
      WHISPER_LANGUAGES.length
    )
    for (const language of WHISPER_LANGUAGES) {
      expect(language.code).toMatch(/^[a-z]{2,3}$/)
      expect(language.name.trim()).not.toBe('')
      expect(language.englishName.trim()).not.toBe('')
    }
  })

  // The UI ships in Spanish too, so every language needs at least one Spanish
  // spelling to be findable from the /es page. Without this the search box looks
  // broken to exactly the audience the app was written for.
  it('carries at least one alias for every entry', () => {
    for (const language of WHISPER_LANGUAGES) {
      expect(language.aliases.length).toBeGreaterThan(0)
      for (const alias of language.aliases) expect(alias.trim()).not.toBe('')
    }
  })
})

describe('foldForSearch', () => {
  it('strips diacritics and case', () => {
    expect(foldForSearch('Français')).toBe('francais')
    expect(foldForSearch('ESPAÑOL')).toBe('espanol')
    expect(foldForSearch('  Română  ')).toBe('romana')
  })

  it('leaves scripts without combining marks alone', () => {
    expect(foldForSearch('日本語')).toBe('日本語')
    expect(foldForSearch('العربية')).toBe('العربية')
  })
})

describe('matchLanguages', () => {
  it('returns the whole catalogue for an empty query', () => {
    expect(matchLanguages('')).toHaveLength(WHISPER_LANGUAGES.length)
    expect(matchLanguages('   ')).toHaveLength(WHISPER_LANGUAGES.length)
  })

  // The point of the feature: the list shows "Deutsch", the user types "german".
  it('finds a language by its English name', () => {
    expect(codes('german')).toContain('de')
    expect(codes('spanish')).toContain('es')
    expect(codes('japanese')).toContain('ja')
  })

  it('finds a language by its own name, with or without accents', () => {
    expect(codes('Français')).toContain('fr')
    expect(codes('francais')).toContain('fr')
    expect(codes('espanol')).toContain('es')
    expect(codes('中文')).toContain('zh')
  })

  it('finds a language by a Spanish alias, accented or not', () => {
    expect(codes('alemán')).toContain('de')
    expect(codes('aleman')).toContain('de')
    expect(codes('japones')).toContain('ja')
    expect(codes('neerlandes')).toContain('nl')
    expect(codes('mandarin')).toContain('zh')
  })

  it('finds a language by code', () => {
    expect(codes('ur')).toContain('ur')
    expect(codes('ta')).toContain('ta')
  })

  // Typing a code should not bury the language it names under a longer word that
  // happens to contain those two letters.
  it('ranks an exact code match first', () => {
    expect(codes('es')[0]).toBe('es')
    expect(codes('no')[0]).toBe('no')
    expect(codes('it')[0]).toBe('it')
  })

  // "Indonesian" starts with the query; "Hindi" merely contains it.
  it('ranks prefix matches above substring matches', () => {
    const results = codes('ind')
    expect(results).toContain('id')
    expect(results).toContain('hi')
    expect(results.indexOf('id')).toBeLessThan(results.indexOf('hi'))
  })

  // No entry's code, endonym or exonym starts with "an", so every hit is a
  // substring match and the catalogue's own order has to survive the sort.
  it('keeps catalogue order between entries of equal rank', () => {
    const positions = matchLanguages('an').map((language) =>
      WHISPER_LANGUAGES.findIndex((entry) => entry.code === language.code)
    )
    expect(positions.length).toBeGreaterThan(1)
    expect(positions).toEqual([...positions].sort((a, b) => a - b))
  })

  it('returns nothing for a query that matches nothing', () => {
    expect(matchLanguages('qqqq')).toEqual([])
  })

  it('does not mutate the catalogue', () => {
    const before = WHISPER_LANGUAGES.map((language) => language.code)
    matchLanguages('a')
    matchLanguages('')
    expect(WHISPER_LANGUAGES.map((language) => language.code)).toEqual(before)
  })
})

describe('languageName', () => {
  it('shows the endonym, never the English name', () => {
    expect(languageName('de')).toBe('Deutsch')
    expect(languageName('es')).toBe('Español')
  })

  it('falls back to the code and handles null', () => {
    expect(languageName('xx')).toBe('xx')
    expect(languageName(null)).toBe('')
  })
})
