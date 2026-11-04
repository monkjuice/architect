import { memo, type CSSProperties } from 'react'
import { furnitureInfo, furnitureSymbol, placeFurniture, placement, type Placement, type SymbolPart } from '../../model/furniture'
import type { Furniture, FurnitureKind, Layer } from '../../model/plan'

/**
 * Furniture in plan notation, at its real size: outlines and the lines that say what each piece is (see
 * furnitureSymbol). The plan, the placing preview and the library icons draw the same symbol.
 */

const points = (pts: { x: number; y: number }[]) => pts.map((p) => `${p.x},${p.y}`).join(' ')

function Part({ part }: { part: SymbolPart }) {
  const className = `furniture-${part.role}`
  if ('c' in part) return <circle className={className} cx={part.c.x} cy={part.c.y} r={part.r} />
  return part.closed ? <polygon className={className} points={points(part.pts)} /> : <polyline className={className} points={points(part.pts)} />
}

export function FurnitureSymbol({ item, placed, className = '' }: { item: Furniture; placed: Placement; className?: string }) {
  return (
    <g className={`furniture ${item.kind} ${'style' in item ? item.style : ''} ${className}`}>
      {furnitureSymbol(item, placed).map((part, i) => (
        <Part key={i} part={part} />
      ))}
    </g>
  )
}

/** A layer's furniture; `selected` holds the selected ids separated by spaces. */
export const FurnitureLayer = memo(function FurnitureLayer({ layer, selected, hovered }: { layer: Layer; selected: string; hovered?: string }) {
  const ids = new Set(selected.split(' '))
  const entries = Object.entries(layer.furniture)
  if (!entries.length) return null
  return (
    <g className={layer.locked ? 'furnishings locked' : 'furnishings'} style={{ '--layer': layer.color } as CSSProperties}>
      {entries.map(([id, f]) => {
        const placed = placeFurniture(layer, f)
        return placed && <FurnitureSymbol key={id} item={f} placed={placed} className={ids.has(id) ? 'selected' : id === hovered ? 'hovered' : ''} />
      })}
    </g>
  )
})

/** A piece's symbol for the library, scaled to fit a 32 × 24 box. */
export function FurnitureIcon({ kind, style }: { kind: FurnitureKind; style?: string }) {
  const info = furnitureInfo(kind, style)
  const scale = Math.min(26 / info.width, 18 / info.depth, 40)
  const item = { kind, style, at: { x: 0, y: 0 }, angle: 0, width: info.width, depth: info.depth, shower: 3.5 } as Furniture
  return (
    <g transform={`translate(16 12) scale(${scale})`}>
      <FurnitureSymbol item={item} placed={placement({ x: 0, y: 0 }, 0, info.width, info.depth)} />
    </g>
  )
}
