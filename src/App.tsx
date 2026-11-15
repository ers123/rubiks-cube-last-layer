import { useMemo, useRef, useState } from 'react'
import { CubeView, type CubeViewHandle } from './render/CubeView'
import { StickerInput } from './ui/StickerInput'
import { CaseGallery } from './ui/CaseGallery'
import { QuestionPicker } from './ui/QuestionPicker'
import { CaseDiagram } from './ui/CaseDiagram'
import { adjacentColors, COLOR_NAMES, cssColors, cubeColors } from './ui/cubeColors'
import { whyOf } from './cube/why'
import { observe } from './cube/observe'
import { netOf, netToCube } from './cube/cases'
import { createSolvedCube, cloneCube, applyMove, parseMoves, COLOR_FACE_ORDER, type Color, type Cube, type Move } from './cube/model'
import { isLastLayerSolved, solveLastLayer, type Solution } from './cube/solver'

type Screen = 'input' | 'gallery' | 'ask' | 'solve'

export default function App() {
  const [cube, setCube] = useState<Cube>(() => createSolvedCube())
  const [topColor, setTopColor] = useState<Color>('U')
  const [frontColor, setFrontColor] = useState<Color>('F')
  const palette = useMemo(() => cubeColors(topColor, frontColor), [topColor, frontColor])
  const colors = useMemo(() => cssColors(palette), [palette])
  const [screen, setScreen] = useState<Screen>('input')
  const [solution, setSolution] = useState<Solution | null>(null)
  const [completed, setCompleted] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [no3d, setNo3d] = useState(false)
  const [preview, setPreview] = useState<Cube | null>(null)
  const viewRef = useRef<CubeViewHandle>(null)
  const playingRef = useRef(false)
  const lastStepStart = useRef<Cube | null>(null)
  const watched = useMemo(() => observe(cube), [cube])
  const done = Boolean(solution?.steps.length && completed === solution.steps.length && isLastLayerSolved(cube))

  function showSolution(target: Cube) {
    setCube(target)
    setSolution(solveLastLayer(target))
    setCompleted(0)
    lastStepStart.current = null
    setScreen('solve')
  }

  function handleReset() {
    setCube(createSolvedCube())
    setSolution(null)
    setCompleted(0)
    setScreen('input')
  }

  async function play(mode: 'next' | 'all' | 'replay') {
    if (!solution || playingRef.current) return
    const startIndex = mode === 'replay' ? completed - 1 : completed
    const startCube = mode === 'replay' ? lastStepStart.current : cube
    if (!startCube || !solution.steps[startIndex]) return

    playingRef.current = true
    setPlaying(true)
    let current = startCube
    const endIndex = mode === 'all' ? solution.steps.length : startIndex + 1
    try {
      for (let i = startIndex; i < endIndex; i++) {
        const step = solution.steps[i]
        lastStepStart.current = current
        viewRef.current?.highlight(step.focus)
        const moves = parseMoves(step.seq)
        for (let r = 0; r < step.reps; r++) {
          for (const move of moves) {
            const next = cloneCube(current)
            applyMove(next, move)
            const view = viewRef.current
            if (view) {
              await view.play(move, current, next)
            } else {
              setPreview(current)
              await new Promise<void>((resolve) => window.setTimeout(resolve, 200))
            }
            current = next
          }
        }
        setCube(current)
        setPreview(null)
        setCompleted(i + 1)
      }
    } finally {
      playingRef.current = false
      setPlaying(false)
      setPreview(null)
    }
  }

  const algCount = useMemo(() => {
    if (!solution) return 0
    return new Set(solution.steps.filter((s) => s.kind === 'alg').map((s) => s.seq)).size
  }, [solution])

  return (
    <main className="app">
      <header>
        <h1>큐브 라스트</h1>
        <p className="sub">아래 두 층을 맞춘 큐브의 마지막 층 풀이</p>
      </header>

      {screen !== 'input' && (
        <p className="sub">윗면 {COLOR_NAMES[palette.U]} · 앞면 {COLOR_NAMES[palette.F]}</p>
      )}

      {screen === 'input' && (
        <>
          <fieldset className="cube-colors">
            <legend>내 큐브의 중심색</legend>
            <div className="color-fields">
              <div>
                <label htmlFor="top-color">윗면</label>
                <select id="top-color" value={topColor} onChange={(event) => {
                  const top = event.target.value as Color
                  const adjacent = adjacentColors(top)
                  setTopColor(top)
                  if (!adjacent.includes(frontColor)) setFrontColor(adjacent[0])
                }}>
                  {COLOR_FACE_ORDER.map((color) => <option key={color} value={color}>{COLOR_NAMES[color]}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="front-color">앞면</label>
                <select id="front-color" value={frontColor} onChange={(event) => setFrontColor(event.target.value as Color)}>
                  {adjacentColors(topColor).map((color) => <option key={color} value={color}>{COLOR_NAMES[color]}</option>)}
                </select>
              </div>
            </div>
            <p className="sub">선택한 면을 위와 앞으로 두세요. 오른쪽 중심색은 {COLOR_NAMES[palette.R]}입니다.</p>
          </fieldset>
          {!no3d && <CubeView ref={viewRef} cube={cube} colors={colors} size={260} onUnavailable={() => setNo3d(true)} />}
          {no3d && <p className="sub">3D 미리보기를 쓸 수 없어 2D로 보여드립니다.</p>}
          <StickerInput cube={cube} palette={palette} colors={colors} onChange={setCube} onSolve={() => showSolution(cube)} />
          <button type="button" className="primary" onClick={() => setScreen('ask')}>
            질문 3개로 좁히기 (추천)
          </button>
          <button type="button" className="ghost" onClick={() => setScreen('gallery')}>
            그림 72개에서 고르기
          </button>
        </>
      )}

      {screen === 'ask' && (
        <>
          <h2>질문 3개로 좁히기</h2>
          <QuestionPicker
            colors={colors}
            onManual={() => setScreen('input')}
            onPick={(c) => showSolution(netToCube(c))}
          />
          <button type="button" className="ghost" onClick={() => setScreen('gallery')}>
            그림 72개에서 고르기
          </button>
        </>
      )}

      {screen === 'gallery' && (
        <>
          <h2>그림으로 고르기</h2>
          <CaseGallery
            colors={colors}
            onPick={(c) => showSolution(netToCube(c))}
          />
          <button type="button" className="ghost" onClick={() => setScreen('input')}>
            직접 입력하러 가기
          </button>
        </>
      )}

      {screen === 'solve' && solution && (
        <>
          {!no3d && <CubeView ref={viewRef} cube={cube} colors={colors} size={260} onUnavailable={() => setNo3d(true)} />}

          {no3d && (
            <div className="mininet">
              <span className="mininet-title">현재 큐브 · 2D</span>
              <CaseDiagram net={netOf(preview ?? cube)} colors={colors} />
            </div>
          )}
          {!done && (
            <div className="verdict">
              {solution.alreadySolved && <p className="ok">마지막 층 이미 완성입니다 🎉</p>}
              {solution.failure && (
                <div className="bad">
                  <p>{solution.problems ? '입력한 상태를 확인해 주세요.' : '이 상태의 풀이를 찾지 못했어요.'}</p>
                  <ul>
                    {(solution.problems ?? [solution.failure]).map((p) => (
                      <li key={p}>{p}</li>
                    ))}
                  </ul>
                </div>
              )}
              {!solution.alreadySolved && !solution.failure && (
                <>
                  <p className="solution-summary">
                    {algCount === 0
                      ? 'U 돌리기만 하면 끝나요. 외울 게 없어요.'
                      : `알고리즘 ${algCount}개만 외우면 돼요.`}
                  </p>
                  {algCount > 0 && (
                    <p className="sub">
                      현재 상태: {solution.caseName} · 총{' '}
                      {solution.steps.reduce((count, step) => count + (step.kind === 'alg' ? step.reps : 0), 0)}회 실행
                    </p>
                  )}
                </>
              )}
            </div>
          )}

          {solution.steps.length > 0 && (
            <>
              <p className="watch">지금 볼 것 · {watched.look}</p>
              {done && !playing && <p className="ok big" role="status">마지막 층 완성! 🎉</p>}
              <div className="actions">
                <button type="button" className="primary" disabled={playing || completed >= solution.steps.length} onClick={() => void play('next')}>
                  다음 단계
                </button>
                <button type="button" className="ghost" disabled={playing || completed === 0} onClick={() => void play('replay')}>
                  마지막 단계 다시 보기
                </button>
                {!done && (
                  <button type="button" className="ghost" disabled={playing || completed >= solution.steps.length} onClick={() => void play('all')}>
                    {completed === 0 ? '전체 재생' : '남은 단계 재생'}
                  </button>
                )}
              </div>
              <ol className="steps">
                {solution.steps.map((s, i) => {
                  const why = whyOf(s.baseLabel)
                  return (
                    <li key={`${s.seq}-${i}`} className={i === completed ? 'cur' : ''}>
                      <button type="button" disabled={playing || i !== completed} onClick={() => void play('next')}>
                        <span className="idx">{i + 1}</span>
                        <span className="lbl">{s.label}</span>
                        <code>{s.seq}{s.reps > 1 ? ` × ${s.reps}` : ''}</code>
                      </button>
                      <p className="why-what">{why.what}</p>
                      <p className="why-know">확인법 · {why.howToKnow}</p>
                    </li>
                  )
                })}
              </ol>
            </>
          )}

          <div className="actions">
            <button type="button" className="ghost" disabled={playing} onClick={() => setScreen('gallery')}>
              다른 그림 고르기
            </button>
            <button type="button" className="ghost" disabled={playing} onClick={() => setScreen('input')}>
              수동 수정
            </button>
            <button type="button" className="ghost" disabled={playing} onClick={handleReset}>
              처음부터
            </button>
          </div>

          <section className="alghelp">
            <h2>배워야 할 알고리즘</h2>
            <ul>
              <li>
                <code>R U R&apos; U R U2 R&apos;</code> <span>Sune — 코너 방향</span>
              </li>
              <li>
                <code>R U2 R&apos; U&apos; R U&apos; R&apos;</code> <span>Anti-Sune</span>
              </li>
              <li>
                <code>U R U&apos; L&apos; U R&apos; U&apos; L</code> <span>Niklas — 코너 자리</span>
              </li>
              <li>
                <code>F2 U L R&apos; F2 L&apos; R U F2</code> <span>Ua — 에지 자리</span>
              </li>
            </ul>
            <p className="sub">
              U 돌리기는 외울 게 없습니다. 이 4개면 288가지 PLL 전부를 커버합니다.
            </p>
          </section>
        </>
      )}
    </main>
  )
}

export type { Move }
