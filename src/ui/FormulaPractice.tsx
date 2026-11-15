import { useState } from 'react'
import type { SolveStep } from '../cube/solver'

function FormulaQuestion({ name, seq }: { name: string; seq: string }) {
  const [answer, setAnswer] = useState('')
  const [feedback, setFeedback] = useState<'correct' | 'wrong' | 'revealed' | null>(null)
  const moves = seq.split(' ')
  const split = Math.ceil(moves.length / 2) - 1
  const suffix = moves.slice(split).join(' ')

  return (
    <form className="lesson" onSubmit={(event) => {
      event.preventDefault()
      const normalized = answer.trim().toUpperCase().replace(/[′’]/g, "'").replace(/\s+/g, '')
      setFeedback(normalized === suffix.replace(/ /g, '') ? 'correct' : 'wrong')
    }}>
      <p>{name} 공식의 뒷부분을 채워 보세요.</p>
      <code className="lesson-formula">{moves.slice(0, split).join(' ')} <span aria-label="빈칸">___</span></code>
      <label htmlFor="formula-answer">빈칸에 들어갈 회전 {moves.length - split}개</label>
      <input id="formula-answer" value={answer} autoComplete="off" autoCapitalize="characters" spellCheck={false}
        onChange={(event) => { setAnswer(event.target.value); setFeedback(null) }} />
      <div className="actions">
        <button type="submit" className="primary" disabled={!answer.trim()}>정답 확인</button>
        <button type="button" className="ghost" onClick={() => setFeedback('revealed')}>정답 보기</button>
      </div>
      {feedback && (
        <p role="status">
          {feedback === 'wrong' ? '아직 달라요. 회전 순서와 방향을 확인해 보세요.' : (
            <>{feedback === 'correct' ? '정답이에요! ' : '전체 공식 '}<code>{seq}</code></>
          )}
        </p>
      )}
    </form>
  )
}

export function FormulaPractice({ steps, onBack }: { steps: SolveStep[]; onBack: () => void }) {
  const formulas = [...new Map(steps.filter((step) => step.kind === 'alg').map((step) => [step.seq, step])).values()]
  const [index, setIndex] = useState(0)
  const formula = formulas[index]
  return (
    <section className="lesson">
      <h2>방금 쓴 공식 연습</h2>
      {formulas.length > 1 && (
        <label>
          연습할 공식
          <select value={index} onChange={(event) => setIndex(Number(event.target.value))}>
            {formulas.map((step, i) => <option key={step.seq} value={i}>{step.baseLabel}</option>)}
          </select>
        </label>
      )}
      <FormulaQuestion key={formula.seq} name={formula.baseLabel} seq={formula.seq} />
      <button className="ghost" type="button" onClick={onBack}>풀이 결과로 돌아가기</button>
    </section>
  )
}
