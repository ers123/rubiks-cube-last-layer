import { useState } from 'react'
import {
  createSolvedCube,
  colorAt,
  setColorAt,
  U_DIR,
  COLOR_FACE_ORDER,
  cloneCube,
  type Cube,
  type Color,
  type Slot,
} from '../cube/model'
import { COLOR_NAMES } from './cubeColors'

const SIDE_VEC = {
  R: { x: 1, y: 0, z: 0 },
  F: { x: 0, y: 0, z: 1 },
  L: { x: -1, y: 0, z: 0 },
  B: { x: 0, y: 0, z: -1 },
} as const

export type SideFace = keyof typeof SIDE_VEC

/** Display order and Korean labels for the four side faces. */
export const SIDE_ORDER: SideFace[] = ['R', 'F', 'B', 'L']
export const SIDE_LABEL: Record<SideFace, string> = {
  R: '오른쪽 (R)',
  F: '앞 (F)',
  B: '뒤 (B)',
  L: '왼쪽 (L)',
}

/**
 * The 21 stickers that matter: the 9 on the top face and the 12 side stickers
 * of the last layer. The lower two layers are assumed finished, which is the
 * exact situation this app is for.
 *
 * Each entry carries the face it belongs to, so callers group by that instead
 * of by index, which is how the labels got out of sync once already.
 */
export function lastLayerSlots(): { slot: Slot; dir: Slot; face: Color; isTop: boolean }[] {
  const out: { slot: Slot; dir: Slot; face: Color; isTop: boolean }[] = []
  for (let z = -1; z <= 1; z++) {
    for (let x = -1; x <= 1; x++) {
      out.push({ slot: { x, y: 1, z }, dir: U_DIR, face: 'U', isTop: true })
    }
  }
  for (const face of SIDE_ORDER) {
    const dir = SIDE_VEC[face]
    // The right and back faces read in reverse coordinate order from outside.
    const along = dir.x === 1 || dir.z === -1 ? ([1, 0, -1] as const) : ([-1, 0, 1] as const)
    for (const t of along) {
      const slot: Slot = dir.x !== 0 ? { x: dir.x, y: 1, z: t } : { x: t, y: 1, z: dir.z }
      out.push({ slot, dir, face: face as Color, isTop: false })
    }
  }
  return out
}

const SLOTS = lastLayerSlots()
const TOP_SLOTS = SLOTS.filter((s) => s.isTop)

export function StickerInput({
  cube,
  onChange,
  onSolve,
  palette,
  colors,
}: {
  cube: Cube
  onChange: (c: Cube) => void
  onSolve: () => void
  palette: Record<Color, Color>
  colors: Record<Color, string>
}) {
  const [active, setActive] = useState<number | null>(null)

  const sides = SIDE_ORDER.map((face) => ({
    face,
    items: SLOTS.map((s, i) => ({ s, i })).filter(({ s }) => !s.isTop && s.face === face),
  }))

  const sticker = (i: number) => {
    const col = colorAt(cube, SLOTS[i].slot, SLOTS[i].dir) ?? 'U'
    return (
      <button
        type="button"
        key={i}
        disabled={i === 4}
        aria-pressed={active === i}
        className="sticker"
        style={{ background: colors[col] }}
        onClick={() => setActive(active === i ? null : i)}
        aria-label={`스티커 ${i + 1} 현재 ${COLOR_NAMES[palette[col]]}`}
      />
    )
  }

  return (
    <div className="input-wrap">
      <p className="hint">
        마지막 층의 스티커를 눌러 색을 입력하세요. 윗면 가운데 색은 위에서 선택한 중심색을 따릅니다.
      </p>

      <div className="net">
        <div className="face">
          <span className="facename">위 (U)</span>
          <div className="grid3">
            {TOP_SLOTS.map((_, i) => sticker(i))}
          </div>
        </div>

        <div className="faces">
          {sides.map((s) => (
            <div className="face" key={s.face}>
              <span className="facename">{SIDE_LABEL[s.face]} · {COLOR_NAMES[palette[s.face]]}</span>
              <div className="grid3">
                {s.items.map(({ i }) => sticker(i))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {active !== null && (
        <div className="picker">
          <span className="picker-label">색 선택</span>
          {COLOR_FACE_ORDER.map((c) => (
            <button
              key={c}
              type="button"
              aria-label={COLOR_NAMES[palette[c]]}
              aria-pressed={colorAt(cube, SLOTS[active].slot, SLOTS[active].dir) === c}
              className={colorAt(cube, SLOTS[active].slot, SLOTS[active].dir) === c ? 'swatch sel' : 'swatch'}
              style={{ background: colors[c] }}
              onClick={() => {
                const next = cloneCube(cube)
                setColorAt(next, SLOTS[active].slot, SLOTS[active].dir, c)
                onChange(next)
              }}
            />
          ))}
          <button type="button" className="ghost" onClick={() => setActive(null)}>
            닫기
          </button>
        </div>
      )}

      <div className="actions">
        <button
          type="button"
          className="ghost"
          onClick={() => {
            onChange(createSolvedCube())
            setActive(null)
          }}
        >
          전체 초기화
        </button>
        <button type="button" className="primary" onClick={onSolve}>
          해답 보기
        </button>
      </div>
    </div>
  )
}
