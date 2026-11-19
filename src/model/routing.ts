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
 *
 * A target with a route set by hand (`guides`, its bends from the source on; see movedRoutes) is laid first, through
 * its bends: where its way runs along pipe already laid (another guided branch sharing a main) it follows it, and it
 * leaves it at the first bend off it. The other targets then branch off whatever is laid, its pipes included.
 */
export function routeTree(roots: readonly Vec[], targets: readonly Vec[], prefer?: (corner: Vec) => boolean, guides?: readonly (readonly Vec[] | undefined)[]): Tree {
  const nodes: TreeNode[] = roots.map((p) => ({ p, target: -1, parent: -1 }))
  const edges: TreeEdge[] = []
  if (!roots.length) return { nodes, edges }
  const left = new Set(targets.map((_, i) => i))
  for (const t of [...left]) {
    const guide = guides?.[t]
    if (!guide?.length) continue
    graft({ nodes, edges }, t, targets[t], guide)
    left.delete(t)
  }
  while (left.size) {
    let best: { t: number; d: number; c: Vec; node?: number; edge?: number; k?: number } | null = null
    for (const t of left) {
      const q = targets[t]
      const near = nearestOn({ nodes, edges }, q)
      if (near && (!best || near.d < best.d - 1e-9)) best = { ...near, t }
    }
    const b = best!
    let at = b.node ?? -1
    // a branch leaves square to the pipe it tees off; from a root or a junction, along x first
    let alongX = false
    if (b.edge !== undefined) {
      const e = edges[b.edge]
      alongX = Math.abs(e.path[b.k!].y - e.path[b.k! + 1].y) < 1e-7
      at = splitAt({ nodes, edges }, b.edge, b.k!, b.c)
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

/** The point of a tree nearest `q` (manhattan): a node, or a point on an edge's stretch. */
function nearestOn(tree: Tree, q: Vec): { d: number; c: Vec; node?: number; edge?: number; k?: number } | null {
  let best: { d: number; c: Vec; node?: number; edge?: number; k?: number } | null = null
  tree.nodes.forEach((n, i) => {
    const d = manhattan(q, n.p)
    if (!best || d < best.d - 1e-9) best = { d, c: n.p, node: i }
  })
  tree.edges.forEach((e, i) => {
    for (let k = 0; k + 1 < e.path.length; k++) {
      const [a, b] = [e.path[k], e.path[k + 1]]
      const c = { x: clamp(q.x, Math.min(a.x, b.x), Math.max(a.x, b.x)), y: clamp(q.y, Math.min(a.y, b.y), Math.max(a.y, b.y)) }
      const d = manhattan(q, c)
      if (!best || d < best.d - 1e-9) best = { d, c, edge: i, k }
    }
  })
  return best
}

/** A node at `c` on stretch `k` of edge `e` (its end, or a tee splitting it there), by index. */
function splitAt(tree: Tree, e: number, k: number, c: Vec): number {
  const edge = tree.edges[e]
  if (same(c, edge.path[0])) return edge.from
  if (same(c, edge.path[edge.path.length - 1])) return edge.to
  const at = tree.nodes.push({ p: c, target: -1, parent: edge.from }) - 1
  tree.edges[e] = { from: edge.from, to: at, path: cleanPath([...edge.path.slice(0, k + 1), c]) }
  tree.edges.push({ from: at, to: edge.to, path: cleanPath([c, ...edge.path.slice(k + 1)]) })
  tree.nodes[edge.to] = { ...tree.nodes[edge.to], parent: at }
  return at
}

/** Consecutive points joined square to the axes: a bend between two that are not in line. */
function squareChain(pts: readonly Vec[]): Vec[] {
  const out: Vec[] = []
  pts.forEach((p, i) => {
    const a = out[out.length - 1]
    if (i && a && Math.abs(a.x - p.x) > 1e-7 && Math.abs(a.y - p.y) > 1e-7) out.push({ x: p.x, y: a.y })
    out.push(p)
  })
  return out
}

/**
 * A target laid through its bends (`guide`), in place on a tree: along pipe already laid as far as its bends lie on
 * it, then off it through the rest of its bends to the target; with none on it, from the point nearest its first.
 */
function graft(tree: Tree, t: number, q: Vec, guide: readonly Vec[]) {
  const onTree = (p: Vec) => {
    const near = nearestOn(tree, p)
    return near && near.d < 1e-4 ? near : null
  }
  let k = -1
  while (k + 1 < guide.length && onTree(guide[k + 1])) k++
  const hit = k >= 0 ? onTree(guide[k])! : nearestOn(tree, guide[0])!
  const at = hit.edge !== undefined ? splitAt(tree, hit.edge, hit.k!, hit.c) : hit.node!
  const rest = guide.slice(k + 1)
  const n = tree.nodes.push({ p: q, target: t, parent: at }) - 1
  tree.edges.push({ from: at, to: n, path: cleanPath(squareChain([tree.nodes[at].p, ...rest, q])) })
}

/**
 * The routes set by hand after a stretch of a run is moved across by `delta` (m, on the plan): for each target the
 * run leads to (its own, or every one downstream of a main), its whole way from the source with that stretch moved,
 * as the bends to keep (see routeTree's `guides`). A stretch inside the way takes its two bends with it; the first or
 * last, whose end stays where it connects, gets a jog there. Keys are what `routeKey` makes of the target.
 */
export function movedRoutes(
  runs: readonly { kind: string; path: readonly Vec[]; to?: Ref; ends?: readonly Ref[] }[],
  index: number,
  stretch: number,
  delta: Vec,
  /** Whether the runs of this kind make a tree from a source (water, heating, gas), or each is a run of its own. */
  tree: boolean,
): Map<string, Vec[]> {
  const out = new Map<string, Vec[]>()
  const run = runs[index]
  if (!run || stretch < 0 || stretch + 1 >= run.path.length) return out
  const [a, b] = [run.path[stretch], run.path[stretch + 1]]
  if (!tree) {
    if (run.to) out.set(routeKey(run.kind, run.to), cleanPath(shiftStretch(run.path, stretch, delta)).slice(1, -1))
    return out
  }
  const ends = run.ends?.length ? run.ends : run.to ? [run.to] : []
  for (const end of ends) {
    const last = runs.findIndex((r) => r.kind === run.kind && r.to && sameRef(r.to, end))
    if (last < 0) continue
    const way = wayTo(runs, last)
    const i = way.findIndex((p, j) => j + 1 < way.length && same(p, a) && same(way[j + 1], b))
    if (i < 0) continue
    out.set(routeKey(run.kind, end), cleanPath(shiftStretch(way, i, delta)).slice(1, -1))
  }
  return out
}

/** The whole way from the source to the end of run `index`: its path, after those of the runs it branches off. */
export function wayTo(runs: readonly { kind: string; path: readonly Vec[] }[], index: number): Vec[] {
  let way = [...runs[index].path]
  const seen = new Set([index])
  for (;;) {
    const start = way[0]
    const up = runs.findIndex((r, j) => !seen.has(j) && r.kind === runs[index].kind && same(r.path[r.path.length - 1], start))
    if (up < 0) return way
    seen.add(up)
    way = [...runs[up].path.slice(0, -1), ...way]
  }
}

/** A path with its stretch `i` moved by `delta`: its bends with it, a jog at a fixed end. */
export function shiftStretch(path: readonly Vec[], i: number, delta: Vec): Vec[] {
  const moved = (v: Vec) => ({ x: v.x + delta.x, y: v.y + delta.y })
  const [p, q] = [path[i], path[i + 1]]
  const head = i === 0 ? [p, moved(p)] : [moved(p)]
  const tail = i + 1 === path.length - 1 ? [moved(q), q] : [moved(q)]
  return [...path.slice(0, i), ...head, ...tail, ...path.slice(i + 2)]
}

/** The kinds of run that make a tree from a source; the others are each a run of its own (a fixture's drain, a lead, a duct). */
export const TREE_KINDS: readonly string[] = ['cold', 'hot', 'heating', 'gas']

/** The key a route set by hand is kept under: the run's kind and the target it leads to. */
export const routeKey = (kind: string, to: Ref): string => `${kind}|${to.layer}:${to.kind}:${to.id}`

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


/** The walls' main direction, radians in (-Ï€/4, Ï€/4]: the angle that turns the plan's axes square to most walls. */
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



// ---- keeping clear of the other installations -----------------------------------------------------------------

/**
 * How far apart two installations' pipes are kept where they run side by side, m: between their outsides, when they
 * run together over `together` or more (the MEP tab's clash rule, see mep.ts); a stretch in the way is moved aside
 * by `step`s, at most `most`.
 */
export const CLEAR = { gap: 0.05, together: 0.3, step: 0.05, most: 0.4 }

/** A stretch of another installation's pipe to keep clear of: its ends, its radius (m) and its floor. */
export interface Obstacle {
  a: Vec
  b: Vec
  r: number
  storey: number
}

/** Another installation's pipes as obstacles: each run's stretches inside the buildings (what is buried outside lies at other depths). */
export function obstaclesOf(runs: readonly { path: readonly Vec[]; size: number; storey: number }[], inside: (p: Vec) => boolean, radius = (size: number) => size / 2000): Obstacle[] {
  const out: Obstacle[] = []
  for (const r of runs) {
    for (let i = 1; i < r.path.length; i++) {
      const [a, b] = [r.path[i - 1], r.path[i]]
      if (inside(lerp(a, b, 0.5))) out.push({ a, b, r: radius(r.size), storey: r.storey })
    }
  }
  return out
}

/**
 * A path moved aside where it would run along another installation's pipe too close: each straight stretch inside
 * the buildings (`inside`) that lies parallel to an obstacle within CLEAR.gap of it (outside to outside) over
 * CLEAR.together or more moves across by the least of ±CLEAR.step, ±2·step… that clears every obstacle. A stretch
 * inside the path takes its two bends with it (the stretches either side only lengthen or shorten); the first or
 * last one, whose end is fixed where it connects, gets a short jog there. Paths are square to the walls (`frame`).
 */
export function clearPath(path: readonly Vec[], r: number, storey: number, obstacles: readonly Obstacle[], frame: number, inside: (p: Vec) => boolean): Vec[] {
  if (path.length < 2 || !obstacles.length) return [...path]
  const to = (p: Vec) => rotate(p, -frame)
  const from = (p: Vec) => rotate(p, frame)
  const near = obstacles.filter((o) => o.storey === storey).map((o) => ({ a: to(o.a), b: to(o.b), r: o.r }))
  if (!near.length) return [...path]
  let pts = path.map(to)
  /** Whether a stretch on `axis` at `at` (its other coordinate), from lo to hi, runs too close along an obstacle. */
  const blocked = (axis: 'x' | 'y', at: number, lo: number, hi: number) => {
    const other = axis === 'x' ? 'y' : 'x'
    return near.some((o) => {
      if (Math.abs(o.a[other] - o.b[other]) > 1e-6) return false
      const [olo, ohi] = [Math.min(o.a[axis], o.b[axis]), Math.max(o.a[axis], o.b[axis])]
      // a little over the gap, so what is cleared is not on the edge of the MEP tab's rule
      return Math.min(hi, ohi) - Math.max(lo, olo) >= CLEAR.together && Math.abs(o.a[other] - at) < CLEAR.gap + r + o.r + 0.005
    })
  }
  for (let i = 0; i + 1 < pts.length; i++) {
    const [p, q] = [pts[i], pts[i + 1]]
    const axis: 'x' | 'y' | null = Math.abs(p.y - q.y) < 1e-6 ? 'x' : Math.abs(p.x - q.x) < 1e-6 ? 'y' : null
    if (!axis || !inside(from(lerp(p, q, 0.5)))) continue
    const other = axis === 'x' ? 'y' : 'x'
    const [lo, hi] = [Math.min(p[axis], q[axis]), Math.max(p[axis], q[axis])]
    if (!blocked(axis, p[other], lo, hi)) continue
    let shift = 0
    for (let k = 1; k * CLEAR.step <= CLEAR.most + 1e-9 && !shift; k++) {
      for (const s of [k * CLEAR.step, -k * CLEAR.step]) {
        if (!blocked(axis, p[other] + s, lo, hi)) {
          shift = s
          break
        }
      }
    }
    if (!shift) continue
    const moved = (v: Vec) => (other === 'x' ? { x: v.x + shift, y: v.y } : { x: v.x, y: v.y + shift })
    // its ends move with it, but an end of the path stays where it connects: a jog there
    const head = i === 0 ? [p, moved(p)] : [moved(p)]
    const tail = i + 1 === pts.length - 1 ? [moved(q), q] : [moved(q)]
    pts = [...pts.slice(0, i), ...head, ...tail, ...pts.slice(i + 2)]
    i += head.length - 1
  }
  return cleanPath(pts).map(from)
}

/** Every edge of a tree kept clear of the obstacles (see clearPath), but those `keep` says; its nodes, where edges meet, stay. */
export function clearTree(
  tree: Tree,
  r: (edge: number) => number,
  storey: number,
  obstacles: readonly Obstacle[],
  frame: number,
  inside: (p: Vec) => boolean,
  /** Edges left as they are: those leading to a route set by hand. */
  keep: (edge: number) => boolean = () => false,
): Tree {
  if (!obstacles.length) return tree
  return { nodes: tree.nodes, edges: tree.edges.map((e, i) => (keep(i) ? e : { ...e, path: clearPath(e.path, r(i), storey, obstacles, frame, inside) })) }
}

/** What a services plan routes with, worked out once per plan (see `router`). */
export interface Router {
  /** The walls' main direction, radians. */
  frame: number
  buildings: Vec[][][]
  /** The building a point is in, by index; -1 outside them. */
  buildingAt: (p: Vec) => number
  /** A tree routed square to the walls, in plan coordinates; pipes leave a root into a building, not along its walls; targets with `guides` laid through their bends. */
  route: (roots: readonly Vec[], targets: readonly Vec[], guides?: readonly (readonly Vec[] | undefined)[]) => Tree
  /** One run from a to b: through its bends when it has a route set by hand, else `square`. */
  guided: (a: Vec, b: Vec, guide: readonly Vec[] | undefined, outside?: boolean) => Vec[]
  /** Targets laid through their bends onto a tree built otherwise (the gas's outside routing), in place. */
  graft: (tree: Tree, targets: readonly { index: number; at: Vec; guide: readonly Vec[] }[]) => void
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
  const route = (roots: readonly Vec[], targets: readonly Vec[], guides?: readonly (readonly Vec[] | undefined)[]): Tree => {
    const t = routeTree(
      roots.map(toFrame),
      targets.map(toFrame),
      (corner) => buildingAt(fromFrame(corner)) >= 0,
      guides?.map((g) => g?.map(toFrame)),
    )
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
  const guided = (a: Vec, b: Vec, guide: readonly Vec[] | undefined, outside = false): Vec[] =>
    guide?.length ? cleanPath(squareChain([a, ...guide, b].map(toFrame))).map(fromFrame) : square(a, b, outside)
  const graftAll = (tree: Tree, list: readonly { index: number; at: Vec; guide: readonly Vec[] }[]) => {
    if (!list.length) return
    // in the walls' frame, where the bends are square, and back
    const inFrame: Tree = { nodes: tree.nodes.map((n) => ({ ...n, p: toFrame(n.p) })), edges: tree.edges.map((e) => ({ ...e, path: e.path.map(toFrame) })) }
    for (const g of list) graft(inFrame, g.index, toFrame(g.at), g.guide.map(toFrame))
    tree.nodes.splice(0, tree.nodes.length, ...inFrame.nodes.map((n) => ({ ...n, p: fromFrame(n.p) })))
    tree.edges.splice(0, tree.edges.length, ...inFrame.edges.map((e) => ({ ...e, path: e.path.map(fromFrame) })))
  }
  return { frame, buildings, buildingAt, route, outdoorLength, square, outside, guided, graft: graftAll }
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

/**
 * What each installation keeps clear of, in the order they are coordinated: the water is where the Plumbing tab lays
 * it (it keeps its own condensate clear of it), the heating keeps clear of the water and condensate, the gas of all
 * of them. Drains lie under the floor and split lines and ducts high on the walls, so they are not in the way.
 */
export const inTheScreed = <R extends { kind: string }>(runs: readonly R[]): R[] => runs.filter((r) => ['feed', 'cold', 'hot', 'condensate', 'heating', 'radiant'].includes(r.kind))
