import { useMemo, useState } from 'react'
import { buildCases, type CaseNet } from '../cube/cases'
import type { Color } from '../cube/model'
import { CaseDiagram } from './CaseDiagram'

/**
 * Pick your case by looking at pictures.
 *
 * Counting twenty-one stickers or naming twenty-one colours is a bad way to ask
 * someone a question. This shows every case as a small unfolded cube instead, so
 * the only thing asked is "which one looks like mine".
 */
export function CaseGallery({ colors, onPick }: { colors: Record<Color, string>; onPick: (c: CaseNet) => void }) {
  const cases = useMemo(() => buildCases(), [])
  const [filter, setFilter] = useState<'all' | 'corners' | 'edges' | 'both'>('all')

  // Grouped by what is actually wrong, so somebody only has to look at the shelf
  // that matches their cube instead of scrolling past seventy other cubes.
  const groups: Record<string, typeof cases> = { all: cases, corners: [], edges: [], both: [] }
  for (const c of cases) {
    const onlyCorners = c.edgesHome === 4
    const onlyEdges = c.cornersHome === 4
    if (onlyCorners) groups.corners.push(c)
    else if (onlyEdges) groups.edges.push(c)
    else groups.both.push(c)
  }
  const shown = groups[filter]

  return (
    <div className="gallery">
      <p className="sub">
        윗면이 한 색으로 맞은 큐브라면 옆면 네 줄까지 같은 그림을 고르세요.
        그림과 맞추려면 선택한 앞면을 유지한 채 윗층을 돌려보세요.
      </p>
      <div className="filters">
        {([
          ['all', `전체 ${groups.all.length}`],
          ['corners', `엣지 이미 맞음 ${groups.corners.length}`],
          ['edges', `코너 이미 맞음 ${groups.edges.length}`],
          ['both', `둘 다 섞임 ${groups.both.length}`],
        ] as const)
          .filter(([k]) => groups[k].length > 0)
          .map(([k, label]) => (
          <button
            key={k}
            type="button"
            className={filter === k ? 'chip on' : 'chip'}
            onClick={() => setFilter(k)}
          >
            {label}
          </button>
          ))}
      </div>
      <p className="sub">{shown.length}개</p>
      <div className="gallery-grid">
        {shown.map((c) => (
          <button key={c.id} type="button" className="case" onClick={() => onPick(c)}>
            <span className="case-label">{c.label}</span>
            <CaseDiagram net={c} colors={colors} />
            <span className="case-sum">{c.summary}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
