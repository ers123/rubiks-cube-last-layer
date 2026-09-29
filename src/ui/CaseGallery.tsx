import { useMemo, useState } from 'react'
import { buildCases, SIDE_LABEL, type CaseNet } from '../cube/cases'
import { FACE_COLORS, type Color } from '../cube/model'

/**
 * Pick your case by looking at pictures.
 *
 * Counting twenty-one stickers or naming twenty-one colours is a bad way to ask
 * someone a question. This shows every case as a small unfolded cube instead, so
 * the only thing asked is "which one looks like mine".
 */
export function CaseGallery({ onPick }: { onPick: (c: CaseNet) => void }) {
  const cases = useMemo(() => buildCases(), [])
  const [filter, setFilter] = useState<'all' | 'corners' | 'edges' | 'both'>('all')

  // Grouped by what is actually wrong, so somebody only has to look at the shelf
  // that matches their cube instead of scrolling past seventy other cubes.
  const groups: Record<string, typeof cases> = { all: cases, corners: [], edges: [], both: [] }
  for (const c of cases) {
    const n = c.summary
    const onlyCorners = n.includes('에지 제자리 4개')
    const onlyEdges = n.includes('코너 제자리 4개')
    if (onlyCorners) groups.corners.push(c)
    else if (onlyEdges) groups.edges.push(c)
    else groups.both.push(c)
  }
  const shown = groups[filter]

  return (
    <div className="gallery">
      <p className="sub">
        님 큐브와 <strong>같은 그림</strong>을 찾으세요. 위쪽 면은 전부 흰색이고, 옆 4줄의 색만 다릅니다.
        회전시켜도 상관없습니다 — 돌려서 맞는 게 나오면 그게 정답입니다.
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
      <p className="sub">지금 {shown.length}개를 보고 있어요. 옆면 색은 회전시켜도 상관없습니다.</p>
      <div className="gallery-grid">
        {shown.map((c) => (
          <button key={c.id} type="button" className="case" onClick={() => onPick(c)}>
            <span className="case-label">{c.label}</span>
            <span className="case-net">
              <span className="case-u">
                {c.uFace.map((col, i) => (
                  <i key={i} style={{ background: col ? FACE_COLORS[col as Color] : 'transparent' }} />
                ))}
              </span>
              {c.sideRows.map((r) => (
                <span key={r.face} className="case-row">
                  <em>{SIDE_LABEL[r.face]}</em>
                  {r.colors.map((col, i) => (
                    <i key={i} style={{ background: col ? FACE_COLORS[col as Color] : 'transparent' }} />
                  ))}
                </span>
              ))}
            </span>
            <span className="case-sum">{c.summary}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
