import { describe, it, expect } from 'vitest'
import { observe } from './observe'
import { createSolvedCube, applySequence, cloneCube } from './model'
import { buildCases, netToCube } from './cases'
import { isLastLayerSolved } from './solver'

describe('what to look at', () => {
  it('reports nothing wrong on a finished cube', () => {
    const o = observe(createSolvedCube())
    expect(o.wrongCorners).toBe(0)
    expect(o.wrongEdges).toBe(0)
    expect(o.finished).toBe(true)
    expect(o.look).toMatch(/더 볼 게 없/)
  })

  it('counts what is still wrong on every case in the gallery', () => {
    for (const c of buildCases()) {
      const o = observe(netToCube(c))
      expect(o.finished, `${c.label} should not read as finished`).toBe(false)
      expect(o.wrongCorners + o.wrongEdges).toBeGreaterThan(0)
    }
  })

  it('reaches zero once the moves have been applied', () => {
    for (const c of buildCases()) {
      const cube = netToCube(c)
      for (const step of c.solution.steps) for (let r = 0; r < step.reps; r++) applySequence(cube, step.seq)
      expect(isLastLayerSolved(cube)).toBe(true)
      expect(observe(cube).finished, `${c.label} should end with nothing left`).toBe(true)
    }
  })

  it('always tells the reader which of the two to look at', () => {
    for (const c of buildCases()) {
      const o = observe(netToCube(c))
      expect(o.look.length).toBeGreaterThan(10)
      if (o.wrongCorners > 0 && o.wrongEdges > 0) expect(o.look).toMatch(/둘 다/)
      else if (o.wrongCorners > 0) expect(o.look).toMatch(/코너/)
      else expect(o.look).toMatch(/옆면/)
    }
  })

  it('never asks for another round when nothing is left', () => {
    const o = observe(createSolvedCube())
    expect(o.look).not.toMatch(/한 번 더/)
  })

  it('counts a twisted corner as still wrong', () => {
    const cube = cloneCube(createSolvedCube())
    applySequence(cube, 'R U R\' U R U2 R\'')
    const o = observe(cube)
    if (o.wrongCorners === 0) throw new Error('a scrambled layer reported zero wrong corners')
  })
})
