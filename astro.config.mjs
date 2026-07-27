// @ts-check
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'astro/config'
import tailwindcss from '@tailwindcss/vite'

// Cross-origin isolation lets onnxruntime-web use SharedArrayBuffer (multi-threaded
// WASM inference). `credentialless` is used instead of `require-corp` so that model
// weights fetched from the Hugging Face CDN don't need CORP headers.
const crossOriginIsolationHeaders = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'credentialless'
}

/**
 * Astro renders HTML itself in dev, bypassing `vite.server.headers`, so the pages
 * would come back without the isolation headers even though assets have them.
 * This middleware puts them on every dev response. In production the same headers
 * come from `public/_headers`.
 */
const crossOriginIsolationDev = {
  name: 'cross-origin-isolation-dev',
  hooks: {
    'astro:server:setup': ({ server }) => {
      server.middlewares.use((_request, response, next) => {
        for (const [header, value] of Object.entries(crossOriginIsolationHeaders)) {
          response.setHeader(header, value)
        }
        next()
      })
    }
  }
}

// https://astro.build/config
export default defineConfig({
  site: 'https://chismesillo.app',
  output: 'static',
  integrations: [crossOriginIsolationDev],
  i18n: {
    locales: ['en', 'es'],
    defaultLocale: 'en',
    routing: {
      prefixDefaultLocale: false
    }
  },
  vite: {
    plugins: [tailwindcss()],
    // mediabunny ships modern ESM that Vite's dep optimizer mangles; and the
    // transformers/onnx bundles must not be pre-bundled into the worker chunk.
    optimizeDeps: {
      exclude: ['mediabunny', '@huggingface/transformers']
    },
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url))
      }
    },
    worker: {
      format: 'es'
    },
    server: {
      headers: crossOriginIsolationHeaders
    },
    preview: {
      headers: crossOriginIsolationHeaders
    }
  }
})
