import { describe, it, expect } from 'vitest'
import { labelFrame, assignFaces, addCenter, emptyCalibration, calibrationReady, type Blob } from './frame'
import type { Rgb } from './classify'
import type { Color } from '../cube/model'

const blob = (id: string, cx: number, cy: number): Blob => ({
  id,
  quad: [],
  stickers: Array.from({ length: 9 }, () => ({ r: 0, g: 0, b: 0 })),
  center: { r: 0, g: 0, b: 0 },
  cx,
  cy,
  area: 100,
})

describe('which blob is the top face', () => {
  it('takes the blob highest in the image', () => {
    const labels = labelFrame([blob('a', 100, 300), blob('b', 200, 90), blob('c', 400, 250)])
    expect(labels.uId).toBe('b')
  })

  it('lists the side blobs left to right', () => {
    const labels = labelFrame([blob('top', 250, 80), blob('right', 400, 300), blob('left', 100, 300)])
    expect(labels.sideIds).toEqual(['left', 'right'])
    expect(labels.uId).toBe('top')
  })

  it('copes with only two faces being readable', () => {
    const labels = labelFrame([blob('top', 250, 80), blob('right', 400, 300)])
    expect(labels.uId).toBe('top')
    expect(labels.sideIds).toEqual(['right'])
  })

  it('copes with nothing at all', () => {
    const labels = labelFrame([])
    expect(labels.uId).toBeNull()
  })
})

describe('turning a front-face tap into a labelling', () => {
  const sides = () => [blob('a', 420, 300), blob('b', 90, 300)]

  it('the tapped blob is the front, the blob right of it is R, left is L', () => {
    const assign = assignFaces('b', sides())
    expect(assign).toEqual({ b: 'F', a: 'R' })
  })

  it('yawing the cube swaps which blob is R, which is the whole point', () => {
    // the user now holds what used to be the right face towards the camera and
    // taps it; the blob that used to be on their left is now to the right
    const assign = assignFaces('a', sides())
    expect(assign).toEqual({ a: 'F', b: 'L' })
  })

  it('never assigns two blobs to the same face, whichever is tapped', () => {
    const bs = sides()
    for (const front of ['a', 'b']) {
      const assign = assignFaces(front, bs)
      const values = Object.values(assign)
      expect(new Set(values).size, `front=${front} -> ${JSON.stringify(assign)}`).toBe(values.length)
      expect(assign[front]).toBe('F')
    }
  })

  it('ignores a tap on a blob that is not present', () => {
    expect(assignFaces('nope', sides())).toEqual({ nope: 'F' })
  })
})

describe('calibration', () => {
  it('is not ready until all five references are measured', () => {
    let cal = emptyCalibration()
    expect(calibrationReady(cal)).toBe(false)
    for (const f of ['U', 'F', 'R', 'L', 'B'] as Color[]) {
      cal = addCenter(cal, f, { r: 10, g: 20, b: 30 })
    }
    expect(calibrationReady(cal)).toBe(true)
  })

  it('keeps the palette in step with the measured centres', () => {
    let cal = emptyCalibration()
    const white: Rgb = { r: 240, g: 240, b: 240 }
    cal = addCenter(cal, 'U', white)
    expect(cal.palette.U).toBeDefined()
    expect(cal.palette.R).toBeUndefined()
    cal = addCenter(cal, 'R', { r: 200, g: 40, b: 50 })
    expect(cal.palette.R).toBeDefined()
  })
})
