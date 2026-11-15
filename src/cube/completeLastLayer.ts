import { CROSS_FORMULA } from './cross'
import { applySequence, cloneCube, createSolvedCube, parseMoves, sequenceToString, slotFromIndex, type Cube, type Sticker } from './model'
import { ALG, isLastLayerSolved, validateLastLayer, type Solution, type SolveStep } from './solver'

const turns = [
  { name: 'U', seq: 'U', kind: 'setup' },
  { name: "U'", seq: "U'", kind: 'setup' },
  { name: 'U2', seq: 'U2', kind: 'setup' },
  { name: 'Sune', seq: ALG.sune, kind: 'alg' },
  { name: 'Anti-Sune', seq: ALG.antiSune, kind: 'alg' },
  { name: 'Niklas', seq: ALG.niklas, kind: 'alg' },
  { name: 'Ua', seq: ALG.uaPerm, kind: 'alg' },
  { name: '윗면 십자', seq: CROSS_FORMULA, kind: 'alg' },
  { name: 'T-Perm', seq: "R U R' U' R' F R2 U' R' U' R U R' F'", kind: 'alg' },
] as const

export const lastLayerFormulas = turns.filter((turn) => turn.kind === 'alg')

function stickers(cube: Cube): Sticker[] {
  return cube.flatMap((piece, i) => {
    const slot = slotFromIndex(i)
    if (slot.y !== 1 || (slot.x === 0 && slot.z === 0)) return []
    return [...piece].sort((a, b) => b.dir.y - a.dir.y || a.dir.x - b.dir.x || a.dir.z - b.dir.z)
  })
}

const pattern = (cube: Cube) => stickers(cube).map(({ color }) => color).join('')
const goal = pattern(createSolvedCube())
type Next = { move: number; next: string }
let solutions: Map<string, Next | null> | undefined

function buildIndex() {
  const predecessors = turns.map(({ seq }) => {
    const cube = createSolvedCube()
    const initial = stickers(cube)
    const inverse = parseMoves(seq).reverse().map(({ face, amount }) => ({
      face, amount: amount === 2 ? 2 as const : amount === 1 ? 3 as const : 1 as const,
    }))
    applySequence(cube, sequenceToString(inverse))
    return stickers(cube).map((sticker) => initial.indexOf(sticker))
  })

  const known = new Map<string, Next | null>([[goal, null]])
  const queue = [goal]
  for (const next of queue) {
    predecessors.forEach((permutation, move) => {
      let previous = ''
      for (const i of permutation) previous += next[i]
      if (!known.has(previous)) {
        known.set(previous, { move, next })
        queue.push(previous)
      }
    })
  }
  return known
}

export function lastLayerCoverage(): number {
  return (solutions ??= buildIndex()).size
}

export function solveCompleteLastLayer(input: Cube): Solution {
  if (isLastLayerSolved(input)) return { alreadySolved: true, steps: [], caseName: '마지막 층 완성' }
  const problems = validateLastLayer(input)
  if (problems.length) return { alreadySolved: false, steps: [], caseName: '입력 확인 필요', failure: problems[0], problems }

  const index = solutions ??= buildIndex()
  let key = pattern(input)
  const steps: SolveStep[] = []
  while (key !== goal) {
    const entry = index.get(key)
    if (!entry) break
    const turn = turns[entry.move]
    steps.push({
      seq: turn.seq, label: turn.name, baseLabel: turn.name, kind: turn.kind,
      reps: 1, phase: 'oll', focus: [],
    })
    key = entry.next
  }

  const check = cloneCube(input)
  for (const { seq } of steps) applySequence(check, seq)
  if (!isLastLayerSolved(check)) {
    return {
      alreadySolved: false, steps: [], caseName: '입력 확인 필요',
      failure: '스티커 색이나 면의 방향을 다시 확인해 주세요.',
      problems: ['입력된 색 배치로는 아래 두 층이 맞은 큐브를 구성할 수 없어요.'],
    }
  }
  return { alreadySolved: false, steps, caseName: '마지막 층' }
}
