import { createTranslator, el, show } from './dom'
import { DOM_IDS } from './domIds'
import { createSegmentItem } from './segmentList'
import { createAudioClient, createTranscriberClient, type WorkerClient } from './workerClient'
import { DEFAULT_MODEL_ID, findModel, MODELS } from './models'
import { languageName } from './languages'
import { cachedModelBytes, clearModelCache, prettifyBytes } from './modelCache'
import { deleteTranscript, fileKey, loadTranscript, saveTranscript } from './store'
import { countWords, downloadTranscript, formatClock, type ExportFormat } from './exports'
import { countWindows, dropOverlapDuplicates, mergeSegments, offsetSegments } from './windowing'
import type { AudioWindow, Transcript, TranscriptSegment } from './types'

const t = createTranslator()

const dom = {
  dropzone: el<HTMLLabelElement>(DOM_IDS.dropzone),
  fileInput: el<HTMLInputElement>(DOM_IDS.fileInput),
  fileSummary: el(DOM_IDS.fileSummary),
  fileName: el(DOM_IDS.fileName),
  fileMeta: el(DOM_IDS.fileMeta),
  fileChange: el<HTMLButtonElement>(DOM_IDS.fileChange),
  player: el<HTMLAudioElement>(DOM_IDS.player),
  restoreBanner: el(DOM_IDS.restoreBanner),
  restoreText: el(DOM_IDS.restoreText),
  restoreAccept: el<HTMLButtonElement>(DOM_IDS.restoreAccept),
  restoreDismiss: el<HTMLButtonElement>(DOM_IDS.restoreDismiss),

  configCard: el(DOM_IDS.configCard),
  modelSelect: el<HTMLSelectElement>(DOM_IDS.modelSelect),
  modelHelp: el(DOM_IDS.modelHelp),
  languageSelect: el<HTMLSelectElement>(DOM_IDS.languageSelect),
  taskSelect: el<HTMLSelectElement>(DOM_IDS.taskSelect),
  wordTimestamps: el<HTMLInputElement>(DOM_IDS.wordTimestamps),
  windowMinutes: el<HTMLInputElement>(DOM_IDS.windowMinutes),
  windowValue: el(DOM_IDS.windowValue),
  forceCpu: el<HTMLInputElement>(DOM_IDS.forceCpu),
  startButton: el<HTMLButtonElement>(DOM_IDS.startButton),
  cancelButton: el<HTMLButtonElement>(DOM_IDS.cancelButton),

  statusDock: el(DOM_IDS.statusDock),
  statusSpinner: el(DOM_IDS.statusSpinner),
  statusText: el(DOM_IDS.statusText),
  statusDetail: el(DOM_IDS.statusDetail),
  statusPercent: el(DOM_IDS.statusPercent),
  statusProgress: el<HTMLProgressElement>(DOM_IDS.statusProgress),
  statusPartial: el(DOM_IDS.statusPartial),
  statusAnnouncer: el(DOM_IDS.statusAnnouncer),
  downloadRow: el(DOM_IDS.downloadRow),
  downloadProgress: el<HTMLProgressElement>(DOM_IDS.downloadProgress),
  downloadDetail: el(DOM_IDS.downloadDetail),
  warningRow: el(DOM_IDS.warningRow),
  errorRow: el(DOM_IDS.errorRow),

  transcriptCard: el(DOM_IDS.transcriptCard),
  segmentList: el<HTMLOListElement>(DOM_IDS.segmentList),
  transcriptEmpty: el(DOM_IDS.transcriptEmpty),
  noMatches: el(DOM_IDS.noMatches),
  segmentCount: el(DOM_IDS.segmentCount),
  wordCount: el(DOM_IDS.wordCount),
  detectedLanguage: el(DOM_IDS.detectedLanguage),
  searchInput: el<HTMLInputElement>(DOM_IDS.searchInput),
  copyButton: el<HTMLButtonElement>(DOM_IDS.copyButton),

  cacheSize: el(DOM_IDS.cacheSize),
  clearCache: el<HTMLButtonElement>(DOM_IDS.clearCache),
  dedicationTrigger: el<HTMLButtonElement>(DOM_IDS.dedicationTrigger),
  dedicationDialog: el<HTMLDialogElement>(DOM_IDS.dedicationDialog)
}

type State = {
  file: File | null
  objectUrl: string | null
  running: boolean
  segments: TranscriptSegment[]
  transcript: Transcript | null
  durationSec: number
  transcribedSec: number
  startedAt: number
  storageKey: string | null
}

const state: State = {
  file: null,
  objectUrl: null,
  running: false,
  segments: [],
  transcript: null,
  durationSec: 0,
  transcribedSec: 0,
  startedAt: 0,
  storageKey: null
}

let audioClient: WorkerClient | null = null
let asrClient: WorkerClient | null = null

// Declared here, not beside gateWebGPUModels: init() runs during module evaluation and
// updateModelHelp reads this, so a later `let` leaves it in the temporal dead zone and
// takes every listener in init() down with it.
let supportsWebGPU = false

init()

function init() {
  dom.modelSelect.value = DEFAULT_MODEL_ID
  updateModelHelp()
  void gateWebGPUModels()
  void refreshCacheInfo()

  dom.fileInput.addEventListener('change', () => {
    const file = dom.fileInput.files?.[0]
    if (file) void selectFile(file)
  })

  dom.dropzone.addEventListener('dragover', (event) => {
    event.preventDefault()
    dom.dropzone.classList.add('is-dragging')
  })
  dom.dropzone.addEventListener('dragleave', () => dom.dropzone.classList.remove('is-dragging'))
  dom.dropzone.addEventListener('drop', (event) => {
    event.preventDefault()
    dom.dropzone.classList.remove('is-dragging')
    const file = event.dataTransfer?.files?.[0]
    if (file) void selectFile(file)
  })

  dom.fileChange.addEventListener('click', () => {
    if (state.running) return
    dom.fileInput.value = ''
    dom.fileInput.click()
  })

  dom.modelSelect.addEventListener('change', updateModelHelp)
  dom.windowMinutes.addEventListener('input', () => {
    dom.windowValue.textContent = dom.windowMinutes.value
  })

  dom.startButton.addEventListener('click', () => void run())
  dom.cancelButton.addEventListener('click', cancel)
  dom.searchInput.addEventListener('input', renderSegments)
  dom.copyButton.addEventListener('click', () => void copyTranscript())

  document.querySelectorAll<HTMLButtonElement>('[data-export]').forEach((button) => {
    button.addEventListener('click', () => {
      if (!state.transcript) return
      downloadTranscript(state.transcript, button.dataset.export as ExportFormat)
    })
  })

  dom.clearCache.addEventListener('click', () => void handleClearCache())
  dom.dedicationTrigger.addEventListener('click', () => {
    dom.dedicationDialog.showModal()
  })

  // Leaving mid-run throws away the work: there is no server-side copy to resume from.
  window.addEventListener('beforeunload', (event) => {
    if (!state.running) return
    event.preventDefault()
  })
}

/* ------------------------------------------------------------------ file */

async function selectFile(file: File) {
  cancel()
  state.file = file
  state.storageKey = fileKey(file)
  state.segments = []
  state.transcript = null
  state.transcribedSec = 0

  if (state.objectUrl) URL.revokeObjectURL(state.objectUrl)
  state.objectUrl = URL.createObjectURL(file)
  dom.player.src = state.objectUrl

  dom.fileName.textContent = file.name
  dom.fileMeta.textContent = prettifyBytes(file.size)
  show(dom.fileSummary, true)
  dom.fileSummary.classList.add('flex')
  show(dom.dropzone, false)
  show(dom.configCard, true)
  show(dom.statusDock, false)
  show(dom.transcriptCard, false)
  hideMessages()
  renderSegments()

  const saved = await loadTranscript(state.storageKey)
  if (saved?.segments.length) offerRestore(saved)
}

function offerRestore(saved: Transcript) {
  dom.restoreText.textContent = t('result.restore')
  dom.restoreAccept.textContent = t('result.restoreAction')
  dom.restoreDismiss.textContent = t('result.discardAction')
  show(dom.restoreBanner, true)

  dom.restoreAccept.onclick = () => {
    state.transcript = saved
    state.segments = saved.segments
    state.durationSec = saved.meta.durationSec
    show(dom.restoreBanner, false)
    show(dom.transcriptCard, true)
    setDetectedLanguage(saved.meta.detectedLanguage)
    renderSegments()
  }

  dom.restoreDismiss.onclick = () => {
    show(dom.restoreBanner, false)
    if (state.storageKey) void deleteTranscript(state.storageKey)
  }
}

/* --------------------------------------------------------------- running */

async function run() {
  if (!state.file || state.running) return

  state.running = true
  state.segments = []
  state.transcript = null
  state.transcribedSec = 0
  state.startedAt = performance.now()

  dom.startButton.disabled = true
  document.body.dataset.transcribing = '1'
  show(dom.cancelButton, true)
  show(dom.statusDock, true)
  show(dom.transcriptCard, true)
  show(dom.restoreBanner, false)
  hideMessages()
  renderSegments()
  setStatus(t('status.preparing'), 0)

  const modelId = dom.modelSelect.value
  const language = dom.languageSelect.value || null
  const task = dom.taskSelect.value as 'transcribe' | 'translate'
  const wordTimestamps = dom.wordTimestamps.checked
  const windowSec = Number(dom.windowMinutes.value) * 60
  const forceCpu = dom.forceCpu.checked

  audioClient = createAudioClient()
  asrClient = createTranscriberClient({
    onProgress: (_key, payload) => updateDownload(payload),
    onEvent: (name, payload) => handleAsrEvent(name, payload)
  })

  try {
    setStatus(t('status.inspecting'), 2)
    const info = await audioClient.call<{ durationSec: number }>('open', {
      file: state.file,
      windowSec
    })
    state.durationSec = info.durationSec ?? 0

    setStatus(t('status.loadingModel'), 4)
    show(dom.downloadRow, true)
    const loaded = await asrClient.call<{ device: 'webgpu' | 'wasm' }>('ensure', {
      model: modelId,
      forceCpu
    })
    show(dom.downloadRow, false)

    const totalWindows = countWindows(state.durationSec, windowSec)
    let detectedLanguage: string | null = null
    let index = 0

    // Ask for window N+1 while window N is being transcribed: decoding and
    // inference overlap, but never by more than one window's worth of memory.
    let nextWindow = audioClient.call<{ window?: AudioWindow; done?: boolean }>('next')

    while (state.running) {
      const current = await nextWindow
      if (!current?.window) break

      const window = current.window
      nextWindow = audioClient.call<{ window?: AudioWindow; done?: boolean }>('next')

      if (!language && !detectedLanguage && index === 0) {
        setStatus(t('status.detectingLanguage'), progressPercent())
        const probe = window.pcm.slice(0, Math.min(window.pcm.length, 30 * 16000))
        const detection = await asrClient.call<{ language: string | null }>('detect', {
          audio: probe
        })
        detectedLanguage = detection?.language ?? null
        setDetectedLanguage(detectedLanguage)
      }

      setStatus(
        t('status.transcribing', { done: index + 1, total: totalWindows }),
        progressPercent()
      )

      activeWindowStartSec = window.startSec
      const pcm = window.pcm
      const result = await asrClient.call<{ segments: TranscriptSegment[] }>(
        'transcribe',
        { audio: pcm, language, task, wordTimestamps },
        [pcm.buffer]
      )

      const absolute = offsetSegments(result.segments, window.startSec)
      const fresh = dropOverlapDuplicates(absolute, window.overlapUntilSec)
      state.segments = mergeSegments(state.segments, fresh)
      state.transcribedSec = window.endSec

      renderSegments()
      persist(modelId, language, detectedLanguage, task, loaded.device, wordTimestamps)

      index++
      if (window.isLast) break
    }

    if (state.running) {
      setStatus(t('status.done'), 100)
      announce(t('status.done'), { force: true })
      dom.statusSpinner.classList.add('hidden')
      show(dom.statusPartial, false)
      persist(modelId, language, detectedLanguage, task, loaded.device, wordTimestamps)
    }
  } catch (error) {
    if (state.running) showError(error)
  } finally {
    finish()
  }
}

function finish() {
  state.running = false
  delete document.body.dataset.transcribing
  dom.startButton.disabled = false
  show(dom.cancelButton, false)
  show(dom.downloadRow, false)
  audioClient?.terminate()
  asrClient?.terminate()
  audioClient = null
  asrClient = null
  void refreshCacheInfo()
}

function cancel() {
  if (!state.running) return
  state.running = false
  setStatus(t('status.canceled'), progressPercent())
  announce(t('status.canceled'), { force: true })
  dom.statusSpinner.classList.add('hidden')
  finish()
}

function persist(
  model: string,
  language: string | null,
  detectedLanguage: string | null,
  task: 'transcribe' | 'translate',
  device: 'webgpu' | 'wasm',
  wordTimestamps: boolean
) {
  if (!state.file) return
  state.transcript = {
    meta: {
      fileName: state.file.name,
      fileSize: state.file.size,
      durationSec: state.durationSec,
      model,
      task,
      language,
      detectedLanguage,
      device,
      wordTimestamps,
      createdAt: Date.now()
    },
    segments: state.segments
  }
  if (state.storageKey) void saveTranscript(state.storageKey, state.transcript)
}

/* ----------------------------------------------------------------- views */

/** Start of the window currently being transcribed, for intra-window progress. */
let activeWindowStartSec = 0

function handleAsrEvent(name: string, payload: unknown) {
  if (name === 'webgpu-fallback') {
    showWarning(t('errors.webgpuFallback'))
    return
  }

  if (name === 'partial') {
    const text = (payload as { text?: string })?.text ?? ''
    if (!text.trim()) return
    dom.statusPartial.textContent = text.trim()
    show(dom.statusPartial, true)
    return
  }

  if (name === 'chunk-end') {
    // Whisper finished one of the 30 s chunks inside the current window, so the
    // progress bar can move without waiting for the whole window.
    const offset = (payload as { offset?: number })?.offset ?? 0
    const reached = activeWindowStartSec + offset
    if (reached > state.transcribedSec) {
      state.transcribedSec = reached
      dom.statusProgress.value = progressPercent()
      dom.statusPercent.textContent = `${progressPercent()}%`
    }
  }
}

function progressPercent(): number {
  if (!state.durationSec) return 5
  return Math.min(99, Math.round((state.transcribedSec / state.durationSec) * 100))
}

function setStatus(text: string, percent: number) {
  dom.statusText.textContent = text
  dom.statusProgress.value = percent
  dom.statusProgress.setAttribute('aria-valuenow', String(Math.round(percent)))
  dom.statusPercent.textContent = `${Math.round(percent)}%`
  dom.statusDetail.textContent = elapsedDetail()
  announce(`${text} ${Math.round(percent)}%`)
}

let lastAnnouncedAt = 0

/**
 * A multi-hour run repaints the status several times a second. Announcing every
 * one makes a screen reader unusable, so the live region is rate limited; the
 * visible text still updates immediately.
 */
function announce(message: string, { force = false } = {}) {
  const now = Date.now()
  if (!force && now - lastAnnouncedAt < 1000) return
  lastAnnouncedAt = now
  dom.statusAnnouncer.textContent = message
}

function elapsedDetail(): string {
  if (!state.startedAt || !state.transcribedSec) return ''
  const elapsedSec = (performance.now() - state.startedAt) / 1000
  const factor = state.transcribedSec / elapsedSec
  const remainingSec = (state.durationSec - state.transcribedSec) / Math.max(factor, 0.01)

  const parts = [t('status.elapsed', { time: formatClock(elapsedSec) })]
  if (factor > 0) parts.push(t('status.speed', { factor: factor.toFixed(1) }))
  if (remainingSec > 1 && state.durationSec > state.transcribedSec) {
    parts.push(t('status.remaining', { time: formatClock(remainingSec) }))
  }
  return parts.join(' · ')
}

function updateDownload(payload: unknown) {
  const progress = payload as { status?: string; loaded?: number; total?: number; file?: string }
  if (!progress || typeof progress.loaded !== 'number' || !progress.total) return

  downloadTotals.set(progress.file ?? 'model', {
    loaded: progress.loaded,
    total: progress.total
  })

  let loaded = 0
  let total = 0
  downloadTotals.forEach((entry) => {
    loaded += entry.loaded
    total += entry.total
  })

  const percent = total ? Math.min(100, (loaded / total) * 100) : 0
  dom.downloadProgress.value = percent
  dom.downloadProgress.setAttribute('aria-valuenow', String(Math.round(percent)))
  dom.downloadDetail.textContent = `${prettifyBytes(loaded)} / ${prettifyBytes(total)}`
}

const downloadTotals = new Map<string, { loaded: number; total: number }>()

function renderSegments() {
  const query = dom.searchInput.value.trim().toLowerCase()
  const segments = query
    ? state.segments.filter((segment) => segment.text.toLowerCase().includes(query))
    : state.segments

  dom.segmentCount.textContent = t('result.segments', { n: state.segments.length })
  dom.wordCount.textContent = t('result.words', { n: countWords(state.segments) })
  show(dom.transcriptEmpty, state.segments.length === 0)
  show(dom.noMatches, state.segments.length > 0 && segments.length === 0)

  const fragment = document.createDocumentFragment()
  for (const segment of segments) {
    fragment.append(
      createSegmentItem(segment, {
        label: (vars) => t('a11y.playSegment', vars),
        onSeek: (startSec) => {
          dom.player.currentTime = startSec
          void dom.player.play()
        }
      })
    )
  }

  dom.segmentList.replaceChildren(fragment)
}

function setDetectedLanguage(code: string | null) {
  if (!code) {
    show(dom.detectedLanguage, false)
    return
  }
  dom.detectedLanguage.textContent = t('result.detectedLanguage', {
    language: languageName(code) || code
  })
  show(dom.detectedLanguage, true)
}

async function copyTranscript() {
  const text = state.segments.map((segment) => segment.text).join('\n')
  try {
    await navigator.clipboard.writeText(text)
    const original = dom.copyButton.textContent
    dom.copyButton.textContent = t('result.copied')
    setTimeout(() => (dom.copyButton.textContent = original), 1500)
  } catch (error) {
    console.warn('[clipboard] copy failed:', error)
  }
}

function updateModelHelp() {
  const model = findModel(dom.modelSelect.value)
  if (!model) return
  const size = supportsWebGPU ? model.webgpuSize : model.wasmSize
  dom.modelHelp.textContent = `${t('config.modelHelp')} ${t('models.sizeApprox', { size })}`
}

async function gateWebGPUModels() {
  const gpu = (navigator as Navigator & { gpu?: { requestAdapter(): Promise<unknown> } }).gpu
  supportsWebGPU = Boolean(gpu && (await gpu.requestAdapter().catch(() => null)))

  if (!supportsWebGPU) {
    for (const model of MODELS.filter((entry) => entry.requiresWebGPU)) {
      const option = dom.modelSelect.querySelector<HTMLOptionElement>(`option[value="${model.id}"]`)
      if (!option) continue
      option.disabled = true
      option.textContent = `${option.textContent} — ${t('models.needsWebgpu')}`
    }
  }
  updateModelHelp()
}

/* ---------------------------------------------------------------- errors */

function hideMessages() {
  show(dom.warningRow, false)
  show(dom.errorRow, false)
}

function showWarning(message: string) {
  dom.warningRow.textContent = message
  show(dom.warningRow, true)
}

function showError(error: unknown) {
  const raw = error instanceof Error ? error.message : String(error)
  const decodeKey = raw.startsWith('decode:') ? raw.slice('decode:'.length) : null
  const message = decodeKey ? t(`errors.${decodeKey}`) : t('errors.generic', { message: raw })

  dom.errorRow.textContent = message
  show(dom.errorRow, true)
  dom.statusText.textContent = t('status.failed')
  dom.statusSpinner.classList.add('hidden')
  console.error('[app]', error)
}

/* ----------------------------------------------------------------- cache */

async function refreshCacheInfo() {
  const bytes = await cachedModelBytes()
  dom.cacheSize.textContent = bytes
    ? t('downloads.cacheSize', { size: prettifyBytes(bytes) })
    : t('downloads.cacheEmpty')
  dom.clearCache.disabled = bytes === 0
  dom.clearCache.dataset.size = String(bytes)
  dom.clearCache.dataset.confirm = ''
  dom.clearCache.textContent = t('downloads.clear')
}

async function handleClearCache() {
  const bytes = Number(dom.clearCache.dataset.size || 0)
  if (!bytes) return

  if (dom.clearCache.dataset.confirm !== '1') {
    dom.clearCache.dataset.confirm = '1'
    dom.clearCache.textContent = t('downloads.clearConfirm', { size: prettifyBytes(bytes) })
    setTimeout(() => {
      if (dom.clearCache.dataset.confirm !== '1') return
      dom.clearCache.dataset.confirm = ''
      dom.clearCache.textContent = t('downloads.clear')
    }, 3500)
    return
  }

  const cleared = await clearModelCache()
  dom.cacheSize.textContent = cleared
    ? t('downloads.cleared', { size: prettifyBytes(bytes) })
    : t('downloads.clearFailed')
  dom.clearCache.dataset.confirm = ''
  dom.clearCache.disabled = true
  dom.clearCache.textContent = t('downloads.clear')
}
