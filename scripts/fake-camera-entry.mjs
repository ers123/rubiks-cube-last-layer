// Bundles the camera modules so the fake-camera generator can import them.
import { build } from 'vite'
import { writeFileSync } from 'node:fs'

const OUT = 'scripts/.fake-camera-build'
await build({
  logLevel: 'error',
  build: {
    outDir: OUT,
    emptyOutDir: true,
    lib: { entry: 'src/camera/synthetic.ts', formats: ['es'], fileName: () => 'render.mjs' },
    rollupOptions: { external: [] },
  },
})
await build({
  logLevel: 'error',
  build: {
    outDir: OUT,
    emptyOutDir: false,
    lib: { entry: 'src/cube/index.ts', formats: ['es'], fileName: () => 'cube.mjs' },
  },
})
writeFileSync(`${OUT}/model.mjs`, `export * from './cube.mjs'\n`)
writeFileSync(`${OUT}/solver.mjs`, `export * from './cube.mjs'\n`)
console.log('bundled camera modules')
