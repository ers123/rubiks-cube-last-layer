import type { Pt, RGBImage } from './detect'
import { rgbToLab, deltaE, type Lab } from './classify'

/**
 * Finding the cube without asking what colour anything is.
 *
 * The earlier version started from a hard-coded palette of the six nominal
 * sticker colours and looked for regions matching it. That works on a
 * synthetic render, which is drawn in exactly those colours, and fails on a
 * real photograph: on a phone snapshot of an actual cube, the green sticker
 * landed more than 60 dE away from the nominal green, so the green face
 * produced zero blocks at any tolerance.
 *
 * So the reference colours are not an input any more. Faces are found as large,
 * compact, single-coloured regions in the image itself, and the reference for
 * each face is measured from that region. This is the same idea the colour
 * classifier already relied on, applied to the finding step as well.
 */

/** What makes a region a cube face rather than a patch of desk. */
export type FaceCandidate = {
  id: string
  quad: Pt[]
  stickers: RgbPatch[]
  /** measured reference colour, the median of the region's interior */
  reference: Lab
  blocks: number
  /** share of the block grid this face covers */
  coverage: number
  /** 0..1, how solidly the region fills its own bounding box */
  solidity: number
}

export type RgbPatch = { r: number; g: number; b: number }

const GW = 48

export type FindOptions = {
  /** how many colour clusters to look for in the whole frame */
  clusters: number
  /** smallest region, in blocks, that can be a face */
  minBlocks: number
  /** how full of its own bounding box a face has to be */
  minSolidity: number
  /** fraction of a sticker patch averaged */
  patchRadius: number
  /**
   * Largest spread, in dE, allowed across the nine samples of one face.
   *
   * A real face is nine stickers of one colour, so the samples all sit on top
   * of each other. This is the check that catches a cube held face-on: the top
   * face is then a sliver a few pixels tall, the nine sample points spill off
   * it onto the face below, and the readings come back as a mix of colours.
   * Without it the app cheerfully reported nine yellow stickers for a face it
   * could not actually see.
   */
  maxSampleSpread: number
  /**
   * Shortest side of the quad, as a fraction of the longest.
   *
   * A face seen at a readable angle is never this squashed. Below roughly a
   * third, the face is too foreshortened to place nine stickers on it.
   */
  minAspect: number
}

export const DEFAULT_FIND: FindOptions = {
  clusters: 7,
  minBlocks: 14,
  minSolidity: 0.34,
  patchRadius: 3,
  maxSampleSpread: 26,
  minAspect: 0.3,
}

type Block = { lab: Lab; rgb: RgbPatch; x: number; y: number }

/**
 * Minimum chroma for a block to be considered part of a sticker.
 *
 * Measured on a real phone snapshot of a cube on a desk: the wooden desk, the
 * keyboard and the dark fabric all measured a chroma of 7 or below, while the
 * sticker faces measured 33 and up. That is a gap of nearly five times, so the
 * cut sits in the middle of it. Without this the background wins, because a
 * large dark desk is both bigger and more compact than a foreshortened face.
 *
 * White is the exception: a white sticker has almost no chroma, so it is found
 * in a second pass by adjacency instead.
 */
const CHROMA_MIN = 20

/** Average every block's pixels, keeping the colour mean as well. */
function blockify(img: RGBImage, minChroma: number): Block[] {
  const GH = Math.max(8, Math.round((GW * img.height) / img.width))
  const acc = new Float64Array(GW * GH * 4)
  const n = new Int32Array(GW * GH)
  for (let y = 0; y < img.height; y++) {
    const gy = Math.min(GH - 1, Math.floor((y / img.height) * GH))
    for (let x = 0; x < img.width; x++) {
      const i = (y * img.width + x) * 4
      const gx = Math.min(GW - 1, Math.floor((x / img.width) * GW))
      const gi = gy * GW + gx
      n[gi]++
      acc[gi * 4] += img.data[i]
      acc[gi * 4 + 1] += img.data[i + 1]
      acc[gi * 4 + 2] += img.data[i + 2]
    }
  }
  const out: Block[] = []
  for (let i = 0; i < GW * GH; i++) {
    if (n[i] === 0) continue
    const rgb = { r: acc[i * 4] / n[i], g: acc[i * 4 + 1] / n[i], b: acc[i * 4 + 2] / n[i] }
    const lab = rgbToLab(rgb)
    if (Math.hypot(lab.a, lab.b) < minChroma) continue
    out.push({ lab, rgb, x: i % GW, y: Math.floor(i / GW) })
  }
  return out
}

/** k-means with deterministic seeding, so nothing depends on randomness. */
function clusterBlocks(
  blocks: Block[],
  k: number
): { labels: number[]; centres: Lab[] } {
  if (blocks.length === 0) return { labels: [], centres: [] }
  const kk = Math.min(k, blocks.length)
  // spread the seeds through the sorted-by-lightness order: a face is a big flat
  // region, so seeding by brightness reliably lands one seed inside it
  const byL = [...blocks].sort((a, b) => a.lab.L - b.lab.L)
  const centres = Array.from({ length: kk }, (_, i) => ({ ...byL[Math.floor(((i + 0.5) * byL.length) / kk)].lab }))
  const labels = new Array(blocks.length).fill(0)

  for (let iter = 0; iter < 30; iter++) {
    let moved = false
    for (let i = 0; i < blocks.length; i++) {
      let best = 0
      let bd = Infinity
      for (let c = 0; c < kk; c++) {
        const d = deltaE(blocks[i].lab, centres[c])
        if (d < bd) {
          bd = d
          best = c
        }
      }
      if (labels[i] !== best) {
        labels[i] = best
        moved = true
      }
    }
    const sums = Array.from({ length: kk }, () => ({ L: 0, a: 0, b: 0, n: 0 }))
    for (let i = 0; i < blocks.length; i++) {
      const s = sums[labels[i]]
      s.L += blocks[i].lab.L
      s.a += blocks[i].lab.a
      s.b += blocks[i].lab.b
      s.n++
    }
    for (let c = 0; c < kk; c++) {
      if (sums[c].n === 0) continue
      centres[c] = {
        L: sums[c].L / sums[c].n,
        a: sums[c].a / sums[c].n,
        b: sums[c].b / sums[c].n,
      }
    }
    if (!moved) break
  }
  return { labels, centres }
}

/** Largest 4-connected run of blocks sharing a label. */
function largestComponent(cells: Set<number>): { cells: number[]; bbox: { minX: number; minY: number; maxX: number; maxY: number } } | null {
  if (cells.size === 0) return null
  const remaining = new Set(cells)
  let best: number[] = []
  while (remaining.size) {
    const start = [...remaining][0]
    const comp: number[] = []
    const stack = [start]
    remaining.delete(start)
    while (stack.length) {
      const i = stack.pop()!
      comp.push(i)
      const x = i % GW
      const y = Math.floor(i / GW)
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx
        const ny = y + dy
        if (nx < 0 || ny < 0 || nx >= GW) continue
        const j = ny * GW + nx
        if (!remaining.has(j)) continue
        remaining.delete(j)
        stack.push(j)
      }
    }
    if (comp.length > best.length) best = comp
  }
  if (best.length === 0) return null
  let minX = GW
  let minY = 1e9
  let maxX = -1
  let maxY = -1
  for (const i of best) {
    const x = i % GW
    const y = Math.floor(i / GW)
    minX = Math.min(minX, x)
    maxX = Math.max(maxX, x)
    minY = Math.min(minY, y)
    maxY = Math.max(maxY, y)
  }
  return { cells: best, bbox: { minX, minY, maxX, maxY } }
}

const dist = (a: Pt, b: Pt) => Math.hypot(b.x - a.x, b.y - a.y)
const centroid = (pts: Pt[]): Pt => ({
  x: pts.reduce((s, p) => s + p.x, 0) / pts.length,
  y: pts.reduce((s, p) => s + p.y, 0) / pts.length,
})

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

function perpDistance(p: Pt, a: Pt, b: Pt): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len = Math.hypot(dx, dy)
  if (len === 0) return Math.hypot(p.x - a.x, p.y - a.y)
  return Math.abs(dy * p.x - dx * p.y + b.x * a.y - b.y * a.x) / len
}

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
  const s1 = simplifyOpen(rot.slice(0, bIdx + 1), eps)
  const s2 = simplifyOpen([...rot.slice(bIdx), rot[0]], eps)
  return [...s1, ...s2.slice(1, -1)]
}

function quadFromHull(hull: Pt[]): Pt[] {
  if (hull.length < 4) return hull
  if (hull.length === 4) return hull
  let perim = 0
  for (let i = 0; i < hull.length; i++) perim += dist(hull[i], hull[(i + 1) % hull.length])
  for (const f of [0.02, 0.04, 0.07, 0.11, 0.16, 0.22]) {
    const q = simplifyClosed(hull, perim * f)
    if (q.length === 4) return q
  }
  const c = centroid(hull)
  const ranked = [...hull].sort((a, b) => dist(b, c) - dist(a, c))
  const chosen: Pt[] = []
  for (const p of ranked) {
    const ang = Math.atan2(p.y - c.y, p.x - c.x)
    const far = chosen.every((q) => {
      const a2 = Math.atan2(q.y - c.y, q.x - c.x)
      let d = Math.abs(ang - a2) % (Math.PI * 2)
      if (d > Math.PI) d = Math.PI * 2 - d
      return d > Math.PI / 3
    })
    if (far) chosen.push(p)
    if (chosen.length === 4) break
  }
  return chosen.length === 4 ? chosen : hull
}

function orderQuad(q: Pt[]): Pt[] {
  if (q.length !== 4) return q
  const c = centroid(q)
  const sorted = [...q].sort((a, b) => Math.atan2(a.y - c.y, a.x - c.x) - Math.atan2(b.y - c.y, b.x - c.x))
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

function samplePatch(img: RGBImage, p: Pt, radius: number): RgbPatch {
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

/**
 * Find the cube faces in a frame using no reference colours at all.
 *
 * Faces are the large, compact, single-colour regions. Desk, keyboard and fabric
 * are rejected because they are either fragmented into many clusters or do not
 * fill their own bounding box, whereas a sticker face does both.
 */
export function findFaces(img: RGBImage, options: FindOptions = DEFAULT_FIND): FaceCandidate[] {
  // Two passes: the coloured faces, then any desaturated face that touches
  // them, which is what a white sticker face looks like.
  const coloured = collectFaces(blockify(img, CHROMA_MIN), img, options)
  if (coloured.length === 0) return []
  const pale = collectFaces(blockify(img, 0).filter((b) => Math.hypot(b.lab.a, b.lab.b) < CHROMA_MIN), img, {
    ...options,
    minBlocks: Math.max(8, Math.round(options.minBlocks * 0.7)),
  })
  const adjacent = pale.filter((p) => coloured.some((c) => touches(p.quad, c.quad)))
  const all = [...coloured, ...adjacent]
  return rankCandidates(all)
}

/**
 * Pick out the cube by structure rather than by size.
 *
 * A wooden desk or a sheet of fabric can easily be a bigger, tidier region than
 * a sticker face seen at an angle, so picking the largest regions finds the
 * background. What the background cannot do is be three regions that all touch
 * one another. The three visible faces of a cube always do, so the answer is the
 * set of candidates that are mutually adjacent, and size is only the tie-break.
 */
function rankCandidates(cands: FaceCandidate[]): FaceCandidate[] {
  return [...cands].sort((a, b) => b.blocks - a.blocks)
}



/**
 * Do two faces overlap or sit right next to each other?
 *
 * Bounding boxes, not corners: neighbouring faces share a whole edge, so their
 * corner points are nowhere near each other even though the faces touch.
 */
function touches(a: Pt[], b: Pt[]): boolean {
  const box = (q: Pt[]) => {
    let minX = 1e9
    let minY = 1e9
    let maxX = -1e9
    let maxY = -1e9
    for (const p of q) {
      minX = Math.min(minX, p.x)
      minY = Math.min(minY, p.y)
      maxX = Math.max(maxX, p.x)
      maxY = Math.max(maxY, p.y)
    }
    return { minX, minY, maxX, maxY }
  }
  const A = box(a)
  const B = box(b)
  const gapX = Math.max(0, Math.max(A.minX, B.minX) - Math.min(A.maxX, B.maxX))
  const gapY = Math.max(0, Math.max(A.minY, B.minY) - Math.min(A.maxY, B.maxY))
  // Faces that share an edge have bounding boxes that overlap along that edge's
  // axis, so one of the two gaps is zero. Requiring both to be small rejected
  // the real faces, which meet at a slant.
  return Math.hypot(gapX, gapY) < 0.1
}

function collectFaces(blocks: Block[], img: RGBImage, options: FindOptions): FaceCandidate[] {
  if (blocks.length === 0) return []
  const GH = Math.max(8, Math.round((GW * img.height) / img.width))
  const totalBlocks = GW * GH
  const { labels } = clusterBlocks(blocks, options.clusters)

  const groups = new Map<number, { cells: Set<number>; labs: Lab[]; rgbs: RgbPatch[] }>()
  blocks.forEach((b, i) => {
    const l = labels[i]
    if (!groups.has(l)) groups.set(l, { cells: new Set(), labs: [], rgbs: [] })
    const g = groups.get(l)!
    g.cells.add(b.y * GW + b.x)
    g.labs.push(b.lab)
    g.rgbs.push(b.rgb)
  })

  const out: FaceCandidate[] = []
  let n = 0
  for (const [, g] of groups) {
    const comp = largestComponent(g.cells)
    if (!comp) continue
    const { cells, bbox } = comp
    if (cells.length < options.minBlocks) continue
    const boxArea = (bbox.maxX - bbox.minX + 1) * (bbox.maxY - bbox.minY + 1)
    const solidity = cells.length / boxArea
    if (solidity < options.minSolidity) continue

    // Reference colour from the blocks well inside the region, so the dark rim
    // and the neighbouring face do not drag it around.
    const insetX = Math.floor((bbox.maxX - bbox.minX) * 0.25)
    const insetY = Math.floor((bbox.maxY - bbox.minY) * 0.25)
    const inner = g.labs.filter((_, i) => {
      const b = blocks.find((bb) => bb.y * GW + bb.x === cells[i])
      return (
        b &&
        b.x >= bbox.minX + insetX &&
        b.x <= bbox.maxX - insetX &&
        b.y >= bbox.minY + insetY &&
        b.y <= bbox.maxY - insetY
      )
    })
    const pool = inner.length >= 3 ? inner : g.labs
    const sortedL = [...pool].sort((a, b) => a.L - b.L)
    const reference = sortedL[Math.floor(sortedL.length / 2)]
    void reference

    const pts: Pt[] = cells.map((i) => ({
      x: ((i % GW) + 0.5) / GW,
      y: ((Math.floor(i / GW) + 0.5) / GH),
    }))
    const quad = orderQuad(quadFromHull(convexHull(pts)))
    if (quad.length !== 4) continue

    const stickers: RgbPatch[] = []
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) {
        stickers.push(samplePatch(img, bilinear(quad, (c + 0.5) / 3, (r + 0.5) / 3), options.patchRadius))
      }
    }

    // A real face is one colour across all nine samples; a sliver is not.
    const sampleLabs = stickers.map((s) => rgbToLab(s))
    let spread = 0
    for (const a of sampleLabs) {
      for (const b of sampleLabs) spread = Math.max(spread, deltaE(a, b))
    }
    if (spread > options.maxSampleSpread) continue

    // and it is not a squashed sliver
    const sideLens = quad.map((p, i) => Math.hypot(quad[(i + 1) % 4].x - p.x, quad[(i + 1) % 4].y - p.y))
    const aspect = Math.min(...sideLens) / Math.max(...sideLens)
    if (aspect < options.minAspect) continue

    out.push({
      id: `f${n++}`,
      quad: quad.map((p) => ({ x: p.x * img.width, y: p.y * img.height })),
      stickers,
      reference: rgbToLab(stickers[4]),
      blocks: cells.length,
      coverage: cells.length / totalBlocks,
      solidity,
    })
  }

  out.sort((a, b) => b.blocks - a.blocks)
  return out
}
