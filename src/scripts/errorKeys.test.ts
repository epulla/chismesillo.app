import { describe, expect, it } from 'vitest'
import { isOutOfMemory, TranslatedError, translatedKey } from './errorKeys'

describe('translatedKey', () => {
  it('reads the key back out of a TranslatedError', () => {
    expect(translatedKey(new TranslatedError('needsWebgpu').message)).toBe('needsWebgpu')
  })

  // DecodeError predates this module and uses its own prefix; both have to keep
  // resolving or decode failures start printing `decode:noAudioTrack` at the user.
  it('still understands the decode: prefix', () => {
    expect(translatedKey('decode:noAudioTrack')).toBe('noAudioTrack')
  })

  it('returns null for an ordinary message', () => {
    expect(translatedKey('Something exploded')).toBeNull()
    expect(translatedKey('')).toBeNull()
  })

  it('returns null for a prefix with no key behind it', () => {
    expect(translatedKey('errors:')).toBeNull()
    expect(translatedKey('decode:')).toBeNull()
  })
})

describe('isOutOfMemory', () => {
  it('recognises the browser allocation failures', () => {
    expect(isOutOfMemory(new RangeError('Array buffer allocation failed'))).toBe(true)
    expect(isOutOfMemory(new Error('Out of memory'))).toBe(true)
    expect(isOutOfMemory(new Error('failed to allocate buffer'))).toBe(true)
  })

  it('ignores unrelated errors', () => {
    expect(isOutOfMemory(new Error('network request failed'))).toBe(false)
    expect(isOutOfMemory('nope')).toBe(false)
  })

  // RangeError is not a memory signal on its own. Reporting these as "out of
  // memory, close some tabs" would send someone chasing the wrong problem.
  it('does not treat every RangeError as an allocation failure', () => {
    expect(isOutOfMemory(new RangeError('Maximum call stack size exceeded'))).toBe(false)
    expect(isOutOfMemory(new RangeError('Invalid array length'))).toBe(false)
    expect(
      isOutOfMemory(new RangeError('toFixed() digits argument must be between 0 and 100'))
    ).toBe(false)
  })
})
