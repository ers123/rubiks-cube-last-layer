import { applyMove, applySequence, cloneCube, createSolvedCube, FACE_DIR, parseMoves, slotFromIndex, slotIndex, type Color, type Cube, type Vec3 } from './model'
import { ALG, isLastLayerSolved } from './solver'

export const gripFaces = ['F', 'R', 'B', 'L'] as const
export const formulas = [
  { name: 'Sune', seq: ALG.sune, front: 'R' },
  { name: 'Anti-Sune', seq: ALG.antiSune, front: 'L' },
  { name: 'Niklas', seq: ALG.niklas, front: 'B' },
  { name: 'Ua', seq: ALG.uaPerm, front: 'R' },
] as const
export type GripFace = (typeof gripFaces)[number]

function turnFrame(vector: Vec3, turns: number): Vec3 {
  let { x, z } = vector
  for (let i = 0; i < turns; i++) [x, z] = [-z, x]
  return { x, y: vector.y, z }
}

function rotateGrip(cube: Cube, turns: number): Cube {
  const colorMap = Object.fromEntries(Object.entries(FACE_DIR).map(([color, dir]) => {
    const turned = turnFrame(dir, turns)
    const face = Object.entries(FACE_DIR).find(([, d]) => d.x === turned.x && d.y === turned.y && d.z === turned.z)
    return [color, face![0]]
  })) as Record<Color, Color>
  const result: Cube = Array.from({ length: 27 }, () => [])
  cube.forEach((piece, i) => {
    const position = slotIndex(turnFrame(slotFromIndex(i), turns))
    result[position] = piece.map(({ dir, color }) => ({ dir: turnFrame(dir, turns), color: colorMap[color] }))
  })
  return result
}

export function gripQuestion(index: number): Cube {
  const { seq, front } = formulas[index]
  const cube = createSolvedCube()
  for (const move of parseMoves(seq).reverse()) {
    applyMove(cube, { ...move, amount: move.amount === 1 ? 3 : move.amount === 3 ? 1 : 2 })
  }
  return rotateGrip(cube, (4 - gripFaces.indexOf(front)) % 4)
}

export function solvesGrip(cube: Cube, front: GripFace, seq: string): boolean {
  const rotated = front === 'F' ? cloneCube(cube) : rotateGrip(cube, gripFaces.indexOf(front))
  applySequence(rotated, seq)
  return isLastLayerSolved(rotated)
}
