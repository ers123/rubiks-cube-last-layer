import type { Cube } from './model'
import { homesOf, areCornersOriented, areEdgesOriented } from './solver'

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
  const cornersOriented = areCornersOriented(cube)
  const edgesOriented = areEdgesOriented(cube)

  let wrongCorners = 0
  for (let i = 0; i < 4; i++) if (corners[i] !== i) wrongCorners++
  // a corner that is twisted counts too, since it is not finished either
  if (!cornersOriented) wrongCorners += corners.filter((c, i) => c === i).length

  let wrongEdges = 0
  for (let i = 0; i < 4; i++) if (edges[i] !== i) wrongEdges++
  if (!edgesOriented) wrongEdges += edges.filter((e, i) => e === i).length

  const finished = wrongCorners === 0 && wrongEdges === 0
  return { wrongCorners, wrongEdges, finished, look: lookAt(wrongCorners, wrongEdges, finished) }
}

function lookAt(c: number, e: number, finished: boolean): string {
  if (finished) return '윗면이 전부 맞아요. 더 볼 게 없습니다.'
  const parts: string[] = []
  if (c > 0) parts.push(`틀린 코너 ${c}개`)
  if (e > 0) parts.push(`틀린 엣지 ${e}개`)
  const what = parts.join(', ')
  if (c > 0 && e > 0) return `윗면을 보세요 — ${what}. 둘 다 남아 있으면 아직 끝이 아니에요.`
  if (c > 0) return `윗면의 코너 4개를 보세요 — ${what}. 하나라도 틀렸으면 한 번 더 돌리세요.`
  return `옆면 4줄을 보세요 — ${what}. 색이 제자리에 다 돌아오면 그만이에요.`
}
