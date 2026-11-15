import { expect, it } from 'vitest'
import { CROSS_COMPLETE, CROSS_FORMULA, crossMask, crossTurn } from './cross'
import { applySequence, createSolvedCube, FACE_DIR, slotFromIndex, slotIndex, U_EDGES } from './model'

it('guides every valid edge pattern to a cross in up to three applications', () => {
  for (let mask = 0; mask <= CROSS_COMPLETE; mask++) {
    const flipped = U_EDGES.filter((_, i) => !(mask & (1 << i)))
    if (flipped.length % 2) {
      expect(crossTurn(mask)).toBeNull()
      continue
    }
    const cube = createSolvedCube()
    for (const slot of flipped) {
      const [a, b] = cube[slotIndex(slot)]
      ;[a.color, b.color] = [b.color, a.color]
    }
    for (let i = 0; i < 3 && crossMask(cube) !== CROSS_COMPLETE; i++) {
      const turn = crossTurn(crossMask(cube))!
      applySequence(cube, turn.setup)
      expect(crossMask(cube)).toBe(turn.aligned)
      applySequence(cube, CROSS_FORMULA)
      expect(crossMask(cube)).toBe(turn.result)
      expect(cube.every((piece, index) => slotFromIndex(index).y === 1 || piece.every(({ color, dir }) =>
        dir.x === FACE_DIR[color].x && dir.y === FACE_DIR[color].y && dir.z === FACE_DIR[color].z,
      ))).toBe(true)
    }
    expect(crossMask(cube)).toBe(CROSS_COMPLETE)
  }
})
