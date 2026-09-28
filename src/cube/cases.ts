import { createSolvedCube, type Cube, type Color } from './model'
import { solveLastLayer, isLastLayerSolved, type Solution } from './solver'

/**
 * The last layer's cases, enumerated as pictures.
 *
 * Making someone name twenty-one colours, or count stickers one at a time, is a
 * poor interface. Once the bottom two layers are done and the cross is on the
 * face being solved, the top face is a cross of white with the four corners in
 * whatever state they happen to be in. All that is left is a permutation, and
 * the twenty-one permutations can be shown as pictures rather than described in
 * words: the user looks at their own cube, finds the matching picture, taps it,
 * and gets the answer.
 */

export type Net = {
  uFace: (Color | null)[]
  sideRows: { face: Color; colors: (Color | null)[] }[]
}

export type CaseNet = Net & {
  id: string
  label: string
  summary: string
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
const sideSlot = (face: Color, i: number) => {
  const v = sideVec(face)
  const t = i - 1
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

/** The same state seen after a U turn, so rotations of one case count once. */
function rotateNetU(n: Net): Net {
  const u = n.uFace
  return {
    uFace: [u[2], u[5], u[8], u[1], u[4], u[7], u[0], u[3], u[6]],
    sideRows: n.sideRows.map((row) => ({ face: row.face, colors: [row.colors[2], row.colors[0], row.colors[1]] })),
  }
}

/** A last layer with every corner and edge oriented, but permuted. */
function pllCube(cp: number[], ep: number[]): Cube {
  const c = createSolvedCube()
  const cornerSets = CORNER_SLOTS.map(({ x, z }) =>
    c[uSlot(x, z)].map((st) => ({ dir: st.dir.x, diry: st.dir.y, dirz: st.dir.z, color: st.color }))
  )
  for (let i = 0; i < 4; i++) {
    const from = cornerSets[cp[i]]
    const to = c[uSlot(CORNER_SLOTS[i].x, CORNER_SLOTS[i].z)]
    to.forEach((st, k) => {
      st.color = from[k].color
    })
  }
  const edgeSets = EDGE_SLOTS.map(({ x, z }) =>
    c[uSlot(x, z)].map((st) => ({ dx: st.dir.x, dz: st.dir.z, color: st.color }))
  )
  for (let i = 0; i < 4; i++) {
    const from = edgeSets[ep[i]]
    const to = c[uSlot(EDGE_SLOTS[i].x, EDGE_SLOTS[i].z)]
    to.forEach((st, k) => {
      st.color = from[k].color
    })
  }
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

const NAMES = [
  'A', 'E', 'F', 'G', 'H', 'J', 'N', 'R', 'T', 'Ua', 'Ub',
  'V', 'Y', 'Z', 'a', 'b', 'c', 'e', 'f', 'g', 'h',
]

function describe(n: Net): string {
  const correctCorners = [0, 1, 2, 3].filter((i) => {
    const c = n.uFace[[0, 2, 8, 6][i]]
    return c === n.sideRows[i].colors[i] || c === n.sideRows[i].colors[2 - i]
  }).length
  const correctEdges = [0, 1, 2, 3].filter((i) => n.sideRows[i].colors[1] === n.sideRows[i].face).length
  return `에지 제자리 ${correctEdges}개, 코너 제자리 ${correctCorners}개`
}

/**
 * WORK IN PROGRESS — NOT WIRED INTO THE APP, NOT TRUSTWORTHY YET.
 *
 * The idea is right and the tests above this comment confirmed the useful half:
 * every case it produces really is unsolved, and every solution it produces
 * really does solve its case. But the rotation folding is wrong, so it yields
 * 7 cases where the correct answer is not what it should be. Shipping a gallery
 * that silently drops cases would be worse than shipping nothing, so this is
 * parked until the folding is correct.
 *
 * The concrete bug: `rotateNetU` does not perform a U turn. It rotates the U
 * face and shifts colours sideways within each side row, but a real U turn
 * rotates the U face AND cycles the four side rows AND moves the U edges
 * between faces. Because the fold is too aggressive, unrelated cases collide on
 * the same key and get discarded.
 *
 * The fix is to fold with a real rotation — apply the U move to the cube with
 * `applySequence` and read the net back — instead of hand-rolling the net
 * arithmetic.
 */
export function buildCases(): CaseNet[] {
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
      cases.push({
        ...netOf(cube),
        id: `case-${cases.length}`,
        label: NAMES[cases.length] ?? `케이스 ${cases.length + 1}`,
        summary: describe(netOf(cube)),
        solution,
      })
    }
  }
  return cases
}
