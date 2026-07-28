import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

// Node is the default because decodeSession drives real Node APIs. DOM specs opt in
// per-file with `// @vitest-environment happy-dom`.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts']
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    }
  }
})
