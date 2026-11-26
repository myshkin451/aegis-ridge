import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('/postprocessing/') || id.includes('/n8ao/')) return 'optics'
          if (id.endsWith('/three/build/three.core.js')) return 'three-core'
          if (id.endsWith('/three/build/three.module.js')) return 'three-webgl'
        },
      },
    },
  },
  test: { include: ['tests/**/*.test.ts', 'src/**/*.test.ts'] },
})
