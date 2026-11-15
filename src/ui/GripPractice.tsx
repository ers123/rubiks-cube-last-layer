import { useState } from 'react'
import { lastLayerFormulas } from '../cube/completeLastLayer'
import { netOf } from '../cube/cases'
import { formulas, gripFaces, gripQuestion, solvesGrip, type GripFace } from '../cube/gripQuiz'
import type { Color } from '../cube/model'
import { CaseDiagram } from './CaseDiagram'
import { COLOR_NAMES } from './cubeColors'

import { dueQuestions, recordAnswer } from './reviewQueue'
import { FormulaQuestion } from './FormulaPractice'

export function GripPractice({ colors, palette, review, onBack }: {
  colors: Record<Color, string>
  palette: Record<Color, Color>
  review: boolean
  onBack: () => void
}) {
  const [questions] = useState(() => review ? dueQuestions() : formulas.map(({ name }) => `grip:${name}`))
  const [position, setPosition] = useState(0)
  const [front, setFront] = useState<GripFace | ''>('')
  const [choice, setChoice] = useState('')
  const [feedback, setFeedback] = useState<'wrong' | 'correct' | null>(null)
  const [notice, setNotice] = useState('')
  const key = questions[position]
  const [mode, name] = key?.split(':') ?? []
  const index = formulas.findIndex((formula) => formula.name === name)
  const target = formulas[index]
  const recalled = lastLayerFormulas.find((formula) => formula.name === name)
  const cube = mode === 'grip' && target ? gripQuestion(index) : null

  function grade() {
    if (!cube || !front || !choice) return
    const correct = solvesGrip(cube, front, choice)
    setNotice(recordAnswer(key, correct))
    setFeedback(correct ? 'correct' : 'wrong')
  }

  function next() {
    setPosition(position + 1)
    setFront('')
    setChoice('')
    setFeedback(null)
    setNotice('')
  }

  return (
    <section className="lesson">
      <h2>{review ? '오늘의 복습' : '큐브 그림 퀴즈'}</h2>
      {mode === 'formula' && recalled ? (
        <>
          <FormulaQuestion key={key} name={recalled.name} seq={recalled.seq} />
          <button type="button" className="ghost" onClick={next}>다음 문제</button>
        </>
      ) : cube ? (
        <>
          <p>윗면을 그대로 두고 큐브 전체를 돌려 어느 색 면을 앞으로 둘지, 이어서 어떤 공식을 쓸지 고르세요.</p>
          <div className="mininet"><CaseDiagram net={netOf(cube)} colors={colors} /></div>
          <label htmlFor="grip-front">앞으로 둘 면</label>
          <select id="grip-front" value={front} disabled={Boolean(feedback)} onChange={(event) => setFront(event.target.value as GripFace)}>
            <option value="">앞면 선택</option>
            {gripFaces.map((face) => <option key={face} value={face}>{COLOR_NAMES[palette[face]]}</option>)}
          </select>
          <label htmlFor="grip-formula">사용할 공식</label>
          <select id="grip-formula" value={choice} disabled={Boolean(feedback)} onChange={(event) => setChoice(event.target.value)}>
            <option value="">공식 선택</option>
            {formulas.map(({ name, seq }) => <option key={name} value={seq}>{name}</option>)}
          </select>
          {feedback ? (
            <>
              <p role="status">{feedback === 'correct' ? '정답이에요!' : `예시 정답은 ${COLOR_NAMES[palette[target.front]]} 앞면과 ${target.name}입니다.`} {notice}</p>
              <button type="button" className="primary" onClick={next}>다음 문제</button>
            </>
          ) : <button type="button" className="primary" disabled={!front || !choice} onClick={grade}>정답 확인</button>}
        </>
      ) : <p role="status">{questions.length ? '오늘 연습을 마쳤어요.' : '오늘 복습할 문제가 없어요.'}</p>}
      <button type="button" className="ghost" onClick={onBack}>돌아가기</button>
    </section>
  )
}
