export type Face = 'U' | 'R' | 'F' | 'D' | 'L' | 'B'
export type Color = 'U' | 'R' | 'F' | 'D' | 'L' | 'B'

export type Vec3 = { x: number; y: number; z: number }

/** A cubie slot address: x,y,z each in -1,0,1. Center slots have 0s. */
export type Slot = Vec3

export type Sticker = {
  /** face direction this sticker points, as a unit vector */
  dir: Vec3
  color: Color
}

/** 27 slots; each holds 0..3 stickers. Index = (x+1) + 3*(y+1) + 9*(z+1) */
export type Cube = Sticker[][]

export const slotIndex = (s: Slot): number => s.x + 1 + 3 * (s.y + 1) + 9 * (s.z + 1)

export const slotFromIndex = (i: number): Slot => ({
  x: (i % 3) - 1,
  y: (Math.floor(i / 3) % 3) - 1,
  z: Math.floor(i / 9) - 1,
})

export const key = (s: Slot): string => `${s.x},${s.y},${s.z}`

const eq = (a: Vec3, b: Vec3): boolean => a.x === b.x && a.y === b.y && a.z === b.z

/**
 * Rotation by +90 degrees about the POSITIVE axis, right-hand rule.
 *   about +X: y -> z
 *   about +Y: z -> x
 *   about +Z: x -> y
 */
function rotPos(v: Vec3, axis: 'x' | 'y' | 'z'): Vec3 {
  const { x, y, z } = v
  if (axis === 'x') return { x, y: -z, z: y }
  if (axis === 'y') return { x: z, y, z: -x }
  return { x: -y, y: x, z }
}

const rotPosInv = (v: Vec3, axis: 'x' | 'y' | 'z'): Vec3 => rotPos(rotPos(rotPos(v, axis), axis), axis)

/** Rotation function bound to a specific axis, so callers cannot forget to pass it. */
const rotAbout =
  (dir: 1 | -1, axis: 'x' | 'y' | 'z') =>
  (v: Vec3): Vec3 =>
    dir === 1 ? rotPos(v, axis) : rotPosInv(v, axis)

const FACE_AXIS: Record<Face, 'x' | 'y' | 'z'> = { R: 'x', L: 'x', U: 'y', D: 'y', F: 'z', B: 'z' }
const FACE_SIGN: Record<Face, number> = { R: 1, L: -1, U: 1, D: -1, F: 1, B: -1 }

export type Move = { face: Face; amount: 1 | 2 | 3 } // 1=CW, 2=180, 3=CCW

/** Apply a move in place to a cube. Direction is always relative to the face, viewed from outside. */
export function applyMove(cube: Cube, move: Move): void {
  const { face, amount } = move
  const axis = FACE_AXIS[face]
  const sign = FACE_SIGN[face]
  // Clockwise as seen from OUTSIDE the face == -90 about the positive axis
  // when the face sits on the positive side, and +90 about the positive axis
  // when the face sits on the negative side.
  const f = rotAbout(sign === 1 ? -1 : 1, axis)
  const steps = amount === 2 ? 2 : amount === 1 ? 1 : 3

  const layerVal = sign
  for (let i = 0; i < 27; i++) {
    const s = slotFromIndex(i)
    const v = axis === 'x' ? s.x : axis === 'y' ? s.y : s.z
    if (v !== layerVal) continue
    for (const st of cube[i]) {
      for (let k = 0; k < steps; k++) st.dir = f(st.dir)
    }
  }

  // permute slots
  const next: Cube = new Array(27)
  for (let i = 0; i < 27; i++) next[i] = []
  for (let i = 0; i < 27; i++) {
    const s = slotFromIndex(i)
    const v = axis === 'x' ? s.x : axis === 'y' ? s.y : s.z
    if (v !== layerVal) {
      next[i] = cube[i]
      continue
    }
    let p = s
    for (let k = 0; k < steps; k++) p = rotateSlot(p, axis, f)
    next[slotIndex(p)] = cube[i]
  }
  for (let i = 0; i < 27; i++) cube[i] = next[i]
}

function rotateSlot(s: Slot, axis: 'x' | 'y' | 'z', f: (v: Vec3) => Vec3): Slot {
  if (axis === 'x') {
    const r = f({ x: 0, y: s.y, z: s.z })
    return { x: s.x, y: r.y, z: r.z }
  }
  if (axis === 'y') {
    const r = f({ x: s.x, y: 0, z: s.z })
    return { x: r.x, y: s.y, z: r.z }
  }
  const r = f({ x: s.x, y: s.y, z: 0 })
  return { x: r.x, y: r.y, z: s.z }
}

export const TOKEN_RE = /^([URFDLB])([2']?)$/

export function parseMoves(str: string): Move[] {
  const tokens = str.trim().split(/\s+/).filter(Boolean)
  return tokens.map((t) => {
    const m = TOKEN_RE.exec(t)
    if (!m) throw new Error(`Bad move: "${t}"`)
    const amount: 1 | 2 | 3 = m[2] === '' ? 1 : m[2] === '2' ? 2 : 3
    return { face: m[1] as Face, amount }
  })
}

export function applySequence(cube: Cube, str: string): void {
  for (const m of parseMoves(str)) applyMove(cube, m)
}

export function moveToString(m: Move): string {
  return m.face + (m.amount === 1 ? '' : m.amount === 2 ? '2' : "'")
}

export function sequenceToString(seq: Move[]): string {
  return seq.map(moveToString).join(' ')
}

export function createSolvedCube(): Cube {
  const cube: Cube = new Array(27)
  const dirFor = (d: Vec3) => d
  for (let i = 0; i < 27; i++) {
    const s = slotFromIndex(i)
    const stickers: Sticker[] = []
    const dirs: Vec3[] = [
      { x: 1, y: 0, z: 0 },
      { x: -1, y: 0, z: 0 },
      { x: 0, y: 1, z: 0 },
      { x: 0, y: -1, z: 0 },
      { x: 0, y: 0, z: 1 },
      { x: 0, y: 0, z: -1 },
    ]
    for (const d of dirs) {
      if (d.x !== 0 && d.x === s.x) stickers.push({ dir: dirFor(d), color: d.x === 1 ? 'R' : 'L' })
      if (d.y !== 0 && d.y === s.y) stickers.push({ dir: dirFor(d), color: d.y === 1 ? 'U' : 'D' })
      if (d.z !== 0 && d.z === s.z) stickers.push({ dir: dirFor(d), color: d.z === 1 ? 'F' : 'B' })
    }
    cube[i] = stickers
  }
  return cube
}

export function cloneCube(cube: Cube): Cube {
  return cube.map((st) => st.map((s) => ({ dir: { ...s.dir }, color: s.color })))
}

/** Color of the sticker facing direction `d` at slot `s`, or null. */
export function colorAt(cube: Cube, s: Slot, d: Vec3): Color | null {
  const found = cube[slotIndex(s)].find((st) => eq(st.dir, d))
  return found ? found.color : null
}

/** Set the color of the sticker at slot `s` facing `d`. */
export function setColorAt(cube: Cube, s: Slot, d: Vec3, color: Color): void {
  const found = cube[slotIndex(s)].find((st) => eq(st.dir, d))
  if (found) found.color = color
}

export const U_DIR: Vec3 = { x: 0, y: 1, z: 0 }
export const R_DIR: Vec3 = { x: 1, y: 0, z: 0 }
export const F_DIR: Vec3 = { x: 0, y: 0, z: 1 }
export const D_DIR: Vec3 = { x: 0, y: -1, z: 0 }
export const L_DIR: Vec3 = { x: -1, y: 0, z: 0 }
export const B_DIR: Vec3 = { x: 0, y: 0, z: -1 }

export const FACE_DIR: Record<Face, Vec3> = { U: U_DIR, R: R_DIR, F: F_DIR, D: D_DIR, L: L_DIR, B: B_DIR }

/** Display colours for each cube face colour. */
export const FACE_COLORS: Record<Color, string> = {
  U: '#f2f2f2',
  R: '#d7263d',
  F: '#2a9d4b',
  D: '#f4c430',
  L: '#f07c1e',
  B: '#2664d8',
}

export const COLOR_FACE_ORDER: Color[] = ['U', 'R', 'F', 'D', 'L', 'B']

/** The 4 U-layer corners, in cycle order. */
export const U_CORNERS: Slot[] = [
  { x: 1, y: 1, z: 1 },
  { x: -1, y: 1, z: 1 },
  { x: -1, y: 1, z: -1 },
  { x: 1, y: 1, z: -1 },
]

/** The 4 U-layer edges, in cycle order. */
export const U_EDGES: Slot[] = [
  { x: 1, y: 1, z: 0 },
  { x: 0, y: 1, z: 1 },
  { x: -1, y: 1, z: 0 },
  { x: 0, y: 1, z: -1 },
]

/** Solved color for a side face sticker at a given slot (its own color). */
export function isUStickerOriented(cube: Cube, s: Slot): boolean {
  return colorAt(cube, s, U_DIR) === 'U'
}

export function isSolved(cube: Cube): boolean {
  for (const f of ['U', 'R', 'F', 'D', 'L', 'B'] as Face[]) {
    const d = FACE_DIR[f]
    const axis = FACE_AXIS[f]
    for (let a = -1; a <= 1; a++) {
      for (let b = -1; b <= 1; b++) {
        const s: Slot =
          axis === 'x' ? { x: d.x, y: a, z: b } : axis === 'y' ? { x: a, y: d.y, z: b } : { x: a, y: b, z: d.z }
        if (colorAt(cube, s, d) !== f) return false
      }
    }
  }
  return true
}
