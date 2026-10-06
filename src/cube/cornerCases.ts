import { createSolvedCube, cloneCube, applySequence, type Cube } from './model'
import { solveLastLayer, isLastLayerSolved, homesOf, areEdgesOriented, validateLastLayer, stateKey, caseNameOf } from './solver'
import { netOf, SIDE_FACES, type Net, type CaseNet } from './cases'

/**
 * The corner stage, taken from the solver's own state space.
 *
 * The bottom two layers are assumed finished and so are the top edges once the
 * cross is in place, which leaves only the corners to be turned: 143 states.
 *
 * Every state here is reached by running real moves from the finished cube and
 * is kept only if `validateLastLayer` accepts it, so none of them can be
 * fabricated. Earlier attempts built these by moving stickers around by hand and
 * got it wrong repeatedly — sticker order differs between slots, moving a piece
 * between positions is a rotation rather than a translation, and a permutation
 * is a set of swaps, so writing into a slot a later move still reads from
 * corrupts the result.
 *
 * The search converges on its own. Only states that are still valid last layers
 * enter the queue, so it walks the last layer rather than wandering through
 * broken cubes, and it stops when nothing new is reachable. The count is
 * therefore a result, not a target: it was measured at 143 and pinned in a test.
 */

const GENERATORS = [
  'U',
  "U'",
  'U2',
  "R U R' U R U2 R'",
  "R U2 R' U' R U' R'",
  "F R U R' U' F'",
  "R U R' U' R' F R2 U' R' U' R U R' F'",
  "U R U' L' U R' U' L",
]

/** Every corner-stage state, folded so that turning the cube does not duplicate one. */
function walk(): Cube[] {
  const seen = new Map<string, Cube>()
  const start = createSolvedCube()
  seen.set(stateKey(start), start)
  const ready = (c: Cube) => {
    const { edges } = homesOf(c)
    return edges.every((v, i) => v === i) && areEdgesOriented(c) && !isLastLayerSolved(c)
  }
  let frontier: Cube[] = [start]
  const collected: Cube[] = []
  while (frontier.length) {
    const next: Cube[] = []
    for (const c of frontier) {
      for (const g of GENERATORS) {
        const n = cloneCube(c)
        applySequence(n, g)
        if (validateLastLayer(n).length > 0) continue
        const k = stateKey(n)
        if (seen.has(k)) continue
        seen.set(k, n)
        next.push(n)
      }
    }
    // Collect from the full visited set rather than the frontier, so a case is
    // never missed just because it was first seen on an earlier round.
    if (!collected.length) {
      for (const c of seen.values()) if (ready(c)) collected.push(c)
    } else {
      const before = collected.length
      for (const c of seen.values()) if (ready(c) && !collected.includes(c)) collected.push(c)
      if (collected.length === before && next.length === 0) break
    }
    frontier = next
  }
  return collected
}

/** The same case seen after a quarter turn of the top. */
function orbitOf(c: Cube): string[] {
  const keys: string[] = []
  let cur = c
  for (let r = 0; r < 4; r++) {
    keys.push(stateKey(cur))
    const n = cloneCube(cur)
    applySequence(n, 'U')
    cur = n
  }
  return keys
}

let cache: CaseNet[] | null = null

export function buildCornerCases(): CaseNet[] {
  if (cache) return cache
  const seen = new Set<string>()
  const out: CaseNet[] = []
  for (const cube of walk()) {
    const orbit = orbitOf(cube)
    if (orbit.some((k) => seen.has(k))) continue
    for (const k of orbit) seen.add(k)
    const net: Net = netOf(cube)
    const solution = solveLastLayer(cube)
    if (solution.failure) continue
    out.push({
      ...net,
      id: `corners-${out.length}`,
      label: `코너 ${out.length + 1}`,
      summary: cornerSummary(cube),
      cornersHome: cornerCount(net),
      edgesHome: SIDE_FACES.filter((f, i) => net.sideRows[i].colors[1] === f).length,
      topAllWhite: net.uFace.every((c) => c === 'U'),
      solution,
    })
  }
  cache = out
  return out
}

/** How many top corners sit in their own place, a twisted one counting as wrong. */
export function cornerCount(n: Net): number {
  const row = (f: string) => n.sideRows[SIDE_FACES.indexOf(f as never)].colors
  const spots: [number, string, number][] = [
    [0, 'F', 0],
    [2, 'F', 2],
    [8, 'B', 2],
    [6, 'B', 0],
  ]
  return spots.filter(([top, face, i]) => n.uFace[top] === row(face)[i]).length
}

function cornerSummary(cube: Cube): string {
  const n = netOf(cube)
  const home = cornerCount(n)
  return home === 4 ? '모서리는 다 맞아요, 엣지만 뒤섞였어요' : `모서리 ${home}개가 제자리, 나머지는 뒤틀림`
}

/** Kept for callers that only want the reason a cube is in the state it is in. */
export { caseNameOf }
