import { describe, it, expect } from 'vitest'
import { buildCornerCases, cornerCount } from './cornerCases'
import { netToCube } from './cases'
import { isLastLayerSolved, solveLastLayer, areEdgesOriented, homesOf } from './solver'
import { applySequence } from './model'

const cases = buildCornerCases()

describe('the corner-stage gallery', () => {
  it('holds every one of the corner-stage states', () => {
    expect(cases).toHaveLength(143)
  })

  it('every case really is a corner-stage state', () => {
    for (const c of cases) {
      const cube = netToCube(c)
      expect(isLastLayerSolved(cube), `${c.label} should not be solved already`).toBe(false)
      const { edges } = homesOf(cube)
      expect(edges.every((v, i) => v === i), `${c.label} top edges must be home`).toBe(true)
      expect(areEdgesOriented(cube), `${c.label} top edges must be facing up`).toBe(true)
    }
  })

  it('every case really does get solved by its own solution', () => {
    for (const c of cases) {
      const cube = netToCube(c)
      for (const step of c.solution.steps) for (let r = 0; r < step.reps; r++) applySequence(cube, step.seq)
      expect(isLastLayerSolved(cube), `${c.label} did not get solved`).toBe(true)
    }
  })

  it('the bottom two layers survive every move of every solution', () => {
    const solid = (c: ReturnType<typeof netToCube>) => {
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
    for (const c of cases) {
      const cube = netToCube(c)
      expect(solid(cube), `${c.label} starts with the bottom two layers broken`).toBe(true)
      for (const step of c.solution.steps)
        for (let r = 0; r < step.reps; r++) {
          applySequence(cube, step.seq)
          expect(solid(cube), `${c.label} broke the bottom two layers with ${step.seq}`).toBe(true)
        }
    }
  })

  it('no case repeats another after a turn of the top', () => {
    const key = (c: typeof cases[number]) => `${c.uFace.join('')}|${c.sideRows.map((r) => r.colors.join('')).join('|')}`
    expect(new Set(cases.map(key)).size).toBe(cases.length)
  })

  it('the corner count in the label matches the picture', () => {
    for (const c of cases) expect(c.cornersHome).toBe(cornerCount(c))
  })

  it('gives a real answer for every case', () => {
    for (const c of cases) {
      expect(solveLastLayer(netToCube(c)).failure).toBeFalsy()
      expect(c.summary.length).toBeGreaterThan(5)
    }
  })
})
