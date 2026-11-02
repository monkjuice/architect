import type { Snap } from '../../model/snap'
import { regionPath } from './areas'
import { OpeningSymbol } from './Openings'
import { SegmentLabel } from './Scene'
import type { OverlayData } from './tools/types'

/** A tool's overlay: previews, measurements, handles and the snap marker, at constant screen size. */
export function Overlay({ data, zoom, thick }: { data: OverlayData; zoom: number; thick: boolean }) {
  const px = 1 / zoom
  return (
    <g className="overlay" fontSize={11 * px}>
      {data.area && <polygon className="measure-area" points={data.area.map((p) => `${p.x},${p.y}`).join(' ')} />}
      {data.region && <path className="overlay-region" fillRule="evenodd" d={regionPath(data.region)} />}
      {data.marquee && (
        <rect className="marquee" x={data.marquee.x0} y={data.marquee.y0} width={data.marquee.x1 - data.marquee.x0} height={data.marquee.y1 - data.marquee.y0} />
      )}
      {data.lines?.map((l, i) => <line key={i} className={`overlay-line ${l.style}`} x1={l.a.x} y1={l.a.y} x2={l.b.x} y2={l.b.y} />)}
      {data.labels?.map((l, i) => <SegmentLabel key={i} a={l.a} b={l.b} text={l.text} px={px} className={`overlay-label ${l.style}`} />)}
      {data.points?.map((pt, i) =>
        pt.style === 'handle' ? (
          <rect key={i} className="overlay-point handle" x={pt.p.x - 4 * px} y={pt.p.y - 4 * px} width={8 * px} height={8 * px} />
        ) : (
          <circle key={i} className={`overlay-point ${pt.style}`} cx={pt.p.x} cy={pt.p.y} r={(pt.style === 'anchor' ? 4 : 3) * px} />
        ),
      )}
      {data.opening && (
        <OpeningSymbol
          opening={data.opening.opening}
          placed={data.opening.placed}
          wall={data.opening.wall}
          thick={thick}
          px={px}
          className={data.opening.problem ? 'preview problem' : 'preview'}
        />
      )}
      {data.snap && <SnapMarker snap={data.snap} px={px} />}
      {data.tag && <Tag x={data.tag.p.x + 14 * px} y={data.tag.p.y + 14 * px} text={data.tag.text} className={data.tag.style ?? ''} px={px} />}
    </g>
  )
}

function SnapMarker({ snap, px }: { snap: Snap; px: number }) {
  const { x, y } = snap.point
  const s = 6 * px
  switch (snap.kind) {
    case 'vertex':
      return <rect className="snap" x={x - s} y={y - s} width={2 * s} height={2 * s} />
    case 'midpoint':
      return <polygon className="snap" points={`${x},${y - s * 1.2} ${x + s},${y + s * 0.8} ${x - s},${y + s * 0.8}`} />
    case 'edge':
      return <path className="snap" d={`M${x - s} ${y - s}L${x + s} ${y + s}M${x - s} ${y + s}L${x + s} ${y - s}`} />
    case 'align':
      return (
        <g>
          <line className="snap-guide" x1={snap.guide!.x} y1={snap.guide!.y} x2={x} y2={y} />
          <path className="snap" d={`M${x - s} ${y}H${x + s}M${x} ${y - s}V${y + s}`} />
        </g>
      )
    default:
      return null
  }
}

/** A boxed note; the box width is estimated from the text, close enough for short tags. */
function Tag({ x, y, text, className, px }: { x: number; y: number; text: string; className: string; px: number }) {
  const w = (text.length * 6.6 + 14) * px
  const h = 20 * px
  return (
    <g className={`tag ${className}`}>
      <rect x={x} y={y} width={w} height={h} rx={4 * px} />
      <text x={x + 7 * px} y={y + 14 * px}>
        {text}
      </text>
    </g>
  )
}
