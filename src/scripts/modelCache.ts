/**
 * transformers.js stores model weights in the Cache Storage API under a cache whose
 * name contains "transformers". These helpers let the user see and reclaim that space.
 */
const CACHE_PATTERN = /transformers/i

export function prettifyBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const exponent = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)))
  const value = bytes / 1024 ** exponent
  return `${value >= 10 || exponent === 0 ? Math.round(value) : value.toFixed(1)} ${units[exponent]}`
}

export async function cachedModelBytes(): Promise<number> {
  if (typeof caches === 'undefined') return 0
  let total = 0
  try {
    const names = (await caches.keys()).filter((name) => CACHE_PATTERN.test(name))
    for (const name of names) {
      const cache = await caches.open(name)
      for (const request of await cache.keys()) {
        const response = await cache.match(request)
        if (!response) continue
        const declared = Number(response.headers.get('content-length'))
        total += declared || (await response.clone().blob()).size
      }
    }
  } catch (error) {
    console.info('[cache] size unavailable:', error)
  }
  return total
}

export async function clearModelCache(): Promise<boolean> {
  if (typeof caches === 'undefined') return false
  try {
    const names = (await caches.keys()).filter((name) => CACHE_PATTERN.test(name))
    await Promise.all(names.map((name) => caches.delete(name)))
    return true
  } catch (error) {
    console.warn('[cache] clear failed:', error)
    return false
  }
}
