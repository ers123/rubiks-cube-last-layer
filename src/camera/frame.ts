import type { Pt, RGBImage } from './detect'
import type { Rgb, Palette } from './classify'
import { rgbToLab } from './classify'
import type { Color } from '../cube/model'

/**
 * Working out which blob is which face.
 *
 * With the bottom two layers solved, the last layer is exactly four corners,
 * four edges and a centre, and the twelve side stickers are three of each of
 * the four side colours. So the geometry is easy; the only real ambiguity is
 * which way the cube is facing, and the user settles that once by tapping the
 * face they are holding towards the camera.
 */

export type Blob = {
  /** stable id within one frame */
  id: string
  quad: Pt[]
  stickers: Rgb[]
  center: Rgb
  cx: number
  cy: number
  area: number
}

export type FrameLabels = {
  /** id of the blob treated as the top face, or null */
  uId: string | null
  /** ids of the side blobs, left to right in the image */
  sideIds: string[]
}

/**
 * Decide which blob is the top face.
 *
 * When the cube is held with the last layer up, the top face is the blob whose
 * centre sits highest in the image. This is deliberately crude: the overlay
 * shows the user exactly what we assumed, so a wrong guess is visible rather
 * than silent.
 */
export function labelFrame(blobs: Blob[]): FrameLabels {
  if (blobs.length === 0) return { uId: null, sideIds: [] }
  const sorted = [...blobs].sort((a, b) => a.cy - b.cy)
  return {
    uId: sorted[0].id,
    sideIds: sorted
      .slice(1)
      .sort((a, b) => a.cx - b.cx)
      .map((b) => b.id),
  }
}

export type FaceAssignment = Partial<Record<string, Color>>

/**
 * Turn the user's "this is the front face" tap into a full labelling.
 *
 * The tapped blob becomes the front. Whatever sits to its right in the image
 * is the right face and whatever sits to its left is the left face, and the
 * fourth side colour, which cannot be visible in this frame, must be the back.
 * That convention matches the cube model, where a camera looking at the front
 * face sees the right face on the right of the screen.
 *
 * A rotation about the vertical axis does not matter: turning the whole cube is
 * the same as a U move, and U moves are part of what the solver is allowed to
 * use. So getting this consistent is enough, and the user sees the resulting
 * labelling in the preview before it is used.
 */
export function assignFaces(frontId: string, sides: Blob[]): FaceAssignment {
  const front = sides.find((s) => s.id === frontId)
  const out: FaceAssignment = { [frontId]: 'F' }
  if (!front) return out
  const others = sides.filter((s) => s.id !== frontId)

  if (others.length <= 2) {
    // Decide by which side of the tapped face each blob sits, not by rank: with
    // only one other face visible, ranking alone would call the face on the
    // user's left "right", which is exactly backwards.
    for (const s of others) out[s.id] = s.cx > front.cx ? 'R' : 'L'
    return out
  }

  // All four side faces are readable, so rank them around the front instead.
  others.sort((a, b) => b.cx - a.cx)
  const names: (Color | null)[] = ['R', 'B', 'L']
  others.forEach((s, i) => {
    const name = names[i]
    if (name) out[s.id] = name
  })
  return out
}

/** A palette measured from the centre stickers of everything we have seen. */
export type Calibration = {
  /** measured centre colour per cube face */
  centers: Partial<Record<Color, Rgb>>
  /** measured reference colours, ready for classification */
  palette: Palette
}

export function emptyCalibration(): Calibration {
  return { centers: {}, palette: {} as Palette }
}

export function addCenter(cal: Calibration, face: Color, rgb: Rgb): Calibration {
  const centers = { ...cal.centers, [face]: rgb }
  const palette = { ...cal.palette } as Palette
  for (const [f, c] of Object.entries(centers)) {
    if (c) palette[f as Color] = rgbToLab(c)
  }
  return { centers, palette }
}

/** Has the camera seen enough to classify with confidence? */
export function calibrationReady(cal: Calibration): boolean {
  return (['U', 'R', 'F', 'L', 'B'] as Color[]).every((c) => !!cal.centers[c])
}

/** Read a frame out of a video element onto an offscreen canvas. */
export function grabFrame(video: HTMLVideoElement, width = 480, height = 360): RGBImage | null {
  if (video.readyState < 2 || video.videoWidth === 0) return null
  const c = document.createElement('canvas')
  c.width = width
  c.height = height
  const ctx = c.getContext('2d', { willReadFrequently: true })
  if (!ctx) return null
  // cover-fit so the whole frame is filled, matching what the user sees
  const vr = video.videoWidth / video.videoHeight
  const tr = width / height
  let sw = video.videoWidth
  let sh = video.videoHeight
  let sx = 0
  let sy = 0
  if (vr > tr) {
    sw = video.videoHeight * tr
    sx = (video.videoWidth - sw) / 2
  } else {
    sh = video.videoWidth / tr
    sy = (video.videoHeight - sh) / 2
  }
  ctx.drawImage(video, sx, sy, sw, sh, 0, 0, width, height)
  const d = ctx.getImageData(0, 0, width, height)
  return { width, height, data: d.data }
}
