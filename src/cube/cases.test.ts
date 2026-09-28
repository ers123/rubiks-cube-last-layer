import { describe, it, expect } from 'vitest'
import { buildCases, netOf, netToCube, SIDE_FACES } from './cases'
import { isLastLayerSolved } from './solver'
import { applySequence } from './model'

const cases = buildCases()

describe('the case gallery', () => {
  it('folds the 288 permutations down to 72 distinct pictures', () => {
    expect(cases).toHaveLength(72)
  })

  it('every case is a real unsolved last layer', () => {
    for (const c of cases) {
      expect(isLastLayerSolved(netToCube(c)), `${c.label} should not be solved already`).toBe(false)
    }
  })

  it('every case has a white top face, because these are the permutation cases', () => {
    for (const c of cases) {
      for (let i = 0; i < 9; i++) expect(c.uFace[i], `${c.label} top ${i}`).toBe('U')
    }
  })

  it('every case actually differs from every other case', () => {
    const keys = new Set(cases.map((c) => `${c.uFace.join('')}|${c.sideRows.map((r) => r.colors.join('')).join('|')}`))
    expect(keys.size).toBe(72)
  })

  it('every case is fixed by a real solution', () => {
    for (const c of cases) {
      const cube = netToCube(c)
      for (const step of c.solution.steps) for (let r = 0; r < step.reps; r++) applySequence(cube, step.seq)
      expect(isLastLayerSolved(cube), `${c.label} did not get solved`).toBe(true)
    }
  })

  it('every case is described honestly, in words the user can read', () => {
    for (const c of cases) {
      expect(c.label).toMatch(/^케이스 \d+$/)
      expect(c.summary).toMatch(/에지 제자리 \d개, 코너 제자리 \d개/)
    }
  })

  it('the four side rows are always present and full', () => {
    for (const c of cases) {
      expect(c.sideRows.map((r) => r.face)).toEqual(SIDE_FACES)
      for (const row of c.sideRows) expect(row.colors.every(Boolean)).toBe(true)
    }
  })

  it('a picture survives the trip through a cube and back', () => {
    for (const c of cases) {
      const back = netOf(netToCube(c))
      expect(back.uFace).toEqual(c.uFace)
      expect(back.sideRows.map((r) => r.colors)).toEqual(c.sideRows.map((r) => r.colors))
    }
  })

  it('the finished cube is not in the gallery', () => {
    const done = cases.every((c) => c.sideRows.every((r) => r.colors[1] === r.face) && c.sideRows.every((r) => r.colors[0] === r.face) && c.sideRows.every((r) => r.colors[2] === r.face))
    expect(done).toBe(false)
  })
})
