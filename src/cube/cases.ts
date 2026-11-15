import { colorAt, U_CORNERS, U_DIR, createSolvedCube, applySequence, type Cube, type Color } from './model'
import { homesOf, solveLastLayer, isLastLayerSolved, type Solution } from './solver'

/** Last-layer sticker diagrams, with the four side rows viewed from outside. */
export type Net = {
  uFace: (Color | null)[]
  sideRows: { face: Color; colors: (Color | null)[] }[]
}

export type CaseNet = Net & {
  id: string
  label: string
  summary: string
  /** how many of the four top corners are already home, for narrowing by question */
  cornersHome: number
  /** how many of the four side rows are already correct, for narrowing by question */
  edgesHome: number
  /** true when the top face is all one colour, which is the question that starts it */
  topAllWhite: boolean
  solution: Solution
}

export const SIDE_FACES: Color[] = ['F', 'R', 'B', 'L']
export const SIDE_LABEL: Partial<Record<Color, string>> = { F: '앞', R: '오른쪽', B: '뒤', L: '왼쪽' }

const SIDE_VEC: Partial<Record<Color, { x: number; z: number }>> = {
  F: { x: 0, z: 1 },
  R: { x: 1, z: 0 },
  B: { x: 0, z: -1 },
  L: { x: -1, z: 0 },
}

const CORNER_SLOTS = [
  { x: 1, z: 1 },
  { x: -1, z: 1 },
  { x: -1, z: -1 },
  { x: 1, z: -1 },
]
const EDGE_SLOTS = [
  { x: 0, z: 1 },
  { x: 1, z: 0 },
  { x: 0, z: -1 },
  { x: -1, z: 0 },
]

const uSlot = (x: number, z: number) => (x + 1) + 3 * 2 + 9 * (z + 1)
/** Row positions from left to right when facing the side from outside. */
const sideSlot = (face: Color, i: number) => {
  const v = sideVec(face)
  const along = v.x === 1 || v.z === -1 ? [1, 0, -1] : [-1, 0, 1]
  const t = along[i]
  return v.x !== 0 ? v.x + 1 + 3 * 2 + 9 * (t + 1) : t + 1 + 3 * 2 + 9 * (v.z + 1)
}

const sideVec = (f: Color) => {
  const v = SIDE_VEC[f]
  if (!v) throw new Error(`no vector for face ${f}`)
  return v
}

export function netOf(cube: Cube): Net {
  const uFace: (Color | null)[] = []
  for (let z = -1; z <= 1; z++) {
    for (let x = -1; x <= 1; x++) {
      const st = cube[uSlot(x, z)].find((s) => s.dir.y === 1)
      uFace.push(st ? st.color : null)
    }
  }
  const sideRows = SIDE_FACES.map((face) => ({
    face,
    colors: [0, 1, 2].map((i) => {
      const v = sideVec(face)
      const st = cube[sideSlot(face, i)].find((s) => s.dir.x === v.x && s.dir.z === v.z)
      return st ? st.color : null
    }),
  }))
  return { uFace, sideRows }
}

export function netToCube(n: Net): Cube {
  const c = createSolvedCube()
  for (let i = 0; i < 9; i++) {
    const col = n.uFace[i]
    if (!col) continue
    const st = c[uSlot((i % 3) - 1, Math.floor(i / 3) - 1)].find((s) => s.dir.y === 1)
    if (st) st.color = col
  }
  for (const row of n.sideRows) {
    for (let i = 0; i < 3; i++) {
      const col = row.colors[i]
      if (!col) continue
      const v = sideVec(row.face)
      const st = c[sideSlot(row.face, i)].find((s) => s.dir.x === v.x && s.dir.z === v.z)
      if (st) st.color = col
    }
  }
  return c
}

const netKey = (n: Net) => n.uFace.join('') + '|' + n.sideRows.map((r) => r.colors.join('')).join('|')

/**
 * The same case seen after a U turn, so rotations of one case count once.
 *
 * This has to be a real rotation of the cube, not arithmetic on the net: a U
 * turn rotates the U face, cycles the four side rows, and moves the U edges
 * between faces. The earlier hand-rolled version only shifted colours sideways
 * within each row, which folded unrelated cases onto the same key and threw
 * most of the gallery away.
 */
function rotateNetU(n: Net): Net {
  const cube = netToCube(n)
  applySequence(cube, 'U')
  return netOf(cube)
}

/** Rotate a position or direction around the vertical axis, 90° steps. */
function rotY(x: number, z: number, k: number): [number, number] {
  let cx = x
  let cz = z
  for (let i = 0; i < ((k % 4) + 4) % 4; i++) {
    const nx = -cz
    cz = cx
    cx = nx
  }
  return [cx, cz]
}

/** How many quarter turns about the vertical axis take `from` to `to`. */
function stepsTo(from: { x: number; z: number }, to: { x: number; z: number }): number {
  for (let k = 0; k < 4; k++) {
    if (rotY(from.x, from.z, k)[0] === to.x && rotY(from.x, from.z, k)[1] === to.z) return k
  }
  return 0
}

/**
 * A last layer with every corner and edge oriented, but permuted.
 *
 * Two things this has to get right, both of which the first attempt got wrong:
 * a piece moving from one slot to another is a rotation of the cube's top ring,
 * not a translation, so sticker directions have to be rotated too; and the order
 * of stickers inside a slot is not consistent between slots, so copying by array
 * position scatters colours onto the wrong faces.
 */
function pllCube(cp: number[], ep: number[]): Cube {
  const c = createSolvedCube()
  const dirKey = (x: number, y: number, z: number) => `${x},${y},${z}`
  // Read from a snapshot: a permutation is a set of swaps, so writing into a
  // slot that a later move still needs to read from would corrupt the result.
  const snapshot = c.map((slot) => slot.map((st) => ({ x: st.dir.x, y: st.dir.y, z: st.dir.z, color: st.color })))

  const movePiece = (from: { x: number; z: number }, to: { x: number; z: number }) => {
    const k = stepsTo(from, to)
    for (const st of snapshot[uSlot(from.x, from.z)]) {
      const [dx, dz] = rotY(st.x, st.z, k)
      const dst = c[uSlot(to.x, to.z)].find((d) => dirKey(d.dir.x, d.dir.y, d.dir.z) === dirKey(dx, st.y, dz))
      if (dst) dst.color = st.color
    }
  }

  for (let i = 0; i < 4; i++) movePiece(CORNER_SLOTS[cp[i]], CORNER_SLOTS[i])
  for (let i = 0; i < 4; i++) movePiece(EDGE_SLOTS[ep[i]], EDGE_SLOTS[i])
  return c
}

const perm4 = (): number[][] => {
  const out: number[][] = []
  const go = (cur: number[], rest: number[]) => {
    if (!rest.length) {
      out.push([...cur])
      return
    }
    for (let i = 0; i < rest.length; i++) {
      go([...cur, rest[i]], [...rest.slice(0, i), ...rest.slice(i + 1)])
    }
  }
  go([], [0, 1, 2, 3])
  return out
}

const parity = (p: number[]) => {
  let inv = 0
  for (let i = 0; i < p.length; i++) for (let j = i + 1; j < p.length; j++) if (p[i] > p[j]) inv++
  return inv % 2
}

/** How many top corners sit in their own place, a twisted one counting as wrong. */
export function countCornersHome(n: Net): number {
  const cube = netToCube(n)
  return homesOf(cube).corners.filter((home, i) => home === i && colorAt(cube, U_CORNERS[i], U_DIR) === 'U').length
}

function describe(n: Net): string {
  const correctCorners = countCornersHome(n)
  const correctEdges = [0, 1, 2, 3].filter((i) => n.sideRows[i].colors[1] === n.sideRows[i].face).length
  return `에지 제자리 ${correctEdges}개, 코너 제자리 ${correctCorners}개`
}

let cachedCases: CaseNet[] | undefined

/**
 * Every last-layer permutation, folded by rotation, as pictures.
 *
 * The count is 72, not 21. Turning the cube in your hand does not change the
 * problem, so the 288 permutations collapse to 72 once a quarter turn of the top
 * is treated as the same case. The familiar "21 cases" is a further grouping
 * that also merges states which need different algorithm orientations; showing
 * 72 honest pictures beats hiding 51 of them.
 *
 * Every case is checked before it is returned: it has to be genuinely unsolved
 * and its solution has to actually solve it. A gallery with a wrong picture in
 * it is worse than no gallery.
 */
export function buildCases(): CaseNet[] {
  if (cachedCases) return cachedCases
  const seen = new Set<string>()
  const cases: CaseNet[] = []
  const perms = perm4()

  for (const cp of perms) {
    for (const ep of perms) {
      if (parity(cp) !== parity(ep)) continue
      const cube = pllCube(cp, ep)
      if (isLastLayerSolved(cube)) continue
      let net = netOf(cube)
      if (seen.has(netKey(net))) continue
      // fold in the three other rotations of the same case
      for (let r = 0; r < 4; r++) {
        seen.add(netKey(net))
        net = rotateNetU(net)
      }
      const solution = solveLastLayer(cube)
      if (solution.failure) continue
      const shown = netOf(cube)
      cases.push({
        ...shown,
        id: `${cases.length}`,
        label: `케이스 ${cases.length + 1}`,
        summary: describe(shown),
        cornersHome: countCornersHome(shown),
        edgesHome: SIDE_FACES.filter((f, i) => shown.sideRows[i].colors[1] === f).length,
        topAllWhite: shown.uFace.every((c) => c === 'U'),
        solution,
      })
    }
  }
  cachedCases = cases
  return cases
}

/** Return the rotation of each picture that matches the user's actual grip. */
export function pllQuestionMatches(cases: CaseNet[], corners: number, edges: number) {
  return cases.flatMap((c) => {
    const variants = []
    let net: Net = c
    for (let turn = 0; turn < 4; turn++) {
      const edgesHome = net.sideRows.filter((row) => row.colors[1] === row.face).length
      if (edgesHome === edges && countCornersHome(net) === corners) {
        variants.push({ ...net, id: `${c.id}-${turn}`, label: c.label })
      }
      net = rotateNetU(net)
    }
    return variants
  })
}
