/**
 * Source of truth for the palette. `global.css` must declare the same values —
 * `theme.test.ts` parses the stylesheet and fails on drift, and checks every pair
 * below against WCAG 2.2 contrast minimums.
 *
 * Pastel palettes are light and low-saturation, so a pastel cannot carry text and
 * cannot act as a high-contrast fill. The scheme is therefore pastel *fields* (see
 * TINTS) with dark ink type on them, and deeper saturated versions of the same hues
 * for anything that has to be a solid fill or coloured copy.
 */
export const TOKENS = {
  'base-100': '#FFFFFF',
  'base-200': '#FBF6F1',
  'base-300': '#EBDFD4',
  'base-content': '#2B2320',
  primary: '#A34E6B',
  'primary-content': '#FFFFFF',
  secondary: '#4F7C6A',
  'secondary-content': '#FFFFFF',
  accent: '#6B5CA5',
  'accent-content': '#FFFFFF',
  neutral: '#2B2320',
  'neutral-content': '#FBF6F1',
  info: '#2E6F91',
  'info-content': '#FFFFFF',
  success: '#3F7A52',
  'success-content': '#FFFFFF',
  warning: '#9A6212',
  'warning-content': '#FFFFFF',
  error: '#B3372F',
  'error-content': '#FFFFFF'
} as const

export type TokenName = keyof typeof TOKENS

export const ROLES = [
  'primary',
  'secondary',
  'accent',
  'neutral',
  'info',
  'success',
  'warning',
  'error'
] as const

/** Roles this UI paints as a solid fill (buttons, progress bars, alerts, badges). */
export const FILL_ROLES = [
  'primary',
  'secondary',
  'accent',
  'info',
  'success',
  'warning',
  'error'
] as const

/**
 * Decorative pastel washes. Only ever used as backgrounds behind ink-coloured text,
 * never as fills that need their own boundary — they sit ~1.1:1 against the page,
 * so anything using them also needs a border to be perceivable.
 */
export const TINTS = {
  rose: '#FBE4EA',
  mint: '#DFF3E9',
  lilac: '#E9E4F7',
  peach: '#FDEBDC',
  sky: '#DDEBF9'
} as const

/** Muted body copy. Replaces the opacity-50/60 the old design guessed with. */
export const MUTED_CONTENT = '#6B5F58'

/** Keyboard focus ring. Must clear 3:1 against every surface it can land on. */
export const FOCUS_RING = '#A34E6B'

/** WCAG 2.2 minimums. Large text is >=18.66px bold or >=24px. */
export const AA_TEXT = 4.5
export const AA_LARGE = 3
export const AA_NON_TEXT = 3

type Pair = {
  name: string
  fg: string
  bg: string
  min: number
}

const SURFACES = [TOKENS['base-100'], TOKENS['base-200']]

const surfaceName = (index: number) => `base-${index === 0 ? '100' : '200'}`

/** Every foreground/background combination the UI can actually produce. */
export const CONTRAST_PAIRS: Pair[] = [
  ...SURFACES.map((bg, i) => ({
    name: `base-content on ${surfaceName(i)}`,
    fg: TOKENS['base-content'],
    bg,
    min: AA_TEXT
  })),
  ...SURFACES.map((bg, i) => ({
    name: `muted content on ${surfaceName(i)}`,
    fg: MUTED_CONTENT,
    bg,
    min: AA_TEXT
  })),
  ...SURFACES.map((bg, i) => ({
    name: `focus ring on ${surfaceName(i)}`,
    fg: FOCUS_RING,
    bg,
    min: AA_NON_TEXT
  })),
  // Every role has to be legible against its own fill.
  ...ROLES.map((role) => ({
    name: `${role}-content on ${role}`,
    fg: TOKENS[`${role}-content`],
    bg: TOKENS[role],
    min: AA_TEXT
  })),
  // A role used as a fill also needs a visible boundary against the page.
  // `neutral` is exempt: daisyUI treats it as a surface, not a fill.
  ...FILL_ROLES.map((role) => ({
    name: `${role} fill against base-200`,
    fg: TOKENS[role],
    bg: TOKENS['base-200'],
    min: AA_NON_TEXT
  })),
  // Status colours are also rendered as coloured copy on a surface, not only as fills.
  ...(['error', 'warning', 'info', 'success'] as const).flatMap((role) =>
    SURFACES.map((bg, i) => ({
      name: `${role} text on ${surfaceName(i)}`,
      fg: TOKENS[role],
      bg,
      min: AA_TEXT
    }))
  ),
  // Ink stays readable on every pastel wash.
  ...Object.entries(TINTS).map(([name, bg]) => ({
    name: `base-content on ${name} tint`,
    fg: TOKENS['base-content'],
    bg,
    min: AA_TEXT
  })),
  {
    name: 'base-300 border against base-100',
    fg: TOKENS['base-300'],
    bg: TOKENS['base-100'],
    min: 1.1
  }
]

function channel(value: number): number {
  const c = value / 255
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}

export function relativeLuminance(hex: string): number {
  const clean = hex.replace('#', '')
  if (!/^[0-9a-fA-F]{6}$/.test(clean)) throw new Error(`Not a 6-digit hex colour: ${hex}`)
  const [r, g, b] = [0, 2, 4].map((i) => channel(parseInt(clean.slice(i, i + 2), 16)))
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!
}

export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a)
  const lb = relativeLuminance(b)
  const [hi, lo] = la > lb ? [la, lb] : [lb, la]
  return (hi + 0.05) / (lo + 0.05)
}
