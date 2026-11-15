import { COLOR_FACE_ORDER, FACE_COLORS, FACE_DIR, type Color, type Vec3 } from '../cube/model'

export const COLOR_NAMES: Record<Color, string> = {
  U: '흰색', R: '빨간색', F: '초록색', D: '노란색', L: '주황색', B: '파란색',
}

const dot = (a: Vec3, b: Vec3) => a.x * b.x + a.y * b.y + a.z * b.z

export function adjacentColors(color: Color): Color[] {
  return COLOR_FACE_ORDER.filter((candidate) => dot(FACE_DIR[color], FACE_DIR[candidate]) === 0)
}

export function cubeColors(top: Color, front: Color): Record<Color, Color> {
  const up = FACE_DIR[top]
  const forward = FACE_DIR[front]
  const right = {
    x: up.y * forward.z - up.z * forward.y,
    y: up.z * forward.x - up.x * forward.z,
    z: up.x * forward.y - up.y * forward.x,
  }
  const faceToward = (direction: Vec3, sign: number) =>
    COLOR_FACE_ORDER.find((color) => dot(FACE_DIR[color], direction) === sign)!

  return { U: top, F: front, R: faceToward(right, 1), D: faceToward(up, -1), B: faceToward(forward, -1), L: faceToward(right, -1) }
}

export const cssColors = (colors: Record<Color, Color>): Record<Color, string> => ({
  U: FACE_COLORS[colors.U], F: FACE_COLORS[colors.F], R: FACE_COLORS[colors.R],
  D: FACE_COLORS[colors.D], B: FACE_COLORS[colors.B], L: FACE_COLORS[colors.L],
})
