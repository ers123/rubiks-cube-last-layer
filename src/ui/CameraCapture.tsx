import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { detectVisibleFaces, DEFAULT_DETECT, type FaceHit } from '../camera/detect'
import { classifyTopSticker, classifySideStickers, type Palette, type Rgb } from '../camera/classify'
import {
  grabFrame,
  labelFrame,
  assignFaces,
  emptyCalibration,
  addCenter,
  calibrationReady,
  type Blob,
  type Calibration,
} from '../camera/frame'
import {
  createSolvedCube,
  FACE_COLORS,
  setColorAt,
  type Color,
  type Cube,
  type Slot,
} from '../cube/model'
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
  const [hits, setHits] = useState<FaceHit[]>([])
  void hits
  const [needTop, setNeedTop] = useState(false)
  const [needFront, setNeedFront] = useState(false)
  void needTop
  const needTopRef = useRef<boolean>(false)
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
  const lastBlobs = useRef<Blob[]>([])

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

  /** Fold one frame's detection into the collected state. */
  const ingest = useCallback((frameBlobs: Blob[], frameHits: FaceHit[]) => {
    const labels = labelFrame(frameBlobs)
    const sideBlobs = frameBlobs.filter((b) => b.id !== labels.uId)

    // Calibrate from every face we can see, before naming anything.
    for (const hit of frameHits) {
      const name = faceOfBlob.current[hit.face]
      if (name) cal.current = addCenter(cal.current, name, hit.center)
    }

    // Ask the user to name the faces once we have a usable frame.
    if (!frontResolved.current && !needTopRef.current && sideBlobs.length >= 1) {
      needTopRef.current = true
      setNeedTop(true)
    }

    // The top face: store the nine raw samples, but only once the user has
    // confirmed which face it is.
    const topId = topChosen.current
    if (topId) {
      const uHit = frameHits.find((h) => h.face === topId)
      if (uHit) {
        for (let i = 0; i < 9; i++) {
          if (!collected.current.u[i]) collected.current.u[i] = uHit.stickers[i]
        }
      }
    }

    // Side faces: only store once we know what each blob is called.
    if (frontResolved.current) {
      for (const b of sideBlobs) {
        const face = faceOfBlob.current[b.id]
        if (!face) continue
        const hit = frameHits.find((h) => h.face === b.id)
        if (!hit) continue
        const row: (Rgb | null)[] = collected.current.sides[face] ?? [null, null, null]
        for (let i = 0; i < 3; i++) if (!row[i]) row[i] = hit.stickers[i]
        collected.current.sides[face] = row
      }
    }

    const uCount = collected.current.u.filter(Boolean).length
    const sideCount = Object.values(collected.current.sides).reduce(
      (n, row) => n + (row?.filter(Boolean).length ?? 0),
      0
    )
    setProgress({ u: uCount, sides: sideCount })
  }, [])

  const loop = useCallback(() => {
    const v = videoRef.current
    const canvas = canvasRef.current
    if (!v || !canvas) {
      rafRef.current = requestAnimationFrame(loop)
      return
    }
    const img = grabFrame(v, FRAME_W, FRAME_H)
    if (img) {
      const ctx = canvas.getContext('2d')
      if (ctx) {
        ctx.drawImage(v, 0, 0, FRAME_W, FRAME_H)
        drawOverlay(ctx, FRAME_W, FRAME_H, hitsRef.current, faceOfBlob.current)
      }
      const palette = bootstrapPalette()
      const res = detectVisibleFaces(img, palette, DEFAULT_DETECT)
      hitsRef.current = res.hits
      const blobs: Blob[] = res.hits.map((h) => {
        const cx = h.quad.reduce((s, p) => s + p.x, 0) / h.quad.length
        const cy = h.quad.reduce((s, p) => s + p.y, 0) / h.quad.length
        return { id: h.face, quad: h.quad, stickers: h.stickers, center: h.center, cx, cy, area: h.coverage }
      })
      lastBlobs.current = blobs
      setHits(res.hits)
      ingest(blobs, res.hits)
    }
    rafRef.current = requestAnimationFrame(loop)
  }, [ingest])

  const hitsRef = useRef<FaceHit[]>([])

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

    if (needTopRef.current) {
      topChosen.current = hit.face
      needTopRef.current = false
      setNeedTop(false)
      setNeedFront(true)
      return
    }

    const topId = topChosen.current
    if (!topId || hit.face === topId) {
      setNotice('서로 다른 두 면을 눌러주세요: 위면 하나, 앞면 하나.')
      return
    }
    const sideBlobs = lastBlobs.current.filter((b) => b.id !== topId)
    const assign = assignFaces(hit.face, sideBlobs)
    const map: Record<string, Color> = { [topId]: 'U' }
    for (const [id, f] of Object.entries(assign)) if (f) map[id] = f
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
  w: number,
  h: number,
  hits: FaceHit[],
  labelMap: Record<string, Color>
) {
  ctx.clearRect(0, 0, w, h)
  for (const hit of hits) {
    const named = labelMap[hit.face]
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

/**
 * Coarse palette used only to FIND blobs. Names here can be wrong under a colour
 * cast, which is fine: blob finding only needs the three big regions, and the
 * real references are measured from the frame afterwards.
 */
function bootstrapPalette(): Palette {
  const p = {} as Palette
  for (const c of ['U', 'R', 'F', 'L', 'B'] as Color[]) {
    const hex = FACE_COLORS[c].replace('#', '')
    p[c] = hexToLabQuick(parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16))
  }
  return p
}

function hexToLabQuick(r: number, g: number, b: number) {
  const lin = (v: number) => {
    const c = v / 255
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
  }
  const R = lin(r)
  const G = lin(g)
  const B = lin(b)
  const x = (R * 0.4124564 + G * 0.3575761 + B * 0.1804375) / 0.95047
  const y = R * 0.2126729 + G * 0.7151522 + B * 0.072175
  const z = (R * 0.0193339 + G * 0.119192 + B * 0.9503041) / 1.08883
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116)
  const fx = f(x)
  const fy = f(y)
  const fz = f(z)
  return { L: 116 * fy - 16, a: 500 * (fx - fy), b: 200 * (fy - fz) }
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
