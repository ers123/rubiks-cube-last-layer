import {
  applySequence,
  cloneCube,
  createSolvedCube,
  colorAt,
  slotIndex,
  U_CORNERS,
  U_EDGES,
  U_DIR,
  type Cube,
  type Slot,
} from './model'

/**
 * Last-layer (OLL + PLL) solver.
 *
 * Design constraint: the user must only ever have to remember a small set of
 * algorithms. So we do NOT emit a solver-optimal sequence. We search, over a
 * deliberately tiny alphabet, for the shortest sequence that solves the layer,
 * and only ever return a solution that has been re-simulated and verified.
 *
 * The search is split into the two phases a beginner already knows:
 *   1. OLL - get all four U corners pointing up.   alphabet: U turns + Sune family
 *   2. PLL - permute the rest.                    alphabet: U turns + perm algs
 */

/**
 * The entire algorithm set. Four moves, all verified by tests to leave the
 * bottom two layers untouched:
 *   Sune / Anti-Sune  orient the last-layer corners
 *   Niklas            3-cycles the last-layer corners, leaves edges alone
 *   Ua                3-cycles the last-layer edges, leaves corners alone
 * Together with U turns these reach every one of the 288 PLL cases.
 */
export const ALG = {
  sune: "R U R' U R U2 R'",
  antiSune: "R U2 R' U' R U' R'",
  niklas: "U R U' L' U R' U' L",
  uaPerm: "F2 U L R' F2 L' R U F2",
} as const

/** Every algorithm the app is allowed to emit. Used to keep the UI honest. */
export const ALG_NAMES = Object.keys(ALG) as (keyof typeof ALG)[]

export type StepKind = 'setup' | 'alg'

export type SolveStep = {
  /** move sequence to apply */
  seq: string
  /** Korean label for this step */
  label: string
  /** label without the repeat count, used when merging consecutive repeats */
  baseLabel: string
  kind: StepKind
  /** how many times to repeat; 1 unless a longer loop was needed */
  reps: number
  /** phase this step belongs to, for UI grouping */
  phase: 'oll' | 'pll'
  /** slots to visually highlight while this step is running */
  focus: Slot[]
}

export type Solution = {
  steps: SolveStep[]
  alreadySolved: boolean
  /** short Korean description of the case, for flavour text */
  caseName: string
  /** set when the solver could not produce a verified solution */
  failure?: string
  /** every reason the input looks wrong, when there is more than one */
  problems?: string[]
}

type FaceName = 'U' | 'R' | 'F' | 'D' | 'L' | 'B'

const FACE_VEC: Record<FaceName, { x: number; y: number; z: number }> = {
  U: { x: 0, y: 1, z: 0 },
  R: { x: 1, y: 0, z: 0 },
  F: { x: 0, y: 0, z: 1 },
  D: { x: 0, y: -1, z: 0 },
  L: { x: -1, y: 0, z: 0 },
  B: { x: 0, y: 0, z: -1 },
}
const SIDE_FACES = ['R', 'F', 'L', 'B'] as const

// --- state inspection ---------------------------------------------------

export function isLastLayerSolved(cube: Cube): boolean {
  for (const s of [...U_CORNERS, ...U_EDGES]) {
    if (colorAt(cube, s, U_DIR) !== 'U') return false
  }
  for (const s of [...U_CORNERS, ...U_EDGES]) {
    for (const f of SIDE_FACES) {
      const col = colorAt(cube, s, FACE_VEC[f])
      if (col !== null && col !== f) return false
    }
  }
  return true
}

export function areCornersOriented(cube: Cube): boolean {
  return U_CORNERS.every((s) => colorAt(cube, s, U_DIR) === 'U')
}

export function areEdgesOriented(cube: Cube): boolean {
  return U_EDGES.every((s) => colorAt(cube, s, U_DIR) === 'U')
}

/**
 * Identity of the cubie in `slot`: its colours with the U sticker removed.
 *
 * This must read the slot's stickers directly rather than probing the four side
 * directions, because a twisted corner puts one of its non-U stickers on top
 * and would otherwise be unidentifiable.
 */
function cubieKey(cube: Cube, slot: Slot): string {
  const cols = cube[slotIndex(slot)]
    .map((s) => s.color)
    .filter((c) => c !== 'U')
    .sort()
    .join('')
  return cols
}

const reference = createSolvedCube()
const CORNER_HOMES = U_CORNERS.map((s) => cubieKey(reference, s))
const EDGE_HOMES = U_EDGES.map((s) => cubieKey(reference, s))

/** Where each U piece belongs, as a slot index. */
export function homesOf(cube: Cube): { corners: number[]; edges: number[] } {
  return {
    corners: U_CORNERS.map((s) => CORNER_HOMES.indexOf(cubieKey(cube, s))),
    edges: U_EDGES.map((s) => EDGE_HOMES.indexOf(cubieKey(cube, s))),
  }
}

/**
 * Check that a cube is in a state this app can actually reason about: the
 * bottom two layers solved, and the last layer holding its own four corners and
 * four edges.
 *
 * Manual sticker entry can easily produce a state no real cube could be in (a
 * corner with no U sticker at all, say). Detecting that up front turns a
 * mysterious "no solution" into something the user can act on.
 */
export function validateLastLayer(cube: Cube): string[] {
  const problems: string[] = []
  const { corners, edges } = homesOf(cube)

  if (colorAt(cube, { x: 0, y: 1, z: 0 }, U_DIR) !== 'U') {
    problems.push('위쪽 면 가운데 스티커는 항상 흰색(U)이어야 합니다.')
  }
  if (corners.some((c) => c < 0)) {
    problems.push('어떤 코너에 흰색 스티커가 없습니다. 코너에는 흰색이 하나씩 있어야 합니다.')
  }
  if (corners.filter((c) => c >= 0).length < 4) {
    problems.push('흰색 코너가 4개보다 적습니다.')
  }
  if (new Set(corners.filter((c) => c >= 0)).size !== 4) {
    problems.push('같은 코너가 두 번씩 들어가 있습니다. 각 코너는 하나씩만 있어야 합니다.')
  }
  if (edges.some((e) => e < 0)) {
    problems.push('어떤 에지에 흰색 스티커가 없습니다.')
  }
  if (new Set(edges.filter((e) => e >= 0)).size !== 4) {
    problems.push('같은 에지가 두 번씩 들어가 있습니다. 각 에지는 하나씩만 있어야 합니다.')
  }
  return problems
}

// --- search -------------------------------------------------------------

type Move = { seq: string; label: string; kind: StepKind }

const U_TURNS: Move[] = [
  { seq: 'U', label: 'U', kind: 'setup' },
  { seq: "U'", label: "U'", kind: 'setup' },
  { seq: 'U2', label: 'U2', kind: 'setup' },
]

/**
 * The whole alphabet. Splitting the search into an OLL phase and a PLL phase
 * turned out to be fragile: the corner permutation algorithm twists the
 * corners, so the two phases chase each other. One breadth-first pass over the
 * complete state is both simpler and provably complete, and the reachable state
 * count stays in the low thousands so it costs a few milliseconds.
 */
const ALPHABET: Move[] = [
  ...U_TURNS,
  { seq: ALG.sune, label: 'Sune', kind: 'alg' },
  { seq: ALG.antiSune, label: 'Anti-Sune', kind: 'alg' },
  { seq: ALG.uaPerm, label: 'Ua', kind: 'alg' },
  { seq: ALG.niklas, label: 'Niklas', kind: 'alg' },
]

const MAX_DEPTH = 8

/**
 * Breadth-first search with a visited set. The state spaces are tiny (OLL has
 * at most 27 reachable orientation patterns, PLL exactly 288), so the visited
 * set bounds the work no matter how deep we allow the search to go.
 */
function bfs(
  start: Cube,
  isGoal: (c: Cube) => boolean,
  keyOf: (c: Cube) => string,
  alphabet: Move[],
  maxDepth: number
): Move[] | null {
  if (isGoal(start)) return []
  const seen = new Set<string>([keyOf(start)])
  let frontier: { cube: Cube; path: Move[] }[] = [{ cube: cloneCube(start), path: [] }]

  for (let d = 0; d < maxDepth; d++) {
    const next: { cube: Cube; path: Move[] }[] = []
    for (const node of frontier) {
      for (const mv of alphabet) {
        const c = cloneCube(node.cube)
        applySequence(c, mv.seq)
        const k = keyOf(c)
        if (seen.has(k)) continue
        seen.add(k)
        const path = [...node.path, mv]
        if (isGoal(c)) return path
        next.push({ cube: c, path })
      }
    }
    if (next.length === 0) break
    frontier = next
  }
  return null
}

/**
 * Complete last-layer state: which cubie is in each U slot, whether the corners
 * are twisted and whether the edges are flipped. Nothing about the last layer
 * is left out, so two states share a key only if they are genuinely identical.
 */
function stateKey(cube: Cube): string {
  const { corners, edges } = homesOf(cube)
  const twist = U_CORNERS.map((s) => (colorAt(cube, s, U_DIR) === 'U' ? '0' : '1')).join('')
  const flip = U_EDGES.map((s) => (colorAt(cube, s, U_DIR) === 'U' ? '0' : '1')).join('')
  return `${corners.join('')}|${edges.join('')}|${twist}|${flip}`
}

// --- labelling ----------------------------------------------------------

function caseNameOf(cube: Cube): string {
  if (isLastLayerSolved(cube)) return '이미 완성'
  const oriented = areCornersOriented(cube)
  const { corners, edges } = homesOf(cube)
  const cornerSolved = corners.every((v, i) => v === i)
  const edgeSolved = edges.every((v, i) => v === i)
  if (!oriented) return '코너 방향이 틀려 있어요'
  if (cornerSolved && !edgeSolved) return '코너는 다 맞아요, 에지만 틀려요'
  if (!cornerSolved && edgeSolved) return '에지는 다 맞아요, 코너만 틀려요'
  if (corners.every((v, i) => v === (i + 1) % 4) || corners.every((v, i) => v === (i + 3) % 4)) {
    return '코너는 한 바퀴 돌아 있어요'
  }
  return '코너와 에지 위치가 다 뒤섞여 있어요'
}

function toSteps(path: Move[], startWasOriented: boolean): SolveStep[] {
  const steps: SolveStep[] = []
  for (const mv of path) {
    const last = steps[steps.length - 1]
    if (last && last.seq === mv.seq && last.kind === 'alg') {
      last.reps += 1
      last.label = `${last.baseLabel} ×${last.reps}`
      continue
    }
    steps.push({
      seq: mv.seq,
      label: mv.kind === 'setup' ? `${mv.label} 돌리기` : mv.label,
      baseLabel: mv.label,
      kind: mv.kind,
      reps: 1,
      phase: startWasOriented ? 'pll' : 'oll',
      focus: mv.kind === 'setup' ? [] : [...U_CORNERS, ...U_EDGES],
    })
  }
  return steps
}

// --- public API ---------------------------------------------------------

export function solveLastLayer(input: Cube): Solution {
  if (isLastLayerSolved(input)) {
    return { steps: [], alreadySolved: true, caseName: '마지막 층 완성' }
  }

  const problems = validateLastLayer(input)
  if (problems.length > 0) {
    return {
      steps: [],
      alreadySolved: false,
      caseName: '입력 확인 필요',
      failure: problems[0],
      problems,
    }
  }

  const path = bfs(input, isLastLayerSolved, stateKey, ALPHABET, MAX_DEPTH)

  if (path === null) {
    return { steps: [], alreadySolved: false, caseName: '해답 없음', failure: '탐색 실패' }
  }

  const steps = toSteps(path, areCornersOriented(input))

  // Label each step OLL or PLL by replaying: a step belongs to OLL until the
  // corners are all pointing up, and to PLL from then on.
  {
    const replay = cloneCube(input)
    let cornersDone = areCornersOriented(replay)
    for (const step of steps) {
      if (!cornersDone) step.phase = 'oll'
      else step.phase = 'pll'
      for (let r = 0; r < step.reps; r++) applySequence(replay, step.seq)
      cornersDone = areCornersOriented(replay)
    }
    if (cornersDone) for (const step of steps) step.phase = 'pll'
  }

  // Never hand back an unverified solution.
  const check = cloneCube(input)
  for (const s of steps) for (let i = 0; i < s.reps; i++) applySequence(check, s.seq)
  if (!isLastLayerSolved(check)) {
    return { steps: [], alreadySolved: false, caseName: '해답 없음', failure: '시뮬레이션 검증 실패' }
  }

  return { steps, alreadySolved: false, caseName: caseNameOf(input) }
}

/** Flat move sequence, used by the tests. */
export function solveLastLayerSequence(input: Cube): string | null {
  const sol = solveLastLayer(input)
  if (sol.steps.length === 0) return null
  const out: string[] = []
  for (const s of sol.steps) for (let i = 0; i < s.reps; i++) out.push(s.seq)
  return out.join(' ')
}
