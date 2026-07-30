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

8. **Guard fp16 and WebGPU fallback together.** Unsupported WebGPU fp16 throws at line
   23176. This app must not catch that and reload a `requiresWebGPU` model on WASM; turbo
   would start a multi-gigabyte CPU download.

9. **State verification limits.** Repo tests have no WebGPU and download no models.
   Worker changes are typechecked, not inference-tested. Report arithmetic separately
   from benchmarks and require a browser run for dtype or transcript-quality changes.
