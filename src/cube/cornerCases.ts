import { createSolvedCube, cloneCube, applySequence, type Cube } from './model'
import { solveLastLayer, isLastLayerSolved, homesOf, areEdgesOriented, validateLastLayer, stateKey, caseNameOf } from './solver'
import { netOf, countCornersHome, SIDE_FACES, type Net, type CaseNet } from './cases'

/**
 * Verified gallery examples with both lower layers solved and all U edges home.
 * The walk uses the solver's search key, which merges the two twist directions,
 * so the gallery count describes its examples rather than every possible state.
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

/** Walk reachable representatives and collect states with all U edges home. */
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
      cornersHome: countCornersHome(net),
      edgesHome: SIDE_FACES.filter((f, i) => net.sideRows[i].colors[1] === f).length,
      topAllWhite: net.uFace.every((c) => c === 'U'),
      solution,
    })
  }
  cache = out
  return out
}

function cornerSummary(cube: Cube): string {
  return `완전히 맞은 코너 ${countCornersHome(netOf(cube))}개`
}

export { countCornersHome as cornerCount } from './cases'

/** Kept for callers that only want the reason a cube is in the state it is in. */
export { caseNameOf }
