/**
 * Errors cross the worker boundary as plain strings — an Error instance does not
 * survive postMessage — so anything the UI must show translated carries its
 * `errors.*` key in the message, behind a prefix. `decode:` predates `errors:`;
 * both resolve into the same sub-tree.
 */
const ERROR_PREFIX = 'errors:'
const DECODE_PREFIX = 'decode:'

export class TranslatedError extends Error {
  constructor(key: string) {
    super(`${ERROR_PREFIX}${key}`)
    this.name = 'TranslatedError'
  }
}

export function translatedKey(message: string): string | null {
  for (const prefix of [ERROR_PREFIX, DECODE_PREFIX]) {
    if (message.startsWith(prefix)) {
      const key = message.slice(prefix.length)
      if (key) return key
    }
  }
  return null
}

/**
 * Matched on the message, never on `instanceof RangeError`: "Maximum call stack
 * size exceeded" is also a RangeError, and telling someone to close tabs and pick
 * a smaller model because of a stack overflow sends them somewhere useless.
 */
export function isOutOfMemory(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return /allocation failed|out of memory|failed to allocate/i.test(message)
}
