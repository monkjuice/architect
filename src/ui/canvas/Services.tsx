import { memo, type CSSProperties } from 'react'
import { placement, type Placement } from '../../model/furniture'
import type { Layer, ServiceKind } from '../../model/plan'
import { editableOn, linkedTo, placeService, serviceInfo, serviceSymbol, specText, type ServiceTab } from '../../model/services'

/**
 * The Plumbing and HVAC tabs' equipment on the plan: each piece drawn at its real size from `serviceSymbol` (a round
 * tank as a circle, a boiler or a split as its footprint), with its title and what it is rated at under it, and the
 * same symbol in the library's icons. On each tab its own pieces are drawn in full; the other tab's are faded
 * (`linked`), or left out, so the relationship between the two shows without mixing them.
 */

const points = (pts: readonly { x: number; y: number }[]) => pts.map((p) => `${p.x},${p.y}`).join(' ')

export function ServiceSymbol({ kind, placed, className = '' }: { kind: ServiceKind; placed: Placement; className?: string }) {
  return (
    <g className={`service ${kind} ${className}`}>
      {serviceSymbol(kind, placed).map((part, i) =>
        'c' in part ? (
          <circle key={i} className={`service-${part.role}`} cx={part.c.x} cy={part.c.y} r={part.r} />
        ) : part.closed ? (
          <polygon key={i} className={`service-${part.role}`} points={points(part.pts)} />
        ) : (
          <polyline key={i} className={`service-${part.role}`} points={points(part.pts)} />
        ),
      )}
    </g>
  )
}

/** A piece carries its label only when it is this wide on screen, so labels do not pile up on a zoomed-out plan. */
const LABEL_PX = 34

/** Every piece on a layer, with its label; the selected and hovered ids are space-separated strings, so memo compares by value. */
export const ServiceLayer = memo(function ServiceLayer({
  layer,
  tab,
  linked,
  selected,
  hovered,
  zoom,
  labels,
}: {
  layer: Layer
  /** The tab drawing it: its pieces in full, the other tab's faded. */
  tab: ServiceTab | 'all'
  /** Whether the other tab's pieces are drawn at all (faded). */
  linked: boolean
  selected: string
  hovered?: string
  zoom: number
  labels: boolean
}) {
  const px = 1 / zoom
  const ids = new Set(selected.split(' '))
  return (
    <g className={layer.locked ? 'services locked' : 'services'} style={{ '--layer': layer.color } as CSSProperties} fontSize={10 * px}>
      {Object.entries(layer.services).map(([id, s]) => {
        const info = serviceInfo(s.kind)
        const own = tab === 'all' || editableOn(info, tab)
        if (!own && (!linked || !linkedTo(info, tab))) return null
        const placed = placeService(s)
        const className = [!own && 'linked', own && ids.has(id) && 'selected', own && hovered === id && 'hovered', s.hot && 'hot'].filter(Boolean).join(' ')
        const rating = specText(info, s.width, s.depth)
        const named = labels && own && s.kind !== 'tap' && s.kind !== 'floor-drain' && (ids.has(id) || Math.max(s.width, s.depth) * zoom >= LABEL_PX)
        return (
          <g key={id}>
            <ServiceSymbol kind={s.kind} placed={placed} className={className} />
            {named && (
              <text className="service-label" x={s.at.x} y={s.at.y + placed.depth / 2 + 11 * px} textAnchor="middle">
                {rating ? `${info.title} · ${rating}` : info.title}
              </text>
            )}
          </g>
        )
      })}
    </g>
  )
})

/** The library's icon: the piece's own symbol, scaled into the 32 × 24 box. */
export function ServiceIcon({ kind }: { kind: ServiceKind }) {
  const info = serviceInfo(kind)
  const scale = Math.min(22 / Math.max(info.width, 0.05), 16 / Math.max(info.depth, 0.05), 40)
  return (
    <g transform={`translate(16 12) scale(${scale})`}>
      <ServiceSymbol kind={kind} placed={placement({ x: 0, y: 0 }, 0, info.width, info.depth)} />
    </g>
  )
}
