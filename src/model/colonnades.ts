import { closestOnSegment, dist, EPS, lerp, type Vec } from './geometry'
import { segmentKind, type Colonnade, type ColumnStyle, type Layer } from './plan'

/**
 * Colonnades: an open edge (a gallery's front, a porch) with columns along it under a beam. The columns are
 * shared out evenly, no farther apart than the colonnade's spacing, with one at each end unless a wall holds
 * that end up already.
 */

export interface ColumnInfo {
  title: string
  /** The shaft's diameter, the spacing new colonnades get, and the depth of the beam they carry, in m. */
  diameter: number
  spacing: number
  beam: number
}

/** Roman: stone columns with a base and a capital, under a stone beam. Metal: slim steel posts under a steel beam. */
export const COLUMNS: Record<ColumnStyle, ColumnInfo> = {
  roman: { title: 'Roman', diameter: 0.32, spacing: 2.4, beam: 0.35 },
  metal: { title: 'Metal', diameter: 0.1, spacing: 3, beam: 0.2 },
}

export const newColonnade = (style: ColumnStyle): Colonnade => ({ style, spacing: COLUMNS[style].spacing })

/** Whether a point stands on one of the layer's walls: within its thickness of its line, joined to it or not. */
export function heldByWall(layer: Layer, thickness: ReadonlyMap<string, number>, p: Vec): boolean {
  return Object.entries(layer.segments).some(
    ([id, s]) => segmentKind(s) === 'wall' && closestOnSegment(p, layer.vertices[s.a], layer.vertices[s.b]).dist <= (thickness.get(id) ?? 0) / 2 + EPS,
  )
}

/** Where columns at most `spacing` apart stand along a line from `a` to `b`, as fractions of the way along it. */
export function columnSpots(length: number, spacing: number): number[] {
  const n = Math.max(1, Math.ceil(length / spacing - 1e-9))
  return Array.from({ length: n + 1 }, (_, i) => i / n)
}

export interface PlacedColonnade {
  segment: string
  colonnade: Colonnade
  a: Vec
  b: Vec
  /** Its columns, as fractions along it and points on the plan; ends a wall holds have none. */
  columns: { t: number; p: Vec }[]
}

/** The layer's colonnades: its open edges that have one, with their columns. */
export function layerColonnades(layer: Layer, thickness: ReadonlyMap<string, number>): PlacedColonnade[] {
  const out: PlacedColonnade[] = []
  for (const [id, s] of Object.entries(layer.segments)) {
    if (segmentKind(s) !== 'open' || !s.colonnade) continue
    const a = layer.vertices[s.a]
    const b = layer.vertices[s.b]
    if (dist(a, b) < EPS) continue
    const columns = columnSpots(dist(a, b), s.colonnade.spacing)
      .map((t) => ({ t, p: lerp(a, b, t) }))
      .filter((c) => !((c.t === 0 || c.t === 1) && heldByWall(layer, thickness, c.p)))
    out.push({ segment: id, colonnade: s.colonnade, a, b, columns })
  }
  return out
}
