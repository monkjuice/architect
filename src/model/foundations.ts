import { add, dist, lerp, type Vec } from './geometry'
import type { Face } from './faces'
import { columnSpots } from './colonnades'
import { storeyOf, type FoundationSystem, type Plan } from './plan'
import { regionAt } from './regions'
import { offsetPolygon, unionOutlines } from './roofs'
import { isCovered, type Solid, type SolidsSource } from './solids'
import { EXTERIOR_WALL, wallHeight } from './walls'
import { wallUses, type WallInfo, type WallUse } from './wallUse'

/**
 * The foundation plan (the Foundation tab): what the ground floor stands on, worked out from its walls, columns and
 * rooms for the plan's foundation system, each wall's footing editable by hand (SegmentSchema.footing):
 *
 * - strip: a strip footing of lean concrete with brick rubble under every wall, and a reinforced ring beam on it
 *   under the load-bearing ones (the envelope and boundary walls);
 * - piles: a reinforced ground beam under every wall of the house, on bored piles under its load-bearing walls;
 * - raft: a reinforced slab under the house's covered areas, out to the walls' outside faces, thickened into a beam
 *   under every wall.
 *
 * Boundary and garden walls (nothing indoors on either side) stand on strip footings whatever the system: they are
 * apart from the house. Columns (a gallery's, a colonnade's) stand on pad footings, and load-bearing walls have tie
 * columns at their ends and along them. Sizes are usual ones for a house on ordinary soil, not a structural design.
 */

/** A strip footing: its width beyond the wall's thickness (at least `min`), and its depth under walls of 25 cm or more and the rest, m. */
export const FOOTING = { extra: 0.15, min: 0.3, deep: 0.6, shallow: 0.4 }
/** A ring beam on a strip footing (and on top of a load-bearing wall): its depth, m; its width is the wall's. */
export const RING_BEAM = 0.2
/** Ground beams on piles, m: under load-bearing walls and partitions (width at least, and depth). */
export const GROUND_BEAM = { bearing: { width: 0.2, depth: 0.4 }, partition: { width: 0.15, depth: 0.3 } }
/** Bored piles: diameter, depth and the most they stand apart along a load-bearing wall, m. */
export const PILE = { diameter: 0.25, depth: 3, spacing: 2.5 }
/** A raft slab's thickness and its thickening under walls (at the edge and inside), m. */
export const RAFT = { slab: 0.15, edge: { width: 0.25, depth: 0.5 }, inner: { width: 0.15, depth: 0.3 } }
/** A pad footing under a column: its side and depth, and how deep it sits, m. */
export const PAD = { side: 0.8, depth: 0.4, bottom: 0.8 }
/** Tie columns: side and the most they stand apart along a load-bearing wall, m. */
export const TIE_COLUMN = { side: 0.2, spacing: 4 }

export const FOUNDATION_TITLES: Record<FoundationSystem, string> = { strip: 'Strip footings', piles: 'Piles and ground beams', raft: 'Raft slab' }

export interface WallFooting {
  layer: string
  segment: string
  a: Vec
  b: Vec
  thickness: number
  use: WallUse
  /** A strip footing (lean concrete) or a reinforced beam (on piles, or a raft's thickening). */
  kind: 'strip' | 'beam'
  width: number
  depth: number
  /** Its width or depth was set by hand. */
  custom: boolean
  /** A strip footing's ring beam on top, under a load-bearing wall. */
  ringBeam: boolean
}

export interface FoundationPlan {
  system: FoundationSystem
  walls: WallFooting[]
  piles: { layer: string; at: Vec }[]
  pads: { layer: string; at: Vec }[]
  ties: { layer: string; at: Vec; height: number }[]
  /** Raft slabs, out to the walls' outside faces. */
  rafts: { layer: string; outline: Vec[] }[]
}

export const foundationSystem = (plan: Plan): FoundationSystem => plan.foundation?.system ?? 'strip'

/** What a wall's footing would be without a size set by hand. */
export function autoFooting(system: FoundationSystem, use: WallUse, thickness: number): { kind: 'strip' | 'beam'; width: number; depth: number } {
  if (system === 'strip' || use === 'boundary') {
    return { kind: 'strip', width: Math.max(FOOTING.min, thickness + FOOTING.extra), depth: thickness >= 0.25 ? FOOTING.deep : FOOTING.shallow }
  }
  if (system === 'piles') {
    const b = use === 'partition' ? GROUND_BEAM.partition : GROUND_BEAM.bearing
    return { kind: 'beam', width: Math.max(b.width, thickness), depth: b.depth }
  }
  const b = use === 'envelope' ? RAFT.edge : RAFT.inner
  return { kind: 'beam', width: Math.max(b.width, thickness), depth: b.depth }
}

/** Points along a wall at most `spacing` apart, its ends included, keyed so walls that meet share them. */
function spots(out: Map<string, { layer: string; at: Vec; height: number }>, w: WallInfo, a: Vec, b: Vec, spacing: number, height: number) {
  for (const t of columnSpots(dist(a, b), spacing)) {
    const at = lerp(a, b, t)
    const key = `${w.layer.id}:${at.x.toFixed(2)},${at.y.toFixed(2)}`
    out.set(key, { layer: w.layer.id, at, height: Math.max(out.get(key)?.height ?? 0, height) })
  }
}

/** Tie columns of the load-bearing walls on every floor, at their ends and at most TIE_COLUMN.spacing apart. */
export function tieColumns(walls: readonly WallInfo[]): { layer: string; at: Vec; height: number }[] {
  const out = new Map<string, { layer: string; at: Vec; height: number }>()
  for (const w of walls) {
    if (w.use === 'partition') continue
    const s = w.layer.segments[w.segment]
    spots(out, w, w.layer.vertices[s.a], w.layer.vertices[s.b], TIE_COLUMN.spacing, wallHeight(s))
  }
  return [...out.values()]
}

/** The middle of a solid's underside. */
function base(s: Solid): Vec | null {
  const bottom = s.faces.filter((f: Face) => f.normal.z < -0.99).flatMap((f) => f.pts)
  if (!bottom.length) return null
  return { x: bottom.reduce((x, p) => x + p.x, 0) / bottom.length, y: bottom.reduce((y, p) => y + p.y, 0) / bottom.length }
}

const ends = (w: WallInfo): [Vec, Vec] => {
  const s = w.layer.segments[w.segment]
  return [w.layer.vertices[s.a], w.layer.vertices[s.b]]
}

export function foundationPlan(plan: Plan, solids: readonly Solid[], source: SolidsSource, walls: readonly WallInfo[] = wallUses(plan, source)): FoundationPlan {
  const system = foundationSystem(plan)
  const ground = walls.filter((w) => storeyOf(w.layer) === 0)
  const footings: WallFooting[] = ground.map((w) => {
    const s = w.layer.segments[w.segment]
    const auto = autoFooting(system, w.use, w.thickness)
    return {
      layer: w.layer.id,
      segment: w.segment,
      a: w.layer.vertices[s.a],
      b: w.layer.vertices[s.b],
      thickness: w.thickness,
      use: w.use,
      kind: auto.kind,
      width: s.footing?.width ?? auto.width,
      depth: s.footing?.depth ?? auto.depth,
      custom: !!s.footing,
      ringBeam: auto.kind === 'strip' && w.use !== 'partition',
    }
  })

  const piles = new Map<string, { layer: string; at: Vec; height: number }>()
  if (system === 'piles') for (const w of ground) if (w.use === 'envelope') spots(piles, w, ...ends(w), PILE.spacing, 0)

  // the raft: the ground floor's covered areas (rooms and galleries, but lots and pools), out to the walls' outside faces
  const rafts: FoundationPlan['rafts'] = []
  if (system === 'raft') {
    for (const layer of plan.layers) {
      if (!layer.visible || storeyOf(layer)) continue
      const regions = source.faces(layer).regions
      const covered = new Set(Object.values(layer.areas).flatMap((a) => {
        const r = !a.lot && !a.depth ? regionAt(regions, a.at) : null
        return r && isCovered(r) ? [r] : []
      }))
      for (const ring of unionOutlines([...covered].map((r) => r.outer))) rafts.push({ layer: layer.id, outline: offsetPolygon(ring, EXTERIOR_WALL / 2) })
    }
  }

  // pad footings under the ground floor's columns: one per column, however many solids make it (a timber post's shoe and braces)
  const pads = new Map<string, { layer: string; at: Vec }>()
  for (const s of solids) {
    const layer = plan.layers.find((l) => l.id === s.ref.layer)
    // a glazed side's posts stand on its concrete base
    if (s.kind !== 'column' || !layer || storeyOf(layer) || layer.segments[s.ref.id]?.colonnade?.style === 'glazed') continue
    const at = base(s)
    if (at) pads.set(`${layer.id}:${(Math.round(at.x * 5) / 5).toFixed(1)},${(Math.round(at.y * 5) / 5).toFixed(1)}`, { layer: layer.id, at })
  }

  return {
    system,
    walls: footings,
    piles: [...piles.values()].map(({ layer, at }) => ({ layer, at })),
    pads: [...pads.values()],
    ties: tieColumns(ground),
    rafts,
  }
}

/** A wall footing's band in plan, `width` wide along its line. */
export function footingBand(f: Pick<WallFooting, 'a' | 'b' | 'width'>): Vec[] {
  const l = dist(f.a, f.b)
  const n = { x: ((f.b.y - f.a.y) / l) * (f.width / 2), y: (-(f.b.x - f.a.x) / l) * (f.width / 2) }
  return [add(f.a, n), add(f.b, n), add(f.b, { x: -n.x, y: -n.y }), add(f.a, { x: -n.x, y: -n.y })]
}
