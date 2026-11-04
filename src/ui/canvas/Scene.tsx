import { memo, type CSSProperties } from 'react'
import { calibrationError, cropRect, imageToWorld, imageTransform } from '../../model/baseImage'
import { dist, lerp, type Vec } from '../../model/geometry'
import { openingSpans } from '../../model/openings'
import { segmentKind, type BaseImage, type Layer, type Plan, type Ref, type SegmentKind } from '../../model/plan'
import { getPlacedAreas, getWalls, visibleAreas, type PlacedArea } from '../../state/derived'
import { findMaterial } from '../../model/materials'
import { areaLabelSize, areaText, regionPath, type LabelLines } from './areas'
import type { Viewport } from '../../state/store'
import { gridSteps } from './view'

/** The static parts of the drawing, in world coordinates. Line widths are screen pixels (non-scaling strokes). */

export const BaseImageView = memo(function BaseImageView({ image, cropping }: { image: BaseImage; cropping: boolean }) {
  const r = cropRect(image)
  return (
    <g className="base-image" transform={imageTransform(image)}>
      <clipPath id="base-crop">
        <rect x={r.x} y={r.y} width={r.w} height={r.h} />
      </clipPath>
      <image
        href={image.src}
        width={image.width}
        height={image.height}
        preserveAspectRatio="none"
        opacity={image.opacity}
        clipPath={cropping ? undefined : 'url(#base-crop)'}
      />
      {cropping && (
        <path
          className="crop-shade"
          fillRule="evenodd"
          d={`M0 0H${image.width}V${image.height}H0Z M${r.x} ${r.y}h${r.w}v${r.h}h${-r.w}Z`}
        />
      )}
    </g>
  )
})

export function Grid({ view, width, height }: { view: Viewport; width: number; height: number }) {
  const { minor, major } = gridSteps(view.zoom)
  const x1 = view.x0 + width / view.zoom
  const y1 = view.y0 + height / view.zoom
  let minorPath = ''
  let majorPath = ''
  const isMajor = (v: number) => Math.abs(v / major - Math.round(v / major)) < 1e-6
  for (let x = Math.ceil(view.x0 / minor) * minor; x <= x1; x += minor) {
    const line = `M${x} ${view.y0}V${y1}`
    if (isMajor(x)) majorPath += line
    else minorPath += line
  }
  for (let y = Math.ceil(view.y0 / minor) * minor; y <= y1; y += minor) {
    const line = `M${view.x0} ${y}H${x1}`
    if (isMajor(y)) majorPath += line
    else minorPath += line
  }
  return (
    <g className="grid">
      <path className="grid-line" d={minorPath} />
      <path className="grid-line major" d={majorPath} />
    </g>
  )
}

/**
 * A label on a pill along a segment, kept upright, just above it; skipped when the segment is too short on
 * screen. The dark pill reads on white paper and on the dark canvas alike. Its width is estimated from the
 * text, which is close enough for numbers.
 */
export function SegmentLabel({ a, b, text, px, className }: { a: Vec; b: Vec; text: string; px: number; className: string }) {
  const w = text.length * 6.4 + 8
  if (dist(a, b) / px < w + 12) return null
  let deg = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI
  if (deg > 90 || deg <= -90) deg += 180
  return (
    <g className={`seg-label ${className}`} transform={`translate(${(a.x + b.x) / 2} ${(a.y + b.y) / 2}) rotate(${deg})`}>
      <rect x={(-w / 2) * px} y={-18 * px} width={w * px} height={15 * px} rx={3 * px} />
      <text y={-10.5 * px} textAnchor="middle" dominantBaseline="central">
        {text}
      </text>
    </g>
  )
}

/**
 * A layer's lines: walls at their thickness, filled, as a plan's cut shows them (or as lines when `thick` is off),
 * open edges dashed, outlines thin; each cut by its doors and windows.
 */
export const LayerShapes = memo(function LayerShapes({ layer, active, zoom, lengths, thick }: { layer: Layer; active: boolean; zoom: number; lengths: boolean; thick: boolean }) {
  const px = 1 / zoom
  const segments = Object.values(layer.segments)
  // each segment is drawn in pieces around its doors and windows
  const path = (kind: SegmentKind) => {
    let d = ''
    for (const [id, s] of Object.entries(layer.segments)) {
      if (segmentKind(s) !== kind) continue
      const a = layer.vertices[s.a]
      const b = layer.vertices[s.b]
      const length = dist(a, b)
      let from = 0
      for (const [start, end] of [...openingSpans(layer, id), [length, length] as [number, number]]) {
        if (start - from > 1e-9) {
          const p = lerp(a, b, from / length)
          const q = lerp(a, b, start / length)
          d += `M${p.x} ${p.y}L${q.x} ${q.y}`
        }
        from = Math.max(from, end)
      }
    }
    return d
  }
  const degree = new Map<string, number>()
  if (active) for (const s of segments) for (const v of [s.a, s.b]) degree.set(v, (degree.get(v) ?? 0) + 1)
  const walls = thick ? getWalls(layer) : null
  return (
    <g className={layer.locked ? 'layer locked' : 'layer'} style={{ '--layer': layer.color } as CSSProperties}>
      {walls ? (
        <g className="walls">
          <path className="wall-fill" d={walls.fills.map((f) => `M${f.map((p) => `${p.x} ${p.y}`).join('L')}Z`).join('')} />
          <path className="wall-edges" d={walls.edges.map(([p, q]) => `M${p.x} ${p.y}L${q.x} ${q.y}`).join('')} />
        </g>
      ) : (
        <path className="layer-lines" d={path('wall')} />
      )}
      <path className="layer-lines open" d={path('open')} />
      <path className="layer-lines outline" d={path('outline')} />
      {active &&
        Object.entries(layer.vertices).map(([id, v]) => (
          // open ends are hollow, so an unconnected end stands out
          <circle key={id} className={degree.get(id) === 1 ? 'vertex open' : 'vertex'} cx={v.x} cy={v.y} r={(degree.get(id) === 1 ? 3 : 2.2) * px} />
        ))}
      {lengths && (
        <g className="length-labels" fontSize={11 * px}>
          {Object.entries(layer.segments).map(([id, s]) => {
            const a = layer.vertices[s.a]
            const b = layer.vertices[s.b]
            return <SegmentLabel key={id} a={a} b={b} text={dist(a, b).toFixed(2)} px={px} className="length-label" />
          })}
        </g>
      )}
    </g>
  )
})

/** Selected and hovered items, highlighted over the layers. */
export function SelectionMarks({ plan, refs, hover, zoom }: { plan: Plan; refs: readonly Ref[]; hover?: Ref; zoom: number }) {
  const px = 1 / zoom
  const s = 7 * px
  const mark = (ref: Ref, className: string) => {
    const layer = plan.layers.find((l) => l.id === ref.layer)
    if (!layer) return null
    const key = `${className}:${ref.layer}:${ref.kind}:${ref.id}`
    if (ref.kind === 'vertex') {
      const v = layer.vertices[ref.id]
      return v && <rect key={key} className={`${className}-point`} x={v.x - s / 2} y={v.y - s / 2} width={s} height={s} />
    }
    const seg = layer.segments[ref.id]
    if (!seg) return null
    const a = layer.vertices[seg.a]
    const b = layer.vertices[seg.b]
    return (
      <g key={key}>
        <line className={`${className}-line`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} />
        {className === 'selected' &&
          [a, b].map((v, i) => <rect key={i} className="selected-end" x={v.x - s / 2} y={v.y - s / 2} width={s} height={s} />)}
      </g>
    )
  }
  return (
    <g className="selection-marks">
      {hover && mark(hover, 'hovered')}
      {refs.map((r) => mark(r, 'selected'))}
    </g>
  )
}

/** The base plan's known lengths, with how far off each reads at the fitted scale. */
export function CalibrationMarks({ image, zoom }: { image: BaseImage; zoom: number }) {
  const px = 1 / zoom
  return (
    <g className="calibration-marks" fontSize={11 * px}>
      {image.calibration.map((ref, i) => {
        const a = imageToWorld(image, ref.a.x, ref.a.y)
        const b = imageToWorld(image, ref.b.x, ref.b.y)
        const error = calibrationError(image, ref) * 100
        const text = image.calibration.length > 1 ? `${ref.length.toFixed(2)} m  ${error >= 0 ? '+' : ''}${error.toFixed(1)}%` : `${ref.length.toFixed(2)} m`
        return (
          <g key={i}>
            <line className="calibration-line" x1={a.x} y1={a.y} x2={b.x} y2={b.y} />
            <circle className="calibration-end" cx={a.x} cy={a.y} r={3 * px} />
            <circle className="calibration-end" cx={b.x} cy={b.y} r={3 * px} />
            <SegmentLabel a={a} b={b} text={text} px={px} className="calibration-label" />
          </g>
        )
      })}
    </g>
  )
}

/** The regions named by a layer's areas, tinted in the layer colour under its lines, or in their floor's material. */
export const AreaFills = memo(function AreaFills({ layer, selected, hovered }: { layer: Layer; selected: string; hovered?: string }) {
  const ids = new Set(selected.split(' '))
  return (
    <g className="area-fills" style={{ '--layer': layer.color } as CSSProperties}>
      {getPlacedAreas(layer).map(
        (a) =>
          a.region && (
            <path
              key={a.id}
              className={[ids.has(a.id) ? 'area-fill selected' : a.id === hovered ? 'area-fill hovered' : 'area-fill', findMaterial(a.area.floor) && 'finished'].filter(Boolean).join(' ')}
              fillRule="evenodd"
              d={regionPath(a.region)}
              style={findMaterial(a.area.floor) ? { fill: findMaterial(a.area.floor)!.color } : undefined}
            />
          ),
      )}
    </g>
  )
})

/** Every visible area's name and size (the lines `lines` asks for), at the middle of its region (or at its point when not enclosed). */
export function AreaLabels({ plan, selection, zoom, lines }: { plan: Plan; selection: readonly Ref[]; zoom: number; lines: LabelLines }) {
  if (!lines.name && !lines.size) return null
  const px = 1 / zoom
  const selected = new Set(selection.filter((r) => r.kind === 'area').map((r) => `${r.layer}:${r.id}`))
  return (
    <g className="area-labels">
      {visibleAreas(plan).map((a) => (
        <AreaLabel key={`${a.layer.id}:${a.id}`} placed={a} px={px} selected={selected.has(`${a.layer.id}:${a.id}`)} lines={lines} />
      ))}
    </g>
  )
}

function AreaLabel({ placed, px, selected, lines }: { placed: PlacedArea; px: number; selected: boolean; lines: LabelLines }) {
  const { w, h } = areaLabelSize(placed, lines)
  const { x, y } = placed.label
  // two lines sit either side of the label's middle; one sits on it
  const both = lines.name && lines.size
  const className = ['area-label', placed.region ? '' : 'unenclosed', selected ? 'selected' : ''].filter(Boolean).join(' ')
  return (
    <g className={className} style={{ '--layer': placed.layer.color } as CSSProperties}>
      <rect x={x - (w / 2) * px} y={y - (h / 2) * px} width={w * px} height={h * px} rx={5 * px} />
      {lines.name && (
        <text className="area-name" x={x} y={y - (both ? 6.5 : 0) * px} fontSize={12 * px} textAnchor="middle" dominantBaseline="central">
          {placed.area.name}
        </text>
      )}
      {lines.size && (
        <text className="area-size" x={x} y={y + (both ? 7.5 : 0) * px} fontSize={11 * px} textAnchor="middle" dominantBaseline="central">
          {areaText(placed)}
        </text>
      )}
    </g>
  )
}
