import { it, expect } from 'vitest'
import { createSolvedCube, applySequence, cloneCube } from './model'
import { ALG } from './solver'
import { buildCases, netToCube } from './cases'

/** Is every sticker on the middle and bottom layers still facing the right colour? */
function f2lSolid(c: ReturnType<typeof createSolvedCube>): boolean {
  const colourOf = (d: { x: number; y: number; z: number }) =>
    d.x === 1 ? 'R' : d.x === -1 ? 'L' : d.y === 1 ? 'U' : d.y === -1 ? 'D' : d.z === 1 ? 'F' : 'B'
  for (let y = -1; y <= 0; y++)
    for (let z = -1; z <= 1; z++)
      for (let x = -1; x <= 1; x++) {
        if (x === 0 && z === 0) continue
        for (const st of c[(x + 1) + 3 * (y + 1) + 9 * (z + 1)]) {
          if (st.color !== colourOf(st.dir)) return false
        }
      }
  return true
}

it('the bottom two layers never break while a solution plays', () => {
  let breaks = 0
  let checked = 0
  for (const c of buildCases()) {
    const cube = netToCube(c)
    if (!f2lSolid(cube)) { console.log(`${c.label}: F2L ALREADY broken before any move`); breaks++; continue }
    for (const step of c.solution.steps) {
      for (let r = 0; r < step.reps; r++) {
        applySequence(cube, step.seq)
        checked++
        if (!f2lSolid(cube)) { if (breaks === 0) console.log(`${c.label}: broken by ${step.seq} (${step.label})`); breaks++ }
      }
    }
  }
  console.log(`checked ${checked} sub-moves; F2L broke ${breaks} times`)
  expect(breaks).toBe(0)
})

it('what do the algorithms do to the bottom two layers', () => {
  const base = createSolvedCube()
  expect(f2lSolid(base)).toBe(true)
  for (const [name, seq] of Object.entries(ALG)) {
    const c = cloneCube(base)
    applySequence(c, seq)
    const afterOne = f2lSolid(c)
    const c2 = cloneCube(c)
    applySequence(c2, seq)
    const afterTwo = f2lSolid(c2)
    console.log(`${name}: F2L after 1 rep = ${afterOne ? 'solid' : 'SCRAMBLED'} | after 2 = ${afterTwo ? 'solid' : 'SCRAMBLED'}`)
  }
})
