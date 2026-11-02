import type { Vec } from '../../model/geometry'
import type { Region } from '../../model/regions'
import type { PlacedArea } from '../../state/derived'

/** Which lines area labels show (View: area names, area sizes). */
export interface LabelLines {
  name: boolean
  size: boolean
}

/** The second line of an area's label: its floor area inside the walls, or why it has none. */
export const areaText = (placed: PlacedArea): string => (placed.region ? `${placed.region.floor.toFixed(2)} m²` : 'not enclosed')

/** Size of an area label in screen pixels, estimated from its text as the other labels are; nothing when it shows no line. */
export function areaLabelSize(placed: PlacedArea, lines: LabelLines): { w: number; h: number } {
  const w = Math.max(lines.name ? placed.area.name.length * 7.4 : 0, lines.size ? areaText(placed).length * 6.4 : 0)
  const count = Number(lines.name) + Number(lines.size)
  return count ? { w: w + 16, h: 6 + 14 * count } : { w: 0, h: 0 }
}

/** The topmost area label under world point `p`. */
export function areaLabelAt(areas: readonly PlacedArea[], p: Vec, px: number, lines: LabelLines): PlacedArea | undefined {
  if (!lines.name && !lines.size) return undefined
  for (let i = areas.length - 1; i >= 0; i--) {
    const a = areas[i]
    const { w, h } = areaLabelSize(a, lines)
    if (Math.abs(p.x - a.label.x) <= (w / 2) * px && Math.abs(p.y - a.label.y) <= (h / 2) * px) return a
  }
  return undefined
}

/** SVG path of a region, holes included (draw it with fill-rule evenodd). */
export function regionPath(region: Pick<Region, 'outer' | 'holes'>): string {
  return [region.outer, ...region.holes].map((ring) => `M${ring.map((p) => `${p.x} ${p.y}`).join('L')}Z`).join('')
}
