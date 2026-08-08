---
name: transformers-js-perf
description: Diagnose transformers.js and ONNX Runtime Web inference speed, model download size, dtype, quantization, chunk stride, WebGPU fallback, and WASM threads. Use when browser transcription is slow or model downloads differ from advertised sizes.
---

# Transformers.js Performance

Use this workflow for this repository's pinned `@huggingface/transformers@4.2.0`.
Line references point to `node_modules/@huggingface/transformers/dist/transformers.js`
and must be rechecked after dependency upgrades.

## Workflow

1. **Measure a warm run.** A cold run includes model download and first-run shader
   compilation. Repeat the same file with cached weights before diagnosing inference.

2. **Compute downloads from selected files.** Never infer size from a quantization label.
   Query `https://huggingface.co/api/models/<MODEL_ID>?blobs=true`, then sum tokenizer
   metadata, each ONNX graph selected by `dtypeFor`, and all matching `.onnx_data` files.

3. **Use ONNX file names as dtype keys.** `constructSessions` passes `names[name]` to
   `getSession` at line 23230, then `selectDtype` resolves against that file name at line
   13629. This app's keys are `encoder_model` and `decoder_model_merged`; a wrong key
   falls back to the device default with only an info log.

4. **Map dtype to the real suffix.** Lines 13611-13623 map `fp32` to no suffix, `fp16` to
   `_fp16`, `q8` to `_quantized`, `q4` to `_q4`, and `q4f16` to `_q4f16`. Device defaults
   are fp32 generally and q8 on WASM at lines 13606-13609.

5. **Include external model data.** `resolveExternalDataFormat` at line 23089 turns a tiny
   ONNX graph into one or more `.onnx_data` fetches. Turbo's fp32 encoder graph is about
   0.4 MB but its external weights are about 2.4 GB.

6. **Treat stride as discarded context on both edges.** The pipeline advances by
   `chunk - 2 * stride` at line 32927. `_decode_asr` removes the margins around line
   15997. Encoder work approaches `chunk / (chunk - 2 * stride)` times realtime.
   Reject `stride >= chunk / 2`; the upstream guard permits a zero or negative hop.

7. **Check WASM isolation before tuning threads.** ONNX Runtime defaults to
   `min(4, ceil(hardwareConcurrency / 2))` at lines 11423-11426, but drops to one thread
   without `crossOriginIsolated`. Verify COOP/COEP in dev and every production host.

8. **Guard fp16 and WebGPU fallback together.** Inspect `shader-f16` before loading turbo
   and select its q4 encoder when unsupported; transformers.js otherwise throws at line
   23176. Never catch that failure by reloading a `requiresWebGPU` model on WASM, which
   would start a multi-gigabyte CPU download.

9. **Do not "optimize" a working fp32 encoder to fp16.** The pair this app ships —
   `encoder_model: fp32`, `decoder_model_merged: q4` — is what both maintained HF
   examples use on WebGPU (`realtime-whisper-webgpu`, and `whisper-word-timestamps`,
   which is chunked with word timestamps like this app). The `// 'fp16' works too`
   comment beside them is a compatibility note, not a benchmark, and it is contradicted
   by transformers.js#1590 — open, labeled `bug`, reopened 2026-03-30 against a version
   later than our pinned 4.2.0 — where the maintainer traces bad Whisper output to
   "some precision loss in the new webgpu EP" and gets much better results by moving
   the *encoder* back to fp32. Turbo is the sole exception: its fp32 encoder cannot be
   allocated at all, so fp16-when-`shader-f16` is the least-bad rung, not an
   optimization. The upside was never large either — the encoder is one forward pass
   per 30 s chunk against an autoregressive decoder that is already q4.

10. **State verification limits.** Repo tests have no WebGPU and download no models.
    Worker changes are typechecked, not inference-tested. Report arithmetic separately
    from benchmarks and require a browser run for dtype or transcript-quality changes.
