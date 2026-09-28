import { useCallback, useMemo, useRef, useState } from 'react'
import { CubeView, type CubeViewHandle } from './render/CubeView'
import { StickerInput } from './ui/StickerInput'
import { CameraCapture } from './ui/CameraCapture'
import { createSolvedCube, applyMove, applySequence, parseMoves, type Cube, type Move } from './cube/model'
import { solveLastLayer, type Solution } from './cube/solver'

type Screen = 'camera' | 'input' | 'solve'

export default function App() {
  const [cube, setCube] = useState<Cube>(() => createSolvedCube())
  const [revision, setRevision] = useState(0)
  const [screen, setScreen] = useState<Screen>('input')
  const [solution, setSolution] = useState<Solution | null>(null)
  const [stepIndex, setStepIndex] = useState(0)
  const [done, setDone] = useState(false)
  const [no3d, setNo3d] = useState(false)
  const viewRef = useRef<CubeViewHandle>(null)
  const cubeRef = useRef<Cube>(cube)
  cubeRef.current = cube

  const handleInput = useCallback((c: Cube) => {
    setCube(c)
    setRevision((r) => r + 1)
  }, [])

  const handleSolve = useCallback(() => {
    const sol = solveLastLayer(cube)
    setSolution(sol)
    setStepIndex(0)
    setDone(false)
    setScreen('solve')
  }, [cube])

  const handleReset = useCallback(() => {
    setCube(createSolvedCube())
    setRevision((r) => r + 1)
    setSolution(null)
    setDone(false)
    setStepIndex(0)
    setScreen('input')
  }, [])

  /** Play one algorithm (all its repetitions). */
  const playStep = useCallback(
    async (index: number) => {
      const step = solution?.steps[index]
      if (!step) return
      setStepIndex(index)
      viewRef.current?.highlight(step.focus)
      for (let r = 0; r < step.reps; r++) {
        const moves = parseMoves(step.seq)
        const view = viewRef.current
        if (view) {
          for (const mv of moves) await view.play(mv)
        } else {
          for (const mv of moves) applyMove(cubeRef.current, mv)
        }
      }
      setCube((c) => {
        const next = c.map((s) => s.map((x) => ({ dir: { ...x.dir }, color: x.color })))
        for (let r = 0; r < step.reps; r++) applySequence(next, step.seq)
        return next
      })
    },
    [solution]
  )

  const algCount = useMemo(() => {
    if (!solution) return 0
    return new Set(solution.steps.filter((s) => s.kind === 'alg').map((s) => s.seq)).size
  }, [solution])

  return (
    <main className="app">
      <header>
        <h1>큐브 라스트</h1>
        <p className="sub">마지막 층만, 외울 alg 최소로</p>
      </header>

      {screen === 'camera' && (
        <CameraCapture
          onDone={(c) => {
            handleInput(c)
            setStepIndex(0)
            setDone(false)
            setScreen('solve')
          }}
          onCancel={() => setScreen('input')}
        />
      )}

      {screen === 'input' && (
        <>
          {!no3d && <CubeView ref={viewRef} cube={cube} revision={revision} size={260} onUnavailable={() => setNo3d(true)} />}
          {no3d && <p className="sub">3D 미리보기를 쓸 수 없어 2D로 보여드립니다.</p>}
          <StickerInput cube={cube} onChange={handleInput} onReset={handleSolve} />
          <button type="button" className="ghost" onClick={() => setScreen('camera')}>
            카메라로 읽기 (아직 완성 안 됨)
          </button>
        </>
      )}

      {screen === 'solve' && solution && (
        <>
          {!no3d && <CubeView ref={viewRef} cube={cube} revision={revision} size={260} onUnavailable={() => setNo3d(true)} />}

          <div className="verdict">
            {solution.alreadySolved && <p className="ok">마지막 층 이미 완성입니다 🎉</p>}
            {solution.failure && (
              <div className="bad">
                <p>입력한 상태를 확인해 주세요.</p>
                <ul>
                  {(solution.problems ?? [solution.failure]).map((p) => (
                    <li key={p}>{p}</li>
                  ))}
                </ul>
              </div>
            )}
            {!solution.alreadySolved && !solution.failure && (
              <>
                <p className="case">
                  {algCount === 0
                    ? 'U 돌리기만 하면 끝나요. 외울 게 없어요.'
                    : `알고리즘 ${algCount}개만 외우면 돼요.`}
                </p>
                {algCount > 0 && (
                  <p className="sub">
                    현재 상태: {solution.caseName} · 총{' '}
                    {solution.steps.filter((s) => s.kind === 'alg').length}회 실행
                  </p>
                )}
              </>
            )}
          </div>

          {solution.steps.length > 0 && (
            <ol className="steps">
              {solution.steps.map((s, i) => (
                <li key={`${s.seq}-${i}`} className={i === stepIndex ? 'cur' : ''}>
                  <button type="button" onClick={() => playStep(i)}>
                    <span className="idx">{i + 1}</span>
                    <span className="lbl">{s.label}</span>
                    <code>{s.seq}</code>
                  </button>
                </li>
              ))}
            </ol>
          )}

          {done && <p className="ok big">마지막 층 완성! 🎉</p>}

          <div className="actions">
            <button
              type="button"
              className="primary"
              onClick={async () => {
                for (let i = 0; i < solution.steps.length; i++) await playStep(i)
                setDone(true)
              }}
              disabled={solution.steps.length === 0}
            >
              전체 재생
            </button>
            <button type="button" className="ghost" onClick={() => setScreen('camera')}>
              카메라로 다시
            </button>
            <button type="button" className="ghost" onClick={() => setScreen('input')}>
              수동 수정
            </button>
            <button type="button" className="ghost" onClick={handleReset}>
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
