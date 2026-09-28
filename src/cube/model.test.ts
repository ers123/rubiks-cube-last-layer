import { describe, it, expect } from 'vitest'
import {
  createSolvedCube,
  applySequence,
  applyMove,
  isSolved,
  colorAt,
  parseMoves,
  U_EDGES,
  U_DIR,
  F_DIR,
  B_DIR,
  L_DIR,
  D_DIR,
  type Cube,
  type Face,
} from './model'

const REF = createSolvedCube()

const facesOk = (c: Cube) => isSolved(c)

describe('cube model', () => {
  it('a fresh cube is solved', () => {
    expect(facesOk(createSolvedCube())).toBe(true)
  })

  it('four identical quarter turns are identity', () => {
    for (const f of ['U', 'R', 'F', 'D', 'L', 'B']) {
      const c = createSolvedCube()
      applySequence(c, `${f} ${f} ${f} ${f}`)
      expect(facesOk(c), `${f} x4`).toBe(true)
    }
  })

  it("a face turn followed by its inverse is identity", () => {
    for (const [f, inv] of [
      ['U', "U'"],
      ['R', "R'"],
      ['F', "F'"],
      ['D', "D'"],
      ['L', "L'"],
      ['B', "B'"],
    ]) {
      const c = createSolvedCube()
      applySequence(c, `${f} ${inv}`)
      expect(facesOk(c), `${f} ${inv}`).toBe(true)
    }
  })

  it('two half turns are identity', () => {
    for (const f of ['U', 'R', 'F', 'D', 'L', 'B']) {
      const c = createSolvedCube()
      applySequence(c, `${f}2 ${f}2`)
      expect(facesOk(c), `${f}2 ${f}2`).toBe(true)
    }
  })

  it('a face turn moves exactly 8 slots of its layer', () => {
    // A face layer holds 9 slots; the center slot keeps both its position and
    // its (rotation-invariant) sticker, so 8 slots must change.
    const c = createSolvedCube()
    const before = JSON.stringify(c)
    applyMove(c, { face: 'R', amount: 1 })
    let changed = 0
    for (let i = 0; i < 27; i++) {
      if (JSON.stringify(JSON.parse(before)[i]) !== JSON.stringify(c[i])) changed++
    }
    expect(changed).toBe(8)
  })

  it('R moves the U-right column to the B-right column', () => {
    const c = createSolvedCube()
    applySequence(c, 'R')
    // R is clockwise seen from +X, so U -> B -> D -> F -> U
    // The U sticker on the UR edge (1,1,0) lands on the BR edge (1,0,-1) facing B.
    expect(colorAt(c, { x: 1, y: 0, z: -1 }, B_DIR)).toBe('U')
    expect(colorAt(c, { x: 1, y: 0, z: -1 }, U_DIR)).not.toBe('U')
  })

  it('U keeps U stickers on the U face but cycles the side stickers', () => {
    const c = createSolvedCube()
    applySequence(c, "U'")
    // The U face is still solid: U stickers only ever move within the U face.
    for (const s of U_EDGES) expect(colorAt(c, s, U_DIR)).toBe('U')
    // The UF edge (0,1,1) shows a side color on its F-facing sticker now.
    expect(colorAt(c, { x: 0, y: 1, z: 1 }, F_DIR)).not.toBe('F')
    // D face untouched.
    for (let a = -1; a <= 1; a++)
      for (let b = -1; b <= 1; b++) expect(colorAt(c, { x: a, y: -1, z: b }, D_DIR)).toBe('D')
  })

  it('U sends the F-facing sticker of the UF edge to the L face', () => {
    const c = createSolvedCube()
    applySequence(c, 'U')
    // U clockwise from above: F -> L
    expect(colorAt(c, { x: -1, y: 1, z: 1 }, L_DIR)).toBe('F')
  })

  it('commuting opposite faces stay commuting', () => {
    const c1 = createSolvedCube()
    applySequence(c1, 'R L')
    const c2 = createSolvedCube()
    applySequence(c2, 'L R')
    expect(JSON.stringify(c1)).toBe(JSON.stringify(c2))
  })

  it('parseMoves handles primes and double turns', () => {
    expect(parseMoves("R U R' U2")).toEqual([
      { face: 'R', amount: 1 },
      { face: 'U', amount: 1 },
      { face: 'R', amount: 3 },
      { face: 'U', amount: 2 },
    ])
    expect(() => parseMoves('X')).toThrow()
  })

  it('all 18 single moves scramble it (sanity that they do something)', () => {
    for (const f of ['U', 'D', 'R', 'L', 'F', 'B']) {
      for (const suffix of ['', "'", '2']) {
        const c = createSolvedCube()
        applySequence(c, f + suffix)
        expect(isSolved(c), `${f}${suffix} should scramble`).toBe(false)
      }
    }
  })

  it('reproduces the known QTM distance distribution of the cube group', () => {
    // The single most decisive check available: breadth-first exploration with
    // the 12 quarter turns must land on exactly these counts. They are the
    // published distances of the Rubik's cube group, so a match this specific
    // cannot happen by accident.
    const QUARTERS: [Face, 1 | 3][] = []
    for (const f of ['U', 'D', 'R', 'L', 'F', 'B'] as Face[]) {
      QUARTERS.push([f, 1])
      QUARTERS.push([f, 3])
    }
    const key = (c: Cube) => c.map((s) => s.map((x) => x.color).join('')).join('|')
    const copy = (c: Cube): Cube => c.map((s) => s.map((x) => ({ dir: { ...x.dir }, color: x.color })))

    const seen = new Set<string>([key(REF)])
    let frontier: Cube[] = [REF]
    const counts = [1]
    for (let d = 1; d <= 5; d++) {
      const layer = new Set<string>()
      const next: Cube[] = []
      for (const node of frontier) {
        for (const [f, a] of QUARTERS) {
          const c = copy(node)
          applyMove(c, { face: f, amount: a })
          const k = key(c)
          if (seen.has(k)) continue
          seen.add(k)
          layer.add(k)
          next.push(c)
        }
      }
      counts.push(layer.size)
      frontier = next
    }
    expect(counts).toEqual([1, 12, 114, 1068, 10011, 93840])
  })
})
