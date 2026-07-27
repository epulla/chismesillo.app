# CLAUDE.md

In-browser Whisper transcription. Static Astro site, no backend, no UI framework — plain
TypeScript in `src/scripts` plus two Web Workers. See `README.md` for the user-facing story.

## Commands

```bash
pnpm dev                          # daemonized, see below
pnpm check                        # astro check (types) — the only correctness gate besides tests
pnpm test                         # vitest run
pnpm format                       # prettier --write .
pnpm vitest run src/scripts/windowing.test.ts   # single file
pnpm vitest run -t "quiet cut"                  # single test by name
```

Verify with `pnpm format:check && pnpm check && pnpm test && pnpm build`. Node >= 22.12, pnpm 11.

`pnpm dev` **returns immediately** — this Astro version daemonizes the dev server. Use
`pnpm exec astro dev stop | status | logs`. A backgrounded `pnpm dev &` leaves a server
running after the shell exits; stop it explicitly or the next `dev` picks a different port.

Runtime deps are pinned exactly (no `^`) on purpose; transformers.js and mediabunny both
break across minors. `pnpm-workspace.yaml` disables the `onnxruntime-node` build script (we
only ever use the web backend) and exempts `astro@7.1.4` from the release-age gate.

## Architecture

`app.ts` is the single client entry, imported by both `src/pages/index.astro` and
`src/pages/es/index.astro`. It drives two workers in lockstep:

```
app.ts run loop  ──call('next')──>  audio.worker.ts  ──> decodeSession.ts (mediabunny)
                 ──call('transcribe')──>  transcriber.worker.ts (transformers.js)
```

- **One window ahead, never two.** `run()` in `app.ts:202` requests window N+1 before
  awaiting transcription of N. `DecodeSession.publish` blocks decoding until the consumer
  pulls, which is what keeps memory flat on multi-hour files. Removing either half breaks
  the invariant that `decodeSession.test.ts` asserts.
- **PCM is transferred, not copied.** `window.pcm.buffer` is in the transfer list, so the
  array is detached after the call. Read anything you need from it first.
- Decode logic lives in `decodeSession.ts`, deliberately free of worker globals so tests can
  drive it directly. `audio.worker.ts` is a thin message wrapper — keep it that way.
- Both workers speak the same RPC shape (`workerClient.ts`): `{id, type, payload}` in,
  `done`/`error` out, plus unsolicited `progress` and `event` messages.

## Gotchas that cost time

- **mediabunny output must never be finalized.** `decodeSession.ts` encodes nothing (the
  `process` hook returns `null`), so `composable: true` + `output.start()` + `output.cancel()`
  is the required sequence — a muxer asked to finalize a track with zero samples asserts.
- **`chunk_callback` does not exist in transformers.js v4.** Use `WhisperTextStreamer`
  (`transcriber.worker.ts:167`). Options passed to the pipeline are silently ignored if
  unknown, so a typo shows up as "progress never fires", not as an error.
- **CPU needs fp32.** Quantized weights break on the WASM backend; only the WebGPU path gets
  q4. Encoded in `dtypeFor` (`models.ts:58`) — don't "optimize" the CPU download size.
- **COOP/COEP live in two places.** Dev: the `crossOriginIsolationDev` integration in
  `astro.config.mjs` (Astro renders HTML itself and bypasses `vite.server.headers`).
  Prod: `public/_headers`. Change one, change the other. Without them, CPU inference silently
  drops to single-threaded.
- **`el()` throws on a missing id, at module load.** `app.ts`'s `dom` object resolves ~45 ids
  eagerly, so renaming an id in any `.astro` file kills the whole page while the build stays
  green. Grep `dist/index.html` _and_ `dist/es/index.html` after touching component markup.

## i18n

All strings live in `src/i18n/ui.ts` (`en` + `es`). Server-rendered text uses
`useTranslations(lang)`; the browser gets only the sub-trees listed in `CLIENT_SECTIONS`,
serialized into `window.__I18N__` by `Layout.astro` and read via `createTranslator()`.

A client-side `t('foo.bar')` whose section is not in `CLIENT_SECTIONS` returns the key path
verbatim instead of throwing. Both page files must stay structurally identical; adding a
component means editing `index.astro` and `es/index.astro`.

`DecodeError` carries an i18n key (`errors.noAudioTrack` etc.), so new decode failure modes
need a matching entry in both locale trees.

## Testing

Tests are colocated (`src/scripts/*.test.ts`) and cover the silent-failure surface: window
boundaries, overlap de-duplication, timestamp repair, subtitle formatting, and a real decode
of a synthesized WAV.

- There is no `vitest.config.ts`, so the `@/` alias is **not** available in tests. Use
  relative imports.
- Node has no WebCodecs, so decode tests can only use WAV/PCM. Compressed codecs are
  browser-only territory; don't add a test that would need them.
- Nothing here can exercise real inference — no WebGPU, no model download. Changes to
  `transcriber.worker.ts` are typechecked, not verified. Say so rather than implying they run.

## Conventions

Prettier is the formatter (no semicolons, single quotes, width 100); there is no ESLint.
Comments in this codebase explain _why_ — non-obvious constraints and dead ends — not what
the line does. Match that. There is intentionally no ffmpeg.wasm fallback: undecodable files
get a translated error, because bundling ffmpeg would reintroduce the whole-file-in-memory
limit the windowed design exists to avoid.
