import type { Transcript } from './types'

const DB_NAME = 'chismesillo'
const DB_VERSION = 1
const STORE = 'transcripts'

/**
 * Identifies a file without reading it: name + size + mtime is enough to notice
 * "this is the same recording I transcribed yesterday".
 */
export function fileKey(file: File): string {
  return `${file.name}:${file.size}:${file.lastModified}`
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE)
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

async function withStore<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T | null> {
  try {
    const db = await openDb()
    return await new Promise<T>((resolve, reject) => {
      const transaction = db.transaction(STORE, mode)
      const request = run(transaction.objectStore(STORE))
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
      transaction.oncomplete = () => db.close()
    })
  } catch (error) {
    // Private browsing and storage-pressure eviction both land here. Persistence
    // is a convenience, never a requirement, so failures stay silent.
    console.info('[store] unavailable:', error)
    return null
  }
}

export function saveTranscript(key: string, transcript: Transcript) {
  return withStore('readwrite', (store) => store.put(transcript, key))
}

/**
 * How long a run should wait between transcript writes.
 *
 * `put` structured-clones the transcript, and the transcript only grows. A fixed
 * floor means a four-hour file clones an ever-larger array on the main thread
 * roughly fifteen hundred times, so the floor rises with the transcript instead.
 * The cap is what bounds how much work a crash can cost.
 */
export function persistIntervalMs(segmentCount: number): number {
  return Math.min(60_000, 10_000 * Math.max(1, Math.ceil(segmentCount / 2000)))
}

export function loadTranscript(key: string): Promise<Transcript | null> {
  return withStore<Transcript>('readonly', (store) => store.get(key)).then((value) => value ?? null)
}

export function deleteTranscript(key: string) {
  return withStore('readwrite', (store) => store.delete(key))
}
