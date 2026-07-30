/**
 * Whisper language codes, limited to the ones people actually pick.
 * Passing `null` instead makes Whisper detect the language itself.
 *
 * Names are shown in their own language so the list is usable in any UI locale,
 * which is exactly why `englishName` exists too: somebody scanning a list of 35
 * entries for German will type "german", not find "Deutsch" by reading, and the
 * search box has to meet them there.
 */
export type WhisperLanguage = {
  code: string
  /** Endonym — how speakers of the language write its name. This is what is shown. */
  name: string
  /** Exonym, for searching and as a scanning hint beside the endonym. */
  englishName: string
  /**
   * Extra spellings people type. The UI ships in English and Spanish, so a Spanish
   * speaker searching "alemán" has to find Deutsch — the English exonym alone is
   * not enough. Also carries the common alternative names ("Mandarin", "Farsi").
   */
  aliases: string[]
}

export const WHISPER_LANGUAGES: WhisperLanguage[] = [
  { code: 'ar', name: 'العربية', englishName: 'Arabic', aliases: ['Árabe'] },
  { code: 'bn', name: 'বাংলা', englishName: 'Bengali', aliases: ['Bengalí', 'Bangla'] },
  { code: 'ca', name: 'Català', englishName: 'Catalan', aliases: ['Catalán'] },
  { code: 'cs', name: 'Čeština', englishName: 'Czech', aliases: ['Checo'] },
  { code: 'da', name: 'Dansk', englishName: 'Danish', aliases: ['Danés'] },
  { code: 'de', name: 'Deutsch', englishName: 'German', aliases: ['Alemán'] },
  { code: 'el', name: 'Ελληνικά', englishName: 'Greek', aliases: ['Griego'] },
  { code: 'en', name: 'English', englishName: 'English', aliases: ['Inglés'] },
  { code: 'es', name: 'Español', englishName: 'Spanish', aliases: ['Castellano'] },
  { code: 'eu', name: 'Euskara', englishName: 'Basque', aliases: ['Euskera', 'Vasco'] },
  { code: 'fa', name: 'فارسی', englishName: 'Persian', aliases: ['Farsi', 'Persa'] },
  { code: 'fi', name: 'Suomi', englishName: 'Finnish', aliases: ['Finés', 'Finlandés'] },
  { code: 'fr', name: 'Français', englishName: 'French', aliases: ['Francés'] },
  { code: 'gl', name: 'Galego', englishName: 'Galician', aliases: ['Gallego'] },
  { code: 'he', name: 'עברית', englishName: 'Hebrew', aliases: ['Hebreo', 'Ivrit'] },
  { code: 'hi', name: 'हिन्दी', englishName: 'Hindi', aliases: ['Hindi'] },
  { code: 'hu', name: 'Magyar', englishName: 'Hungarian', aliases: ['Húngaro'] },
  { code: 'id', name: 'Bahasa Indonesia', englishName: 'Indonesian', aliases: ['Indonesio'] },
  { code: 'it', name: 'Italiano', englishName: 'Italian', aliases: ['Italiano'] },
  { code: 'ja', name: '日本語', englishName: 'Japanese', aliases: ['Japonés', 'Nihongo'] },
  { code: 'ko', name: '한국어', englishName: 'Korean', aliases: ['Coreano', 'Hangugeo'] },
  { code: 'nl', name: 'Nederlands', englishName: 'Dutch', aliases: ['Neerlandés', 'Holandés'] },
  { code: 'no', name: 'Norsk', englishName: 'Norwegian', aliases: ['Noruego'] },
  { code: 'pl', name: 'Polski', englishName: 'Polish', aliases: ['Polaco'] },
  { code: 'pt', name: 'Português', englishName: 'Portuguese', aliases: ['Portugués'] },
  { code: 'ro', name: 'Română', englishName: 'Romanian', aliases: ['Rumano'] },
  { code: 'ru', name: 'Русский', englishName: 'Russian', aliases: ['Ruso'] },
  { code: 'sv', name: 'Svenska', englishName: 'Swedish', aliases: ['Sueco'] },
  { code: 'ta', name: 'தமிழ்', englishName: 'Tamil', aliases: ['Tamil'] },
  { code: 'th', name: 'ไทย', englishName: 'Thai', aliases: ['Tailandés'] },
  { code: 'tr', name: 'Türkçe', englishName: 'Turkish', aliases: ['Turco'] },
  { code: 'uk', name: 'Українська', englishName: 'Ukrainian', aliases: ['Ucraniano'] },
  { code: 'ur', name: 'اردو', englishName: 'Urdu', aliases: ['Urdu'] },
  { code: 'vi', name: 'Tiếng Việt', englishName: 'Vietnamese', aliases: ['Vietnamita'] },
  { code: 'zh', name: '中文', englishName: 'Chinese', aliases: ['Chino', 'Mandarin', 'Mandarín'] }
]

export function languageName(code: string | null): string {
  if (!code) return ''
  const match = WHISPER_LANGUAGES.find((language) => language.code === code)
  return match ? match.name : code
}

/**
 * Lowercases and strips diacritics so "Français", "francais" and "FRANCAIS" are the
 * same string. NFD splits a letter from its accent, and the combining marks are
 * then dropped; scripts without them are simply left alone.
 */
export function foldForSearch(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim()
}

/** Exact code, then prefix, then substring. Lower sorts first. */
const RANK_EXACT_CODE = 0
const RANK_PREFIX = 1
const RANK_SUBSTRING = 2
const RANK_NONE = 3

function rank(language: WhisperLanguage, query: string): number {
  const fields = [language.code, language.name, language.englishName, ...language.aliases].map(
    foldForSearch
  )
  if (fields[0] === query) return RANK_EXACT_CODE
  if (fields.some((field) => field.startsWith(query))) return RANK_PREFIX
  if (fields.some((field) => field.includes(query))) return RANK_SUBSTRING
  return RANK_NONE
}

/**
 * Filters the catalogue for the combobox. An empty query returns everything, so
 * opening the list without typing shows the full set.
 *
 * Sorting is stable, so entries of equal rank keep the catalogue's own order
 * rather than jumping around as the query grows.
 */
export function matchLanguages(
  query: string,
  languages: WhisperLanguage[] = WHISPER_LANGUAGES
): WhisperLanguage[] {
  const needle = foldForSearch(query)
  if (!needle) return [...languages]

  return languages
    .map((language, index) => ({ language, index, rank: rank(language, needle) }))
    .filter((entry) => entry.rank !== RANK_NONE)
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map((entry) => entry.language)
}
