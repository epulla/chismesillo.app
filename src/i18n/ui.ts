import { defaultLang, type Lang } from './locales'

// Every string the app can show, per locale. Server-rendered copy is read directly
// from here; the `client` sub-tree is serialized into `window.__I18N__` so only the
// active locale ships to the browser.
export const ui = {
  en: {
    meta: {
      title: 'chismesillo — local audio transcription',
      description:
        'Transcribe long audio files with Whisper, entirely in your browser. No uploads, no backend, no API keys.'
    },
    a11y: {
      skipToContent: 'Skip to main content',
      languageNav: 'Language',
      mainContent: 'Main content',
      statusRegion: 'Transcription status',
      transcriptionProgress: 'Transcription progress',
      downloadProgress: 'Model download progress',
      searchLabel: 'Search in the transcript',
      playSegment: 'Play from {time}: {text}',
      fileIcon: 'Audio file',
      openFilePicker: 'Choose an audio file from your device'
    },
    header: {
      tagline: 'Whisper transcription that never leaves your device',
      privacy: '100% local',
      sourceCode: 'Source'
    },
    hero: {
      title: 'Transcribe audio without uploading it',
      subtitle:
        'Drop a file of any size. Everything runs in your browser with Whisper: segments, word-level timestamps, language detection and translation.',
      bullet1: 'Files never leave your device',
      bullet2: 'Handles multi-hour recordings',
      bullet3: 'Export SRT, VTT, JSON, TXT, CSV'
    },
    upload: {
      title: 'Choose an audio file',
      hint: 'Drag & drop, or click to browse',
      formats: 'MP3, WAV, M4A, AAC, OGG, OPUS, FLAC, WebM — and video files too',
      browse: 'Browse files',
      change: 'Choose another file'
    },
    config: {
      title: 'Settings',
      model: 'Model',
      modelHelp: 'Bigger models are more accurate and slower to download and run.',
      language: 'Audio language',
      languageAuto: 'Detect automatically',
      task: 'Task',
      taskTranscribe: 'Transcribe (keep original language)',
      taskTranslate: 'Translate to English',
      wordTimestamps: 'Word-level timestamps',
      wordTimestampsHelp: 'Slower, but gives a timestamp for every word.',
      advanced: 'Advanced',
      windowMinutes: 'Chunk size (minutes)',
      windowHelp: 'Audio is decoded and transcribed in chunks so memory stays flat on long files.',
      forceCpu: 'Force CPU (disable WebGPU)',
      forceCpuHelp: 'Use this if your GPU produces errors or garbled text.',
      start: 'Start transcription',
      cancel: 'Cancel'
    },
    models: {
      tiny: 'Tiny — fastest',
      base: 'Base — recommended',
      small: 'Small — most accurate (CPU-friendly)',
      turbo: 'Large v3 Turbo — WebGPU only',
      sizeApprox: '~{size} download, cached after the first run',
      needsWebgpu: 'Requires WebGPU, not available in this browser'
    },
    status: {
      idle: 'Waiting for a file',
      preparing: 'Preparing…',
      inspecting: 'Reading file metadata…',
      loadingModel: 'Loading the speech model…',
      detectingLanguage: 'Detecting language…',
      decoding: 'Decoding audio…',
      transcribing: 'Transcribing {done} / {total} chunks…',
      finishing: 'Finishing up…',
      done: 'Transcription complete',
      canceled: 'Canceled',
      failed: 'Something went wrong',
      elapsed: 'Elapsed {time}',
      remaining: 'about {time} left',
      speed: '{factor}× realtime'
    },
    downloads: {
      title: 'Model downloads',
      whisper: 'Whisper model',
      pending: 'Not downloaded yet',
      ready: 'Ready',
      failed: 'Download failed',
      cacheTitle: 'Cached models',
      cacheSize: 'Using {size} of storage',
      cacheEmpty: 'Nothing cached yet',
      clear: 'Delete cached models',
      clearConfirm: 'Click again to delete {size}',
      cleared: 'Freed {size}',
      clearFailed: 'Could not clear the cache'
    },
    result: {
      title: 'Transcript',
      empty: 'Segments will show up here as they are transcribed.',
      search: 'Search in the transcript',
      noMatches: 'No matches',
      segments: '{n} segments',
      words: '{n} words',
      detectedLanguage: 'Detected language: {language}',
      copy: 'Copy text',
      copied: 'Copied',
      restore: 'A previous transcript for this file was found.',
      restoreAction: 'Restore it',
      discardAction: 'Start fresh',
      playFrom: 'Play from here'
    },
    export: {
      title: 'Export',
      srt: 'SRT subtitles',
      vtt: 'WebVTT',
      json: 'JSON (full data)',
      txt: 'Plain text',
      csv: 'CSV'
    },
    errors: {
      noAudioTrack: 'This file has no audio track we can read.',
      undecodable:
        'Your browser cannot decode this audio codec. Try converting the file to WAV or MP3 first.',
      unreadable: 'This file could not be read as a media file.',
      modelLoad: 'The speech model failed to load: {message}',
      transcribe: 'Transcription failed: {message}',
      webgpuFallback: 'WebGPU failed, falling back to CPU. This will be slower.',
      generic: 'Unexpected error: {message}'
    },
    footer: {
      privacyTitle: 'What "local" means here',
      privacyBody:
        'Your audio is read straight from disk and processed in your browser. It is never uploaded. The only network requests are for the Whisper model weights, downloaded once from Hugging Face and then cached offline.',
      builtWith: 'Built with Astro, Tailwind, daisyUI and transformers.js'
    }
  },
  es: {
    meta: {
      title: 'chismesillo — transcripción de audio local',
      description:
        'Transcribe archivos de audio largos con Whisper, entero en tu navegador. Sin subidas, sin backend, sin claves de API.'
    },
    a11y: {
      skipToContent: 'Saltar al contenido principal',
      languageNav: 'Idioma',
      mainContent: 'Contenido principal',
      statusRegion: 'Estado de la transcripción',
      transcriptionProgress: 'Progreso de la transcripción',
      downloadProgress: 'Progreso de la descarga del modelo',
      searchLabel: 'Buscar en la transcripción',
      playSegment: 'Reproducir desde {time}: {text}',
      fileIcon: 'Archivo de audio',
      openFilePicker: 'Elige un archivo de audio de tu dispositivo'
    },
    header: {
      tagline: 'Transcripción con Whisper que nunca sale de tu dispositivo',
      privacy: '100% local',
      sourceCode: 'Código'
    },
    hero: {
      title: 'Transcribe audio sin subirlo a ningún sitio',
      subtitle:
        'Suelta un archivo del tamaño que sea. Todo ocurre en tu navegador con Whisper: segmentos, marcas de tiempo por palabra, detección de idioma y traducción.',
      bullet1: 'Los archivos nunca salen de tu dispositivo',
      bullet2: 'Aguanta grabaciones de varias horas',
      bullet3: 'Exporta SRT, VTT, JSON, TXT, CSV'
    },
    upload: {
      title: 'Elige un archivo de audio',
      hint: 'Arrastra y suelta, o haz clic para buscar',
      formats: 'MP3, WAV, M4A, AAC, OGG, OPUS, FLAC, WebM — y también vídeos',
      browse: 'Buscar archivos',
      change: 'Elegir otro archivo'
    },
    config: {
      title: 'Ajustes',
      model: 'Modelo',
      modelHelp: 'Los modelos grandes son más precisos, pero tardan más en descargar y ejecutar.',
      language: 'Idioma del audio',
      languageAuto: 'Detectar automáticamente',
      task: 'Tarea',
      taskTranscribe: 'Transcribir (mantener el idioma original)',
      taskTranslate: 'Traducir al inglés',
      wordTimestamps: 'Marcas de tiempo por palabra',
      wordTimestampsHelp: 'Más lento, pero da una marca de tiempo para cada palabra.',
      advanced: 'Avanzado',
      windowMinutes: 'Tamaño de bloque (minutos)',
      windowHelp:
        'El audio se decodifica y transcribe por bloques para que la memoria no crezca con archivos largos.',
      forceCpu: 'Forzar CPU (desactivar WebGPU)',
      forceCpuHelp: 'Úsalo si tu GPU da errores o texto corrupto.',
      start: 'Empezar transcripción',
      cancel: 'Cancelar'
    },
    models: {
      tiny: 'Tiny — el más rápido',
      base: 'Base — recomendado',
      small: 'Small — el más preciso (apto para CPU)',
      turbo: 'Large v3 Turbo — solo WebGPU',
      sizeApprox: '~{size} de descarga, se guarda en caché tras la primera vez',
      needsWebgpu: 'Necesita WebGPU, no disponible en este navegador'
    },
    status: {
      idle: 'Esperando un archivo',
      preparing: 'Preparando…',
      inspecting: 'Leyendo los metadatos del archivo…',
      loadingModel: 'Cargando el modelo de voz…',
      detectingLanguage: 'Detectando el idioma…',
      decoding: 'Decodificando el audio…',
      transcribing: 'Transcribiendo {done} / {total} bloques…',
      finishing: 'Terminando…',
      done: 'Transcripción completada',
      canceled: 'Cancelado',
      failed: 'Algo ha fallado',
      elapsed: 'Tiempo {time}',
      remaining: 'quedan unos {time}',
      speed: '{factor}× tiempo real'
    },
    downloads: {
      title: 'Descarga del modelo',
      whisper: 'Modelo Whisper',
      pending: 'Todavía sin descargar',
      ready: 'Listo',
      failed: 'La descarga ha fallado',
      cacheTitle: 'Modelos en caché',
      cacheSize: 'Ocupando {size} de almacenamiento',
      cacheEmpty: 'Nada en caché todavía',
      clear: 'Borrar modelos en caché',
      clearConfirm: 'Haz clic otra vez para borrar {size}',
      cleared: 'Liberados {size}',
      clearFailed: 'No se ha podido vaciar la caché'
    },
    result: {
      title: 'Transcripción',
      empty: 'Los segmentos irán apareciendo aquí según se transcriban.',
      search: 'Buscar en la transcripción',
      noMatches: 'Sin resultados',
      segments: '{n} segmentos',
      words: '{n} palabras',
      detectedLanguage: 'Idioma detectado: {language}',
      copy: 'Copiar texto',
      copied: 'Copiado',
      restore: 'Hemos encontrado una transcripción anterior de este archivo.',
      restoreAction: 'Recuperarla',
      discardAction: 'Empezar de cero',
      playFrom: 'Reproducir desde aquí'
    },
    export: {
      title: 'Exportar',
      srt: 'Subtítulos SRT',
      vtt: 'WebVTT',
      json: 'JSON (datos completos)',
      txt: 'Texto plano',
      csv: 'CSV'
    },
    errors: {
      noAudioTrack: 'Este archivo no tiene ninguna pista de audio que podamos leer.',
      undecodable:
        'Tu navegador no puede decodificar este códec de audio. Prueba a convertir el archivo a WAV o MP3 antes.',
      unreadable: 'No hemos podido leer este archivo como archivo multimedia.',
      modelLoad: 'El modelo de voz no se ha podido cargar: {message}',
      transcribe: 'La transcripción ha fallado: {message}',
      webgpuFallback: 'WebGPU ha fallado, seguimos con la CPU. Irá más lento.',
      generic: 'Error inesperado: {message}'
    },
    footer: {
      privacyTitle: 'Qué significa "local" aquí',
      privacyBody:
        'Tu audio se lee directamente del disco y se procesa en tu navegador. Nunca se sube a ningún sitio. Las únicas peticiones de red son las de los pesos del modelo Whisper, que se descargan una vez desde Hugging Face y quedan en caché.',
      builtWith: 'Hecho con Astro, Tailwind, daisyUI y transformers.js'
    }
  }
} as const

type UiTree = (typeof ui)[typeof defaultLang]

/**
 * Resolves a dotted key path ("status.transcribing") against the locale tree,
 * falling back to the default locale, then to the key itself.
 * `{placeholders}` in the string are replaced with `vars`.
 */
export function useTranslations(lang: Lang) {
  return function t(path: string, vars?: Record<string, unknown>): string {
    const value = lookup(ui[lang], path) ?? lookup(ui[defaultLang], path)
    if (typeof value !== 'string') return path
    if (!vars) return value
    return value.replace(/\{(\w+)\}/g, (match, name: string) =>
      name in vars ? String(vars[name]) : match
    )
  }
}

function lookup(tree: unknown, path: string): unknown {
  return path
    .split('.')
    .reduce<unknown>(
      (node, key) =>
        node && typeof node === 'object' ? (node as Record<string, unknown>)[key] : undefined,
      tree
    )
}

/** The sub-trees the client bundle needs at runtime. */
const CLIENT_SECTIONS = [
  'a11y',
  'config',
  'models',
  'status',
  'downloads',
  'result',
  'export',
  'errors',
  'upload'
] as const

export function clientStrings(lang: Lang) {
  const tree = ui[lang] as UiTree
  return Object.fromEntries(CLIENT_SECTIONS.map((section) => [section, tree[section]]))
}
