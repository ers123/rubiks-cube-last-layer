import { useState } from 'react'
import { CROSS_COMPLETE, CROSS_FORMULA, crossTurn } from '../cube/cross'

const setupDirections: Record<string, string> = {
  U: '시계 방향으로 90°',
  "U'": '반시계 방향으로 90°',
  U2: '반 바퀴',
}

const edges = [
  { bit: 3, row: 1, column: 2, label: '뒤쪽' },
  { bit: 2, row: 2, column: 1, label: '왼쪽' },
  { bit: 0, row: 2, column: 3, label: '오른쪽' },
  { bit: 1, row: 3, column: 2, label: '앞쪽' },
]

function CrossPattern({ mask, color, onToggle }: { mask: number; color: string; onToggle?: (bit: number) => void }) {
  return (
    <div className="cross-grid">
      <span className="cross-cell" style={{ gridArea: '2 / 2', backgroundColor: color }} />
      {edges.map(({ bit, row, column, label }) => {
        const pressed = Boolean(mask & (1 << bit))
        const style = { gridArea: `${row} / ${column}`, backgroundColor: pressed ? color : undefined }
        return onToggle
          ? <button key={bit} type="button" className="cross-cell" style={style} aria-label={`${label} 엣지`} aria-pressed={pressed} onClick={() => onToggle(bit)} />
          : <span key={bit} className="cross-cell" style={style} />
      })}
    </div>
  )
}

export function CrossGuide({ color, onBack, onContinue }: { color: string; onBack: () => void; onContinue: () => void }) {
  const [mask, setMask] = useState(0)
  const turn = crossTurn(mask)

  return (
    <section className="lesson">
      <h2>윗면 십자 안내</h2>
      <p>아래 두 층을 맞춘 채 선택한 앞면을 계속 정면에 두세요. 윗면에서 가운데 칸과 색이 같은 엣지만 누르세요.</p>
      <CrossPattern mask={mask} color={color} onToggle={(bit) => setMask(mask ^ (1 << bit))} />
      <span className="sub cross-front">앞면 ↑</span>
      {mask === CROSS_COMPLETE ? (
        <>
          <p className="ok" role="status">윗면 십자 완성!</p>
          <p>옆면 맨 윗줄의 가운데 칸도 각 면의 중심색과 맞는지 확인하세요.</p>
          <button className="primary" type="button" onClick={onContinue}>마지막 층 질문으로 돌아가기</button>
        </>
      ) : turn ? (
        <>
          {turn.setup && (
            <>
              <p>윗면을 위에서 보면서 윗층만 {setupDirections[turn.setup]} 돌려 아래 모양에 맞추세요.</p>
              <CrossPattern mask={turn.aligned} color={color} />
            </>
          )}
          <p>같은 앞면을 유지하고 아래 공식을 한 번 돌리세요. F는 앞면, R은 오른쪽 면, U는 윗면입니다. 각 면을 정면에서 볼 때 기본 방향은 시계 방향이고 <code>′</code>는 반시계 방향입니다.</p>
          <code className="lesson-formula">{CROSS_FORMULA}</code>
          <p>가운데 칸과 색이 같은 엣지가 아래 그림과 일치하는지 확인하세요.</p>
          <CrossPattern mask={turn.result} color={color} />
          <button type="button" className="primary" onClick={() => setMask(turn.result)}>그림과 같아요</button>
          <p className="sub">그림과 다르면 위의 엣지를 실제 큐브에 맞춰 다시 선택하세요.</p>
        </>
      ) : (
        <p role="status">엣지 네 칸을 다시 확인하세요. 맞는 엣지의 수는 0개, 2개, 4개 중 하나입니다.</p>
      )}
      <button className="ghost" type="button" onClick={onBack}>돌아가기</button>
    </section>
  )
}
