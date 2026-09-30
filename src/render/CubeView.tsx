import { useEffect, useRef, useImperativeHandle, forwardRef, useState } from 'react'
import * as THREE from 'three'
import {
  slotFromIndex,
  applyMove,
  FACE_COLORS,
  type Color,
  type Cube,
  type Vec3,
  type Move,
  type Slot,
} from '../cube/model'

const CUBIE = 1.0
const STICKER_OFFSET = CUBIE / 2 + 0.01
const STICKER_SIZE = 0.86

export type CubeViewHandle = {
  /** Play a move, resolving when the animation finishes. */
  play: (move: Move) => Promise<void>
  /** Flash the given slots. */
  highlight: (slots: Slot[]) => void
}

type Props = {
  cube: Cube
  /** Bump this to force a full rebuild (input change / reset). */
  revision: number
  size?: number
  /** Called once if 3D is unavailable, so the app can fall back to 2D. */
  onUnavailable?: () => void
}

const FACE_AXIS: Record<string, 'x' | 'y' | 'z'> = { R: 'x', L: 'x', U: 'y', D: 'y', F: 'z', B: 'z' }
const FACE_SIGN: Record<string, number> = { R: 1, L: -1, U: 1, D: -1, F: 1, B: -1 }

/** How far the cube has to turn for one unit of `amount`. */
const DIR_ANGLE: Record<number, number> = { 1: 1, 2: 2, 3: -1 }

export const CubeView = forwardRef<CubeViewHandle, Props>(function CubeView(
  { cube, revision, size = 320, onUnavailable },
  ref
) {
  const hostRef = useRef<HTMLDivElement>(null)
  const groupsRef = useRef<THREE.Group[]>([])
  const meshesRef = useRef<{ slot: number; dir: Vec3; mesh: THREE.Mesh; base: THREE.Color }[]>([])
  const stateRef = useRef<{ cube: Cube; busy: boolean }>({ cube, busy: false })
  const highlightRef = useRef<THREE.Mesh[]>([])
  const rafRef = useRef<number>()
  const rendererOkRef = useRef(true)
  const [noScene, setNoScene] = useState(false)

  stateRef.current.cube = cube

  // --- scene setup (once) ---
  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    // Some environments (headless browsers, locked-down WebViews) have no WebGL
    // at all. A cube view is a nicety, so degrade instead of taking the app
    // down with it.
    let renderer: THREE.WebGLRenderer
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    } catch {
      rendererOkRef.current = false
      setNoScene(true)
      onUnavailable?.()
      return
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setSize(size, size)
    host.appendChild(renderer.domElement)

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100)
    camera.position.set(5.2, 5.0, 6.4)
    camera.lookAt(0, 0, 0)

    scene.add(new THREE.AmbientLight(0xffffff, 1.5))
    const key1 = new THREE.DirectionalLight(0xffffff, 1.6)
    key1.position.set(4, 8, 6)
    scene.add(key1)
    const key2 = new THREE.DirectionalLight(0xffffff, 0.7)
    key2.position.set(-6, -2, -5)
    scene.add(key2)

    const root = new THREE.Group()
    scene.add(root)

    // 27 cubie groups
    groupsRef.current = []
    for (let i = 0; i < 27; i++) {
      const g = new THREE.Group()
      root.add(g)
      groupsRef.current.push(g)
    }

    // one sticker mesh per sticker
    const stickerGeo = new THREE.PlaneGeometry(STICKER_SIZE, STICKER_SIZE)
    for (let i = 0; i < 27; i++) {
      const s = slotFromIndex(i)
      for (const d of [{ x: 1, y: 0, z: 0 }, { x: -1, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }, { x: 0, y: -1, z: 0 }, { x: 0, y: 0, z: 1 }, { x: 0, y: 0, z: -1 }]) {
        if (d.x !== 0 && d.x !== s.x) continue
        if (d.y !== 0 && d.y !== s.y) continue
        if (d.z !== 0 && d.z !== s.z) continue
        if (s.x === 0 && s.y === 0 && s.z === 0) continue // the core piece is invisible
        const mat = new THREE.MeshStandardMaterial({ roughness: 0.55, metalness: 0.0 })
        const m = new THREE.Mesh(stickerGeo, mat)
        m.position.set(d.x * STICKER_OFFSET, d.y * STICKER_OFFSET, d.z * STICKER_OFFSET)
        m.lookAt(m.position.clone().add(new THREE.Vector3(d.x, d.y, d.z)))
        m.userData.baseColor = new THREE.Color('#dddddd')
        groupsRef.current[i].add(m)
        meshesRef.current.push({ slot: i, dir: d, mesh: m, base: new THREE.Color('#dddddd') })
      }
    }

    // solid body so gaps between stickers read as a real cube
    const bodyGeo = new THREE.BoxGeometry(CUBIE * 0.98, CUBIE * 0.98, CUBIE * 0.98)
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x111318, roughness: 0.9 })
    for (let i = 0; i < 27; i++) {
      const m = new THREE.Mesh(bodyGeo, bodyMat)
      groupsRef.current[i].add(m)
    }

    const idle = () => {
      rafRef.current = requestAnimationFrame(idle)
      root.rotation.y += 0.0035
      renderer.render(scene, camera)
    }
    idle()

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      renderer.dispose()
      host.removeChild(renderer.domElement)
    }
  }, [size])

  // --- sync visuals from the logical cube ---
  /**
   * Paint each sticker mesh from the cubie sticker that faces the same way.
   *
   * The earlier version indexed meshes by direction through a map built from
   * `c[i]`, which put every direction of a corner onto one mesh and then coloured
   * only that one. Two of every three stickers kept a stale colour, so a solved
   * face would show whatever was on screen before. Reading the direction off the
   * mesh record itself is the only way each one can be set to its own colour.
   */
  const sync = (c: Cube) => {
    for (const rec of meshesRef.current) {
      const st = c[rec.slot].find(
        (s) => s.dir.x === rec.dir.x && s.dir.y === rec.dir.y && s.dir.z === rec.dir.z
      )
      if (!st) continue
      const mat = rec.mesh.material as THREE.MeshStandardMaterial
      mat.color.set(FACE_COLORS[st.color as Color])
      rec.mesh.userData.baseColor = mat.color.clone()
    }
  }

  const place = (c: Cube) => {
    if (!rendererOkRef.current) return
    for (let i = 0; i < 27; i++) {
      const s = slotFromIndex(i)
      groupsRef.current[i].position.set(s.x, s.y, s.z)
      groupsRef.current[i].quaternion.identity()
      groupsRef.current[i].rotation.set(0, 0, 0)
      groupsRef.current[i].userData.slotVec = new THREE.Vector3(s.x, s.y, s.z)
    }
    sync(c)
  }

  useEffect(() => {
    place(cube)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revision, noScene])

  useImperativeHandle(
    ref,
    () => ({
      play: (move: Move) =>
        new Promise<void>((resolve) => {
          if (!rendererOkRef.current) {
            // still advance the model so the app keeps working without 3D
            applyMove(stateRef.current.cube, move)
            return resolve()
          }
          if (stateRef.current.busy) return resolve()
          stateRef.current.busy = true
          const axis = FACE_AXIS[move.face]
          const sign = FACE_SIGN[move.face]
          const dir = new THREE.Vector3(
            axis === 'x' ? 1 : 0,
            axis === 'y' ? 1 : 0,
            axis === 'z' ? 1 : 0
          )
          const angle = ((DIR_ANGLE[move.amount] * Math.PI) / 2) * sign

          const layer: THREE.Group[] = []
          for (let i = 0; i < 27; i++) {
            const s = slotFromIndex(i)
            const v = axis === 'x' ? s.x : axis === 'y' ? s.y : s.z
            if (v === sign) layer.push(groupsRef.current[i])
          }

          const t0 = performance.now()
          const DUR = 420
          const tick = () => {
            const k = Math.min(1, (performance.now() - t0) / DUR)
            const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2
            const partial = new THREE.Quaternion().setFromAxisAngle(dir, angle * e)
            for (const g of layer) {
              g.quaternion.copy(partial)
              const s = g.userData.slotVec as THREE.Vector3 | undefined
              if (s) g.position.copy(s).applyQuaternion(partial)
            }
            if (k < 1) {
              requestAnimationFrame(tick)
            } else {
              for (const g of layer) {
                g.quaternion.identity()
                g.rotation.set(0, 0, 0)
              }
              place(stateRef.current.cube)
              applyMove(stateRef.current.cube, move)
              stateRef.current.busy = false
              resolve()
            }
          }
          requestAnimationFrame(tick)
        }),
      highlight: (slots: Slot[]) => {
        if (!rendererOkRef.current) return
        highlightRef.current.forEach((m) => {
          const mat = m.material as THREE.MeshStandardMaterial
          mat.emissive.set(0x000000)
        })
        highlightRef.current = []
        const wanted = new Set(slots.map((s) => `${s.x},${s.y},${s.z}`))
        for (const rec of meshesRef.current) {
          const s = slotFromIndex(rec.slot)
          if (!wanted.has(`${s.x},${s.y},${s.z}`)) continue
          const mat = rec.mesh.material as THREE.MeshStandardMaterial
          mat.emissive.set(0x333333)
          highlightRef.current.push(rec.mesh)
        }
      },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  )

  return <div ref={hostRef} style={{ width: size, height: size, margin: '0 auto' }} />
})

