import { add, closestOnSegment, cross, dist, dot, EPS, lerp, mul, polygonArea, signedArea, sub, type Vec } from './geometry'
import type { Roof, RoofType } from './plan'
import { EXTERIOR_WALL, WALL_HEIGHT } from './walls'

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

export const ROOF_TITLES: Record<RoofType, string> = { flat: 'Flat', shed: 'Shed', gable: 'Gable', hip: 'Hip', pergola: 'Pergola' }

/** A pergola's rafters: how deep and wide they are and how far apart, m; its covering, when it has one, on them. */
export const RAFTER = { depth: 0.2, width: 0.07, spacing: 0.6 }
export const PERGOLA_SHEET = 0.012

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

/**
 * A ring with each edge moved out by its own distance (in, for a negative one), its corners where the moved edges
 * meet; where two edges in line move by different distances, the corner becomes a step.
 */
export function offsetEdges(pts: readonly Vec[], d: (edge: number) => number): Vec[] {
  const ring = normalized(pts)
  const n = ring.length
  const line = (i: number) => ({ p: add(ring[i], mul(inward(ring, i), -d(i))), dir: sub(ring[(i + 1) % n], ring[i]) })
  return ring.flatMap((p, i) => {
    const [a, b] = [line((i + n - 1) % n), line(i)]
    const den = cross(a.dir, b.dir)
    if (Math.abs(den) < 1e-9) return Math.abs(d(i) - d((i + n - 1) % n)) < 1e-9 ? [b.p] : [add(p, mul(inward(ring, (i + n - 1) % n), -d((i + n - 1) % n))), b.p]
    return [add(a.p, mul(a.dir, cross(sub(b.p, a.p), b.dir) / den))]
  })
}

/** How far skylights keep from a roof's outline, and from the edges of its slopes (a gable's ridge), m. */
export const SKYLIGHT_MARGIN = 0.5
const SKYLIGHT_SLOPE_MARGIN = 0.15

/** The part of `subject` inside the convex polygon `clipper` (Sutherland-Hodgman). */
function clipConvex(subject: readonly Vec[], clipper: readonly Vec[]): Vec[] {
  const s = signedArea(clipper) > 0 ? 1 : -1
  let out = [...subject]
  clipper.forEach((c0, i) => {
    const c1 = clipper[(i + 1) % clipper.length]
    const side = (p: Vec) => s * cross(sub(c1, c0), sub(p, c0))
    const input = out
    out = []
    input.forEach((p, j) => {
      const q = input[(j + 1) % input.length]
      const [dp, dq] = [side(p), side(q)]
      if (dp >= 0) out.push(p)
      if ((dp >= 0) !== (dq >= 0)) out.push(lerp(p, q, dp / (dp - dq)))
    })
  })
  return out
}

/**
 * A roof's skylights in plan: `count` strips evenly spaced along its `edge` (a shed's eaves), each `width` wide and
 * running across the roof, kept SKYLIGHT_MARGIN in from its outline. With `slope` (one of its faces), only the part
 * over that slope, a little in from its edges, so a strip over a gable's ridge becomes one opening on each side.
 */
export function skylights(roof: Roof, slope?: readonly Vec[]): Vec[][] {
  const sk = roof.skylights
  if (!sk) return []
  const pts = normalized(roof.outline)
  const [a, b] = [pts[roof.edge % pts.length], pts[(roof.edge + 1) % pts.length]]
  const u = unit(sub(b, a))
  let v = { x: -u.y, y: u.x }
  const middle = mul(pts.reduce(add, { x: 0, y: 0 }), 1 / pts.length)
  if (dot(sub(middle, a), v) < 0) v = mul(v, -1)
  const us = pts.map((p) => dot(sub(p, a), u))
  const depth = Math.max(...pts.map((p) => dot(sub(p, a), v)))
  const [u0, u1] = [Math.min(...us), Math.max(...us)]
  const step = (u1 - u0) / sk.count
  const half = Math.min(sk.width, step - 0.3) / 2
  if (half <= 0.05) return []
  const at = (s: number, t: number) => add(add(a, mul(u, s)), mul(v, t))
  const within = (poly: Vec[], area: readonly Vec[]) => (isConvex(area) ? clipConvex(poly, area) : poly.every((p) => pointIn(p, area)) ? poly : [])
  const inner = offsetPolygon(pts, -SKYLIGHT_MARGIN)
  return Array.from({ length: sk.count }, (_, i) => {
    const c = u0 + (i + 0.5) * step
    let poly = within([at(c - half, 0), at(c + half, 0), at(c + half, depth), at(c - half, depth)], inner)
    if (slope && poly.length >= 3) poly = within(poly, offsetPolygon(slope, -SKYLIGHT_SLOPE_MARGIN))
    return poly
  }).filter((poly) => poly.length >= 3 && polygonArea(poly) > 0.05)
}

/**
 * A pergola's rafters in plan, as lines: RAFTER.spacing apart along its `edge` (a shed's eaves), each running down
 * its slope from eaves to eaves (out over its overhang).
 */
export function pergolaRafters(roof: Roof): [Vec, Vec][] {
  const eaves = eavesOf(roof)
  const pts = normalized(roof.outline)
  const [a, b] = [pts[roof.edge % pts.length], pts[(roof.edge + 1) % pts.length]]
  const u = unit(sub(b, a))
  let v = { x: -u.y, y: u.x }
  const middle = mul(pts.reduce(add, { x: 0, y: 0 }), 1 / pts.length)
  if (dot(sub(middle, a), v) < 0) v = mul(v, -1)
  const us = eaves.map((p) => dot(sub(p, a), u))
  const [u0, u1] = [Math.min(...us), Math.max(...us)]
  const n = Math.max(2, Math.round((u1 - u0 - RAFTER.width) / RAFTER.spacing) + 1)
  const out: [Vec, Vec][] = []
  for (let i = 0; i < n; i++) {
    const c = u0 + RAFTER.width / 2 + ((u1 - u0 - RAFTER.width) * i) / (n - 1)
    const origin = add(a, mul(u, c))
    // where the line across the roof at `c` meets its eaves: the first and last crossings
    const ts: number[] = []
    eaves.forEach((p, j) => {
      const q = eaves[(j + 1) % eaves.length]
      const d = sub(q, p)
      const den = cross(v, d)
      if (Math.abs(den) < 1e-12) return
      const t = cross(sub(p, origin), d) / den
      const s = cross(sub(p, origin), v) / den
      if (s >= -1e-9 && s <= 1 + 1e-9) ts.push(t)
    })
    if (ts.length < 2) continue
    out.push([add(origin, mul(v, Math.min(...ts))), add(origin, mul(v, Math.max(...ts)))])
  }
  return out
}

/** How far a roof's side moves to meet a wall running along it, at most (in or out), m. */
export const FIT_REACH = 1.5

/**
 * A roof fitted between the walls round it (a carport between a boundary wall and the house): each side of its
 * outline that runs along a wall (within 10°, alongside it for at least a metre or half the side) moves to that
 * wall's face on the roof's side, when that face is within FIT_REACH of it, in or out (the nearest such wall). Its
 * overhang then goes on its other sides only, drawn into its outline. The same roof when no side meets a wall.
 */
export function fitRoof(roof: Roof, walls: readonly { a: Vec; b: Vec; half: number }[]): Roof {
  const pts = normalized(roof.outline)
  const n = pts.length
  const moves = pts.map((p, i) => {
    const q = pts[(i + 1) % n]
    const len = dist(p, q)
    if (len < EPS) return null
    const dir = unit(sub(q, p))
    const into = inward(pts, i)
    let best: number | null = null
    for (const w of walls) {
      const wl = dist(w.a, w.b)
      if (wl < EPS) continue
      const wd = unit(sub(w.b, w.a))
      if (Math.abs(cross(dir, wd)) > Math.sin((10 * Math.PI) / 180)) continue
      const [t0, t1] = [dot(sub(w.a, p), dir), dot(sub(w.b, p), dir)]
      const [lo, hi] = [Math.max(0, Math.min(t0, t1)), Math.min(len, Math.max(t0, t1))]
      if (hi - lo < Math.min(1, len / 2)) continue
      // the wall's line where it runs alongside, measured in from the side; its face towards the roof's inside
      const along = add(p, mul(dir, (lo + hi) / 2))
      const onWall = add(w.a, mul(wd, dot(sub(along, w.a), wd)))
      const move = dot(sub(onWall, p), into) + w.half
      if (Math.abs(move) <= FIT_REACH && (best === null || Math.abs(move) < Math.abs(best))) best = move
    }
    return best
  })
  if (moves.every((m) => m === null)) return roof
  const outline = offsetEdges(pts, (i) => (moves[i] === null ? roof.overhang : -moves[i]!))
  return { ...roof, outline: normalized(outline), edge: roof.edge % outline.length, overhang: 0 }
}

/** Whether `p` is inside the ring (even-odd). */
function pointIn(p: Vec, ring: readonly Vec[]): boolean {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [a, b] = [ring[i], ring[j]]
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside
  }
  return inside
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
  // a pergola slopes one way, as a shed does
  return roof.type === 'shed' || roof.type === 'pergola' ? [rising] : [rising, { a: -n.x, b: -n.y, c: high }]
}

export const roofThickness = (roof: Pick<Roof, 'type'>): number => (roof.type === 'flat' ? SLAB : roof.type === 'pergola' ? RAFTER.depth + PERGOLA_SHEET : COVERING)

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
  const pitch = type === 'pergola' ? 2 : type === 'shed' ? 10 : 25
  return { outline: pts, type, pitch, height, overhang: flat ? 0 : type === 'pergola' ? 0.3 : 0.5, edge, parapet: flat ? 0.3 : 0 }
}

/** The pitch a gallery's roof starts at, in degrees: as near flat as still sheds water; and its overhang, m. */
export const GALLERY_PITCH = 2
const GALLERY_OVERHANG = 0.5

/**
 * A gallery's own roof, apart from the rooms' so it can be nearly flat: a shed over `ring` (the gallery, to the
 * lines' centres) sloping down away from the house, to its longest side that does not run along the rooms (`rooms`,
 * their outlines), and 0.1 m under the top of the walls (`top`) where it meets them, so it tucks under the eaves of
 * the rooms' roof. It overhangs on its open sides only (its overhang is drawn into its outline): along the house it
 * stops at the face of the house's walls, which stand taller than it, so as not to run into them.
 */
export function galleryRoof(ring: readonly Vec[], rooms: readonly (readonly Vec[])[], top: number): Roof {
  const near = (a: Vec, b: Vec) => {
    const m = lerp(a, b, 0.5)
    return rooms.some((r) => r.some((p, j) => closestOnSegment(m, p, r[(j + 1) % r.length]).dist < EXTERIOR_WALL))
  }
  const centres = normalized(ring)
  const outline = offsetEdges(centres, (i) => (near(centres[i], centres[(i + 1) % centres.length]) ? -EXTERIOR_WALL / 2 : EXTERIOR_WALL / 2 + GALLERY_OVERHANG))
  const roof = { ...newRoof(outline, 'shed'), overhang: 0 }
  const pts = roof.outline
  const next = (i: number) => pts[(i + 1) % pts.length]
  let edge = roof.edge
  let longest = -1
  pts.forEach((p, i) => {
    if (!near(p, next(i)) && dist(p, next(i)) > longest) [edge, longest] = [i, dist(p, next(i))]
  })
  const [a, b] = [pts[edge], next(edge)]
  const depth = Math.max(...pts.map((p) => Math.abs(cross(sub(b, a), sub(p, a))) / dist(a, b)))
  const rise = depth * Math.tan((GALLERY_PITCH * Math.PI) / 180)
  return { ...roof, edge, pitch: GALLERY_PITCH, height: top - 0.1 - roofThickness(roof) - rise }
}

/**
 * The outer boundaries of polygons put together (rooms that share walls), each running clockwise on screen.
 * The polygons must share their corners where they touch, as a layer's regions do; holes are left out, or put in
 * `holes` when given (a space the polygons ring round, such as a courtyard).
 */
export function unionOutlines(rings: readonly (readonly Vec[])[], holes?: Vec[][]): Vec[][] {
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
    if (ring.length < 3) continue
    // what is left once rooms are put together runs the other way round a hole
    if (signedArea(loop) > 0) loops.push(ring)
    else holes?.push(ring)
  }
  return loops
}
