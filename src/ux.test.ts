import { it, expect } from 'vitest'
import { createSolvedCube, colorAt, U_DIR, setColorAt, applySequence, type Color } from './cube/model'
import { lastLayerSlots, SIDE_ORDER, SIDE_LABEL } from './ui/StickerInput'
import { solveLastLayer, validateLastLayer, ALG } from './cube/solver'

it('every side group shows the colour that belongs to that face', () => {
  const c = createSolvedCube()
  const SLOTS = lastLayerSlots()
  expect(SLOTS).toHaveLength(21)
  for (const face of SIDE_ORDER) {
    const items = SLOTS.filter((s) => !s.isTop && s.face === face)
    expect(items, `${face} count`).toHaveLength(3)
    for (const it of items) {
      expect(colorAt(c, it.slot, it.dir), `${SIDE_LABEL[face]} should be ${face}`).toBe(face)
    }
  }
})

it('top face stickers are all U on a solved cube', () => {
  const c = createSolvedCube()
  for (const s of lastLayerSlots().filter((x) => x.isTop)) {
    expect(colorAt(c, s.slot, s.dir)).toBe('U')
  }
})

it('a legal scramble entered through the 21 input stickers solves', () => {
  // Build a real scrambled last layer with verified algorithms, then confirm it
  // survives validation and the solver handles it.
  const c = createSolvedCube()
  applySequence(c, ALG.sune)
  applySequence(c, ALG.uaPerm)
  expect(validateLastLayer(c)).toEqual([])
  const sol = solveLastLayer(c)
  expect(sol.failure).toBeUndefined()
  expect(sol.steps.length).toBeGreaterThan(0)
})

it('an illegal hand-typed state is rejected with a readable message', () => {
  const c = createSolvedCube()
  const SLOTS = lastLayerSlots()
  const corner = (x: number, z: number) =>
    SLOTS.findIndex((s) => s.isTop && s.slot.x === x && s.slot.z === z)
  // wipe the U sticker off a corner
  setColorAt(c, SLOTS[corner(1, 1)].slot, U_DIR, 'F' as Color)

  const problems = validateLastLayer(c)
  expect(problems.length).toBeGreaterThan(0)
  expect(problems.join(' ')).toMatch(/흰색/)

  const sol = solveLastLayer(c)
  expect(sol.failure).toBeDefined()
  expect(sol.problems?.length).toBeGreaterThan(0)
})
