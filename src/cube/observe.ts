import { colorAt, U_CORNERS, U_DIR, U_EDGES, type Cube } from './model'
import { homesOf } from './solver'

/**
 * What to look at right now.
 *
 * Telling someone "repeat the algorithm" hands them a number to obey. Counting
 * the things that are still wrong and showing them the count turns that into a
 * decision they make themselves: if the count is still above zero, go again, and
 * when it reaches zero you know without being told.
 */
export type Observation = {
  /** corners not in their own place, counting a twisted corner as wrong */
  wrongCorners: number
  /** edges not in their own place, counting a flipped edge as wrong */
  wrongEdges: number
  /** true when nothing is left to do */
  finished: boolean
  /** one line telling them where to look */
  look: string
}

export function observe(cube: Cube): Observation {
  const { corners, edges } = homesOf(cube)
  const wrongCorners = corners.filter((home, i) => home !== i || colorAt(cube, U_CORNERS[i], U_DIR) !== 'U').length
  const wrongEdges = edges.filter((home, i) => home !== i || colorAt(cube, U_EDGES[i], U_DIR) !== 'U').length

  const finished = wrongCorners === 0 && wrongEdges === 0
  return { wrongCorners, wrongEdges, finished, look: lookAt(wrongCorners, wrongEdges, finished) }
}

function lookAt(c: number, e: number, finished: boolean): string {
  if (finished) return '윗면과 옆면 네 줄이 모두 맞아요.'
  const parts: string[] = []
  if (c > 0) parts.push(`틀린 코너 ${c}개`)
  if (e > 0) parts.push(`틀린 엣지 ${e}개`)
  const what = parts.join(', ')
  if (c > 0 && e > 0) return `윗면을 보세요 — ${what}. 둘 다 남아 있으면 아직 끝이 아니에요.`
  if (c > 0) return `윗면의 코너 4개를 보세요 — ${what}. 남은 코너가 어디인지 확인하세요.`
  return `옆면 4줄을 보세요 — ${what}. 색이 제자리에 다 돌아오면 그만이에요.`
}
