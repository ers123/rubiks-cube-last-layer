import { rgbToLab, type Lab, type Palette, type Rgb } from './classify'
import { SIDE_COLORS, deltaE } from './classify'
import type { Color } from '../cube/model'

/**
 * Finding the cube in a camera frame.
 *
 * Everything here is a pure function of the pixel data, with no camera and no
 * DOM, so the whole geometry pipeline can be tested against images whose
 * correct answer we already know. That matters: this is the part that is
 * hardest to get right and impossible to eyeball from source code.
 */

export type Pt = { x: number; y: number }

export type FaceHit = {
  /** which cube face this blob is, e.g. 'U' */
  face: Color
  /** quad corners, in image space */
  quad: Pt[]
  /** 9 sticker samples, row-major, in the face's own grid */
  stickers: Rgb[]
  /** the centre sticker, used as the calibration reference */
  center: Rgb
  /** share of the block grid covered, a cheap confidence signal */
  coverage: number
}

export type RGBImage = { width: number; height: number; data: Uint8ClampedArray }

const GW = 48
const GH = 36

/** Perceptually match how a sticker of `face` should look under this light. */
function blockMask(img: RGBImage, ref: Lab, tolerance: number): Float32Array {
  const m = new Float32Array(GW * GH)
  const counts = new Int32Array(GW * GH)
  for (let y = 0; y < img.height; y++) {
    const gy = Math.min(GH - 1, Math.floor((y / img.height) * GH))
    for (let x = 0; x < img.width; x++) {
      const i = (y * img.width + x) * 4
      const lab = rgbToLab({ r: img.data[i], g: img.data[i + 1], b: img.data[i + 2] })
      // A linear falloff, not 1/distance: a sticker that matches perfectly has
      // distance zero, and dividing by that poisons the whole block with
      // Infinity. This is what made the white face undetectable.
      const d = deltaE(lab, ref)
      const gx = Math.min(GW - 1, Math.floor((x / img.width) * GW))
      const gi = gy * GW + gx
      counts[gi]++
      if (d < tolerance) m[gi] += 1 - d / tolerance
    }
  }
  for (let i = 0; i < m.length; i++) {
    // majority vote per block: this is blur + threshold, which is what kills
    // sensor noise without dragging in a full morphology library
    m[i] = counts[i] > 0 ? m[i] / counts[i] : 0
  }
  return m
}

function largestComponent(mask: Float32Array, minScore: number): Set<number> {
  const seen = new Uint8Array(GW * GH)
  let best: number[] = []
  for (let start = 0; start < mask.length; start++) {
    if (seen[start] || mask[start] < minScore) continue
    const comp: number[] = []
    const stack = [start]
    seen[start] = 1
    while (stack.length) {
      const i = stack.pop()!
      comp.push(i)
      const x = i % GW
      const y = (i / GW) | 0
      const nb = [
        x > 0 ? i - 1 : -1,
        x < GW - 1 ? i + 1 : -1,
        y > 0 ? i - GW : -1,
        y < GH - 1 ? i + GW : -1,
      ]
      for (const j of nb) {
        if (j >= 0 && !seen[j] && mask[j] >= minScore) {
          seen[j] = 1
          stack.push(j)
        }
      }
    }
    if (comp.length > best.length) best = comp
  }
  return new Set(best)
}

function toPoints(cells: Set<number>): Pt[] {
  return [...cells].map((i) => ({
    x: ((i % GW) + 0.5) * (1 / GW),
    y: (((i / GW) | 0) + 0.5) * (1 / GH),
  }))
}

/** Andrew's monotone chain. */
function convexHull(pts: Pt[]): Pt[] {
  const p = [...pts].sort((a, b) => a.x - b.x || a.y - b.y)
  if (p.length < 3) return p
  const cross = (o: Pt, a: Pt, b: Pt) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x)
  const lower: Pt[] = []
  for (const q of p) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) lower.pop()
    lower.push(q)
  }
  const upper: Pt[] = []
  for (let i = p.length - 1; i >= 0; i--) {
    const q = p[i]
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) upper.pop()
    upper.push(q)
  }
  lower.pop()
  upper.pop()
  return lower.concat(upper)
}

/** Douglas-Peucker on an open polyline. */
function simplifyOpen(points: Pt[], eps: number): Pt[] {
  if (points.length < 3) return points
  let worst = 0
  let worstIdx = 0
  for (let i = 1; i < points.length - 1; i++) {
    const d = perpDistance(points[i], points[0], points[points.length - 1])
    if (d > worst) {
      worst = d
      worstIdx = i
    }
  }
  if (worst <= eps) return [points[0], points[points.length - 1]]
  const left = simplifyOpen(points.slice(0, worstIdx + 1), eps)
  const right = simplifyOpen(points.slice(worstIdx), eps)
  return [...left.slice(0, -1), ...right]
}

const dist = (a: Pt, b: Pt) => Math.hypot(b.x - a.x, b.y - a.y)

/**
 * Douglas-Peucker on a closed ring.
 *
 * The open version cannot be used directly: it anchors the result to the
 * first and last point, which for a closed hull are arbitrary neighbours and
 * yields three or five corners instead of four. Splitting the ring at its two
 * most distant points and simplifying each half fixes that.
 */
function simplifyClosed(points: Pt[], eps: number): Pt[] {
  if (points.length <= 4) return points
  let ai = 0
  let bi = 0
  let best = -1
  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) {
      const d = dist(points[i], points[j])
      if (d > best) {
        best = d
        ai = i
        bi = j
      }
    }
  }
  const rot = [...points.slice(ai), ...points.slice(0, ai)]
  const bIdx = ((bi - ai) % points.length + points.length) % points.length
  const half1 = rot.slice(0, bIdx + 1)
  const half2 = [...rot.slice(bIdx), rot[0]]
  const s1 = simplifyOpen(half1, eps)
  const s2 = simplifyOpen(half2, eps)
  return [...s1, ...s2.slice(1, -1)]
}

/**
 * Reduce a convex hull to exactly four corners.
 *
 * Tries progressively looser tolerances, and if none of them lands on four
 * points falls back to picking the four hull points that are furthest from the
 * centroid while staying angularly separated. The fallback matters: a projected
 * cube face is a quadrilateral, but a noisy one can simplify to five, and giving
 * up on the face entirely is worse than using an approximate quad.
 */
function quadFromHull(hull: Pt[]): Pt[] {
  if (hull.length < 4) return hull
  if (hull.length === 4) return hull
  let perim = 0
  for (let i = 0; i < hull.length; i++) perim += dist(hull[i], hull[(i + 1) % hull.length])
  for (const f of [0.02, 0.035, 0.05, 0.07, 0.1, 0.14, 0.2]) {
    const q = simplifyClosed(hull, perim * f)
    if (q.length === 4) return q
  }
  // fallback: farthest from the centroid, keeping the four apart
  const c = centroid(hull)
  const ranked = [...hull].sort((a, b) => dist(b, c) - dist(a, c))
  const chosen: Pt[] = []
  for (const p of ranked) {
    const ang = Math.atan2(p.y - c.y, p.x - c.x)
    const far = chosen.every(
      (q) => {
        const a2 = Math.atan2(q.y - c.y, q.x - c.x)
        let d = Math.abs(ang - a2) % (Math.PI * 2)
        if (d > Math.PI) d = Math.PI * 2 - d
        return d > Math.PI / 3
      }
    )
    if (far) chosen.push(p)
    if (chosen.length === 4) break
  }
  return chosen.length === 4 ? chosen : hull
}

function perpDistance(p: Pt, a: Pt, b: Pt): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len = Math.hypot(dx, dy)
  if (len === 0) return Math.hypot(p.x - a.x, p.y - a.y)
  return Math.abs(dy * p.x - dx * p.y + b.x * a.y - b.y * a.x) / len
}

function centroid(pts: Pt[]): Pt {
  const sx = pts.reduce((s, p) => s + p.x, 0)
  const sy = pts.reduce((s, p) => s + p.y, 0)
  return { x: sx / pts.length, y: sy / pts.length }
}

/** Order four corners so that p0 is top-left, p1 top-right, p2 bottom-right, p3 bottom-left. */
function orderQuad(q: Pt[]): Pt[] {
  if (q.length !== 4) return q
  const c = centroid(q)
  const sorted = [...q].sort(
    (a, b) => Math.atan2(a.y - c.y, a.x - c.x) - Math.atan2(b.y - c.y, b.x - c.x)
  )
  // In image space y grows downward, so the first corner in angular order is
  // the top one; rotate so we start at the top-most corner.
  let top = 0
  for (let i = 1; i < 4; i++) if (sorted[i].y < sorted[top].y) top = i
  const out = [sorted[top], sorted[(top + 1) % 4], sorted[(top + 2) % 4], sorted[(top + 3) % 4]]
  return out[0].x < out[3].x ? out : [out[3], out[2], out[1], out[0]]
}

function bilinear(quad: Pt[], u: number, v: number): Pt {
  const top = { x: quad[0].x + (quad[1].x - quad[0].x) * u, y: quad[0].y + (quad[1].y - quad[0].y) * u }
  const bot = { x: quad[3].x + (quad[2].x - quad[3].x) * u, y: quad[3].y + (quad[2].y - quad[3].y) * u }
  return { x: top.x + (bot.x - top.x) * v, y: top.y + (bot.y - top.y) * v }
}

/** Average a small patch around a point so one noisy pixel cannot decide a sticker. */
function samplePatch(img: RGBImage, p: Pt, radius: number): Rgb {
  const cx = Math.round(p.x * img.width)
  const cy = Math.round(p.y * img.height)
  let r = 0
  let g = 0
  let b = 0
  let n = 0
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const x = cx + dx
      const y = cy + dy
      if (x < 0 || y < 0 || x >= img.width || y >= img.height) continue
      const i = (y * img.width + x) * 4
      r += img.data[i]
      g += img.data[i + 1]
      b += img.data[i + 2]
      n++
    }
  }
  return n === 0 ? { r: 0, g: 0, b: 0 } : { r: r / n, g: g / n, b: b / n }
}

export type DetectOptions = {
  /** how far a pixel may sit from the reference colour, in dE */
  tolerance: number
  /** minimum share of a block that must match */
  blockScore: number
  /** patch radius in pixels when sampling a sticker */
  patchRadius: number
}

export const DEFAULT_DETECT: DetectOptions = {
  tolerance: 30,
  blockScore: 0.5,
  patchRadius: 3,
}

export type DetectResult = {
  hits: FaceHit[]
  /** corner quadrilaterals in image pixels, for drawing an overlay */
  overlay: { face: Color; quad: Pt[] }[]
}

/**
 * Find the faces of the cube that are visible in this frame.
 *
 * The approach leans on a fact about the problem rather than on clever vision:
 * with the bottom two layers solved, the three faces you can see always have
 * three different colours, and each of those colours appears in one contiguous
 * blob. So instead of looking for cube edges, look for colour, and fit a quad to
 * each blob. That is far less brittle on a phone camera than edge detection.
 */
export function detectVisibleFaces(
  img: RGBImage,
  palette: Palette,
  options: DetectOptions = DEFAULT_DETECT
): DetectResult {
  const hits: FaceHit[] = []
  const overlay: { face: Color; quad: Pt[] }[] = []

  const candidates: Color[] = ['U', ...SIDE_COLORS]
  for (const face of candidates) {
    const ref = palette[face]
    if (!ref) continue
    const mask = blockMask(img, ref, options.tolerance)
    const cells = largestComponent(mask, options.blockScore)
    if (cells.size < 8) continue

    const pts = toPoints(cells)
    const hull = convexHull(pts)
    const quad = orderQuad(quadFromHull(hull))
    if (quad.length !== 4) continue

    const stickers: Rgb[] = []
    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 3; col++) {
        stickers.push(samplePatch(img, bilinear(quad, (col + 0.5) / 3, (row + 0.5) / 3), options.patchRadius))
      }
    }

    const pixelQuad = quad.map((p) => ({ x: p.x * img.width, y: p.y * img.height }))
    hits.push({
      face,
      quad: pixelQuad,
      stickers,
      center: stickers[4],
      coverage: cells.size / (GW * GH),
    })
    overlay.push({ face, quad: pixelQuad })
  }

  return { hits, overlay }
}
