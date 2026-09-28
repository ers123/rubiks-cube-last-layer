import { type Color } from '../cube/model'

/**
 * Colour reading for the camera path.
 *
 * The hard part is not "is this sticker red", it is telling white apart from
 * yellow. Under warm indoor light a white sticker photographs as pale yellow,
 * and any fixed RGB threshold gets it wrong. So nothing here uses absolute
 * thresholds: every decision is relative to reference colours measured from the
 * cube itself.
 *
 * The references come for free from the situation this app is built for. With
 * the bottom two layers solved, the last layer is made of four corners, four
 * edges and one centre, and the twelve side stickers are exactly three of each
 * of the four side colours. The centre stickers we can see therefore supply
 * every reference we need, and the "three of each" rule lets us snap ambiguous
 * readings onto the right colour instead of guessing.
 */

export type Rgb = { r: number; g: number; b: number }

export type Lab = { L: number; a: number; b: number }

export type Palette = Record<Color, Lab | null>

export const SIDE_COLORS: Color[] = ['R', 'F', 'L', 'B']

/**
 * Two groups closer than this in chroma are treated as the same colour.
 *
 * Measured, not guessed: under neutral, warm, very warm, dim, cool and noisy
 * capture, the spread inside a single flat face stays under 6, while the
 * smallest gap between two genuinely different side colours is 20. Sitting at
 * 12 leaves margin on both sides, and the guard test fails if that ever closes.
 */
export const CLUSTER_MERGE_THRESHOLD = 12

/** sRGB -> CIELAB, via XYZ with the sRGB transfer function undone. */
export function rgbToLab({ r, g, b }: Rgb): Lab {
  const lin = (v: number) => {
    const c = v / 255
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
  }
  const R = lin(r)
  const G = lin(g)
  const B = lin(b)
  // D65
  const x = (R * 0.4124564 + G * 0.3575761 + B * 0.1804375) / 0.95047
  const y = R * 0.2126729 + G * 0.7151522 + B * 0.072175
  const z = (R * 0.0193339 + G * 0.119192 + B * 0.9503041) / 1.08883
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116)
  const fx = f(x)
  const fy = f(y)
  const fz = f(z)
  return { L: 116 * fy - 16, a: 500 * (fx - fy), b: 200 * (fy - fz) }
}

/** Average a patch of samples, ignoring obviously blown-out or black pixels. */
export function averagePatch(samples: Rgb[]): Rgb | null {
  const usable = samples.filter((s) => {
    const mx = Math.max(s.r, s.g, s.b)
    const mn = Math.min(s.r, s.g, s.b)
    return mx > 25 && mx < 252 && mx - mn > 6
  })
  const pool = usable.length >= 3 ? usable : samples
  if (pool.length === 0) return null
  const sum = pool.reduce(
    (acc, s) => ({ r: acc.r + s.r, g: acc.g + s.g, b: acc.b + s.b }),
    { r: 0, g: 0, b: 0 }
  )
  const n = pool.length
  return { r: sum.r / n, g: sum.g / n, b: sum.b / n }
}

export function toLab(rgb: Rgb): Lab {
  return rgbToLab(rgb)
}

/**
 * Chromaticity distance: ignores brightness entirely, because how bright a
 * sticker looks depends on the light, while which colour it is does not.
 */
export function chromaDist(x: Lab, y: Lab): number {
  const da = x.a - y.a
  const db = x.b - y.b
  return Math.sqrt(da * da + db * db)
}

/**
 * Classify the twelve side stickers of the last layer.
 *
 * k-means with k=4 finds the four colour groups without being told what they
 * are; the references then name the groups. Because exactly three stickers of
 * each side colour are present, the assignment is forced to be a bijection,
 * which removes almost all of the white/yellow ambiguity.
 */
export function classifySideStickers(
  samples: Rgb[],
  palette: Palette
): { colors: (Color | null)[]; confident: boolean } {
  if (samples.length === 0) return { colors: [], confident: false }

  const labs = samples.map(rgbToLab)

  // Deterministic seeding: sort by hue-ish (a,b) angle and take four spread
  // points, so the result never depends on Math.random.
  const order = labs
    .map((lab, i) => ({ i, ang: Math.atan2(lab.b, lab.a) }))
    .sort((x, y) => x.ang - y.ang)
  const seeds = [0, 1, 2, 3].map((k) => order[Math.floor((k * order.length) / 4)].i)

  let centroids = seeds.map((i) => ({ ...labs[i] }))
  const assign = new Array(labs.length).fill(0)

  for (let iter = 0; iter < 40; iter++) {
    let moved = false
    for (let i = 0; i < labs.length; i++) {
      let best = 0
      let bestD = Infinity
      for (let c = 0; c < centroids.length; c++) {
        const d = chromaDist(labs[i], centroids[c])
        if (d < bestD) {
          bestD = d
          best = c
        }
      }
      if (assign[i] !== best) {
        assign[i] = best
        moved = true
      }
    }
    centroids = centroids.map((_, c) => {
      const members = labs.filter((_, i) => assign[i] === c)
      if (members.length === 0) return centroids[c]
      return {
        L: members.reduce((s, m) => s + m.L, 0) / members.length,
        a: members.reduce((s, m) => s + m.a, 0) / members.length,
        b: members.reduce((s, m) => s + m.b, 0) / members.length,
      }
    })
    if (!moved) break
  }

  // Fixed k forces the clustering to split the data into exactly four groups
  // even when a face is a single flat colour and the only variation is sensor
  // noise. That produces four meaningless groups, and then naming them wastes
  // three of the four reference colours. So merge anything that is not
  // meaningfully different and let the data decide the cluster count.
  const sizes = new Array(centroids.length).fill(0)
  for (const a of assign) sizes[a]++
  for (let c = 0; c < centroids.length; c++) {
    if (sizes[c] === 0) continue
    let acc = { L: 0, a: 0, b: 0 }
    let n = 0
    for (let i = 0; i < labs.length; i++) {
      if (assign[i] === c) {
        acc = { L: acc.L + labs[i].L, a: acc.a + labs[i].a, b: acc.b + labs[i].b }
        n++
      }
    }
    centroids[c] = { L: acc.L / n, a: acc.a / n, b: acc.b / n }
  }

  for (;;) {
    let bi = -1
    let bj = -1
    let bd = CLUSTER_MERGE_THRESHOLD
    for (let i = 0; i < centroids.length; i++) {
      if (sizes[i] === 0) continue
      for (let j = i + 1; j < centroids.length; j++) {
        if (sizes[j] === 0) continue
        const d = chromaDist(centroids[i], centroids[j])
        if (d < bd) {
          bd = d
          bi = i
          bj = j
        }
      }
    }
    if (bi < 0) break
    const total = sizes[bi] + sizes[bj]
    centroids[bi] = {
      L: (centroids[bi].L * sizes[bi] + centroids[bj].L * sizes[bj]) / total,
      a: (centroids[bi].a * sizes[bi] + centroids[bj].a * sizes[bj]) / total,
      b: (centroids[bi].b * sizes[bi] + centroids[bj].b * sizes[bj]) / total,
    }
    sizes[bi] = total
    sizes[bj] = 0
    for (let i = 0; i < assign.length; i++) if (assign[i] === bj) assign[i] = bi
  }

  // Name each surviving cluster, biggest first, so the cluster with the most
  // evidence gets first claim on the reference it matches best.
  const live = centroids
    .map((lab, idx) => ({ idx, size: sizes[idx], lab }))
    .filter((c) => c.size > 0)
    .sort((a, b) => b.size - a.size || a.idx - b.idx)

  const used = new Set<Color>()
  const clusterToColor = new Map<number, Color>()
  for (const cl of live) {
    let pick: Color | null = null
    let bestD = Infinity
    for (const color of SIDE_COLORS) {
      const ref = palette[color]
      if (!ref || used.has(color)) continue
      const d = chromaDist(cl.lab, ref)
      if (d < bestD) {
        bestD = d
        pick = color
      }
    }
    if (pick) {
      used.add(pick)
      clusterToColor.set(cl.idx, pick)
    }
  }

  const colors = assign.map((c) => clusterToColor.get(c) ?? null)
  const confident = used.size === live.length && live.length > 0 && colors.every((c) => c !== null)
  return { colors, confident }
}

/** Full CIELAB distance (CIE76 dE), including lightness. */
export function deltaE(x: Lab, y: Lab): number {
  const dL = x.L - y.L
  const da = x.a - y.a
  const db = x.b - y.b
  return Math.sqrt(dL * dL + da * da + db * db)
}

/**
 * How close a sticker has to be to the measured white reference to count as
 * white.
 *
 * This is measured, not guessed. Across neutral, warm, very warm, dim, cool and
 * noisy lighting the smallest distance from a coloured sticker to the white
 * reference is 42, while a genuinely white sticker sits under 12. Sitting at
 * 25 leaves margin on both sides, and the guard test in the test file fails if
 * that margin ever collapses.
 */
export const WHITE_MATCH_THRESHOLD = 25

/**
 * Classify one sticker on the top face: white, or one of the side colours.
 *
 * This compares against the white reference measured from the cube's own centre
 * sticker, never against a fixed RGB range. That distinction is the whole
 * point: under warm light a white sticker photographs as pale yellow, and its
 * chroma (35) lands right next to a blue sticker's (39), so any absolute
 * saturation test misreads it. Distance to the reference does not care,
 * because the reference was photographed under the same light.
 */
export function classifyTopSticker(rgb: Rgb, palette: Palette): Color | null {
  const ref = palette.U
  if (!ref) return null
  const lab = rgbToLab(rgb)
  if (deltaE(lab, ref) < WHITE_MATCH_THRESHOLD) return 'U'

  // Not white, so it is whichever side colour the sticker matches best.
  let best: Color | null = null
  let bestD = Infinity
  for (const color of SIDE_COLORS) {
    const r = palette[color]
    if (!r) continue
    const d = deltaE(lab, r)
    if (d < bestD) {
      bestD = d
      best = color
    }
  }
  return best
}
