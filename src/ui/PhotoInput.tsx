import { useEffect, useState, type MouseEvent } from 'react'
import { netToCube } from '../cube/cases'
import type { Color, Cube } from '../cube/model'
import { photoFaces, readPhotoNet, type PhotoSamples, type Rgb } from '../photo/readColors'
import { COLOR_NAMES } from './cubeColors'

const faceNames = { U: '윗면', F: '앞면', R: '오른쪽', B: '뒷면', L: '왼쪽' }
type Point = { x: number; y: number }

function samplesAt(image: HTMLImageElement, start: Point, end: Point): Rgb[] {
  const canvas = document.createElement('canvas')
  const scale = Math.min(1, 1000 / Math.max(image.naturalWidth, image.naturalHeight))
  canvas.width = Math.round(image.naturalWidth * scale)
  canvas.height = Math.round(image.naturalHeight * scale)
  const context = canvas.getContext('2d')!
  context.drawImage(image, 0, 0, canvas.width, canvas.height)
  const spanX = (end.x - start.x) * canvas.width
  const spanY = (end.y - start.y) * canvas.height
  const radius = Math.max(1, Math.floor(Math.min(spanX, spanY) * 0.045))
  return Array.from({ length: 9 }, (_, i) => {
    const x = Math.round(start.x * canvas.width + spanX * (i % 3) / 2)
    const y = Math.round(start.y * canvas.height + spanY * Math.floor(i / 3) / 2)
    const left = Math.max(0, x - radius)
    const top = Math.max(0, y - radius)
    const width = Math.min(canvas.width - left, radius * 2 + 1)
    const height = Math.min(canvas.height - top, radius * 2 + 1)
    const data = context.getImageData(left, top, width, height).data
    const channel = (offset: number) => {
      const values = Array.from({ length: data.length / 4 }, (_, j) => data[4 * j + offset]).sort((a, b) => a - b)
      return values[Math.floor(values.length / 2)]
    }
    return { r: channel(0), g: channel(1), b: channel(2) }
  })
}

export function PhotoInput({ palette, onBack, onRead }: {
  palette: Record<Color, Color>
  onBack: () => void
  onRead: (cube: Cube) => void
}) {
  const [samples, setSamples] = useState<PhotoSamples>({})
  const [index, setIndex] = useState(0)
  const [url, setUrl] = useState('')
  const [first, setFirst] = useState<Point | null>(null)
  const [error, setError] = useState('')
  const face = photoFaces[index]
  useEffect(() => () => { if (url) URL.revokeObjectURL(url) }, [url])

  function changeFace(next: number) {
    setIndex(next)
    setUrl('')
    setFirst(null)
    setError('')
  }

  function mark(event: MouseEvent<HTMLImageElement>) {
    const image = event.currentTarget
    const box = image.getBoundingClientRect()
    const point = { x: (event.clientX - box.left) / box.width, y: (event.clientY - box.top) / box.height }
    setError('')
    if (!first) {
      setFirst(point)
      return
    }
    if (point.x - first.x < 0.05 || point.y - first.y < 0.05) {
      setError('오른쪽 아래 스티커의 가운데를 눌러 주세요.')
      return
    }
    try {
      setSamples({ ...samples, [face]: samplesAt(image, first, point) })
      changeFace(index + 1)
    } catch {
      setError('사진을 다시 선택해 주세요.')
      setFirst(null)
    }
  }

  return (
    <section className="lesson">
      <h2>사진으로 마지막 층 읽기</h2>
      <p>아래 두 층이 맞은 큐브의 윗면과 옆면 네 장을 사용합니다. 사진은 이 기기에서 처리합니다.</p>
      {face ? (
        <>
          <p><strong>{index + 1} / 5 · {faceNames[face]} · {COLOR_NAMES[palette[face]]} 중심</strong></p>
          <p>{face === 'U' ? '윗면을 위에서 찍되, 앞면과 닿는 줄이 사진 아래쪽에 오게 하세요.' :
            '이 면을 정면에서 찍고, 마지막 층에 닿는 줄을 사진 위쪽에 두세요.'}</p>
          <label htmlFor="cube-photo">이 면의 사진 선택</label>
          <input key={face} id="cube-photo" type="file" accept="image/*" onChange={(event) => {
            const file = event.target.files?.[0]
            setUrl(file ? URL.createObjectURL(file) : '')
            setFirst(null)
            setError('')
          }} />
          {url && (
            <>
              <p>{first ? '오른쪽 아래 스티커의 가운데를 누르세요.' : '왼쪽 위 스티커의 가운데를 누르세요.'}</p>
              <div className="photo-markup">
                <img src={url} alt={`${faceNames[face]} 사진`} onClick={mark} onError={() => setError('이 사진을 열 수 없어요. JPEG 또는 PNG를 선택해 주세요.')} />
                {first && <span className="photo-point" style={{ left: `${first.x * 100}%`, top: `${first.y * 100}%` }} />}
              </div>
              {first && <button type="button" className="ghost" onClick={() => setFirst(null)}>위치 다시 지정</button>}
            </>
          )}
        </>
      ) : (
        <>
          <p>사진을 모두 읽었어요. 다음 화면에서 스티커 색을 확인하거나 고친 뒤 해답을 보세요.</p>
          <button className="primary" type="button" onClick={() => onRead(netToCube(readPhotoNet(samples)))}>읽은 색 확인하기</button>
        </>
      )}
      {error && <p role="status">{error}</p>}
      {index > 0 && <button className="ghost" type="button" onClick={() => changeFace(index - 1)}>이전 면 다시 찍기</button>}
      <button className="ghost" type="button" onClick={onBack}>돌아가기</button>
    </section>
  )
}
