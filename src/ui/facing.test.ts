import { it, expect } from 'vitest'
import { lastLayerSlots } from './StickerInput'
import { netOf, netToCube, buildCases, SIDE_FACES } from '../cube/cases'
import { createSolvedCube } from '../cube/model'

/**
 * Which end of a side row sits next to which neighbour, as seen from outside.
 * Looking at a face means standing in front of it, with up still up. On the right
 * face the cube's back end appears on the viewer's right, which is the opposite
 * of the front and left faces.
 */
const facing: Record<string, { screen: (x: number, z: number) => number }> = {
  F: { screen: (x) => x },            // looking along -z, +x is to the right
  B: { screen: (x) => x },            // looking along +z, +x is to the right
  R: { screen: (_x, z) => -z },       // looking along -x, -z is to the right
  L: { screen: (_x, z) => z },        // looking along +x, +z is to the right
}

it('each side row reads left to right the way the face looks from outside', () => {
  const rows = lastLayerSlots().filter((s) => !s.isTop)
  for (const face of ['F', 'B', 'R', 'L']) {
    const cells = rows.filter((s) => s.face === face)
    if (cells.length !== 3) throw new Error(`${face} row is not 3 cells`)
    const positions = cells.map((c) => facing[face].screen(c.slot.x, c.slot.z))
    const ascending = positions.every((p, i) => i === 0 || p > positions[i - 1])
    const descending = positions.every((p, i) => i === 0 || p < positions[i - 1])
    if (!ascending && !descending) throw new Error(`${face} row zigzags: ${positions.join(',')}`)
    if (!ascending) {
      throw new Error(
        `${face} row runs backwards on screen: the net shows ${positions.join(',')} but that face is seen the other way round, so the two end corners get entered on the wrong side`
      )
    }
  }
})


it('the gallery pictures read left to right the same way', () => {
  // A solved cube makes this easy to check: the sticker at each end of a row is
  // the one belonging to the corner that face shares with its neighbour.
  const net = netOf(createSolvedCube())
  for (const face of SIDE_FACES) {
    const row = net.sideRows[SIDE_FACES.indexOf(face)].colors
    expect(row.length, `${face} row length`).toBe(3)
    expect(row[0], `${face} left end should show its own colour`).toBe(face)
    expect(row[2], `${face} right end should show its own colour`).toBe(face)
  }
})

it('a gallery picture still round trips into the same cube', () => {
  for (const c of buildCases()) {
    const back = netOf(netToCube(c))
    expect(back.sideRows.map((r) => r.colors)).toEqual(c.sideRows.map((r) => r.colors))
  }
})
