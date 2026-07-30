/**
 * Audio decoding worker.
 *
 * Thin message wrapper around `DecodeSession`, which does the real work of turning
 * any media file into 16 kHz mono PCM windows. Decoding blocks the thread it runs
 * on, hence the worker.
 *
 * Protocol (main -> worker):
 *   { id, type: 'open',  payload: { file, windowSec } }  -> { durationSec, ... }
 *   { id, type: 'next' }                                 -> { window } | { done: true }
 *   { id, type: 'close' }
 */
import { DecodeSession, type OpenPayload } from './decodeSession'

const post = (message: unknown, transfer: Transferable[] = []) =>
  (self as unknown as Worker).postMessage(message, transfer)

let session: DecodeSession | null = null

/**
 * Decoding runs detached from any request — `DecodeSession.run()` drives the
 * conversion in the background — so a failure there rejects a promise nobody is
 * awaiting. Without this the run simply stops with the progress bar mid-way.
 */
self.addEventListener('unhandledrejection', (event) => {
  event.preventDefault()
  reportFatal(event.reason)
})

self.addEventListener('error', (event) => {
  event.preventDefault()
  reportFatal(event.error ?? event.message)
})

function reportFatal(reason: unknown) {
  console.error('[audio] fatal:', reason)
  const message = reason instanceof Error ? reason.message : String(reason)
  post({ type: 'event', name: 'fatal', payload: { message } })
}

self.onmessage = async (event: MessageEvent) => {
  const { id, type, payload } = event.data ?? {}
  try {
    if (type === 'open') {
      session?.dispose()
      session = new DecodeSession(payload as OpenPayload)
      post({ id, type: 'done', result: await session.open() })
      return
    }

    if (type === 'next') {
      if (!session) throw new Error('No decode session is open')
      const window = await session.next()
      if (!window) {
        post({ id, type: 'done', result: { done: true } })
        return
      }
      post({ id, type: 'done', result: { window } }, [window.pcm.buffer])
      return
    }

    if (type === 'close') {
      session?.dispose()
      session = null
      post({ id, type: 'done' })
      return
    }

    throw new Error(`Unknown message type: ${type}`)
  } catch (error) {
    post({ id, type: 'error', error: error instanceof Error ? error.message : String(error) })
  }
}
