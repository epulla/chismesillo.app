import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { DOM_IDS } from './domIds'

const SRC = new URL('../', import.meta.url).pathname

function astroFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return astroFiles(path)
    return entry.name.endsWith('.astro') ? [path] : []
  })
}

const markup = astroFiles(SRC).map((path) => ({ path, source: readFileSync(path, 'utf8') }))

function filesDeclaring(id: string): string[] {
  return markup.filter((file) => file.source.includes(`id="${id}"`)).map((file) => file.path)
}

describe('DOM_IDS', () => {
  it('finds .astro files to check', () => {
    expect(markup.length).toBeGreaterThan(0)
  })

  // app.ts resolves all of these eagerly through el(), which throws on a miss. A
  // renamed id in any component takes the whole page down while the build stays
  // green, so the manifest and the markup have to agree.
  it.each(Object.entries(DOM_IDS))('%s is declared exactly once', (_key, id) => {
    expect(filesDeclaring(id)).toHaveLength(1)
  })

  it('has no duplicate values', () => {
    const values = Object.values(DOM_IDS)
    expect(new Set(values).size).toBe(values.length)
  })

  it('covers every id the markup declares', () => {
    const declared = new Set(
      markup.flatMap((file) => [...file.source.matchAll(/id="([a-z-]+)"/g)].map((m) => m[1]!))
    )
    const known = new Set<string>(Object.values(DOM_IDS))
    // Anchor targets are addressed by href, not by el(), so they are not in the manifest.
    known.add('main')
    known.add('upload-formats')
    expect([...declared].filter((id) => !known.has(id))).toEqual([])
  })
})
