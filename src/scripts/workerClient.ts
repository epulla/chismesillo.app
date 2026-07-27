type Pending = {
  resolve: (value: unknown) => void
  reject: (reason: unknown) => void
}

type ClientOptions = {
  onProgress?: (key: string, payload: unknown) => void
  onEvent?: (name: string, payload: unknown) => void
}

/** Promise-based RPC over a Web Worker, shared by the audio and ASR workers. */
export class WorkerClient {
  private readonly pending = new Map<number, Pending>()
  private nextId = 0

  constructor(
    private worker: Worker,
    private readonly options: ClientOptions = {}
  ) {
    this.attach()
  }

  private attach() {
    this.worker.onmessage = (event: MessageEvent) => {
      const { id, type } = event.data ?? {}

      if (type === 'progress') {
        this.options.onProgress?.(event.data.key, event.data.payload)
        return
      }

      if (type === 'event') {
        this.options.onEvent?.(event.data.name, event.data.payload)
        return
      }

      const request = this.pending.get(id)
      if (!request) return
      this.pending.delete(id)

      if (type === 'error') request.reject(new Error(event.data.error))
      else request.resolve(event.data.result)
    }

    this.worker.onerror = (event) => {
      this.rejectAll(new Error(event.message || 'The worker crashed'))
    }
  }

  call<T = unknown>(type: string, payload?: unknown, transfer: Transferable[] = []): Promise<T> {
    const id = ++this.nextId
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (value: unknown) => void, reject })
      try {
        this.worker.postMessage({ id, type, payload }, transfer)
      } catch (error) {
        this.pending.delete(id)
        reject(error)
      }
    })
  }

  private rejectAll(reason: unknown) {
    for (const [id, request] of this.pending) {
      this.pending.delete(id)
      request.reject(reason)
    }
  }

  /** Kills the worker outright; used to cancel an in-flight run. */
  terminate() {
    this.rejectAll(new Error('canceled'))
    this.worker.terminate()
  }
}

export function createAudioClient(options: ClientOptions = {}) {
  return new WorkerClient(
    new Worker(new URL('./audio.worker.ts', import.meta.url), { type: 'module' }),
    options
  )
}

export function createTranscriberClient(options: ClientOptions = {}) {
  return new WorkerClient(
    new Worker(new URL('./transcriber.worker.ts', import.meta.url), { type: 'module' }),
    options
  )
}
