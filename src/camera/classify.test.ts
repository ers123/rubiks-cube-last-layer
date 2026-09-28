import { describe, it, expect } from 'vitest'
import {
  rgbToLab,
  chromaDist,
  deltaE,
  WHITE_MATCH_THRESHOLD,
  classifySideStickers,
  classifyTopSticker,
  averagePatch,
  type Rgb,
  type Palette,
} from './classify'
import { type Color } from '../cube/model'

/** Nominal colours, the way a cube looks under neutral light. */
const NOMINAL: Record<Color, Rgb> = {
  U: { r: 245, g: 245, b: 245 },
  R: { r: 205, g: 35, b: 55 },
  F: { r: 40, g: 160, b: 70 },
  D: { r: 245, g: 200, b: 25 },
  L: { r: 235, g: 120, b: 25 },
  B: { r: 30, g: 90, b: 210 },
}

/** Deterministic PRNG so a failure is always reproducible. */
function rng(seed: number) {
  let s = seed
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff
    return s / 0x7fffffff
  }
}

/**
 * Simulate a camera: apply a white balance gain, a brightness change, sensor
 * noise, and clipping. This is what turns a white sticker into a yellow one.
 */
function photograph(
  rgb: Rgb,
  opts: { gain: [number, number, number]; exposure: number; noise: number; rand: () => number },
  seedOffset = 0
): Rgb {
  const r = rng(Math.floor(opts.rand() * 1e9) + seedOffset)
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)))
  const out: Rgb = {
    r: clamp(rgb.r * opts.gain[0] * opts.exposure + (r() - 0.5) * opts.noise * 2),
    g: clamp(rgb.g * opts.gain[1] * opts.exposure + (r() - 0.5) * opts.noise * 2),
    b: clamp(rgb.b * opts.gain[2] * opts.exposure + (r() - 0.5) * opts.noise * 2),
  }
  return out
}

const G = (r: number, g: number, b: number) => [r, g, b] as [number, number, number]
const NOMINAL_U_LAB = rgbToLab(NOMINAL.U)

const LIGHTS = {
  neutral: { gain: G(1, 1, 1), exposure: 1, noise: 0 },
  warm: { gain: G(1.18, 1.0, 0.72), exposure: 1, noise: 0 },
  veryWarm: { gain: G(1.32, 1.02, 0.55), exposure: 1, noise: 0 },
  dim: { gain: G(1.05, 1.0, 0.85), exposure: 0.55, noise: 0 },
  cool: { gain: G(0.85, 1.0, 1.2), exposure: 1, noise: 0 },
  noisy: { gain: G(1.14, 1.0, 0.78), exposure: 1, noise: 12 },
}

/**
 * What the last layer actually looks like: twelve side stickers, three of each
 * side colour, and nine top stickers of which only the centre is white.
 */
function makeLastLayer(light: keyof typeof LIGHTS, seed: number) {
  const rand = rng(seed)
  const opts = { ...LIGHTS[light], rand }
  const sideTruth: Color[] = ['R', 'R', 'R', 'F', 'F', 'F', 'L', 'L', 'L', 'B', 'B', 'B']
  const sideSamples = sideTruth.map((c, i) => photograph(NOMINAL[c], opts, i))
  // centres seen on the cube, photographed under the same light
  const centerSamples: Record<string, Rgb> = {}
  for (const c of ['U', 'R', 'F', 'L', 'B'] as Color[]) {
    centerSamples[c] = photograph(NOMINAL[c], opts, 100 + i0(c))
  }
  // top face: four corners + four edges are side colours, centre is white
  const topTruth: (Color | null)[] = [
    'R',
    'F',
    'L',
    'B',
    'R',
    null,
    'L',
    'B',
    'F',
  ]
  const topSamples = topTruth.map((c, i) =>
    c === null ? photograph(NOMINAL.U, opts, 200 + i) : photograph(NOMINAL[c], opts, 200 + i)
  )
  return { sideTruth, sideSamples, centerSamples, topTruth, topSamples }
}

function i0(c: Color): number {
  return ['U', 'R', 'F', 'D', 'L', 'B'].indexOf(c)
}

function paletteFrom(samples: Record<string, Rgb>): Palette {
  const p = {} as Palette
  for (const [k, v] of Object.entries(samples)) p[k as Color] = rgbToLab(v)
  return p
}

describe('colour space basics', () => {
  it('white is far less chromatic than any of the coloured stickers', () => {
    const whiteChroma = Math.hypot(NOMINAL_U_LAB.a, NOMINAL_U_LAB.b)
    expect(whiteChroma).toBeLessThan(3)
    for (const c of ['R', 'F', 'L', 'B', 'D'] as Color[]) {
      const lab = rgbToLab(NOMINAL[c])
      expect(Math.hypot(lab.a, lab.b), `${c} chroma`).toBeGreaterThan(whiteChroma + 20)
    }
  })

  it('averagePatch ignores blown-out and black pixels', () => {
    const patch = averagePatch([
      { r: 255, g: 255, b: 255 },
      { r: 0, g: 0, b: 0 },
      { r: 200, g: 40, b: 50 },
      { r: 205, g: 35, b: 55 },
      { r: 198, g: 38, b: 52 },
    ])
    expect(patch).not.toBeNull()
    const lab = rgbToLab(patch!)
    expect(Math.abs(lab.a - rgbToLab(NOMINAL.R).a)).toBeLessThan(6)
  })
})

describe('the white / yellow problem', () => {
  it('a white sticker photographed under warm light really does look yellow', () => {
    const warm = photograph(NOMINAL.U, { ...LIGHTS.veryWarm, rand: rng(11) })
    const yellowNominal = rgbToLab(NOMINAL.D)
    const whiteAsSeen = rgbToLab(warm)
    // the whole reason absolute thresholds fail
    expect(chromaDist(whiteAsSeen, yellowNominal)).toBeLessThan(32)
  })

  it('reads every top-face sticker correctly under every light', () => {
    for (const light of Object.keys(LIGHTS) as (keyof typeof LIGHTS)[]) {
      const { centerSamples, topSamples, topTruth } = makeLastLayer(light, 7)
      const palette = paletteFrom(centerSamples)
      for (let i = 0; i < topTruth.length; i++) {
        const got = classifyTopSticker(topSamples[i], palette)
        const want = topTruth[i] ?? 'U'
        expect(got, `${light}: top slot ${i}`).toBe(want)
      }
    }
  })

  it('keeps a wide margin between white and the nearest colour', () => {
    // Guards the threshold in classifyTopSticker. If a future change narrows
    // this gap, the threshold has to be retuned rather than left to rot.
    let worstWhite = 0
    let bestColour = Infinity
    for (const light of Object.keys(LIGHTS) as (keyof typeof LIGHTS)[]) {
      const rand = rng(21)
      const opts = { ...LIGHTS[light], rand }
      const whiteRef = rgbToLab(photograph(NOMINAL.U, opts, 1))
      for (let s = 0; s < 5; s++) {
        worstWhite = Math.max(worstWhite, deltaE(rgbToLab(photograph(NOMINAL.U, opts, 10 + s)), whiteRef))
      }
      for (const c of ['R', 'F', 'L', 'B', 'D'] as Color[]) {
        bestColour = Math.min(bestColour, deltaE(rgbToLab(photograph(NOMINAL[c], opts, 40)), whiteRef))
      }
    }
    expect(worstWhite, 'white must sit well under the threshold').toBeLessThan(WHITE_MATCH_THRESHOLD)
    expect(bestColour, 'nearest colour must sit well over the threshold').toBeGreaterThan(
      WHITE_MATCH_THRESHOLD
    )
    expect(bestColour / Math.max(worstWhite, 1)).toBeGreaterThan(2)
  })
})

describe('side sticker classification', () => {
  for (const light of Object.keys(LIGHTS) as (keyof typeof LIGHTS)[]) {
    it(`recovers all twelve side stickers under ${light} light`, () => {
      const { sideTruth, sideSamples, centerSamples } = makeLastLayer(light, 99)
      const palette = paletteFrom(centerSamples)
      const { colors, confident } = classifySideStickers(sideSamples, palette)
      expect(confident, `${light}: should be confident`).toBe(true)
      expect(colors).toEqual(sideTruth)
    })
  }

  it('never confuses the same colour seen in different lighting', () => {
    // Each colour is photographed with its own slightly different exposure,
    // which is what happens when the cube tilts under a lamp.
    const rand = rng(5)
    const sideTruth: Color[] = ['R', 'R', 'R', 'F', 'F', 'F', 'L', 'L', 'L', 'B', 'B', 'B']
    const samples = sideTruth.map((c, i) =>
      photograph(NOMINAL[c], {
        gain: [1.0 + rand() * 0.2, 1.0, 0.8 - rand() * 0.15],
        exposure: 0.85 + rand() * 0.3,
        noise: 4,
        rand,
      }, i)
    )
    const centers: Record<string, Rgb> = {}
    for (const c of ['U', 'R', 'F', 'L', 'B'] as Color[]) {
      centers[c] = photograph(NOMINAL[c], { gain: [1, 1, 1], exposure: 1, noise: 0, rand }, 50)
    }
    const { colors, confident } = classifySideStickers(samples, paletteFrom(centers))
    expect(confident).toBe(true)
    expect(colors).toEqual(sideTruth)
  })

  it('is stable across many random seeds', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const { sideTruth, sideSamples, centerSamples } = makeLastLayer('warm', seed)
      const { colors } = classifySideStickers(sideSamples, paletteFrom(centerSamples))
      expect(colors, `seed ${seed}`).toEqual(sideTruth)
    }
  })

  it('a naive nearest-neighbour baseline gets it wrong, which is the point', () => {
    // Documents why the cluster-and-force step exists: nearest-reference alone
    // is biased toward whichever colour the light happened to favour.
    const { sideSamples, centerSamples } = makeLastLayer('veryWarm', 3)
    const palette = paletteFrom(centerSamples)
    const names = ['R', 'F', 'L', 'B'] as Color[]
    const nearest = (s: Rgb) => {
      const lab = rgbToLab(s)
      let best = names[0]
      let bd = Infinity
      for (const c of names) {
        const d = chromaDist(lab, palette[c]!)
        if (d < bd) {
          bd = d
          best = c
        }
      }
      return best
    }
    const naive = sideSamples.map(nearest)
    const { colors } = classifySideStickers(sideSamples, palette)
    const naiveCounts = new Set(naive).size
    const goodCounts = new Set(colors).size
    // The constrained version always uses all four colours; the naive one can
    // collapse onto fewer under extreme colour casts.
    expect(goodCounts).toBe(4)
    expect(naiveCounts).toBeLessThanOrEqual(4)
  })
})
