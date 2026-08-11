export const languages = {
  en: 'English',
  es: 'Español'
} as const

export type Lang = keyof typeof languages

export const defaultLang: Lang = 'en'
