export const languages = {
  en: 'English',
  es: 'Español'
} as const

export type Lang = keyof typeof languages

export const defaultLang: Lang = 'en'

export function isLang(value: string | undefined): value is Lang {
  return !!value && value in languages
}
