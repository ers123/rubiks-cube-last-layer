import { SIDE_LABEL, type Net } from '../cube/cases'
import type { Color } from '../cube/model'

export function CaseDiagram({ net, colors }: { net: Net; colors: Record<Color, string> }) {
  return (
    <span className="case-net">
      <span className="case-u">
        {net.uFace.map((color, i) => (
          <i key={i} style={{ background: color ? colors[color] : 'transparent' }} />
        ))}
      </span>
      {net.sideRows.map((row) => (
        <span key={row.face} className="case-row">
          <em>{SIDE_LABEL[row.face]}</em>
          {row.colors.map((color, i) => (
            <i key={i} style={{ background: color ? colors[color] : 'transparent' }} />
          ))}
        </span>
      ))}
    </span>
  )
}
