import { memo, type CSSProperties } from 'react'
import type { Vec } from '../../model/geometry'
import { openingParts, parkingRoom, placeOpening, styleInfo, type OpeningParts, type PlacedOpening } from '../../model/openings'
import type { Layer, Opening, OpeningKind, OpeningStyle } from '../../model/plan'
import { hostThickness } from '../../state/derived'
import { flueMark } from './symbols'

/**
 * Doors and windows in plan notation, their jambs and frames across the full thickness of their wall (when walls
 * are drawn as thin lines, never thinner than a few pixels on screen). The geometry comes from openingParts, so
 * the plan and the library icons draw the same symbol.
 */

const points = (pts: readonly Vec[]) => pts.map((p) => `${p.x},${p.y}`).join(' ')

function OpeningShape({ parts, className }: { parts: OpeningParts; className: string }) {
  return (
    <g className={className}>
      {parts.frame && <polygon className="opening-frame" points={points(parts.frame)} />}
      {parts.jambs.length > 0 && <path className="opening-jamb" d={parts.jambs.map(([a, b]) => `M${a.x} ${a.y}L${b.x} ${b.y}`).join('')} />}
      {parts.glass.map(([a, b], i) => (
        <line key={`g${i}`} className="opening-glass" x1={a.x} y1={a.y} x2={b.x} y2={b.y} />
      ))}
      {parts.panels.map((panel, i) => (
        <polygon key={`p${i}`} className="opening-panel" points={points(panel)} />
      ))}
      {parts.dashed.map((outline, i) => (
        <polyline key={`d${i}`} className="opening-dashed" points={points(outline)} />
      ))}
      {parts.posts.map((post, i) => (
        <polygon key={`q${i}`} className="opening-post" points={points(post)} />
      ))}
      {parts.leaves.map(([a, b], i) => (
        <line key={`l${i}`} className="opening-leaf" x1={a.x} y1={a.y} x2={b.x} y2={b.y} />
      ))}
      {parts.arcs.map((arc, i) => (
        <path key={`a${i}`} className="opening-arc" d={`M${arc.from.x} ${arc.from.y}A${arc.radius} ${arc.radius} 0 0 ${arc.sweep} ${arc.to.x} ${arc.to.y}`} />
      ))}
      {parts.fireplace && (
        <>
          <polygon className="fireplace-hearth" points={points(parts.fireplace.hearth)} />
          <polygon className="fireplace-box" points={points(parts.fireplace.box)} />
          <polygon className="fireplace-fire" points={points(parts.fireplace.firebox)} />
          <path className="fireplace-flue" d={flueMark(parts.fireplace.flue)} />
        </>
      )}
    </g>
  )
}

/** One door or window on the plan, in a wall `wall` m thick, drawn at its thickness when `thick`. */
export function OpeningSymbol({
  opening,
  placed,
  wall,
  thick,
  px,
  className,
}: {
  opening: Opening
  placed: PlacedOpening
  wall: number
  thick: boolean
  px: number
  className: string
}) {
  // className may add 'cramped': a sliding gate without enough wall to park along
  const parts = openingParts(placed, opening, thick ? wall / 2 : Math.max(wall / 2, 3 * px))
  return <OpeningShape parts={parts} className={`opening ${opening.kind} ${opening.style} ${placed.fits ? '' : 'misfit'} ${className}`} />
}

/** A layer's doors and windows; `selected` holds the selected opening ids separated by spaces. */
export const OpeningLayer = memo(function OpeningLayer({
  layer,
  zoom,
  thick,
  selected,
  hovered,
}: {
  layer: Layer
  zoom: number
  thick: boolean
  selected: string
  hovered?: string
}) {
  const ids = new Set(selected.split(' '))
  return (
    <g className={layer.locked ? 'openings locked' : 'openings'} style={{ '--layer': layer.color } as CSSProperties}>
      {Object.entries(layer.openings).map(([id, o]) => {
        const placed = placeOpening(layer, o)
        const state = ids.has(id) ? 'selected' : id === hovered ? 'hovered' : ''
        const cramped = parkingRoom(layer, id) < o.width - 1e-6 ? 'cramped' : ''
        return (
          placed && <OpeningSymbol key={id} opening={o} placed={placed} wall={hostThickness(layer, o.segment)} thick={thick} px={1 / zoom} className={`${state} ${cramped}`} />
        )
      })}
    </g>
  )
})

/** A style's symbol for the library, in a stub of wall, in a 32 × 24 box; it opens upwards (a sliding gate parks to the right). */
export function OpeningIcon({ kind, style }: { kind: OpeningKind; style: OpeningStyle }) {
  const y = 17
  if (kind === 'fireplace' && style === 'parrilla') {
    return (
      <>
        <path className="icon-wall" d={`M2 ${y}H30`} />
        <g className="opening fireplace">
          <polygon className="fireplace-hearth" points={`3,7 29,7 29,4 3,4`} />
          <polygon className="fireplace-box" points={`4,${y - 1} 28,${y - 1} 28,7 4,7`} />
          <polygon className="fireplace-fire" points={`7,14 25,14 25,7 7,7`} />
          <path className="fireplace-flue" d="M10 8V13M13 8V13M16 8V13M19 8V13M22 8V13" />
        </g>
      </>
    )
  }
  if (kind === 'fireplace') {
    // a fireplace's real depth would vanish at this scale: drawn to the icon instead
    return (
      <>
        <path className="icon-wall" d={`M2 ${y}H30`} />
        <g className="opening fireplace">
          <polygon className="fireplace-hearth" points={`7,9 25,9 25,5 7,5`} />
          <polygon className="fireplace-box" points={`9,${y - 1} 23,${y - 1} 23,9 9,9`} />
          <polygon className="fireplace-fire" points={`12.5,12 19.5,12 19.5,9 12.5,9`} />
        </g>
      </>
    )
  }
  const placed: PlacedOpening = {
    start: { x: 9, y },
    end: { x: 23, y },
    center: { x: 16, y },
    dir: { x: 1, y: 0 },
    left: { x: 0, y: -1 },
    length: 28,
    offset: 14,
    fits: true,
  }
  const opening = { kind, style, segment: '', offset: 0, width: styleInfo(kind, style).width, hinge: kind === 'gate' && style === 'sliding' ? 'b' : 'a', swing: 'left' } as Opening
  return (
    <>
      <path className="icon-wall" d={`M2 ${y}H9M23 ${y}H30`} />
      <OpeningShape parts={openingParts(placed, opening, 3.5)} className={`opening ${kind} ${style}`} />
    </>
  )
}
