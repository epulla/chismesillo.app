# chismesillo

Transcribe long audio files with Whisper, entirely in the browser. No uploads, no backend, no API keys.

Drop in a file of any size — a three-hour podcast is fine — and get segments, word-level timestamps, language detection, optional translation to English, and exports to SRT, VTT, JSON, TXT and CSV.

## How it works

```
File (read lazily from disk, never uploaded)
  │
  ├─ audio.worker.ts ── mediabunny ── decode + downmix + resample to 16 kHz mono
  │                                     │
  │                                     └─ emits ~10 min PCM windows, one at a time
  │
  └─ transcriber.worker.ts ── transformers.js ── Whisper ── segments + timestamps
```

Two Web Workers, pulled in lockstep by the main thread: while window N is being
transcribed, window N+1 is being decoded, and nothing further ahead of that.

**Memory stays flat regardless of file length.** The decoder's `process` hook awaits a
gate once a window is ready, which suspends decoding until the consumer pulls it. A
ten-minute window of 16 kHz mono float PCM is about 38 MB, and that is the ceiling —
a 20-minute file and a 5-hour file use the same amount of RAM.

Window boundaries are snapped to the quietest point within ±15 s of the nominal cut,
and each window replays the last 2 s of the previous one so Whisper keeps context
across the seam. Duplicated text from that overlap is dropped on the way out.

## Stack

| Layer              | Choice                                                                                                                       |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| Framework          | [Astro 7](https://astro.build), static output                                                                                |
| Styling            | [Tailwind CSS 4](https://tailwindcss.com) + [daisyUI 5](https://daisyui.com) (`pastel` theme)                                |
| Speech recognition | [transformers.js](https://huggingface.co/docs/transformers.js) running [Whisper](https://huggingface.co/Xenova/whisper-base) |
| Audio decoding     | [mediabunny](https://mediabunny.dev) (WebCodecs)                                                                             |
| Tests              | Vitest                                                                                                                       |

No UI framework: the pages are static Astro and the client logic is plain TypeScript.

## Models

| Option             | Model                                   | WebGPU download | CPU download    |
| ------------------ | --------------------------------------- | --------------- | --------------- |
| **Base (default)** | `Xenova/whisper-base`                   | ~200 MB         | ~280 MB         |
| Tiny               | `Xenova/whisper-tiny`                   | ~120 MB         | ~150 MB         |
| Small              | `Xenova/whisper-small`                  | ~560 MB         | ~930 MB         |
| Turbo              | `onnx-community/whisper-large-v3-turbo` | ~1.5 GB         | — (WebGPU only) |

The app tries WebGPU first with a quantized decoder, and CPU-capable models fall back to
fp32 weights if the GPU fails either to load the model or to run a window. Quantized ONNX
weights are unreliable on the CPU backend — missing dequantization scales on Firefox,
unimplemented q4 kernels elsewhere — which is why the CPU path pays for fp32. Turbo is
WebGPU-only and uses an fp16 encoder when supported, or q4 otherwise; it never falls back
to a multi-gigabyte CPU download. There is a "force CPU" switch in the advanced settings
for GPUs that misbehave.

Weights are cached by the browser after the first download and can be deleted from the
footer.

## What "local" means here

Your audio is read straight from disk with the File API and processed in Web Workers.
It is never uploaded, and there is no server to upload it to — the production build is
static files.

The one network request the app makes is for the Whisper model weights, downloaded
once from the Hugging Face CDN and then cached offline. Weights come _in_; your audio
never goes _out_.

## Getting started

```bash
pnpm install
pnpm dev        # http://localhost:4321
```

| Command        | Description                    |
| -------------- | ------------------------------ |
| `pnpm dev`     | Dev server                     |
| `pnpm build`   | Static build to `./dist/`      |
| `pnpm preview` | Preview the production build   |
| `pnpm check`   | Astro + TypeScript diagnostics |
| `pnpm test`    | Vitest suite                   |
| `pnpm format`  | Prettier                       |

Requires Node ≥ 22.13.

### Cross-origin isolation

The app sends `Cross-Origin-Opener-Policy: same-origin` and
`Cross-Origin-Embedder-Policy: credentialless`, which lets onnxruntime-web use
`SharedArrayBuffer` for multi-threaded CPU inference. `credentialless` is used instead
of `require-corp` so the Hugging Face CDN doesn't need to send CORP headers.

In dev these come from an integration in `astro.config.mjs`; in production from
`public/_headers` (Cloudflare Pages, Netlify and similar) and `vercel.json` (Vercel, which
does not read `_headers`). On other hosts, set those two headers yourself — without them
inference still works, just single-threaded.

## Browser support

Chromium and Firefox are the happy paths. Safari works but has no `credentialless` COEP,
so CPU inference stays single-threaded. Decoding needs WebCodecs support for the source
codec; WAV and MP3 are handled natively by mediabunny.

There is no ffmpeg.wasm fallback: if the browser cannot decode a codec, the app says so
and suggests converting the file, rather than pulling in a 32 MB WASM build that would
also reintroduce the whole-file-in-memory limit this design exists to avoid.

## Tests

```bash
pnpm test
```

Covers the parts where being wrong is silent rather than loud: window boundary
selection, overlap de-duplication, timestamp offsetting and repair, subtitle
formatting, and an end-to-end decode of a synthesized stereo 44.1 kHz WAV asserting
that windows tile the file and that backpressure actually caps buffered audio.

## Prior art

The architecture takes cues from [subvid.app](https://github.com/midudev/subvid.app) by
[midudev](https://midu.dev) — the worker protocol shape and the hard-won knowledge that
Whisper needs fp32 weights on the CPU backend both come from there. The decoding path
differs: subvid.app extracts audio with ffmpeg.wasm in one pass, which caps usable file
size, whereas this app streams through mediabunny in windows to stay flat on memory.
