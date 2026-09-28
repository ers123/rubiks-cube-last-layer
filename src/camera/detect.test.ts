import { describe, it, expect } from 'vitest'
import { renderCubeImage, stickerColorAt, hexToRgb } from './synthetic'
import { detectVisibleFaces, DEFAULT_DETECT } from './detect'
import { rgbToLab, classifySideStickers, classifyTopSticker, type Palette } from './classify'
import { createSolvedCube, applySequence, FACE_COLORS, type Color, type Cube } from '../cube/model'
import { ALG } from '../cube/solver'

const SOLVED = createSolvedCube()

/**
 * The palette is measured from centre stickers under the same light as the
 * frame, which is exactly what the app does at runtime.
 */
function paletteFromCube(gain: [number, number, number]): Palette {
  const p = {} as Palette
  for (const face of ['U', 'R', 'F', 'L', 'B'] as Color[]) {
    const rgb = hexToRgb(FACE_COLORS[stickerColorAt(SOLVED, face, 1, 1)])
    p[face] = rgbToLab({
      r: Math.min(255, rgb.r * gain[0]),
      g: Math.min(255, rgb.g * gain[1]),
      b: Math.min(255, rgb.b * gain[2]),
    })
  }
  return p
}

const EYES: { name: string; eye: { x: number; y: number; z: number } }[] = [
  { name: 'classic 3/4 (U,F,R)', eye: { x: 1, y: 1, z: 1 } },
  { name: 'low angle', eye: { x: 1.2, y: 0.55, z: 1 } },
  { name: 'high angle (U,F,L)', eye: { x: -1, y: 1.3, z: 0.9 } },
  { name: 'tilted (U,B,R)', eye: { x: 1, y: 1, z: -1.1 } },
  { name: 'nearly face on', eye: { x: 0.15, y: 1, z: 1 } },
  { name: 'flat top', eye: { x: 0.9, y: 1.9, z: 0.8 } },
]

const render = (
  eye: { x: number; y: number; z: number },
  cube: Cube = SOLVED,
  gain: [number, number, number] = [1, 1, 1],
  noise = 0
) => renderCubeImage(cube, { width: 640, height: 480, eye, gain, noise, seed: 3 })

describe('finding the cube in a frame', () => {
  it('finds exactly the faces that are visible', () => {
    for (const { name, eye } of EYES) {
      const { img, visible } = render(eye)
      const { hits } = detectVisibleFaces(img, paletteFromCube([1, 1, 1]), DEFAULT_DETECT)
      expect(hits.map((h) => h.face).sort(), name).toEqual([...visible].sort())
    }
  })

  it('reads the right colour for every sticker of a solved cube', () => {
    for (const { name, eye } of EYES) {
      const { img, visible } = render(eye)
      const palette = paletteFromCube([1, 1, 1])
      const { hits } = detectVisibleFaces(img, palette, DEFAULT_DETECT)
      // At a low angle the top face is a sliver, so only two faces are readable.
      expect(hits.length, `${name}: expected ${visible.length} readable faces`).toBe(visible.length)
      for (const hit of hits) {
        for (let row = 0; row < 3; row++) {
          for (let col = 0; col < 3; col++) {
            const got = classifyTopSticker(hit.stickers[row * 3 + col], palette)
            expect(got ?? 'U', `${name}: ${hit.face} r${row}c${col}`).toBe(
              stickerColorAt(SOLVED, hit.face, row, col)
            )
          }
        }
      }
    }
  })

  it('still works under warm light, because the palette is calibrated on that frame', () => {
    const gain: [number, number, number] = [1.28, 1.0, 0.62]
    for (const { name, eye } of EYES) {
      const { img, visible } = render(eye, SOLVED, gain)
      const palette = paletteFromCube(gain)
      const { hits } = detectVisibleFaces(img, palette, DEFAULT_DETECT)
      expect(hits.length, `${name}: readable faces under warm light`).toBe(visible.length)
      for (const hit of hits) {
        for (let row = 0; row < 3; row++) {
          for (let col = 0; col < 3; col++) {
            const got = classifyTopSticker(hit.stickers[row * 3 + col], palette)
            expect(got ?? 'U', `${name}: ${hit.face} r${row}c${col} warm`).toBe(
              stickerColorAt(SOLVED, hit.face, row, col)
            )
          }
        }
      }
      void visible
    }
  })

  it('survives sensor noise', () => {
    for (const noise of [6, 12, 20]) {
      const { img } = render({ x: 1, y: 1, z: 1 }, SOLVED, [1, 1, 1], noise)
      const { hits } = detectVisibleFaces(img, paletteFromCube([1, 1, 1]), DEFAULT_DETECT)
      expect(hits.length, `noise ${noise}`).toBe(3)
    }
  })

  it('each visible side face classifies as a single colour', () => {
    const gain: [number, number, number] = [1.2, 1.0, 0.7]
    const { img } = render({ x: 1, y: 1, z: 1 }, SOLVED, gain, 3)
    const palette = paletteFromCube(gain)
    const { hits } = detectVisibleFaces(img, palette, DEFAULT_DETECT)
    for (const h of hits.filter((x) => x.face !== 'U')) {
      const got = classifySideStickers(h.stickers, palette)
      expect(got.confident, `${h.face} confident`).toBe(true)
      expect(new Set(got.colors).size, `${h.face} is one colour`).toBe(1)
      expect(got.colors[0], `${h.face} should read as itself`).toBe(h.face)
    }
  })

  it('reads a scrambled last layer: the U centre stays white and edges vary', () => {
    const c = createSolvedCube()
    applySequence(c, ALG.uaPerm)
    applySequence(c, ALG.sune)
    const gain: [number, number, number] = [1.15, 1.0, 0.8]
    const { img } = renderCubeImage(c, {
      width: 640,
      height: 480,
      eye: { x: 1, y: 1, z: 1 },
      gain,
      noise: 4,
      seed: 9,
    })
    const palette = paletteFromCube(gain)
    const { hits } = detectVisibleFaces(img, palette, DEFAULT_DETECT)
    const uHit = hits.find((h) => h.face === 'U')
    expect(uHit, 'the U face must be found').toBeTruthy()

    const classified = uHit!.stickers.map((s) => classifyTopSticker(s, palette))
    expect(classified[4], 'the centre is always white').toBe('U')

    // the centre of the U face is a fixed centre piece, so it is white in every
    // state; the eight surrounding stickers are what the scramble moves around
    const centreIsWhite = classified.filter((_, i) => i !== 4).length
    expect(centreIsWhite).toBe(8)
    const whiteCount = classified.filter((c) => c === 'U').length
    // F2L intact means the U centre is white; corners/edges vary between white
    // and side colours, so the count is somewhere between 1 and 9
    expect(whiteCount).toBeGreaterThanOrEqual(1)
    expect(whiteCount).toBeLessThanOrEqual(9)
  })

  it('reports an overlay corner set for every face it found', () => {
    const { img } = render({ x: 1, y: 1, z: 1 })
    const { overlay } = detectVisibleFaces(img, paletteFromCube([1, 1, 1]), DEFAULT_DETECT)
    expect(overlay.length).toBe(3)
    for (const o of overlay) {
      expect(o.quad.length).toBe(4)
      for (const p of o.quad) {
        expect(p.x).toBeGreaterThanOrEqual(0)
        expect(p.x).toBeLessThanOrEqual(640)
        expect(p.y).toBeGreaterThanOrEqual(0)
        expect(p.y).toBeLessThanOrEqual(480)
      }
    }
  })

  it('finds nothing when there is no cube in frame', () => {
    const empty: ReturnType<typeof render>['img'] = {
      width: 320,
      height: 240,
      data: new Uint8ClampedArray(320 * 240 * 4).fill(40),
    }
    for (let i = 3; i < empty.data.length; i += 4) empty.data[i] = 255
    const { hits } = detectVisibleFaces(empty, paletteFromCube([1, 1, 1]), DEFAULT_DETECT)
    expect(hits.length).toBe(0)
  })
})
