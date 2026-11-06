import type { Vec } from './geometry'
import { segmentKind, type Plan, type Site } from './plan'
import type { Solid, SolidKind, SolidMaterial } from './solids'

/**
 * Elevations: the house drawn from each side as an architect draws it, in parallel projection, square to its
 * main walls. Only the faces that face the viewer are drawn, the farthest first so nearer ones cover them (a
 * painter's algorithm, which holds for the walls, openings and roofs of a house: their faces do not interpenetrate).
 */

export interface ElevationView {
  /** The way the viewer looks, on the plan (unit vector). */
  dir: Vec
  /** The compass bearing the facade faces (towards the viewer), in degrees, and its name ("North-west"). */
  bearing: number
  name: string
}

const WORDS: Record<string, string> = { N: 'North', NE: 'North-east', E: 'East', SE: 'South-east', S: 'South', SW: 'South-west', W: 'West', NW: 'North-west' }
const POINTS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']

/** The plan's main direction: its walls' directions folded to a quarter turn, weighted by length, in radians. */
export function mainDirection(plan: Plan): number {
  let sx = 0
  let sy = 0
  for (const layer of plan.layers) {
    if (!layer.visible) continue
    for (const s of Object.values(layer.segments)) {
      if (segmentKind(s) !== 'wall') continue
      const a = layer.vertices[s.a]
      const b = layer.vertices[s.b]
      const length = Math.hypot(b.x - a.x, b.y - a.y)
      const angle = 4 * Math.atan2(b.y - a.y, b.x - a.x)
      sx += length * Math.cos(angle)
      sy += length * Math.sin(angle)
    }
  }
  return sx || sy ? Math.atan2(sy, sx) / 4 : 0
}

/**
 * The four elevations, square to the plan's main walls: looking at the side that faces the plan's top first, then
 * round clockwise (right, bottom, left).
 */
export function elevationViews(plan: Plan, site: Site = plan.site): ElevationView[] {
  const phi = mainDirection(plan)
  return [0, 1, 2, 3].map((k) => {
    // the viewer stands on the side the facade faces: up the sheet first, as the plan reads
    const a = phi - Math.PI / 2 + (k * Math.PI) / 2
    const out = { x: Math.cos(a), y: Math.sin(a) }
    // clockwise from straight up on the plan, then from true north
    const onPlan = (Math.atan2(out.x, -out.y) * 180) / Math.PI
    const bearing = (((onPlan - site.north) % 360) + 360) % 360
    return { dir: { x: -out.x, y: -out.y }, bearing, name: WORDS[POINTS[Math.round(bearing / 45) % 8]] }
  })
}

/** One face as seen: (u to the viewer's right, z up), in m. */
export interface ElevationPolygon {
  pts: Vec[]
  kind: SolidKind
  material: SolidMaterial
  /** How squarely it faces the viewer, 0 (edge on) to 1, for shading; a facet of a round surface is drawn without lines. */
  facing: number
  smooth: boolean
  /** The material it is finished in (an id, see materials.ts), when it is. */
  finish?: string
}

export interface Elevation {
  /** Farthest first. */
  polygons: ElevationPolygon[]
  /** Across and up, in m; null when nothing faces this way. */
  bounds: { u0: number; u1: number; z0: number; z1: number } | null
  /** Heights worth marking: the ground, the tops of walls, the eaves and tops of roofs. */
  levels: number[]
}

export function elevation(solids: readonly Solid[], view: ElevationView): Elevation {
  const d = view.dir
  // to the viewer's right, looking along d (+y is down on the plan)
  const r = { x: -d.y, y: d.x }
  const drawn: (ElevationPolygon & { depth: number })[] = []
  for (const solid of solids) {
    // what is under the ground (a pool's lining and water) does not show in an elevation
    if (solid.top <= 0.01) continue
    for (const face of solid.faces) {
      // facing the viewer, not edge on
      const facing = -(face.normal.x * d.x + face.normal.y * d.y)
      if (facing < 0.01) continue
      const pts = face.pts.map((p) => ({ x: p.x * r.x + p.y * r.y, y: p.z }))
      // the nearest point orders faces: a roof's eaves stand in front of the wall they overhang
      const depth = Math.min(...face.pts.map((p) => p.x * d.x + p.y * d.y))
      drawn.push({ pts, kind: solid.kind, material: solid.material, facing, smooth: !!face.smooth, finish: face.finish ?? solid.finish, depth })
    }
  }
  drawn.sort((a, b) => b.depth - a.depth)
  const us = drawn.flatMap((p) => p.pts.map((q) => q.x))
  const zs = drawn.flatMap((p) => p.pts.map((q) => q.y))
  const marks = [0]
  for (const s of solids) {
    if (s.kind === 'wall') marks.push(s.top)
    if (s.kind === 'roof') marks.push(s.bottom, s.top)
    if (s.kind === 'parapet') marks.push(s.top)
  }
  const levels: number[] = []
  for (const z of [...new Set(marks.map((z) => Math.round(z * 100) / 100))].sort((a, b) => a - b)) {
    // marks closer than 15 cm would print over each other
    if (!levels.length || z - levels[levels.length - 1] >= 0.15) levels.push(z)
  }
  return {
    polygons: drawn.map(({ depth: _depth, ...polygon }) => polygon),
    bounds: us.length ? { u0: Math.min(...us), u1: Math.max(...us), z0: Math.min(0, ...zs), z1: Math.max(...zs) } : null,
    levels,
  }
}
