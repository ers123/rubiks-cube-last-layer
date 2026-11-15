import { useMemo, useState } from 'react'
import { buildCases, netOf, pllQuestionMatches, type Net } from '../cube/cases'
import { buildCornerCases } from '../cube/cornerCases'
import { createSolvedCube, type Color } from '../cube/model'
import { CaseDiagram } from './CaseDiagram'

const solved = netOf(createSolvedCube())
const cross = {
  uFace: solved.uFace.map((color, i) => i % 2 === 1 || i === 4 ? color : null),
  sideRows: solved.sideRows.map((row) => ({ face: row.face, colors: [null, row.face, null] })),
}
const counts = [0, 1, 2, 3, 4]

type Answer = 'uniform' | 'mixed' | 'aligned' | 'unsure' | number

export function QuestionPicker({ colors, onPick, onManual }: {
  colors: Record<Color, string>
  onPick: (net: Net) => void
  onManual: () => void
}) {
  const [answers, setAnswers] = useState<Answer[]>([])
  const [showAll, setShowAll] = useState(false)
  const [top, second, third] = answers
  const uniform = top === 'uniform'
  const unsupported = second === 'unsure'
  const finished = uniform && second === 4 && third === 4
  const step = answers.length
  const pool = useMemo(() => {
    if (step !== 3 || finished) return []
    return uniform ? buildCases() : buildCornerCases().filter((c) => !c.topAllWhite)
  }, [step, uniform, finished])
  const matches = useMemo(() => {
    if (!uniform) return pool.filter((c) => c.cornersHome === third)
    return typeof second === 'number' && typeof third === 'number'
      ? pllQuestionMatches(pool, second, third)
      : []
  }, [pool, uniform, second, third])
  const results = showAll ? pool : matches

  function changeAnswers(next: Answer[]) {
    setAnswers(next)
    setShowAll(false)
  }

  function option(label: string, answer: Answer) {
    return (
      <button key={label} type="button" className="qp-opt" onClick={() => changeAnswers([...answers, answer])}>
        {label}
      </button>
    )
  }

  return (
    <div className="qp">
      {step < 3 && !unsupported && <p className="sub">질문 {step + 1} / 3</p>}
      {step === 0 && (
        <>
          <p className="qp-q">윗면 아홉 칸이 모두 가운데 칸과 같은 색인가요?</p>
          <div className="qp-opts">
            {option('네, 모두 같은 색이에요', 'uniform')}
            {option('아니오, 다른 색이 섞여 있어요', 'mixed')}
          </div>
        </>
      )}
      {top === 'mixed' && step === 1 && (
        <>
          <p className="qp-q">윗면 십자와 옆면 가운데 스티커 네 개가 모두 맞나요?</p>
          <p className="sub">윗면의 십자가 가운데 칸과 같은 색이고, 각 옆면 맨 윗줄의 가운데 칸이 그 면의 중심색과 같아야 해요.</p>
          <div className="cross-example"><CaseDiagram net={cross} colors={colors} /></div>
          <div className="qp-opts">
            {option('네, 십자와 옆면 네 곳이 맞아요', 'aligned')}
            {option('아니오 / 잘 모르겠어요', 'unsure')}
          </div>
        </>
      )}
      {unsupported && (
        <p className="qp-none">그림으로 고르는 코너 단계는 윗면 십자와 옆면 엣지 네 곳이 맞아야 해요. 현재 상태는 직접 입력으로 확인할 수 있어요.</p>
      )}
      {((uniform && step === 1) || (second === 'aligned' && step === 2)) && (
        <>
          <p className="qp-q">윗면 코너 네 개 중 완전히 맞은 코너는 몇 개인가요?</p>
          <p className="sub">코너의 스티커 세 개가 각각 붙어 있는 면의 가운데 칸과 모두 같은 색이면 세세요.</p>
          <div className="qp-opts">{counts.map((n) => option(`${n}개`, n))}</div>
        </>
      )}
      {uniform && step === 2 && (
        <>
          <p className="qp-q">옆면 네 곳 중 맨 윗줄의 가운데 칸이 중심색과 같은 곳은 몇 개인가요?</p>
          <div className="qp-opts">{counts.map((n) => option(`${n}곳`, n))}</div>
        </>
      )}
      {finished && <p className="ok">마지막 층이 이미 맞았어요.</p>}
      {step === 3 && !finished && (
        results.length > 0 ? (
          <>
            <p className="sub">{showAll ? `이 단계의 그림 ${results.length}개` : `이 답과 맞는 그림 ${results.length}개`}. 윗면과 옆면 색까지 같은 그림을 고르세요.</p>
            <div className="gallery-grid">
              {results.map((c) => (
                <button key={c.id} type="button" className="case" onClick={() => onPick(c)}>
                  <span className="case-label">{c.label}</span>
                  <CaseDiagram net={c} colors={colors} />
                </button>
              ))}
            </div>
          </>
        ) : (
          <div className="qp-none">
            <p>이 답과 맞는 그림이 없어요. 답을 다시 확인하거나 이 단계의 전체 그림을 보세요.</p>
            <button type="button" className="primary" onClick={() => setShowAll(true)}>
              이 단계의 그림 {pool.length}개 보기
            </button>
          </div>
        )
      )}
      <div className="qp-foot">
        {step > 0 && (
          <>
            <button type="button" className="ghost" onClick={() => changeAnswers(answers.slice(0, -1))}>이전 질문</button>
            <button type="button" className="ghost" onClick={() => changeAnswers([])}>처음부터</button>
          </>
        )}
        <button type="button" className="ghost" onClick={onManual}>직접 입력하러 가기</button>
      </div>
    </div>
  )
}
