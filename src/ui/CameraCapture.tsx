import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { findFaces, type FaceCandidate } from '../camera/find'
import { classifyTopSticker, classifySideStickers, type Palette, type Rgb } from '../camera/classify'
import {
  grabFrame,
  drawFrameToCanvas,
  assignFaces,
  emptyCalibration,
  addCenter,
  calibrationReady,
  type Calibration,
} from '../camera/frame'
import { createSolvedCube, setColorAt, type Color, type Cube, type Slot } from '../cube/model'
import { lastLayerSlots, SIDE_ORDER } from '../ui/StickerInput'
import { validateLastLayer } from '../cube/solver'

type Props = {
  onDone: (cube: Cube) => void
  onCancel: () => void
}

const SLOTS = lastLayerSlots()
const FRAME_W = 480
const FRAME_H = 360

/** Raw samples we have collected, keyed by where they belong. */
type Collected = {
  /** 9 samples for the U face, row-major */
  u: (Rgb | null)[]
  /** 3 samples per side face, for F, R, L, B */
  sides: Partial<Record<Color, (Rgb | null)[]>>
}

const emptyCollected = (): Collected => ({
  u: Array(9).fill(null),
  sides: {},
})

export function CameraCapture({ onDone, onCancel }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const rafRef = useRef<number>()

  const [error, setError] = useState<string | null>(null)
  void error
  const [running, setRunning] = useState(false)
  const [hits, setHits] = useState<FaceCandidate[]>([])
  void hits
  const [needTop, setNeedTop] = useState(false)
  const [needFront, setNeedFront] = useState(false)
  void needTop
  const needTopRef = useRef<boolean>(false)
  const topGuess = useRef<FaceCandidate | null>(null)
  const topChosen = useRef<string | null>(null)
  const [progress, setProgress] = useState({ u: 0, sides: 0 })
  const [notice, setNotice] = useState<string | null>(null)

  const collected = useRef<Collected>(emptyCollected())
  const cal = useRef<Calibration>(emptyCalibration())
  const faceOfBlob = useRef<Record<string, Color>>({})
  const frontResolved = useRef(false)
  const [labelMap, setLabelMap] = useState<Record<string, Color>>({})
  void labelMap

  /** Latest frame's blobs, kept in a ref so the tap handler can use them. */
  const facesRef = useRef<FaceCandidate[]>([])

  const stop = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    setRunning(false)
  }, [])

  const start = useCallback(async () => {
    setError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      })
      streamRef.current = stream
      const v = videoRef.current
      if (!v) return
      v.srcObject = stream
      await v.play()
      setRunning(true)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setError(
        /NotAllowed|Permission/i.test(msg)
          ? '카메라 권한이 필요합니다. 브라우저 설정에서 허용해 주세요.'
          : `카메라를 켜지 못했습니다: ${msg}`
      )
    }
  }, [])

  useEffect(() => stop, [stop])

  /**
   * Fold one frame into the collected state, before anything is named.
   *
   * Sampling never waits on the user. The earlier version only stored the top
   * face once the user had tapped it, and only offered the tap once two faces
   * were found, so a frame that came back short of faces left the app with
   * nothing stored and nothing to ask: a deadlock. Now every frame contributes
   * and the taps only decide what things get called.
   */
  const ingest = useCallback((faces: FaceCandidate[]) => {
    if (faces.length === 0) return
    // keep the best face by area as the working top face until told otherwise
    const best = faces[0]
    if (!topChosen.current) topGuess.current = best
    const uFace = topChosen.current ? faces.find((f) => f.id === topChosen.current) : topGuess.current
    if (uFace) {
      for (let i = 0; i < 9; i++) {
        if (!collected.current.u[i]) collected.current.u[i] = uFace.stickers[i]
      }
    }
    // Side faces can only be filed once the user has named the cube, but their
    // raw samples are kept per candidate so nothing has to be re-read.
    for (const f of faces) {
      if (f.id === uFace?.id) continue
      const name = faceOfBlob.current[f.id]
      if (!name) continue
      const row: (Rgb | null)[] = collected.current.sides[name] ?? [null, null, null]
      for (let i = 0; i < 3; i++) if (!row[i]) row[i] = f.stickers[i]
      collected.current.sides[name] = row
    }
    setProgress(countCollected())
  }, [])

  const countCollected = () => ({
    u: collected.current.u.filter(Boolean).length,
    sides: Object.values(collected.current.sides).reduce((n, r) => n + (r?.filter(Boolean).length ?? 0), 0),
  })

  const loop = useCallback(() => {
    const v = videoRef.current
    const canvas = canvasRef.current
    if (!v || !canvas) {
      rafRef.current = requestAnimationFrame(loop)
      return
    }
    const ctx = canvas.getContext('2d')
    const drew = ctx ? drawFrameToCanvas(v, ctx, FRAME_W, FRAME_H) : false
    // The overlay goes on top of the frame that was just drawn, so it must not
    // clear the canvas: doing that wiped the video and left a black screen.
    if (ctx && drew) drawOverlay(ctx, hitsRef.current, faceOfBlob.current)
    const img = grabFrame(v, FRAME_W, FRAME_H)
    if (img) {
      const faces = findFaces(img)
      facesRef.current = faces
      setHits(faces)
      // Accumulate straight away, before any naming. Collecting data must never
      // depend on the user having answered a question, or a frame that fails to
      // be recognised leaves the app with nothing to show and nothing to ask.
      ingest(faces)
    }
    rafRef.current = requestAnimationFrame(loop)
  }, [ingest])

  const hitsRef = useRef<FaceCandidate[]>([])

  useEffect(() => {
    if (!running) return
    rafRef.current = requestAnimationFrame(loop)
  }, [running, loop])

  /**
   * Two taps: the top face first, then the face held towards the camera.
   *
   * Guessing the top face as "the blob highest in the image" looked fine and was
   * quietly wrong: when the cube is held low, a side face can sit higher than
   * the top face, and then the whole last layer is read from the wrong face.
   * A tap cannot be silently wrong, and the overlay shows exactly what was
   * picked so the user can see it.
   */
  const onTapFace = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const x = ((e.clientX - rect.left) / rect.width) * FRAME_W
    const y = ((e.clientY - rect.top) / rect.height) * FRAME_H
    const hit = hitsRef.current.find((h) => pointInQuad({ x, y }, h.quad))
    if (!hit) return

    // Measuring the centre of the two faces the user picked gives the reference
    // colours, so calibration follows the same taps instead of guessing.
    cal.current = addCenter(cal.current, 'U', hit.stickers[4])

    if (needTopRef.current) {
      topChosen.current = hit.id
      needTopRef.current = false
      setNeedTop(false)
      setNeedFront(true)
      return
    }

    const topId = topChosen.current
    if (!topId || hit.id === topId) {
      setNotice('서로 다른 두 면을 눌러주세요: 위면 하나, 앞면 하나.')
      return
    }
    const others = hitsRef.current.filter((f) => f.id !== topId)
    const sideBlobs = others.map((f) => ({
      id: f.id,
      quad: f.quad,
      stickers: f.stickers,
      center: f.stickers[4],
      cx: f.quad.reduce((a, p) => a + p.x, 0) / f.quad.length,
      cy: f.quad.reduce((a, p) => a + p.y, 0) / f.quad.length,
      area: f.blocks,
    }))
    const assign = assignFaces(hit.id, sideBlobs)
    const map: Record<string, Color> = { [topId]: 'U' }
    for (const [id, f] of Object.entries(assign)) if (f) map[id] = f
    for (const [id, name] of Object.entries(map)) {
      if (name === 'U') continue
      const face = hitsRef.current.find((f) => f.id === id)
      if (face) cal.current = addCenter(cal.current, name as Color, face.stickers[4])
    }
    faceOfBlob.current = map
    frontResolved.current = true
    setLabelMap(map)
    setNeedFront(false)
  }

  const finish = useCallback(() => {
    const c = collected.current
    const palette: Palette = cal.current.palette
    if (!calibrationReady(cal.current)) {
      setNotice('아직 모든 면을 못 봤어요. 큐브를 돌려서 뒤쪽 면도 보여주세요.')
      return
    }

    // 1. the nine top stickers: white or one of the side colours
    const c2: Cube = cloneCubeSafe(cubeBase())
    for (let i = 0; i < 9; i++) {
      const s = SLOTS[i]
      const rgb = c.u[i]
      if (!rgb) continue
      const col = classifyTopSticker(rgb, palette)
      if (col) setColorAt(c2, s.slot, s.dir, col)
    }
    // 2. the twelve side stickers: cluster them into four colours
    const sideSamples: Rgb[] = []
    const sideSlots: { slot: Slot; dir: Slot }[] = []
    for (const face of SIDE_ORDER) {
      const row = c.sides[face]
      if (!row) continue
      for (let i = 0; i < 3; i++) {
        const sample = row[i]
        if (!sample) continue
        sideSamples.push(sample)
        sideSlots.push({ slot: SIDE_SLOT(face, i), dir: SIDE_DIR(face) })
      }
    }
    if (sideSamples.length > 0) {
      const { colors, confident } = classifySideStickers(sideSamples, palette)
      if (!confident) {
        setNotice('侧面 색이 확실하지 않아요. 한 번 더 천천히 보여주세요.')
        return
      }
      sideSlots.forEach((s, i) => {
        const col = colors[i]
        if (col) setColorAt(c2, s.slot, s.dir, col)
      })
    }

    const problems = validateLastLayer(c2)
    if (problems.length) {
      setNotice(problems[0])
      return
    }
    onDone(c2)
  }, [onDone])

  const status = useMemo(() => {
    if (!running) return '카메라 준비 중'
    if (progress.u < 9) return '위면 스티커를 읽는 중'
    if (progress.sides < 12) return `옆면 ${progress.sides}/12 · 큐브를 180도 돌려주세요`
    return '다 읽었습니다'
  }, [running, progress])

  return (
    <div className="cam">
      <div className="cam-stage">
        <video ref={videoRef} playsInline muted className="cam-video" />
        <canvas
          ref={canvasRef}
          width={FRAME_W}
          height={FRAME_H}
          className="cam-canvas"
          onClick={onTapFace}
        />
        {!running && (
          <div className="cam-cover">
            <p>큐브의 마지막 층이 위로 오게 들고, 두 면이 보이게 하세요.</p>
            <button type="button" className="primary" onClick={start}>
              카메라 켜기
            </button>
          </div>
        )}
      </div>

      <p className="cam-status">{status}</p>
      {needFront && running && <p className="cam-hint">앞면에 해당하는 면을 화면에서 한 번 눌러주세요.</p>}
      {notice && <p className="cam-bad">{notice}</p>}

      <div className="cam-preview">
        <MiniNet collected={collected.current} palette={cal.current.palette} />
      </div>

      <div className="actions">
        <button type="button" className="primary" onClick={finish} disabled={!running}>
          이 상태로 풀기
        </button>
        <button type="button" className="ghost" onClick={stop}>
          끄기
        </button>
        <button type="button" className="ghost" onClick={onCancel}>
          수동으로 입력
        </button>
      </div>
    </div>
  )
}

// --- helpers ------------------------------------------------------------

/** A solved cube is the right base: the lower two layers are assumed correct,
 * so only the last layer gets written. */
function cubeBase(): Cube {
  return createSolvedCube()
}

function cloneCubeSafe(c: Cube): Cube {
  return c.map((s) => s.map((x) => ({ dir: { ...x.dir }, color: x.color })))
}

const SIDE_DIR_VEC: Record<string, Slot> = {
  R: { x: 1, y: 0, z: 0 },
  F: { x: 0, y: 0, z: 1 },
  L: { x: -1, y: 0, z: 0 },
  B: { x: 0, y: 0, z: -1 },
}

function SIDE_DIR(face: string): Slot {
  return SIDE_DIR_VEC[face]
}

/** The three stickers of `face` in the last layer, left to right in the net. */
function SIDE_SLOT(face: string, i: number): Slot {
  const d = SIDE_DIR_VEC[face]
  if (d.x !== 0) return { x: d.x, y: 1, z: [-1, 0, 1][i] }
  return { x: [-1, 0, 1][i], y: 1, z: d.z }
}

function pointInQuad(p: { x: number; y: number }, q: { x: number; y: number }[]): boolean {
  let inside = false
  for (let i = 0, j = q.length - 1; i < q.length; j = i++) {
    const a = q[i]
    const b = q[j]
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) {
      inside = !inside
    }
  }
  return inside
}

function drawOverlay(
  ctx: CanvasRenderingContext2D,
  hits: FaceCandidate[],
  labelMap: Record<string, Color>
) {
  for (const hit of hits) {
    const named = labelMap[hit.id]
    ctx.strokeStyle = named ? '#5b8cff' : '#ffd166'
    ctx.lineWidth = 3
    ctx.beginPath()
    hit.quad.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)))
    ctx.closePath()
    ctx.stroke()
    if (named) {
      ctx.fillStyle = '#5b8cff'
      ctx.font = 'bold 15px sans-serif'
      const cx = hit.quad.reduce((s, p) => s + p.x, 0) / 4
      const cy = hit.quad.reduce((s, p) => s + p.y, 0) / 4
      ctx.fillText(named, cx - 6, cy)
    }
  }
}

/** Live readout of what has been read, so a mistake is visible not silent. */
function MiniNet({ collected, palette }: { collected: Collected; palette: Palette }) {
  const swatch = (rgb: Rgb | null) => (rgb ? `rgb(${rgb.r | 0},${rgb.g | 0},${rgb.b | 0})` : '#20242d')
  return (
    <div className="mininet">
      <div className="mininet-title">지금까지 읽은 것</div>
      <div className="grid3">
        {collected.u.map((s, i) => (
          <span key={i} className="mini" style={{ background: swatch(s) }} />
        ))}
      </div>
      {SIDE_ORDER.map((f) => (
        <div key={f} className="mininet-row">
          <span className="mininet-label">{f}</span>
          <div className="grid3">
            {(collected.sides[f] ?? [null, null, null]).map((s, i) => (
              <span key={i} className="mini" style={{ background: swatch(s) }} />
            ))}
          </div>
        </div>
      ))}
      <span className="visually-hidden">{Object.keys(palette).length} references measured</span>
    </div>
  )
}
