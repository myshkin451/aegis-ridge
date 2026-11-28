import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('/lights/RectAreaLight')) return 'area-light-lut'
          if (id.endsWith('/loaders/GLTFLoader.js')) return 'gltf-loader'
          if (id.includes('/camera-controls/') || id.includes('/three-mesh-bvh/')) return 'navigation'
          if (
            id.includes('/postprocessing/') ||
            id.includes('/n8ao/') ||
            id.includes('/examples/jsm/csm/') ||
            id.endsWith('/examples/jsm/objects/Sky.js') ||
            id.endsWith('/scene/atmosphere/ScenarioGrade.ts')
          )
            return 'optics'
          if (id.endsWith('/three/build/three.core.js')) return 'three-core'
          if (id.endsWith('/three/build/three.module.js')) return 'three-webgl'
        },
      },
    },
  },
  test: { include: ['tests/**/*.test.ts', 'src/**/*.test.ts'] },
})
