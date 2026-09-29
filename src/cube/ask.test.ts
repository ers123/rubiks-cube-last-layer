import { describe, it, expect } from 'vitest'
import { buildCases } from './cases'
import { netToCube, countCornersHome } from './cases'
import { isLastLayerSolved, solveLastLayer } from './solver'

const cases = buildCases()

/** The same narrowing the three questions perform. */
const narrow = (top: boolean, corners: number, edges: number) =>
  cases.filter((c) => c.topAllWhite === top && c.cornersHome === corners && c.edgesHome === edges)

describe('the three questions', () => {
  it('every case has all three answers recorded', () => {
    for (const c of cases) {
      expect(typeof c.topAllWhite).toBe('boolean')
      expect(c.cornersHome).toBeGreaterThanOrEqual(0)
      expect(c.cornersHome).toBeLessThanOrEqual(4)
      expect(c.edgesHome).toBeGreaterThanOrEqual(0)
      expect(c.edgesHome).toBeLessThanOrEqual(4)
    }
  })

  it('the recorded corner count matches the picture', () => {
    for (const c of cases) expect(c.cornersHome).toBe(countCornersHome(c))
  })

  it('every case is found by exactly the answers that describe it', () => {
    for (const c of cases) {
      const hit = narrow(c.topAllWhite, c.cornersHome, c.edgesHome)
      expect(hit.some((h) => h.id === c.id), `${c.label} lost by its own answers`).toBe(true)
    }
  })

  it('never points a set of answers at two pictures that look the same', () => {
    for (const c of cases) {
      const hit = narrow(c.topAllWhite, c.cornersHome, c.edgesHome)
      const key = (x: typeof cases[number]) => `${x.uFace.join('')}|${x.sideRows.map((r) => r.colors.join('')).join('|')}`
      expect(new Set(hit.map(key)).size, `${c.label} matched a duplicate`).toBe(hit.length)
    }
  })

  it('every case the questions offer can actually be solved', () => {
    for (const c of cases) {
      for (const hit of narrow(c.topAllWhite, c.cornersHome, c.edgesHome)) {
        expect(solveLastLayer(netToCube(hit)).failure).toBeFalsy()
        expect(isLastLayerSolved(netToCube(hit))).toBe(false)
      }
    }
  })

  it('the questions cover every case between them', () => {
    const covered = new Set<string>()
    for (let t = 0; t < 2; t++) for (let co = 0; co < 5; co++) for (let e = 0; e < 5; e++) {
      for (const c of narrow(t === 1, co, e)) covered.add(c.id)
    }
    expect(covered.size).toBe(cases.length)
  })

  it('the three questions always cut the shelf down hard', () => {
    let worst = 0
    for (let t = 0; t < 2; t++) for (let co = 0; co < 5; co++) for (let e = 0; e < 5; e++) {
      worst = Math.max(worst, narrow(t === 1, co, e).length)
    }
    // Measured, not hoped for: the busiest answer set leaves 28, which is under
    // half the gallery. Asserting the number keeps it from quietly drifting.
    expect(worst).toBe(28)
    expect(worst).toBeLessThan(cases.length / 2)
  })
})
