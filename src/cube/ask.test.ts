import { describe, it, expect } from 'vitest'
import { buildCases, countCornersHome, netToCube, pllQuestionMatches } from './cases'
import { applySequence } from './model'
import { isLastLayerSolved } from './solver'

const cases = buildCases()

describe('the three questions', () => {
  it('records how many pieces are fully aligned in each gallery picture', () => {
    for (const c of cases) {
      expect(c.topAllWhite).toBe(true)
      expect(c.cornersHome).toBe(countCornersHome(c))
      expect(c.edgesHome).toBe(c.sideRows.filter((row) => row.colors[1] === row.face).length)
    }
  })

  it('finds the rotation that matches the reported counts', () => {
    const matches = pllQuestionMatches(cases, 0, 0)
    expect(matches).toHaveLength(45)
    expect(new Set(matches.map((c) => c.sideRows.map((row) => row.colors.join('')).join('|'))).size).toBe(45)
    for (const c of matches) {
      expect(countCornersHome(c)).toBe(0)
      expect(c.sideRows.every((row) => row.colors[1] !== row.face)).toBe(true)
    }
    for (const c of cases) {
      const hit = pllQuestionMatches(cases, c.cornersHome, c.edgesHome)
      expect(hit.some((picture) => picture.id === `${c.id}-0`)).toBe(true)
    }
  })

  it('offers the quarter-turn cases under the same answers as the physical cube', () => {
    const matches = pllQuestionMatches(cases, 0, 0)
    const quarterTurn = matches.find((c) => {
      const cube = netToCube(c)
      applySequence(cube, 'U')
      return isLastLayerSolved(cube)
    })
    expect(quarterTurn).toBeDefined()
    expect(pllQuestionMatches(cases, 0, 3)).toHaveLength(0)
  })
})
