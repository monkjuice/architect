import { add, boundsOf, closestOnSegment, cross, dist, mul, signedArea, sub, type Vec } from './geometry'
import { segmentKind, type Layer, type SegmentKind } from './plan'
import { EXTERIOR_WALL, INTERIOR_WALL, MITRE_LIMIT } from './walls'

/**
 * Regions: the areas a layer's lines enclose, the faces of their planar graph. Lines are first split wherever
 * they cross or touch, with or without a shared vertex, so a region closes when it looks closed on screen;
 * walls, open edges and outlines bound regions alike. A free-standing block of lines inside a region (a chimney, a stair
 * core) is a hole of that region.
 *
 * The same faces tell which walls face outside, which sets the thickness of walls that have none of their own
 * (see walls.ts), and with the thicknesses, each region's floor area inside its walls.
 */

export interface Region {
  /** The outer boundary, in order; a stub poking into the region appears there and back. */
  outer: Vec[]
  holes: Vec[][]
  /** Enclosed area to the lines (wall centrelines), holes subtracted, in m². */
  area: number
  /** Floor area inside the walls' faces, holes and their walls subtracted, in m². */
  floor: number
  /**
   * Walled off from the outside: no way out of it across open edges or outlines, though it may open onto other
   * rooms that way (an open-plan kitchen). Galleries, porches and pools are not.
   */
  indoor: boolean
  /** The walls around it and in it (stubs, islands). */
  wallIds: string[]
  /** Boundary length by kind, in m; stubs that poke into the region do not count. */
  walls: number
  open: number
  outline: number
}

/** Points closer than this are the same point; a point closer than this to a line is on it. */
const TOL = 1e-6

interface Edge {
  u: number
  v: number
  kind: SegmentKind
  /** The segments it is a piece of: one, or more where lines overlap. */
  ids: string[]
}

/** The layer's lines as a planar graph: nodes where lines end, cross or touch, and the pieces between them. */
function arrangement(layer: Layer): { nodes: Vec[]; edges: Edge[] } {
  const nodes: Vec[] = []
  const nodeOf = (p: Vec): number => {
    for (let i = 0; i < nodes.length; i++) if (dist(nodes[i], p) <= TOL) return i
    nodes.push({ x: p.x, y: p.y })
    return nodes.length - 1
  }
  const segs = Object.entries(layer.segments).map(([id, s]) => ({ id, a: layer.vertices[s.a], b: layer.vertices[s.b], kind: segmentKind(s) }))
  const cuts: { t: number; p: Vec }[][] = segs.map((s) => [
    { t: 0, p: s.a },
    { t: 1, p: s.b },
  ])
  // other lines' ends lying on a line (T junctions, overlapping lines)
  const points = Object.values(layer.vertices)
  segs.forEach((s, i) => {
    for (const p of points) {
      const c = closestOnSegment(p, s.a, s.b)
      if (c.dist <= TOL && c.t > 0 && c.t < 1) cuts[i].push({ t: c.t, p })
    }
  })
  // crossings
  for (let i = 0; i < segs.length; i++) {
    for (let j = i + 1; j < segs.length; j++) {
      const hit = crossing(segs[i].a, segs[i].b, segs[j].a, segs[j].b)
      if (!hit) continue
      cuts[i].push({ t: hit.t, p: hit.p })
      cuts[j].push({ t: hit.u, p: hit.p })
    }
  }
  const edges = new Map<string, Edge>()
  segs.forEach((s, i) => {
    const ids = cuts[i].sort((x, y) => x.t - y.t).map((c) => nodeOf(c.p))
    for (let k = 1; k < ids.length; k++) {
      const [u, v] = [ids[k - 1], ids[k]]
      if (u === v) continue
      const key = u < v ? `${u}|${v}` : `${v}|${u}`
      const known = edges.get(key)
      // where a wall overlaps another kind, the wall wins
      if (!known) edges.set(key, { u, v, kind: s.kind, ids: [s.id] })
      else {
        if (s.kind === 'wall') known.kind = 'wall'
        known.ids.push(s.id)
      }
    }
  })
  return { nodes, edges: [...edges.values()] }
}

/** Where segments a-b and c-d cross, as parameters along each; null when parallel or apart. */
function crossing(a: Vec, b: Vec, c: Vec, d: Vec): { t: number; u: number; p: Vec } | null {
  const r = sub(b, a)
  const s = sub(d, c)
  const denom = cross(r, s)
  if (Math.abs(denom) < 1e-12 * Math.hypot(r.x, r.y) * Math.hypot(s.x, s.y)) return null
  const ac = sub(c, a)
  const t = cross(ac, s) / denom
  const u = cross(ac, r) / denom
  const e = 1e-9
  if (t < -e || t > 1 + e || u < -e || u > 1 + e) return null
  return { t, u, p: add(a, mul(r, t)) }
}

export function pointInPolygon(p: Vec, pts: readonly Vec[]): boolean {
  let inside = false
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i]
    const b = pts[j]
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside
  }
  return inside
}

/** A layer's regions, and the thickness its walls get. */
export interface LayerFaces {
  regions: Region[]
  /** Each wall's thickness in m: its own, or automatic (see walls.ts). Walls only. */
  thickness: Map<string, number>
  /** The walls that face outside: they are exterior walls unless they have a thickness of their own. */
  exterior: Set<string>
}

/** Every region a layer's lines enclose. */
export function layerRegions(layer: Layer): Region[] {
  return layerFaces(layer).regions
}

export function layerFaces(layer: Layer): LayerFaces {
  const { nodes, edges } = arrangement(layer)
  // half-edge h runs along edges[h >> 1], u→v when h is even; its twin is h ^ 1
  const from = (h: number) => (h & 1 ? edges[h >> 1].v : edges[h >> 1].u)
  const to = (h: number) => (h & 1 ? edges[h >> 1].u : edges[h >> 1].v)
  const out: number[][] = nodes.map(() => [])
  for (let h = 0; h < edges.length * 2; h++) out[from(h)].push(h)
  const angle = (h: number) => Math.atan2(nodes[to(h)].y - nodes[from(h)].y, nodes[to(h)].x - nodes[from(h)].x)
  const position = new Map<number, number>()
  for (const list of out) {
    list.sort((x, y) => angle(x) - angle(y))
    list.forEach((h, i) => position.set(h, i))
  }
  // turning onto the neighbour of the twin traces each face with the face on the left: bounded faces have a
  // positive signed area, the outside of each connected group of lines a negative one
  const next = (h: number) => {
    const list = out[to(h)]
    return list[(position.get(h ^ 1)! - 1 + list.length) % list.length]
  }

  const faceOf = new Int32Array(edges.length * 2).fill(-1)
  const cycles: { hs: number[]; signed: number }[] = []
  for (let h = 0; h < edges.length * 2; h++) {
    if (faceOf[h] >= 0) continue
    const hs: number[] = []
    let signed = 0
    let cur = h
    do {
      faceOf[cur] = cycles.length
      hs.push(cur)
      signed += cross(nodes[from(cur)], nodes[to(cur)]) / 2
      cur = next(cur)
    } while (cur !== h && hs.length <= edges.length * 2)
    cycles.push({ hs, signed })
  }

  // connected groups of lines, to tell which outlines are islands inside another group's face
  const group = nodes.map((_, i) => i)
  const root = (i: number): number => (group[i] === i ? i : (group[i] = root(group[i])))
  for (const e of edges) group[root(e.u)] = root(e.v)

  const ring = (hs: number[]) => hs.map((h) => nodes[from(h)])
  const faces = cycles.map((c, i) => ({ i, c, pts: ring(c.hs) })).filter((f) => f.c.signed > TOL)
  const holes = new Map<number, number[]>()
  for (const [i, c] of cycles.entries()) {
    if (c.signed >= -TOL) continue
    const g = root(from(c.hs[0]))
    const probe = nodes[from(c.hs[0])]
    let best: (typeof faces)[number] | undefined
    for (const f of faces) {
      if (root(from(f.c.hs[0])) === g || !pointInPolygon(probe, f.pts)) continue
      if (!best || f.c.signed < best.c.signed) best = f
    }
    if (best) holes.set(best.i, [...(holes.get(best.i) ?? []), i])
  }

  // the region on the left of each cycle: its own for a bounded face, the one it is an island in for the outside
  // of a group of lines, or none (-1) for the outside of everything
  const regionOf = new Int32Array(cycles.length).fill(-1)
  faces.forEach((f, r) => {
    regionOf[f.i] = r
    for (const i of holes.get(f.i) ?? []) regionOf[i] = r
  })
  const stub = (h: number) => faceOf[h ^ 1] === faceOf[h] // the same region on both sides

  // what is not indoors is whatever the outside reaches across open edges and outlines, region to region
  const across = new Map<number, number[]>()
  for (let h = 0; h < edges.length * 2; h++) {
    if (edges[h >> 1].kind === 'wall') continue
    const [r, q] = [regionOf[faceOf[h]], regionOf[faceOf[h ^ 1]]]
    if (r !== q) across.set(r, [...(across.get(r) ?? []), q])
  }
  const indoor = faces.map(() => true)
  const reach = [-1]
  while (reach.length) {
    for (const q of across.get(reach.pop()!) ?? []) {
      if (q >= 0 && indoor[q]) {
        indoor[q] = false
        reach.push(q)
      }
    }
  }

  // a wall faces outside when what is on either side of any piece of it is not indoors
  const exterior = new Set<string>()
  for (let h = 0; h < edges.length * 2; h++) {
    const r = regionOf[faceOf[h]]
    if (edges[h >> 1].kind === 'wall' && (r < 0 || !indoor[r])) for (const id of edges[h >> 1].ids) exterior.add(id)
  }
  const thickness = new Map<string, number>()
  for (const [id, s] of Object.entries(layer.segments)) {
    if (segmentKind(s) === 'wall') thickness.set(id, s.thickness ?? (exterior.has(id) ? EXTERIOR_WALL : INTERIOR_WALL))
  }
  const inset = (h: number) => {
    const e = edges[h >> 1]
    return e.kind === 'wall' ? Math.max(0, ...e.ids.map((id) => thickness.get(id) ?? 0)) / 2 : 0
  }
  const insetArea = (hs: number[]) => signedArea(insetRing(ring(hs), hs.map(inset)))

  const regions = faces.map((f, r) => {
    const own = holes.get(f.i) ?? []
    const by: Record<SegmentKind, number> = { wall: 0, open: 0, outline: 0 }
    const wallIds = new Set<string>()
    for (const h of [...f.c.hs, ...own.flatMap((i) => cycles[i].hs)]) {
      const e = edges[h >> 1]
      if (e.kind === 'wall') for (const id of e.ids) if (thickness.has(id)) wallIds.add(id)
      if (stub(h)) continue // it pokes into the region: not part of its boundary
      by[e.kind] += dist(nodes[from(h)], nodes[to(h)])
    }
    const area = f.c.signed - own.reduce((sum, i) => sum - cycles[i].signed, 0)
    const floor = insetArea(f.c.hs) + own.reduce((sum, i) => sum + insetArea(cycles[i].hs), 0)
    return {
      outer: f.pts,
      holes: own.map((i) => ring(cycles[i].hs)),
      area,
      floor: Math.min(area, Math.max(0, floor)),
      indoor: indoor[r],
      wallIds: [...wallIds],
      walls: by.wall,
      open: by.open,
      outline: by.outline,
    }
  })
  return { regions, thickness, exterior }
}

/**
 * A face's boundary with each piece moved `insets[k]` to its left, into the face: corners where the moved pieces
 * meet (bevelled where the face wraps round a sharp corner, as walls are; see walls.ts) and, where two run
 * parallel (a stub's tip, a change of thickness along a line), both their ends. Piece k runs from pts[k] to pts[k + 1].
 */
function insetRing(pts: readonly Vec[], insets: readonly number[]): Vec[] {
  const n = pts.length
  const out: Vec[] = []
  for (let k = 0; k < n; k++) {
    const i = (k + n - 1) % n
    const p = pts[k]
    const d0 = unit(sub(p, pts[i]))
    const d1 = unit(sub(pts[(k + 1) % n], p))
    const p0 = add(p, mul({ x: -d0.y, y: d0.x }, insets[i]))
    const p1 = add(p, mul({ x: -d1.y, y: d1.x }, insets[k]))
    const turn = cross(d0, d1)
    const most = Math.max(insets[i], insets[k])
    if (Math.abs(turn) > 1e-9 && most > 0) {
      const c = add(p0, mul(d0, cross(sub(p1, p0), d1) / turn))
      // turning left is a corner of the face pointing out of it, where the moved pieces always meet
      if (dist(c, p) <= (turn > 0 ? 100 : MITRE_LIMIT) * most) {
        out.push(c)
        continue
      }
    }
    out.push(p0)
    if (dist(p0, p1) > TOL) out.push(p1)
  }
  return out
}

const unit = (v: Vec): Vec => mul(v, 1 / Math.hypot(v.x, v.y))

/** The smallest region containing `p`, or null when `p` is not enclosed. */
export function regionAt(regions: readonly Region[], p: Vec): Region | null {
  let best: Region | null = null
  for (const r of regions) {
    if (!pointInPolygon(p, r.outer) || r.holes.some((h) => pointInPolygon(p, h))) continue
    if (!best || r.area < best.area) best = r
  }
  return best
}

const labels = new WeakMap<Region, Vec>()

/** Where a region's label goes: inside it, as far from its boundary as possible. Worked out once per region. */
export function regionLabel(region: Region): Vec {
  let p = labels.get(region)
  if (!p) labels.set(region, (p = labelPoint(region.outer, region.holes)))
  return p
}

/**
 * Where a label goes in a polygon: its centroid when that is well inside (rooms that are roughly convex),
 * otherwise the point farthest from its edges, found by a grid search that zooms in on the best cell (close
 * to the pole of inaccessibility). The farthest point alone drifts along a long room, whose middle line is
 * all equally far from the walls, so a slightly skewed room got its label at one end.
 */
export function labelPoint(outer: readonly Vec[], holes: readonly (readonly Vec[])[] = []): Vec {
  const rings = [outer, ...holes]
  const inside = (p: Vec) => pointInPolygon(p, outer) && !holes.some((h) => pointInPolygon(p, h))
  const clearance = (p: Vec) => {
    let d = Infinity
    for (const r of rings) for (let i = 0; i < r.length; i++) d = Math.min(d, closestOnSegment(p, r[i], r[(i + 1) % r.length]).dist)
    return d
  }
  const box = boundsOf(outer)!
  let best: Vec = { x: (box.x0 + box.x1) / 2, y: (box.y0 + box.y1) / 2 }
  let bestD = inside(best) ? clearance(best) : -1
  let [cx, cy, w, h] = [best.x, best.y, box.x1 - box.x0, box.y1 - box.y0]
  const n = 12
  for (let round = 0; round < 6; round++) {
    for (let i = 0; i <= n; i++) {
      for (let j = 0; j <= n; j++) {
        const p = { x: cx - w / 2 + (w * i) / n, y: cy - h / 2 + (h * j) / n }
        if (!inside(p)) continue
        const d = clearance(p)
        if (d > bestD) [bestD, best] = [d, p]
      }
    }
    ;[cx, cy, w, h] = [best.x, best.y, w / 3, h / 3]
  }
  const c = centroid(outer)
  return c && inside(c) && clearance(c) >= 0.7 * bestD ? c : best
}

/** Area centroid of a polygon (stubs walked there and back add nothing); null for a degenerate one. */
function centroid(pts: readonly Vec[]): Vec | null {
  let a = 0
  let x = 0
  let y = 0
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i]
    const q = pts[(i + 1) % pts.length]
    const k = p.x * q.y - q.x * p.y
    a += k
    x += (p.x + q.x) * k
    y += (p.y + q.y) * k
  }
  return Math.abs(a) < 1e-12 ? null : { x: x / (3 * a), y: y / (3 * a) }
}
