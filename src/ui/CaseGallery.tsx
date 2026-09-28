import { useMemo } from 'react'
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

  return (
    <div className="gallery">
      <p className="sub">
        님 큐브와 <strong>같은 그림</strong>을 찾으세요. 위쪽 면은 전부 흰색이고, 옆 4줄의 색만 다릅니다.
        회전시켜도 상관없습니다 — 돌려서 맞는 게 나오면 그게 정답입니다.
      </p>
      <div className="gallery-grid">
        {cases.map((c) => (
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
