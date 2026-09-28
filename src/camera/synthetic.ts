import { createSolvedCube, applySequence, type Cube, type Color } from '../cube/model'
import { FACE_COLORS } from '../cube/model'
import type { Rgb } from './classify'
import type { RGBImage } from './detect'

/**
 * A software cube renderer, used only by the tests.
 *
 * Its job is to produce camera-like frames whose correct answer is already
 * known: for every visible sticker it knows exactly which colour belongs there.
 * Real photos cannot be used for this, because nobody knows the ground truth for
 * a photo of someone's cube.
 */

type V3 = { x: number; y: number; z: number }

const FACE_NORMAL: Record<Color, V3> = {
  U: { x: 0, y: 1, z: 0 },
  D: { x: 0, y: -1, z: 0 },
  F: { x: 0, y: 0, z: 1 },
  B: { x: 0, y: 0, z: -1 },
  R: { x: 1, y: 0, z: 0 },
  L: { x: -1, y: 0, z: 0 },
}

/** In-face axes chosen so that u x v equals the outward normal. */
const FACE_BASIS: Record<Color, { u: V3; v: V3 }> = {
  U: { u: { x: 1, y: 0, z: 0 }, v: { x: 0, y: 0, z: -1 } },
  F: { u: { x: -1, y: 0, z: 0 }, v: { x: 0, y: -1, z: 0 } },
  R: { u: { x: 0, y: 0, z: 1 }, v: { x: 0, y: -1, z: 0 } },
  B: { u: { x: 1, y: 0, z: 0 }, v: { x: 0, y: -1, z: 0 } },
  L: { u: { x: 0, y: 0, z: -1 }, v: { x: 0, y: -1, z: 0 } },
  D: { u: { x: 1, y: 0, z: 0 }, v: { x: 0, y: 0, z: 1 } },
}

/**
 * Cube-space position at a fractional grid coordinate on a face.
 *
 * The grid runs 0..3, so sticker (row, col) spans [row, row+1] and is centred
 * at (row + 0.5, col + 0.5). The model stores cubie positions, which sit at -1,
 * 0 and +1, so a cubie row is three units wide and the outer surface of the
 * face is half a unit beyond the outer cubie centre: the face plane is at 1.5.
 */
export function gridPoint(face: Color, gr: number, gc: number): V3 {
  const n = FACE_NORMAL[face]
  const { u, v } = FACE_BASIS[face]
  const a = gc - 1.5
  const b = gr - 1.5
  return {
    x: n.x * 1.5 + u.x * a + v.x * b,
    y: n.y * 1.5 + u.y * a + v.y * b,
    z: n.z * 1.5 + u.z * a + v.z * b,
  }
}

/** Cube-space position of the cubie holding the sticker at (face, row, col). */
function stickerPos(face: Color, row: number, col: number): V3 {
  const n = FACE_NORMAL[face]
  const { u, v } = FACE_BASIS[face]
  const a = col - 1
  const b = row - 1
  return {
    x: n.x + u.x * a + v.x * b,
    y: n.y + u.y * a + v.y * b,
    z: n.z + u.z * a + v.z * b,
  }
}

/** Colour of the sticker at (face, row, col) in a given cube state. */
export function stickerColorAt(cube: Cube, face: Color, row: number, col: number): Color {
  // The sticker on this face of that cubie, found by matching the outward normal.
  const p = stickerPos(face, row, col)
  const idx = (p.x + 1) + 3 * (p.y + 1) + 9 * (p.z + 1)
  const want = FACE_NORMAL[face]
  for (const st of cube[idx]) {
    if (st.dir.x === want.x && st.dir.y === want.y && st.dir.z === want.z) return st.color
  }
  return face
}

const scale = (a: V3, k: number): V3 => ({ x: a.x * k, y: a.y * k, z: a.z * k })
const dot = (a: V3, b: V3): number => a.x * b.x + a.y * b.y + a.z * b.z
const norm = (a: V3): V3 => {
  const l = Math.hypot(a.x, a.y, a.z) || 1
  return { x: a.x / l, y: a.y / l, z: a.z / l }
}
const cross = (a: V3, b: V3): V3 => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x,
})

export function hexToRgb(hex: string): Rgb {
  const h = hex.replace('#', '')
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  }
}

export type RenderOptions = {
  width: number
  height: number
  /** unit direction from the cube toward the camera */
  eye: V3
  background?: Rgb
  /** simulate a light with these per-channel gains */
  gain?: [number, number, number]
  noise?: number
  seed?: number
}

function rand(seed: number) {
  let s = seed
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff
    return s / 0x7fffffff
  }
}

/**
 * Render the three faces that face the camera. Visible faces of a cube never
 * overlap in projection, so no depth sorting is needed.
 */
export function renderCubeImage(cube: Cube, opts: RenderOptions): { img: RGBImage; visible: Color[] } {
  const { width, height } = opts
  const data = new Uint8ClampedArray(width * height * 4)
  const bg = opts.background ?? { r: 30, g: 32, b: 38 }
  const gain = opts.gain ?? [1, 1, 1]
  const noise = opts.noise ?? 0
  const rnd = rand(opts.seed ?? 1)
  const jit = () => (rnd() - 0.5) * noise * 2

  for (let i = 0; i < width * height; i++) {
    data[i * 4] = Math.max(0, Math.min(255, bg.r + jit()))
    data[i * 4 + 1] = Math.max(0, Math.min(255, bg.g + jit()))
    data[i * 4 + 2] = Math.max(0, Math.min(255, bg.b + jit()))
    data[i * 4 + 3] = 255
  }

  const eyeDir = norm(opts.eye)
  // Only faces turned far enough towards the camera are counted as visible.
  // A face seen at a grazing angle is squashed to a few pixels, and neither a
  // person nor the detector can read its stickers, so treating it as visible
  // would just produce a lie the tests then have to work around.
  const visible = (['U', 'D', 'F', 'B', 'R', 'L'] as Color[]).filter(
    (f) => dot(FACE_NORMAL[f], eyeDir) > 0.35
  )

  // camera basis
  const forward = scale(eyeDir, -1)
  const right = norm(cross(forward, { x: 0, y: 1, z: 0 }))
  const up = cross(right, forward)
  const dist = 7
  const focal = Math.min(width, height) * 1.05

  const project = (p: V3): { x: number; y: number } => {
    // camera sits at eyeDir * dist, so the vector from the camera to the point
    const rel = {
      x: p.x - eyeDir.x * dist,
      y: p.y - eyeDir.y * dist,
      z: p.z - eyeDir.z * dist,
    }
    const z = dot(rel, forward)
    const f = focal / Math.max(0.001, z)
    return {
      x: width / 2 + dot(rel, right) * f,
      y: height / 2 - dot(rel, up) * f,
    }
  }

  const put = (x: number, y: number, rgb: Rgb) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return
    const i = (y * width + x) * 4
    data[i] = Math.max(0, Math.min(255, rgb.r * gain[0] + jit()))
    data[i + 1] = Math.max(0, Math.min(255, rgb.g * gain[1] + jit()))
    data[i + 2] = Math.max(0, Math.min(255, rgb.b * gain[2] + jit()))
  }

  const fillQuad = (q: { x: number; y: number }[], rgb: Rgb) => {
    const xs = q.map((p) => p.x)
    const ys = q.map((p) => p.y)
    const x0 = Math.max(0, Math.floor(Math.min(...xs)))
    const x1 = Math.min(width - 1, Math.ceil(Math.max(...xs)))
    const y0 = Math.max(0, Math.floor(Math.min(...ys)))
    const y1 = Math.min(height - 1, Math.ceil(Math.max(...ys)))
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const p = { x: x + 0.5, y: y + 0.5 }
        if (pointInQuad(p, q)) put(x, y, rgb)
      }
    }
  }

  for (const face of visible) {
    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 3; col++) {
        const q = [
          project(gridPoint(face, row, col)),
          project(gridPoint(face, row, col + 1)),
          project(gridPoint(face, row + 1, col + 1)),
          project(gridPoint(face, row + 1, col)),
        ]
        const color = stickerColorAt(cube, face, row, col)
        fillQuad(q, hexToRgb(FACE_COLORS[color]))
      }
    }
  }

  return { img: { width, height, data }, visible }
}

function pointInQuad(p: { x: number; y: number }, q: { x: number; y: number }[]): boolean {
  let inside = false
  for (let i = 0, j = q.length - 1; i < q.length; j = i++) {
    const a = q[i]
    const b = q[j]
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) {
      inside = !inside
    }
  }
  return inside
}

/** Scramble helper so tests can produce interesting states. */
export function scrambled(sequence: string): Cube {
  const c = createSolvedCube()
  applySequence(c, sequence)
  return c
}
