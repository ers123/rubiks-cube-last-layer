import { applySequence, cloneCube, colorAt, createSolvedCube, slotIndex, U_DIR, U_EDGES, type Cube } from './model'

export const CROSS_FORMULA = "F R U R' U' F'"
export const CROSS_COMPLETE = 15

export function crossMask(cube: Cube): number {
  return U_EDGES.reduce((mask, slot, i) => mask | (colorAt(cube, slot, U_DIR) === 'U' ? 1 << i : 0), 0)
}

type CrossTurn = { setup: string; aligned: number; result: number }

export function crossTurn(mask: number): CrossTurn | null {
  const cube = createSolvedCube()
  for (const [i, slot] of U_EDGES.entries()) {
    if (mask & (1 << i)) continue
    const [a, b] = cube[slotIndex(slot)]
    const color = a.color
    a.color = b.color
    b.color = color
  }

  const queue: { cube: Cube; first: CrossTurn | null }[] = [{ cube, first: null }]
  const seen = new Set([mask])
  for (const { cube: current, first } of queue) {
    if (crossMask(current) === CROSS_COMPLETE) return first
    for (const setup of ['', 'U', "U'", 'U2']) {
      const next = cloneCube(current)
      applySequence(next, setup)
      const aligned = crossMask(next)
      applySequence(next, CROSS_FORMULA)
      const result = crossMask(next)
      if (seen.has(result)) continue
      seen.add(result)
      queue.push({ cube: next, first: first ?? { setup, aligned, result } })
    }
  }
  return null
}
