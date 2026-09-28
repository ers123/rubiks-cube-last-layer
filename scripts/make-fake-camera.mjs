/**
 * Builds a Y4M video of a rotating cube, for Chromium's fake webcam.
 *
 * It reuses the same software renderer the detection tests use, so the video is
 * exactly the kind of frame the detector was proven on. It is a plumbing test,
 * not a realism test: real glare and white balance are exactly what it omits.
 */
import { mkdirSync, writeFileSync } from 'node:fs'

// The renderer is TypeScript, so build it first. This script is invoked by
// `pnpm fake-camera`, which bundles the camera modules before calling it.
const { renderCubeImage } = await import('./.fake-camera-build/render.mjs')
const { createSolvedCube, applySequence } = await import('./.fake-camera-build/model.mjs')
const { ALG } = await import('./.fake-camera-build/solver.mjs')

const W = 640
const H = 480
const FRAMES = 90
const OUT = '/tmp/cube-fake/cube.y4m'

mkdirSync('/tmp/cube-fake', { recursive: true })

/** A last layer that is genuinely scrambled, so the read has something to do. */
const cube = createSolvedCube()
applySequence(cube, ALG.uaPerm)
applySequence(cube, ALG.sune)

const rgbToYuv = (r, g, b) => {
  const y = 0.299 * r + 0.587 * g + 0.114 * b
  const u = -0.169 * r - 0.331 * g + 0.5 * b + 128
  const v = 0.5 * r - 0.419 * g - 0.081 * b + 128
  return [y, u, v]
}

const head = Buffer.from(`YUV4MPEG2 W${W} H${H} F15:1 Ip A1:1 C420mpeg2\n`, 'ascii')
const chunks = [head]

for (let f = 0; f < FRAMES; f++) {
  // Start on a 3/4 view showing the top face, then yaw a full turn so every
  // side face passes through view. One full turn means a U rotation, which
  // leaves the last layer untouched, so the state stays consistent throughout.
  const t = (f / FRAMES) * Math.PI * 2
  const eye = { x: Math.cos(t), y: 0.95, z: Math.sin(t) }
  const { img } = renderCubeImage(cube, { width: W, height: H, eye, seed: 3 })

  const ySize = W * H
  const cSize = (W / 2) * (H / 2)
  const yPlane = Buffer.alloc(ySize)
  const uPlane = Buffer.alloc(cSize)
  const vPlane = Buffer.alloc(cSize)

  for (let py = 0; py < H; py++) {
    for (let px = 0; px < W; px++) {
      const i = (py * W + px) * 4
      const [Y] = rgbToYuv(img.data[i], img.data[i + 1], img.data[i + 2])
      yPlane[py * W + px] = Math.max(0, Math.min(255, Math.round(Y)))
    }
  }
  // 4:2:0 chroma, box averaged
  for (let cy = 0; cy < H / 2; cy++) {
    for (let cx = 0; cx < W / 2; cx++) {
      let su = 0
      let sv = 0
      for (let dy = 0; dy < 2; dy++) {
        for (let dx = 0; dx < 2; dx++) {
          const i = ((cy * 2 + dy) * W + (cx * 2 + dx)) * 4
          const [, U, V] = rgbToYuv(img.data[i], img.data[i + 1], img.data[i + 2])
          su += U
          sv += V
        }
      }
      uPlane[cy * (W / 2) + cx] = Math.max(0, Math.min(255, Math.round(su / 4)))
      vPlane[cy * (W / 2) + cx] = Math.max(0, Math.min(255, Math.round(sv / 4)))
    }
  }

  chunks.push(Buffer.from('FRAME\n', 'ascii'), yPlane, uPlane, vPlane)
}

writeFileSync(OUT, Buffer.concat(chunks))
console.log(`wrote ${OUT} (${FRAMES} frames of ${W}x${H})`)
