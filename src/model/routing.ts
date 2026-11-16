import { clamp, closestOnSegment, dist, lerp, rotate, sub, type Vec } from './geometry'
import { sameRef, segmentKind, storeyOf, type Plan, type Ref } from './plan'
import { pointInPolygon, regionAt, type Region } from './regions'
import { offsetPolygon, unionOutlines } from './roofs'
import { isCovered, type SolidsSource } from './solids'
import { EXTERIOR_WALL } from './walls'

/**
 * Routing shared by the services tabs (Plumbing, HVAC): the walls' main direction pipes and ducts run square to, the
 * buildings they enter and leave, rectilinear trees grown from roots to targets, single bends, and how much of a
 * route runs outside the buildings. Nothing here knows what the pipes carry.
 */

// ---- trees ---------------------------------------------------------------------------------------------------

export interface TreeNode {
  p: Vec
  /** The target it is, by index; -1 for a root or a tee. */
  target: number
  /** The node upstream (towards a root); -1 for a root. */
  parent: number
}

export interface TreeEdge {
  /** Its upstream and downstream nodes. */
  from: number
  to: number
  /** Square to the axes: each step along x or along y. */
  path: Vec[]
}

export interface Tree {
  nodes: TreeNode[]
  edges: TreeEdge[]
}

const manhattan = (a: Vec, b: Vec): number => Math.abs(a.x - b.x) + Math.abs(a.y - b.y)
const same = (a: Vec, b: Vec): boolean => manhattan(a, b) < 1e-7

/** A route without repeated points or points in the middle of a straight stretch; at least its two ends. */
function cleanPath(pts: readonly Vec[]): Vec[] {
  const out: Vec[] = []
  for (const p of pts) {
    if (out.length && same(out[out.length - 1], p)) continue
    if (out.length >= 2) {
      const [a, b] = [out[out.length - 2], out[out.length - 1]]
      if ((Math.abs(a.x - b.x) < 1e-7 && Math.abs(b.x - p.x) < 1e-7) || (Math.abs(a.y - b.y) < 1e-7 && Math.abs(b.y - p.y) < 1e-7)) out.pop()
    }
    out.push(p)
  }
  return out.length >= 2 ? out : [pts[0], pts[pts.length - 1]]
}

export const pathLength = (path: readonly Vec[]): number => path.reduce((sum, p, i) => (i ? sum + dist(path[i - 1], p) : sum), 0)

/**
 * Pipes from `roots` to every target, square to the axes: each target in turn (the nearest first) branches off the
 * nearest point of a pipe already laid, or a root, square to that pipe, with one bend at most. It is a rectilinear
 * Steiner tree grown the way Prim's grows a spanning tree: not the shortest there is, but close, and laid the way a
 * plumber tees branches off a main. A branch from a root or a junction bends where `prefer` likes the corner (inside
 * a building, say), else along x first.
 */
export function routeTree(roots: readonly Vec[], targets: readonly Vec[], prefer?: (corner: Vec) => boolean): Tree {
  const nodes: TreeNode[] = roots.map((p) => ({ p, target: -1, parent: -1 }))
  const edges: TreeEdge[] = []
  if (!roots.length) return { nodes, edges }
  const left = new Set(targets.map((_, i) => i))
  while (left.size) {
    let best: { t: number; d: number; c: Vec; node?: number; edge?: number; k?: number } | null = null
    for (const t of left) {
      const q = targets[t]
      nodes.forEach((n, i) => {
        const d = manhattan(q, n.p)
        if (!best || d < best.d - 1e-9) best = { t, d, c: n.p, node: i }
      })
      edges.forEach((e, i) => {
        for (let k = 0; k + 1 < e.path.length; k++) {
          const [a, b] = [e.path[k], e.path[k + 1]]
          const c = { x: clamp(q.x, Math.min(a.x, b.x), Math.max(a.x, b.x)), y: clamp(q.y, Math.min(a.y, b.y), Math.max(a.y, b.y)) }
          const d = manhattan(q, c)
          if (!best || d < best.d - 1e-9) best = { t, d, c, edge: i, k }
        }
      })
    }
    const b = best!
    let at = b.node ?? -1
    // a branch leaves square to the pipe it tees off; from a root or a junction, along x first
    let alongX = false
    if (b.edge !== undefined) {
      const e = edges[b.edge]
      const k = b.k!
      alongX = Math.abs(e.path[k].y - e.path[k + 1].y) < 1e-7
      if (same(b.c, e.path[0])) at = e.from
      else if (same(b.c, e.path[e.path.length - 1])) at = e.to
      else {
        at = nodes.push({ p: b.c, target: -1, parent: e.from }) - 1
        edges[b.edge] = { from: e.from, to: at, path: cleanPath([...e.path.slice(0, k + 1), b.c]) }
        edges.push({ from: at, to: e.to, path: cleanPath([b.c, ...e.path.slice(k + 1)]) })
        nodes[e.to] = { ...nodes[e.to], parent: at }
      }
    }
    const q = targets[b.t]
    const c = nodes[at].p
    if (b.edge === undefined && prefer && !prefer({ x: q.x, y: c.y }) && prefer({ x: c.x, y: q.y })) alongX = true
    const corner = alongX ? { x: c.x, y: q.y } : { x: q.x, y: c.y }
    const n = nodes.push({ p: q, target: b.t, parent: at }) - 1
    edges.push({ from: at, to: n, path: cleanPath([c, corner, q]) })
    left.delete(b.t)
  }
  return { nodes, edges }
}

/** For each edge of a tree, the targets downstream of it: at its lower end and beyond. */
export function downstream(tree: Tree): number[][] {
  const out = new Map<number, number[]>()
  const below = (node: number): number[] => {
    let list = out.get(node)
    if (!list) {
      const n = tree.nodes[node]
      list = n.target >= 0 ? [n.target] : []
      for (const e of tree.edges) if (e.from === node) list = list.concat(below(e.to))
      out.set(node, list)
    }
    return list
  }
  return tree.edges.map((e) => below(e.to))
}

/** How far each node is from its root along the pipes, m. */
export function fromRoot(tree: Tree): number[] {
  const d = tree.nodes.map(() => 0)
  const into = new Map(tree.edges.map((e) => [e.to, e]))
  const at = (node: number, seen = 0): number => {
    const e = into.get(node)
    return e && seen < tree.nodes.length ? at(e.from, seen + 1) + pathLength(e.path) : 0
  }
  tree.nodes.forEach((_, i) => (d[i] = at(i)))
  return d
}


/** The walls' main direction, radians in (-π/4, π/4]: the angle that turns the plan's axes square to most walls. */
export function wallFrame(plan: Plan): number {
  let [c, s] = [0, 0]
  for (const layer of plan.layers) {
    if (!layer.visible) continue
    for (const seg of Object.values(layer.segments)) {
      if (segmentKind(seg) !== 'wall') continue
      const d = sub(layer.vertices[seg.b], layer.vertices[seg.a])
      const l = Math.hypot(d.x, d.y)
      const a = Math.atan2(d.y, d.x) * 4
      c += l * Math.cos(a)
      s += l * Math.sin(a)
    }
  }
  return Math.abs(c) + Math.abs(s) < 1e-9 ? 0 : Math.atan2(s, c) / 4
}

/**
 * The buildings the drains leave: the ground floor's covered areas (rooms and galleries, not lots or pools) put
 * together out to their walls' outside faces, each building one or more rings (a house drawn on two layers).
 */
export function buildingsOf(plan: Plan, source: SolidsSource): Vec[][][] {
  const rings: Vec[][] = []
  for (const layer of plan.layers) {
    if (!layer.visible || storeyOf(layer)) continue
    const regions = source.faces(layer).regions
    const covered = new Set<Region>()
    for (const a of Object.values(layer.areas)) {
      const r = !a.lot && !a.depth ? regionAt(regions, a.at) : null
      if (r && isCovered(r)) covered.add(r)
    }
    for (const ring of unionOutlines([...covered].map((r) => r.outer))) rings.push(offsetPolygon(ring, EXTERIOR_WALL / 2))
  }
  // rings that touch or overlap make one building
  const group = rings.map((_, i) => i)
  const find = (i: number): number => (group[i] === i ? i : (group[i] = find(group[i])))
  const toRing = (p: Vec, ring: readonly Vec[]) => Math.min(...ring.map((a, i) => closestOnSegment(p, a, ring[(i + 1) % ring.length]).dist))
  const touch = (a: Vec[], b: Vec[]) => a.some((p) => pointInPolygon(p, b) || toRing(p, b) < 0.5) || b.some((p) => pointInPolygon(p, a))
  for (let i = 0; i < rings.length; i++) for (let j = i + 1; j < rings.length; j++) if (touch(rings[i], rings[j])) group[find(i)] = find(j)
  const out = new Map<number, Vec[][]>()
  rings.forEach((r, i) => out.set(find(i), [...(out.get(find(i)) ?? []), r]))
  return [...out.values()]
}

/** Where segment a–b crosses segment c–d, as a fraction along a–b; null when they do not cross. */
function segmentCrossing(a: Vec, b: Vec, c: Vec, d: Vec): number | null {
  const r = sub(b, a)
  const s = sub(d, c)
  const den = r.x * s.y - r.y * s.x
  if (Math.abs(den) < 1e-12) return null
  const q = sub(c, a)
  const t = (q.x * s.y - q.y * s.x) / den
  const u = (q.x * r.y - q.y * r.x) / den
  return t > 0 && t < 1 && u >= 0 && u <= 1 ? t : null
}



/** What a services plan routes with, worked out once per plan (see `router`). */
export interface Router {
  /** The walls' main direction, radians. */
  frame: number
  buildings: Vec[][][]
  /** The building a point is in, by index; -1 outside them. */
  buildingAt: (p: Vec) => number
  /** A tree routed square to the walls, in plan coordinates; pipes leave a root into a building, not along its walls. */
  route: (roots: readonly Vec[], targets: readonly Vec[]) => Tree
  /** How much of a route is outside the buildings: each step cut where it crosses their walls. */
  outdoorLength: (path: readonly Vec[]) => number
  /** One bend, square to the walls; with `outside`, the bend that keeps more of it outside the buildings. */
  square: (a: Vec, b: Vec, outside?: boolean) => Vec[]
  /** The nearest point just outside a building's walls (`out` m beyond their faces), or null with no buildings. */
  outside: (p: Vec, out?: number) => Vec | null
}

export function router(plan: Plan, source: SolidsSource): Router {
  const frame = wallFrame(plan)
  const buildings = buildingsOf(plan, source)
  const buildingAt = (p: Vec) => buildings.findIndex((rings) => rings.some((r) => pointInPolygon(p, r)))
  const toFrame = (p: Vec) => rotate(p, -frame)
  const fromFrame = (p: Vec) => rotate(p, frame)
  /** A tree routed square to the walls, in plan coordinates; pipes leave a root into a building, not along its walls. */
  const route = (roots: readonly Vec[], targets: readonly Vec[]): Tree => {
    const t = routeTree(roots.map(toFrame), targets.map(toFrame), (corner) => buildingAt(fromFrame(corner)) >= 0)
    return { nodes: t.nodes.map((n) => ({ ...n, p: fromFrame(n.p) })), edges: t.edges.map((e) => ({ ...e, path: e.path.map(fromFrame) })) }
  }
  /** How much of a route is outside the buildings: each step cut where it crosses their walls. */
  const outdoorLength = (path: readonly Vec[]) => {
    let sum = 0
    for (let i = 1; i < path.length; i++) {
      const [a, b] = [path[i - 1], path[i]]
      const ts = [0, 1]
      for (const ring of buildings.flat()) {
        ring.forEach((c, k) => {
          const hit = segmentCrossing(a, b, c, ring[(k + 1) % ring.length])
          if (hit !== null) ts.push(hit)
        })
      }
      ts.sort((x, y) => x - y)
      for (let k = 1; k < ts.length; k++) if (buildingAt(lerp(a, b, (ts[k - 1] + ts[k]) / 2)) < 0) sum += dist(a, b) * (ts[k] - ts[k - 1])
    }
    return sum
  }
  /** One bend, square to the walls; with `outside`, the bend that keeps more of it outside the buildings. */
  const square = (a: Vec, b: Vec, outside = false): Vec[] => {
    const [p, q] = [toFrame(a), toFrame(b)]
    const first = cleanPath([p, { x: q.x, y: p.y }, q]).map(fromFrame)
    if (!outside) return first
    const other = cleanPath([p, { x: p.x, y: q.y }, q]).map(fromFrame)
    return outdoorLength(other) > outdoorLength(first) + 1e-6 ? other : first
  }
  const outside = (p: Vec, out = 0.3): Vec | null => {
    let best: Vec | null = null
    for (const ring of buildings.flat()) {
      const grown = offsetPolygon(ring, out)
      for (let k = 0; k < grown.length; k++) {
        const c = closestOnSegment(p, grown[k], grown[(k + 1) % grown.length]).point
        if (!best || dist(c, p) < dist(best, p)) best = c
      }
    }
    return best
  }
  return { frame, buildings, buildingAt, route, outdoorLength, square, outside }
}

/** A run a tab draws and can pick: its kind, its route, its floor, and what it is the branch to. */
interface PickableRun {
  kind: string
  path: Vec[]
  storey: number
  to?: Ref
}

/**
 * Where a picked run is now: the branch to the same fixture, piece or room when it had one, else the same place if
 * it is still a run of that kind; -1 when it is gone.
 */
export function findRun(runs: readonly PickableRun[], pick: { kind: string; index: number; to?: Ref }): number {
  if (pick.to) return runs.findIndex((r) => r.kind === pick.kind && r.to && sameRef(r.to, pick.to))
  return runs[pick.index]?.kind === pick.kind ? pick.index : -1
}

/** The run nearest `at` on a floor, within `reach`, by its place in the runs. */
export function runAt(runs: readonly PickableRun[], storey: number, at: Vec, reach: number): number {
  let best = { index: -1, d: reach }
  runs.forEach((r, index) => {
    if (r.storey !== storey) return
    for (let i = 1; i < r.path.length; i++) {
      const d = closestOnSegment(at, r.path[i - 1], r.path[i]).dist
      if (d < best.d) best = { index, d }
    }
  })
  return best.index
}
