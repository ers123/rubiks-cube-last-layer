import { useMemo, useState } from 'react'
import { buildCases, type CaseNet } from '../cube/cases'
import { buildCornerCases } from '../cube/cornerCases'
import { FACE_COLORS, type Color } from '../cube/model'

/**
 * Three questions, then a short list.
 *
 * Asking someone to name twenty-one colours is a bad way to hand out a cube's
 * last layer. Asking three things they can see instead is quick, and it narrows
 * the shelf down to a handful so the final choice is a glance rather than a
 * search. Nothing here needs a camera, a count of individual stickers, or any
 * knowledge of cube notation.
 */

const ANSWERS = [
  {
    key: 'topAllWhite' as const,
    q: '맨 윗면이 전부 흰색이에요?',
    hint: '빨강·주황 같은 다른 색이 하나라도 보이면 "아니오"예요.',
    options: [
      { v: true, label: '네, 전부 흰색' },
      { v: false, label: '아니오, 다른 색이 섞여 있어요' },
    ],
  },
  {
    key: 'cornersHome' as const,
    q: '윗면 모서리 4개 중, 자기 자리인 건 몇 개예요?',
    hint: '모서리 두 개의 옆면 색이 그 면의 색과 맞는지를 보세요. 같은 색이 2개 보이면 제자리예요.',
    options: [0, 1, 2, 3, 4].map((n) => ({ v: n, label: `${n}개` })),
  },
  {
    key: 'edgesHome' as const,
    q: '옆면 4줄 중, 색이 제자리에 맞는 줄은 몇 줄이에요?',
    hint: '옆면의 가운데 스티커가 그 면의 색과 같으면 맞는 줄이에요.',
    options: [0, 1, 2, 3, 4].map((n) => ({ v: n, label: `${n}줄` })),
  },
]

type Answers = { topAllWhite: boolean | null; cornersHome: number | null; edgesHome: number | null }

export function QuestionPicker({ onPick }: { onPick: (c: CaseNet) => void }) {
  const cases = useMemo(() => buildCases(), [])
  const corners = useMemo(() => buildCornerCases(), [])
  const [a, setA] = useState<Answers>({ topAllWhite: null, cornersHome: null, edgesHome: null })
  const [step, setStep] = useState(0)
  const [skipped, setSkipped] = useState(false)

  // The first answer decides which stage is in front of the reader. A top face
  // that is not all one colour means the corners are still twisted, which is a
  // completely different and much larger set of cases.
  const pool = a.topAllWhite === false ? corners : cases

  // Once the top edges are home the side rows are all correct by definition, so
  // asking how many are right has an answer that is always the same. Asking it
  // would only ever narrow the list to nothing.
  const asked = a.topAllWhite === false ? ANSWERS.slice(0, 2) : ANSWERS
  const effective = a.topAllWhite === false ? { ...a, edgesHome: a.edgesHome ?? 4 } : a
  const current = step < asked.length ? asked[step] : null
  const value = current ? a[current.key] : null

  const matches = useMemo(() => {
    if (effective.topAllWhite === null || effective.cornersHome === null || effective.edgesHome === null) return []
    return pool.filter(
      (c) => c.cornersHome === effective.cornersHome && c.edgesHome === effective.edgesHome
    )
  }, [pool, effective.topAllWhite, effective.cornersHome, effective.edgesHome])

  const answered = effective.topAllWhite !== null && effective.cornersHome !== null && effective.edgesHome !== null
  const reshuffle = () => {
    setA({ topAllWhite: null, cornersHome: null, edgesHome: null })
    setStep(0)
    setSkipped(false)
  }

  return (
    <div className="qp">
      <ol className="qp-steps">
        {asked.map((s, i) => (
          <li key={s.key} className={i === step ? 'on' : a[s.key] !== null ? 'done' : ''}>
            {i + 1}
          </li>
        ))}
      </ol>

      {current && (
        <>
      <p className="qp-q">{current.q}</p>
      <p className="sub">{current.hint}</p>

      <div className="qp-opts">
        {current.options.map((o) => (
          <button
            key={String(o.v)}
            type="button"
            className={value === o.v ? 'qp-opt on' : 'qp-opt'}
            onClick={() => {
              setA({ ...a, [current.key]: o.v })
              setSkipped(false)
              if (step < asked.length - 1) setTimeout(() => setStep(step + 1), 180)
            }}
          >
            {o.label}
          </button>
        ))}
      </div>
        </>
      )}

      {answered && matches.length > 0 && (
        <>
          <p className="sub">
            이 답으로는 {matches.length}가지가 남아요
            {pool.length > 100 ? ` (모서리 단계 ${pool.length}가지 중에서)` : ''}. 님 큐브와 같은 그림을 고르세요.
          </p>
          <div className="gallery-grid">
            {matches.map((c) => (
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
              </button>
            ))}
          </div>
        </>
      )}

      {answered && matches.length === 0 && !skipped && (
        <div className="qp-none">
          <p>
            <strong>이 답과 맞는 경우가 목록에 없어요.</strong> 님이 센 개수가 실제 큐브와 다를 수 있습니다.
            앞에서부터 다시 확인해 보세요.
          </p>
          <button type="button" className="primary" onClick={() => setSkipped(true)}>
            그래도 계속할게요
          </button>
        </div>
      )}

      {answered && matches.length === 0 && skipped && (
        <div className="qp-none">
          <p>
            대신 이 단계의 그림을 전부 보여드릴게요.
          </p>
          <button type="button" className="primary" onClick={() => onPick(pool[0])}>
            이 단계의 그림 {pool.length}개 보기
          </button>
        </div>
      )}

      <div className="qp-foot">
        {step > 0 && (
          <button type="button" className="ghost" onClick={() => setStep(step - 1)}>
            이전 질문
          </button>
        )}
        <button type="button" className="ghost" onClick={reshuffle}>
          처음부터
        </button>
      </div>
    </div>
  )
}

const SIDE_LABEL: Partial<Record<Color, string>> = { F: '앞', R: '오른쪽', B: '뒤', L: '왼쪽' }
