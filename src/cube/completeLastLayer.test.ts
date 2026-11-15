import { expect, it } from 'vitest'
import { applySequence, createSolvedCube, isSolved } from './model'
import { CROSS_FORMULA } from './cross'
import { lastLayerCoverage, solveCompleteLastLayer } from './completeLastLayer'

it('indexes every legal last-layer arrangement and solves flipped edges', () => {
  expect(lastLayerCoverage()).toBe(24 * 24 / 2 * 27 * 8)
  const cube = createSolvedCube()
  applySequence(cube, CROSS_FORMULA)
  const result = solveCompleteLastLayer(cube)
  expect(result.failure).toBeUndefined()
  for (const { seq } of result.steps) applySequence(cube, seq)
  expect(isSolved(cube)).toBe(true)
})
