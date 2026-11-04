import { add, cross, dist, dot, EPS, lerp, mul, polygonArea, signedArea, sub, type Vec } from './geometry'
import type { Roof, RoofType } from './plan'
import { WALL_HEIGHT } from './walls'

/**
 * Roof geometry. A roof covers its outline (usually the walls' outside faces) and its eaves stand `overhang`
 * beyond it. Its underside rises at `pitch` from `height`, which it has where it crosses the outline at an eaves
 * side:
 *
 * - flat: level, a slab with a parapet round its edge;
 * - shed: one slope, rising away from the outline edge `edge` (its low side);
 * - gable: two slopes rising from the sides parallel to `edge` to a ridge along it; the other sides are gable ends;
 * - hip: a slope rising from every side, meeting at hips and a ridge. Exact for convex outlines only: an L-shaped
 *   house takes two overlapping roofs.
 *
 * Each slope is a plane, given as f(p), the distance into the roof from its eaves line. The underside is
 * height + tan(pitch) · min f, so slopes meet where they cross (ridges, hips) and carry on, lower, over the
 * overhang.
 */

export const ROOF_TITLES: Record<RoofType, string> = { flat: 'Flat', shed: 'Shed', gable: 'Gable', hip: 'Hip' }

/** Thickness of a flat slab and of a pitched roof (rafters and covering), measured vertically. */
export const SLAB = 0.2
export const COVERING = 0.15
/** A parapet wall's thickness. */
export const PARAPET_WALL = 0.15

/** f(p) = a·x + b·y + c. */
export interface Plane {
  a: number
  b: number
  c: number
}

export const planeAt = (f: Plane, p: Vec): number => f.a * p.x + f.b * p.y + f.c

const unit = (v: Vec): Vec => mul(v, 1 / Math.hypot(v.x, v.y))

/** Without repeated points or points in line with their neighbours, running clockwise on screen (positive area). */
export function normalized(pts: readonly Vec[]): Vec[] {
  let out = pts.filter((p, i) => dist(p, pts[(i + 1) % pts.length]) > 1e-6)
  let changed = true
  while (changed && out.length > 3) {
    changed = false
    for (let i = 0; i < out.length; i++) {
      const prev = out[(i + out.length - 1) % out.length]
      const next = out[(i + 1) % out.length]
      const d1 = sub(out[i], prev)
      const d2 = sub(next, out[i])
      if (Math.abs(cross(unit(d1), unit(d2))) < 1e-9 && dot(d1, d2) > 0) {
        out = out.filter((_, k) => k !== i)
        changed = true
        break
      }
    }
  }
  return signedArea(out) < 0 ? out.reverse() : out
}

/** Into the polygon from its edge i, for a polygon of positive area. */
const inward = (pts: readonly Vec[], i: number): Vec => {
  const d = unit(sub(pts[(i + 1) % pts.length], pts[i]))
  return { x: -d.y, y: d.x }
}

/** The polygon moved out by `d` (in by a negative `d`), its corners mitred. */
export function offsetPolygon(pts: readonly Vec[], d: number): Vec[] {
  const ring = normalized(pts)
  if (Math.abs(d) < EPS) return ring
  return ring.map((p, i) => {
    const n1 = mul(inward(ring, (i + ring.length - 1) % ring.length), -1)
    const n2 = mul(inward(ring, i), -1)
    // the corner where both edges' moved lines meet; a near reversal is capped at twice the distance
    const sum = add(n1, n2)
    if (Math.hypot(sum.x, sum.y) < 1e-9) return add(p, mul(n2, d))
    const k = Math.min(4, 1 / Math.max(1e-6, (1 + dot(n1, n2)) / 2))
    return add(p, mul(unit(sum), d * Math.sqrt(k)))
  })
}

export function isConvex(pts: readonly Vec[]): boolean {
  const ring = normalized(pts)
  return ring.every((p, i) => cross(sub(p, ring[(i + ring.length - 1) % ring.length]), sub(ring[(i + 1) % ring.length], p)) >= -1e-9)
}

/** The slopes of a roof; a flat roof has one level plane. */
export function roofPlanes(roof: Roof): Plane[] {
  if (roof.type === 'flat') return [{ a: 0, b: 0, c: 0 }]
  if (roof.type === 'hip') {
    const ring = normalized(roof.outline)
    return ring.map((p, i) => {
      const n = inward(ring, i)
      return { a: n.x, b: n.y, c: -dot(n, p) }
    })
  }
  // shed and gable slope across the reference edge, from the outline's extremes that way
  const pts = roof.outline
  const k = roof.edge % pts.length
  let n = unit(sub(pts[(k + 1) % pts.length], pts[k]))
  n = { x: -n.y, y: n.x }
  if (signedArea(pts) < 0) n = mul(n, -1)
  const s = pts.map((p) => dot(p, n))
  const low = Math.min(...s)
  const high = Math.max(...s)
  const rising: Plane = { a: n.x, b: n.y, c: -low }
  return roof.type === 'shed' ? [rising] : [rising, { a: -n.x, b: -n.y, c: high }]
}

export const roofThickness = (roof: Pick<Roof, 'type'>): number => (roof.type === 'flat' ? SLAB : COVERING)

/** Height of the roof's underside over plan point `p`. */
export function underside(roof: Roof, planes: readonly Plane[], p: Vec): number {
  if (roof.type === 'flat') return roof.height
  return roof.height + Math.tan((roof.pitch * Math.PI) / 180) * Math.min(...planes.map((f) => planeAt(f, p)))
}

/** The eaves line: the outline moved out by the overhang. */
export const eavesOf = (roof: Roof): Vec[] => offsetPolygon(roof.outline, roof.overhang)

/** The part of a polygon where g(p) ≤ 0 (Sutherland–Hodgman against one half-plane). */
function clip(poly: readonly Vec[], g: Plane): Vec[] {
  const out: Vec[] = []
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i]
    const q = poly[(i + 1) % poly.length]
    const gp = planeAt(g, p)
    const gq = planeAt(g, q)
    if (gp <= 1e-9) out.push(p)
    if (gp <= 1e-9 !== gq <= 1e-9) out.push(lerp(p, q, gp / (gp - gq)))
  }
  return out
}

/** One sloped face of a roof, over its eaves polygon: where its plane is the lowest. */
export interface RoofFace {
  pts: Vec[]
  plane: Plane
}

export function roofFaces(roof: Roof): RoofFace[] {
  const eaves = eavesOf(roof)
  const planes = roofPlanes(roof)
  if (planes.length === 1) return [{ pts: eaves, plane: planes[0] }]
  const faces: RoofFace[] = []
  planes.forEach((f, i) => {
    let pts = eaves
    planes.forEach((g, j) => {
      if (i === j || !pts.length) return
      const diff = { a: f.a - g.a, b: f.b - g.b, c: f.c - g.c }
      // the same plane twice (edges in line): the first one keeps the face
      if (Math.abs(diff.a) + Math.abs(diff.b) < 1e-9) {
        if (diff.c > 1e-9 || (diff.c > -1e-9 && i > j)) pts = []
        return
      }
      pts = clip(pts, diff)
    })
    // clipping leaves a point twice where a corner lies on a clipping line
    if (pts.length >= 3 && polygonArea(pts) > 1e-6) faces.push({ pts: normalized(pts), plane: f })
  })
  return faces
}

/** The underside along a line from `a` to `b`, as its heights at the ends and wherever the slope changes (a ridge, a hip). */
export function undersideAlong(roof: Roof, a: Vec, b: Vec): { t: number; z: number }[] {
  const planes = roofPlanes(roof)
  const ts = [0, 1]
  for (let i = 0; i < planes.length; i++) {
    for (let j = i + 1; j < planes.length; j++) {
      const ga = planeAt(planes[i], a) - planeAt(planes[j], a)
      const gb = planeAt(planes[i], b) - planeAt(planes[j], b)
      if (ga > 0 !== gb > 0 && Math.abs(ga - gb) > 1e-12) ts.push(ga / (ga - gb))
    }
  }
  return [...new Set(ts.sort((x, y) => x - y).map((t) => Math.round(t * 1e9) / 1e9))].map((t) => ({ t, z: underside(roof, planes, lerp(a, b, t)) }))
}

/**
 * The edge a shed or gable roof turns to: the next side round the outline, skipping, for a gable, sides parallel
 * to its ridge (on a rectangle the ridge just swaps between its two directions).
 */
export function nextEdge(roof: Roof): number {
  const n = roof.outline.length
  const dir = (i: number) => unit(sub(roof.outline[(i + 1) % n], roof.outline[i]))
  const current = dir(roof.edge % n)
  for (let step = 1; step < n; step++) {
    const i = (roof.edge + step) % n
    if (roof.type !== 'gable' || Math.abs(cross(current, dir(i))) > 0.05) return i
  }
  return roof.edge % n
}

/** What needs fixing for the roof to come out right, or null. */
export function roofProblem(roof: Roof): string | null {
  if (roof.type === 'hip' && !isConvex(roof.outline)) return 'A hip roof needs a convex outline: draw an L-shaped house as two overlapping roofs.'
  return null
}

export interface RoofSummary {
  /** Covered by the eaves, in plan, and the roof's own (sloped) surface, m². */
  planArea: number
  surface: number
  /** The lowest point of the eaves and the top of the roof, m. */
  eaves: number
  top: number
}

export function roofSummary(roof: Roof): RoofSummary {
  const planes = roofPlanes(roof)
  const eaves = eavesOf(roof)
  const planArea = polygonArea(eaves)
  const slope = roof.type === 'flat' ? 1 : Math.cos((roof.pitch * Math.PI) / 180)
  const tops = roofFaces(roof).flatMap((f) => f.pts.map((p) => underside(roof, planes, p)))
  return {
    planArea,
    surface: planArea / slope,
    eaves: Math.min(...eaves.map((p) => underside(roof, planes, p))),
    top: Math.max(...tops) + roofThickness(roof) + (roof.type === 'flat' ? roof.parapet : 0),
  }
}

/** A new roof over `outline`: its slopes run off the outline's longest side; flat roofs get a parapet and no overhang. */
export function newRoof(outline: readonly Vec[], type: RoofType, height = WALL_HEIGHT): Roof {
  const pts = normalized(outline)
  let edge = 0
  pts.forEach((p, i) => {
    if (dist(p, pts[(i + 1) % pts.length]) > dist(pts[edge], pts[(edge + 1) % pts.length])) edge = i
  })
  const flat = type === 'flat'
  return { outline: pts, type, pitch: type === 'shed' ? 10 : 25, height, overhang: flat ? 0 : 0.5, edge, parapet: flat ? 0.3 : 0 }
}

/**
 * The outer boundaries of polygons put together (rooms that share walls), each running clockwise on screen.
 * The polygons must share their corners where they touch, as a layer's regions do; holes are left out.
 */
export function unionOutlines(rings: readonly (readonly Vec[])[]): Vec[][] {
  const key = (p: Vec) => `${Math.round(p.x * 1e5)},${Math.round(p.y * 1e5)}`
  // every edge once; one that a neighbour runs the other way is shared, so it is inside
  type Edge = { a: Vec; b: Vec; ka: string; kb: string }
  const edges = new Map<string, Edge>()
  for (const ring of rings) {
    const pts = signedArea(ring) < 0 ? [...ring].reverse() : ring
    pts.forEach((a, i) => {
      const b = pts[(i + 1) % pts.length]
      const [ka, kb] = [key(a), key(b)]
      if (ka === kb) return
      if (edges.has(`${kb}>${ka}`)) edges.delete(`${kb}>${ka}`)
      else edges.set(`${ka}>${kb}`, { a, b, ka, kb })
    })
  }
  const from = new Map<string, string[]>()
  for (const [k, e] of edges) from.set(e.ka, [...(from.get(e.ka) ?? []), k])
  const loops: Vec[][] = []
  const used = new Set<string>()
  for (const start of edges.keys()) {
    if (used.has(start)) continue
    const loop: Vec[] = []
    let k: string | undefined = start
    while (k && !used.has(k)) {
      used.add(k)
      const e: Edge = edges.get(k)!
      loop.push(e.a)
      k = from.get(e.kb)?.find((n) => !used.has(n))
    }
    const ring = normalized(loop)
    // what is left once rooms are put together runs the other way round a hole
    if (ring.length >= 3 && signedArea(loop) > 0) loops.push(ring)
  }
  return loops
}
