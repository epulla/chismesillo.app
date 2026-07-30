---
name: transformers-js-memory
description: Diagnose and prevent memory failures when running transformers.js / ONNX Runtime Web models in the browser. Use when a model download stalls partway, when you see "Array buffer allocation failed", "RangeError", or "out of memory" while loading weights, when choosing a `dtype` or device for a pipeline, when estimating how large a model download really is, or when deciding between WebGPU and WASM.
license: MIT
metadata:
  author: chismesillo
  version: "1.0"
---

# transformers.js memory and dtype selection

Loading a model in the browser fails in ways the error message does not explain.
This is the checklist that turns "the page just stops" into a known cause.

## The constraint is the largest single file, not the total download

`transformers.js` fetches each weight file into **one contiguous `Uint8Array`**, then
ONNX Runtime copies it again into the WASM heap or a GPU buffer. So:

- peak ≈ **2× the largest single file**, not 2× the total
- a 3 GB model split into six 500 MB files loads; a 2.5 GB model in one file does not
- the failure is `RangeError: Array buffer allocation failed`, thrown from
  `new Uint8Array(total)` inside the response reader

A download that dies at some arbitrary number of MB with a `RangeError` is this,
every time. It is not a network problem, and retrying will not help.

## Always look up the real file sizes before choosing a dtype

A `dtype` name maps to files whose sizes you cannot infer from the parameter count.

```bash
curl -s "https://huggingface.co/api/models/<org>/<model>?blobs=true" | python3 -c "
import json,sys
d=json.load(sys.stdin)
for f in d.get('siblings',[]):
    n=f['rfilename']
    if n.endswith('.onnx') or n.endswith('.onnx_data'):
        print(n, round((f.get('size') or 0)/1e6,1),'MB')
"
```

Run this **before** writing a `dtype`, and again before advertising a download size
in the UI. Numbers guessed from parameter counts have been wrong by 3× here.

## `.onnx_data` — the trap that makes a 2.5 GB file look like 0.4 MB

ONNX serialises with protobuf, which caps a single message at 2 GB. Past that, the
weights move into a sidecar file and the `.onnx` becomes a stub holding only the
graph:

```
onnx/encoder_model.onnx           0.4 MB     <- looks free
onnx/encoder_model.onnx_data   2547.9 MB     <- the actual weights
```

Any listing that filters for `.onnx` alone will report this model as tiny. Always
include `.onnx_data` — the `curl` above does.

Corollary: **the presence of an `.onnx_data` sidecar means that dtype is over 2 GB
in one allocation and will not load in a browser.** Treat it as a hard exclusion.

## Reference configuration for Whisper

The config with real-world evidence behind it, taken from the official
`webml-community/whisper-large-v3-turbo-webgpu` space:

```js
dtype: {
  encoder_model: model === 'onnx-community/whisper-large-v3-turbo' ? 'fp16' : 'fp32',
  decoder_model_merged: 'q4'
},
device: 'webgpu'
```

The asymmetry is the point: `fp32` encoder is fine for tiny/base/small, and is
`.onnx_data`-sized for large-v3-turbo. There is no single dtype that is correct for
every model, so `dtype` must be a function of the model, not a constant.

Rough ladder for a large encoder, cheapest safe option first: `q4f16` → `q4` →
`fp16` → *(fp32 unavailable)*.

## Probe adapter features before asking for fp16

`fp16` weights need the `shader-f16` WebGPU feature. Without it, session creation
fails:

```js
const adapter = await navigator.gpu?.requestAdapter()
const supportsF16 = adapter?.features?.has('shader-f16') ?? false
```

When it is missing, step **down** to a quantized encoder. Stepping "up" to fp32 to
preserve accuracy is what produces the allocation failure — the fallback is the bug.

## WASM needs fp32, which is why large models have no CPU path

Quantized ONNX weights are unreliable on the WASM backend (missing dequant scales on
Firefox, unimplemented q4 kernels elsewhere), so CPU inference needs fp32. For a
large model that means gigabytes in one allocation.

So a WebGPU→WASM fallback ladder is actively harmful above a certain model size: it
starts a download that cannot finish. Large models should **fail fast with a clear
message** instead of falling back.

## Load errors escape your try/catch

`transformers.js` fetches weight files concurrently. When one rejects, the sibling
promises reject too — and those are not awaited through your handler. The result is
an unhandled rejection, a console trace nobody reads, and a progress bar that never
moves.

In a worker:

```js
self.addEventListener('unhandledrejection', (event) => {
  event.preventDefault()
  post({ type: 'event', name: 'fatal', payload: { message: String(event.reason) } })
})
```

Do this **first**, before debugging a "hang". A hang is usually a swallowed error.

## Inference memory: features for the whole input are built up front

For chunked ASR, the pipeline builds `input_features` for **every** sub-chunk before
generating any tokens, and holds them all until the input finishes
(`pipelines/automatic-speech-recognition.js`, the `chunk_length_s` branch). Memory
therefore scales with the length of what you pass in:

```
featureBytes ≈ ceil(inputSec / (chunkLengthSec - 2 * strideSec))
               * melBins * 3000 frames * 4 bytes
```

`melBins` is 80 for most Whisper checkpoints and **128 for large-v3** and its
derivatives, so a large model pays double. This is internal to the library and
cannot be tuned from the outside — the only lever is passing in less audio at a
time.

## Verifying without being able to run inference

A browser-only stack cannot be exercised in Node: no WebGPU, no model download, no
WebCodecs. Do not imply otherwise in a PR description.

What *is* testable is the decision, not the outcome. Assert on dtype **resolution**:

```ts
it('never resolves an fp32 encoder for a WebGPU-only model', () => {
  for (const device of ['webgpu', 'wasm']) {
    for (const capabilities of [{ supportsF16: true }, { supportsF16: false }]) {
      // ...assert the encoder is never 'fp32'
    }
  }
})
```

This catches the regression that matters — someone "optimising" the dtype table
later — without pretending to validate inference.

## Dead ends, so they are not re-derived

- Retrying the download after a `RangeError`. The allocation is deterministic.
- Clearing the Cache Storage. The failure happens before anything is cached.
- Raising a browser memory flag. Users do not have one, so it is not a fix.
- Falling back to CPU for a large model. See above — the CPU path is bigger.
- Assuming a stalled progress bar means a slow network. Check for an unhandled
  rejection first.
