import { memo, type CSSProperties } from 'react'
import { add, mul, sub, type Vec } from '../../model/geometry'
import { fireplaceShape, placeOpening } from '../../model/openings'
import type { Layer, Roof } from '../../model/plan'
import { findMaterial } from '../../model/materials'
import { labelPoint } from '../../model/regions'
import { eavesOf, ROOF_TITLES, roofFaces, roofProblem, roofSummary, type RoofFace } from '../../model/roofs'
import { hostThickness } from '../../state/derived'
import { flueMark } from './symbols'

/**
 * The roof plan: each roof's slopes shaded by the way they face, as roof plans draw them (light from the top
 * left of the sheet), its eaves line, the walls' line under an overhang (dashed), an arrow down each slope, and
 * a label with its type, pitch and top. The chimneys of the layer's fireplaces come up through them.
 */

const ring = (pts: readonly Vec[]) => `M${pts.map((p) => `${p.x} ${p.y}`).join('L')}Z`

const centroid = (pts: readonly Vec[]): Vec => mul(pts.reduce(add, { x: 0, y: 0 }), 1 / pts.length)

/** Down the slope of a face, unit length; null for a level one. */
function downhill(face: RoofFace): Vec | null {
  const l = Math.hypot(face.plane.a, face.plane.b)
  return l < 1e-9 ? null : { x: -face.plane.a / l, y: -face.plane.b / l }
}

const LIGHT = { x: -Math.SQRT1_2, y: -Math.SQRT1_2 }

/** Fill opacity: slopes that face the light are lighter. */
function shade(face: RoofFace): number {
  const d = downhill(face)
  return d ? 0.3 - 0.18 * (d.x * LIGHT.x + d.y * LIGHT.y) : 0.25
}

export const RoofLayer = memo(function RoofLayer({ layer, zoom, selected, hovered }: { layer: Layer; zoom: number; selected: string; hovered?: string }) {
  const ids = new Set(selected.split(' '))
  return (
    <g className={layer.locked ? 'roofs locked' : 'roofs'} style={{ '--layer': layer.color } as CSSProperties}>
      {Object.entries(layer.roofs).map(([id, roof]) => (
        <RoofShape key={id} roof={roof} px={1 / zoom} selected={ids.has(id)} hovered={id === hovered} />
      ))}
      {Object.entries(layer.openings).map(([id, o]) => {
        const placed = o.kind === 'fireplace' ? placeOpening(layer, o) : null
        return placed && <path key={id} className="roof-chimney" d={flueMark(fireplaceShape(placed, o, hostThickness(layer, o.segment) / 2).flue)} />
      })}
    </g>
  )
})

function RoofShape({ roof, px, selected, hovered }: { roof: Roof; px: number; selected: boolean; hovered: boolean }) {
  const faces = roofFaces(roof)
  const eaves = eavesOf(roof)
  const problem = roofProblem(roof)
  const { top } = roofSummary(roof)
  const at = labelPoint(eaves)
  const title = roof.type === 'flat' ? ROOF_TITLES.flat : `${ROOF_TITLES[roof.type]} ${roof.pitch.toFixed(0)}°`
  const detail = problem ? 'not convex' : `top +${top.toFixed(2)}`
  const w = Math.max(title.length * 7.2, detail.length * 6.4) + 14
  const cover = findMaterial(roof.finish)
  const className = ['roof', selected && 'selected', hovered && 'hovered', problem && 'problem'].filter(Boolean).join(' ')
  const arrow = (face: RoofFace) => {
    const d = downhill(face)
    if (!d) return ''
    const c = centroid(face.pts)
    const half = mul(d, 14 * px)
    const tip = add(c, half)
    const back = mul(d, -6 * px)
    const side = { x: -d.y * 4 * px, y: d.x * 4 * px }
    const tail = sub(c, half)
    return `M${tail.x} ${tail.y}L${tip.x} ${tip.y}M${tip.x + back.x + side.x} ${tip.y + back.y + side.y}L${tip.x} ${tip.y}L${tip.x + back.x - side.x} ${tip.y + back.y - side.y}`
  }
  return (
    <g className={className}>
      {faces.map((f, i) => (
        <path key={i} className="roof-face" d={ring(f.pts)} fillOpacity={shade(f)} style={cover ? { fill: cover.color } : undefined} />
      ))}
      <path className="roof-eaves" d={ring(eaves)} />
      {roof.overhang > 0 && <path className="roof-outline" d={ring(roof.outline)} />}
      {roof.type !== 'flat' && <path className="roof-arrow" d={faces.map(arrow).join('')} />}
      <g className="roof-label">
        <rect x={at.x - (w / 2) * px} y={at.y - 17 * px} width={w * px} height={34 * px} rx={5 * px} />
        <text className="roof-title" x={at.x} y={at.y - 6.5 * px} fontSize={12 * px} textAnchor="middle" dominantBaseline="central">
          {title}
        </text>
        <text className="roof-detail" x={at.x} y={at.y + 7.5 * px} fontSize={11 * px} textAnchor="middle" dominantBaseline="central">
          {detail}
        </text>
      </g>
      {selected &&
        roof.outline.map((p, i) => <rect key={i} className="roof-corner" x={p.x - 4 * px} y={p.y - 4 * px} width={8 * px} height={8 * px} />)}
    </g>
  )
}
