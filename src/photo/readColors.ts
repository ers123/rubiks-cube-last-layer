import { type Color } from '../cube/model'
import { SIDE_FACES, type Net } from '../cube/cases'

export type Rgb = { r: number; g: number; b: number }
type Lab = { L: number; a: number; b: number }
export type PhotoFace = Exclude<Color, 'D'>
export const photoFaces: PhotoFace[] = ['U', 'F', 'R', 'B', 'L']
export type PhotoSamples = Partial<Record<PhotoFace, Rgb[]>>
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

export function readPhotoNet(samples: PhotoSamples): Net {
  const references = photoFaces.map((face) => ({ face, lab: rgbToLab(samples[face]![4]) }))
  function read(rgb: Rgb): Color {
    const lab = rgbToLab(rgb)
    const distance = (other: Lab) => (lab.L - other.L) ** 2 + (lab.a - other.a) ** 2 + (lab.b - other.b) ** 2
    return references.reduce((best, candidate) => distance(candidate.lab) < distance(best.lab) ? candidate : best).face
  }
  return {
    uFace: samples.U!.map((rgb, i) => i === 4 ? 'U' : read(rgb)),
    sideRows: SIDE_FACES.map((face) => ({ face, colors: samples[face as PhotoFace]!.slice(0, 3).map(read) })),
  }
}
