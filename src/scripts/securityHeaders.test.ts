import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

interface VercelConfig {
  headers: { source: string; headers: { key: string; value: string }[] }[]
}

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8')

const astroConfig = read('../../astro.config.mjs')
const headersFile = read('../../public/_headers')
const vercel = JSON.parse(read('../../vercel.json')) as VercelConfig

const SECURITY_HEADERS = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'credentialless',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()'
}

const IMMUTABLE = 'public, max-age=31536000, immutable'

function vercelRule(source: string): Record<string, string> {
  const rule = vercel.headers.find((entry) => entry.source === source)
  if (!rule) throw new Error(`vercel.json declares no rule for ${source}`)
  return Object.fromEntries(rule.headers.map((header) => [header.key, header.value]))
}

// Host header drift is silent: the page loads, but CPU inference loses SharedArrayBuffer.
describe('public/_headers', () => {
  it.each(Object.entries(SECURITY_HEADERS))('sends %s', (key, value) => {
    expect(headersFile).toContain(`${key}: ${value}`)
  })

  it('marks hashed assets immutable', () => {
    expect(headersFile).toContain(`Cache-Control: ${IMMUTABLE}`)
  })
})

describe('vercel.json', () => {
  it.each(Object.entries(SECURITY_HEADERS))('sends %s', (key, value) => {
    expect(vercelRule('/(.*)')[key]).toBe(value)
  })

  it('sends nothing beyond the shared set', () => {
    expect(Object.keys(vercelRule('/(.*)')).sort()).toEqual(Object.keys(SECURITY_HEADERS).sort())
  })

  it('marks hashed assets immutable', () => {
    expect(vercelRule('/_astro/(.*)')['Cache-Control']).toBe(IMMUTABLE)
  })
})

describe('astro.config.mjs', () => {
  it.each(['Cross-Origin-Opener-Policy', 'Cross-Origin-Embedder-Policy'] as const)(
    'applies %s in dev',
    (key) => {
      expect(astroConfig).toContain(`'${key}': '${SECURITY_HEADERS[key]}'`)
    }
  )
})
