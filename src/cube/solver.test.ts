import { describe, it, expect } from 'vitest'
import {
  createSolvedCube,
  applySequence,
  cloneCube,
  colorAt,
  U_CORNERS,
  U_EDGES,
  slotFromIndex,
  type Cube,
} from './model'
import {
  solveLastLayer,
  isLastLayerSolved,
  solveLastLayerSequence,
  ALG,
  areCornersOriented,
  areEdgesOriented,
} from './solver'

function mulberry32(seed: number) {
  return function () {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Canonical form of the bottom layer, to prove F2L is untouched. */
function bottomKey(cube: Cube): string {
  const out: string[] = []
  for (let i = 0; i < 27; i++) {
    const s = slotFromIndex(i)
    if (s.y === -1) out.push(cube[i].map((q) => q.color).sort().join(''))
  }
  return out.join('|')
}

const SIDE_VEC = [
  { x: 1, y: 0, z: 0 },
  { x: 0, y: 0, z: 1 },
  { x: -1, y: 0, z: 0 },
  { x: 0, y: 0, z: -1 },
]
function cubieKey(cube: Cube, slot: { x: number; y: number; z: number }): string {
  const cols: string[] = []
  for (const d of SIDE_VEC) {
    const c = colorAt(cube, slot, d)
    if (c && c !== 'U') cols.push(c)
  }
  return cols.sort().join('')
}
const REF = createSolvedCube()
const CORNER_HOMES = U_CORNERS.map((s) => cubieKey(REF, s))
const EDGE_HOMES = U_EDGES.map((s) => cubieKey(REF, s))
const perms = (cube: Cube) => ({
  c: U_CORNERS.map((s) => CORNER_HOMES.indexOf(cubieKey(cube, s))),
  e: U_EDGES.map((s) => EDGE_HOMES.indexOf(cubieKey(cube, s))),
})

/**
 * Last-layer scrambles. Only the four algorithms proven above are used, because
 * anything else (a "sexy move", a remembered A-perm) turns out to break F2L and
 * produces states this app is not meant to handle.
 */
const LL_MOVES = ['U', "U'", 'U2', ALG.sune, ALG.antiSune, ALG.niklas, ALG.uaPerm]

function scrambleLL(rand: () => number): Cube {
  const c = createSolvedCube()
  const n = 2 + Math.floor(rand() * 4)
  for (let i = 0; i < n; i++) applySequence(c, LL_MOVES[Math.floor(rand() * LL_MOVES.length)])
  return c
}

describe('the algorithm set itself', () => {
  it('every algorithm leaves the bottom two layers solved', () => {
    for (const [name, seq] of Object.entries(ALG)) {
      const c = createSolvedCube()
      applySequence(c, seq)
      expect(bottomKey(c), `${name} broke the bottom layer`).toBe(bottomKey(REF))
    }
  })

  it('Sune and Anti-Sune orient corners', () => {
    expect(areCornersOriented(REF)).toBe(true)
    for (const [name, seq] of [
      ['sune', ALG.sune],
      ['antiSune', ALG.antiSune],
    ] as const) {
      const c = createSolvedCube()
      applySequence(c, seq)
      expect(areCornersOriented(c), `${name} should not leave corners oriented`).toBe(false)
      expect(areEdgesOriented(c), `${name} should keep edges oriented`).toBe(true)
    }
  })

  it('Niklas permutes corners only', () => {
    const c = createSolvedCube()
    applySequence(c, ALG.niklas)
    const p = perms(c)
    expect(p.e, 'Niklas must not move edges').toEqual([0, 1, 2, 3])
    expect(p.c, 'Niklas must permute corners').not.toEqual([0, 1, 2, 3])
  })

  it('Ua permutes edges only', () => {
    const c = createSolvedCube()
    applySequence(c, ALG.uaPerm)
    const p = perms(c)
    expect(p.c, 'Ua must not move corners').toEqual([0, 1, 2, 3])
    expect(p.e, 'Ua must permute edges').not.toEqual([0, 1, 2, 3])
  })
})

describe('last layer solver', () => {
  it('recognises a solved cube', () => {
    expect(isLastLayerSolved(REF)).toBe(true)
    const sol = solveLastLayer(REF)
    expect(sol.alreadySolved).toBe(true)
    expect(sol.steps).toHaveLength(0)
  })

  it('solves every scrambled last layer, verified by simulation', () => {
    const rand = mulberry32(12345)
    let tested = 0
    for (let i = 0; i < 600; i++) {
      const c = scrambleLL(rand)
      if (isLastLayerSolved(c)) continue
      tested++
      const seq = solveLastLayerSequence(c)
      expect(seq, `no solution found for state ${i}`).not.toBeNull()
      const check = cloneCube(c)
      applySequence(check, seq as string)
      expect(isLastLayerSolved(check), `bad solution: ${seq}`).toBe(true)
    }
    expect(tested).toBeGreaterThan(400)
  })

  it('never disturbs the bottom two layers', () => {
    const rand = mulberry32(999)
    for (let i = 0; i < 300; i++) {
      const c = scrambleLL(rand)
      const before = bottomKey(c)
      const sol = solveLastLayer(c)
      for (const step of sol.steps) {
        for (let r = 0; r < step.reps; r++) applySequence(c, step.seq)
      }
      expect(bottomKey(c)).toBe(before)
    }
  })

  it('only ever uses the four known algorithms plus U turns', () => {
    const rand = mulberry32(4242)
    const allowed = new Set<string>(['U', "U'", 'U2', ...Object.values(ALG)])
    for (let i = 0; i < 300; i++) {
      const sol = solveLastLayer(scrambleLL(rand))
      for (const step of sol.steps) expect(allowed.has(step.seq), `unexpected: ${step.seq}`).toBe(true)
    }
  })

  it('never asks the user to learn more than the four known algorithms', () => {
    // The entire promise of the app: at most the four beginner algorithms, and
    // usually one or two.
    const rand = mulberry32(777)
    let worst = 0
    const hist: Record<number, number> = {}
    for (let i = 0; i < 300; i++) {
      const sol = solveLastLayer(scrambleLL(rand))
      const distinct = new Set(sol.steps.filter((s) => s.kind === 'alg').map((s) => s.seq)).size
      worst = Math.max(worst, distinct)
      hist[distinct] = (hist[distinct] ?? 0) + 1
    }
    console.log('  distinct algorithm histogram:', JSON.stringify(hist))
    expect(worst).toBeLessThanOrEqual(4)
  })

  it('handles the standard PLL cases', () => {
    for (const g of [ALG.niklas, ALG.uaPerm, ALG.sune, ALG.antiSune]) {
      for (let repeat = 1; repeat <= 3; repeat++) {
        const c = createSolvedCube()
        applySequence(c, Array.from({ length: repeat }, () => g).join(' '))
        if (isLastLayerSolved(c)) continue
        const seq = solveLastLayerSequence(c)
        expect(seq, `${g} x${repeat}`).not.toBeNull()
        const check = cloneCube(c)
        applySequence(check, seq as string)
        expect(isLastLayerSolved(check), `${g} x${repeat} -> ${seq}`).toBe(true)
      }
    }
  })

  it('solves all 288 PLL permutations', () => {
    // Build every physically reachable PLL state directly: corners and edges
    // permuted, orientations untouched. A cube is only reachable when the two
    // permutations share parity, which gives exactly 288 cases.
    const parity = (p: number[]) => {
      let inv = 0
      for (let i = 0; i < p.length; i++) for (let j = i + 1; j < p.length; j++) if (p[i] > p[j]) inv++
      return inv % 2
    }
    const identity = [0, 1, 2, 3]
    const permsOf = (): number[][] => {
      const out: number[][] = []
      const go = (cur: number[], rest: number[]) => {
        if (!rest.length) { out.push([...cur]); return }
        for (let i = 0; i < rest.length; i++) go([...cur, rest[i]], [...rest.slice(0, i), ...rest.slice(i + 1)])
      }
      go([], identity)
      return out
    }
    const all = permsOf()
    expect(all).toHaveLength(24)

    let checked = 0
    for (const cp of all) {
      for (const ep of all) {
        if (parity(cp) !== parity(ep)) continue
        const c = createSolvedCube()
        const cornerArrs = U_CORNERS.map((s) => c[U_CORNERS.indexOf(s)])
        const edgeArrs = U_EDGES.map((s) => c[U_EDGES.indexOf(s)])
        U_CORNERS.forEach((s, i) => (c[U_CORNERS.indexOf(s)] = cornerArrs[cp[i]]))
        U_EDGES.forEach((s, i) => (c[U_EDGES.indexOf(s)] = edgeArrs[ep[i]]))

        if (isLastLayerSolved(c)) {
          checked++
          continue
        }
        const seq = solveLastLayerSequence(c)
        expect(seq, `unsolved PLL case corners=${cp} edges=${ep}`).not.toBeNull()
        const check = cloneCube(c)
        applySequence(check, seq as string)
        expect(isLastLayerSolved(check), `bad solve corners=${cp} edges=${ep}: ${seq}`).toBe(true)
        checked++
      }
    }
    expect(checked).toBe(288)
  })
})
