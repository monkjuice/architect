import { closestOnSegment, dist, rotate, type Vec } from './geometry'
import { pointInPolygon } from './regions'
import { offsetPolygon } from './roofs'
import type { GasRoutingChoice } from './plan'
import type { Router, Tree, TreeEdge, TreeNode } from './routing'

/**
 * Gas pipe routed outside the buildings where it can be (see gas.ts): along their walls, a little out from their
 * outside faces, and across the open ground between them, entering a building through its wall near what it feeds.
 * Buried or along the façade, a gas pipe outside is safer to lay and to reach than one under the floors.
 *
 * The way is a graph: each building's outline moved `GAS_ROUTE.out` out from its walls, the points where the pipe
 * enters, the supply and what stands outside, and straight or single-bend links between them that cross no building.
 * The tree grows the way Prim's does: each target in turn, the nearest by the way, joined by its shortest path to the
 * pipe already laid (Dijkstra from every node on it). Inside a building, from the entry to what it feeds, the pipe is
 * routed square to the walls as the other tabs' pipes are (routing.ts).
 */

/**
 * How far out from the walls' outside faces the pipe runs, how near two entries are to be one, and how far an entry
 * keeps from an electrical box on the wall (a socket's cable comes up to it at the height the gas goes through), m.
 */
export const GAS_ROUTE = { out: 0.3, merge: 1.5, boxes: 0.35 }

/** How the gas pipe is routed (see GAS_ROUTING_CHOICES in plan.ts). */
export type GasRouting = GasRoutingChoice

/** Where the pipe goes into a building: just outside its wall, on its outside face, and the targets fed through it. */
export interface GasEntry {
  out: Vec
  wall: Vec
  building: number
  targets: number[]
}

interface Edge {
  to: number
  cost: number
  path: Vec[]
}

/**
 * A tree from `roots` to `targets` (indices into `targets` in its nodes), and the entries it goes in by. With
 * `direct`, or a root inside a building, it is the router's own tree and has no entries.
 */
export function gasTree(
  router: Router,
  roots: readonly Vec[],
  targets: readonly Vec[],
  routing: GasRouting,
  /** Routes set by hand, by target: laid through their bends, not routed (see routeTree's `guides`). */
  guides: readonly (readonly Vec[] | undefined)[] = [],
  /** Electrical boxes on the ground floor: an entry keeps GAS_ROUTE.boxes from each, sliding along the wall. */
  boxes: readonly Vec[] = [],
): { tree: Tree; entries: GasEntry[] } {
  const { buildings, buildingAt, frame } = router
  if (routing === 'direct' || !roots.length || !buildings.length || roots.some((r) => buildingAt(r) >= 0)) return { tree: router.route(roots, targets, guides), entries: [] }
  const byHand = (i: number) => !!guides[i]?.length
  const walls = buildings.flat()
  const ringOf: number[] = []
  buildings.forEach((rings, b) => rings.forEach(() => ringOf.push(b)))
  const outRings = walls.map((r) => offsetPolygon(r, GAS_ROUTE.out))

  // ---- what crosses a building: a segment through one of its walls, or lying inside it
  const blocked = (a: Vec, b: Vec): boolean => {
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
    for (const ring of walls) {
      if (pointInPolygon(mid, ring)) return true
      for (let k = 0; k < ring.length; k++) if (crosses(a, b, ring[k], ring[(k + 1) % ring.length])) return true
    }
    return false
  }
  /** A way from a to b that crosses no building: one bend square to the walls, either way round, else straight. */
  const link = (a: Vec, b: Vec): Vec[] | null => {
    const [p, q] = [rotate(a, -frame), rotate(b, -frame)]
    for (const c of [rotate({ x: q.x, y: p.y }, frame), rotate({ x: p.x, y: q.y }, frame)]) if (!blocked(a, c) && !blocked(c, b)) return [a, c, b]
    return blocked(a, b) ? null : [a, b]
  }

  // ---- the entries: each target inside a building goes in by the nearest point of that building's way round
  const entries: GasEntry[] = []
  const within = targets.map((t) => buildingAt(t))
  const nearestOut = (b: number, p: Vec) => {
    let best: { ring: number; k: number; point: Vec; d: number } | null = null
    outRings.forEach((ring, r) => {
      if (ringOf[r] !== b) return
      for (let k = 0; k < ring.length; k++) {
        const [a, c] = [ring[k], ring[(k + 1) % ring.length]]
        if (blocked(a, c)) continue
        const hit = closestOnSegment(p, a, c)
        if (!best || hit.dist < best.d) best = { ring: r, k, point: hit.point, d: hit.dist }
      }
    })
    return best as { ring: number; k: number; point: Vec; d: number } | null
  }
  const onWall = (b: number, p: Vec): Vec => {
    let best = { d: Infinity, point: p }
    walls.forEach((ring, r) => {
      if (ringOf[r] !== b) return
      for (let k = 0; k < ring.length; k++) {
        const hit = closestOnSegment(p, ring[k], ring[(k + 1) % ring.length])
        if (hit.dist < best.d) best = { d: hit.dist, point: hit.point }
      }
    })
    return best.point
  }
  const inserted: { ring: number; k: number; point: Vec; entry: number }[] = []
  /** The point along ring edge `o` nearest `o.point` that keeps clear of the electrical boxes, or the point itself. */
  const clearOfBoxes = (o: { ring: number; k: number; point: Vec }): Vec => {
    const clear = (p: Vec) => boxes.every((q) => dist(onWall(ringOf[o.ring], p), q) >= GAS_ROUTE.boxes)
    if (clear(o.point)) return o.point
    const ring = outRings[o.ring]
    const [a, c] = [ring[o.k], ring[(o.k + 1) % ring.length]]
    const l = dist(a, c)
    if (l < 1e-9) return o.point
    const t0 = dist(a, o.point)
    for (let s = 0.05; s <= l; s += 0.05) {
      for (const t of [t0 + s, t0 - s]) {
        if (t < 0.05 || t > l - 0.05) continue
        const p = { x: a.x + ((c.x - a.x) * t) / l, y: a.y + ((c.y - a.y) * t) / l }
        if (clear(p)) return p
      }
    }
    return o.point
  }
  const addEntry = (b: number, toward: Vec, t: number[]) => {
    const found = nearestOut(b, toward)
    if (!found) return false
    // away from the sockets on that wall
    const o = { ...found, point: clearOfBoxes(found) }
    const near = entries.findIndex((e) => e.building === b && dist(e.out, o.point) < GAS_ROUTE.merge)
    if (near >= 0) {
      entries[near].targets.push(...t)
      return true
    }
    inserted.push({ ring: o.ring, k: o.k, point: o.point, entry: entries.length })
    entries.push({ out: o.point, wall: onWall(b, o.point), building: b, targets: [...t] })
    return true
  }
  const free: number[] = []
  if (routing === 'entry') {
    // one entry per building, at its way round nearest the middle of what it feeds there
    const byBuilding = new Map<number, number[]>()
    within.forEach((b, i) => (byHand(i) ? undefined : b >= 0 ? byBuilding.set(b, [...(byBuilding.get(b) ?? []), i]) : free.push(i)))
    for (const [b, list] of byBuilding) {
      const mid = { x: list.reduce((s, i) => s + targets[i].x, 0) / list.length, y: list.reduce((s, i) => s + targets[i].y, 0) / list.length }
      if (!addEntry(b, mid, list)) free.push(...list)
    }
  } else {
    within.forEach((b, i) => (byHand(i) ? undefined : b < 0 || !addEntry(b, targets[i], [i]) ? free.push(i) : undefined))
  }

  // ---- the graph: the ways round the buildings with the entries on them, the roots and what stands outside
  const pts: Vec[] = []
  const adj: Edge[][] = []
  const node = (p: Vec) => {
    adj.push([])
    return pts.push(p) - 1
  }
  const join = (a: number, b: number, path: Vec[]) => {
    const cost = path.reduce((s, p, i) => (i ? s + dist(path[i - 1], p) : s), 0)
    adj[a].push({ to: b, cost, path })
    adj[b].push({ to: a, cost, path: [...path].reverse() })
  }
  const ringNodes: number[][] = []
  const entryNode: number[] = entries.map(() => -1)
  outRings.forEach((ring, r) => {
    // the ring's corners and the entries on its edges, in order round it
    const items: { at: number; p: Vec; entry?: number }[] = ring.map((p, k) => ({ at: k, p }))
    for (const e of inserted) if (e.ring === r) items.push({ at: e.k + Math.min(0.999, dist(ring[e.k], e.point) / Math.max(1e-9, dist(ring[e.k], ring[(e.k + 1) % ring.length]))), p: e.point, entry: e.entry })
    items.sort((x, y) => x.at - y.at)
    const ids = items.map((it) => {
      const id = node(it.p)
      if (it.entry !== undefined) entryNode[it.entry] = id
      return id
    })
    ids.forEach((id, i) => {
      const next = ids[(i + 1) % ids.length]
      const [a, b] = [pts[id], pts[next]]
      if (id !== next && dist(a, b) > 1e-9 && !blocked(a, b)) join(id, next, [a, b])
    })
    ringNodes.push(ids)
  })
  const rootNodes = roots.map((p) => node(p))
  const freeNodes = free.map((i) => node(targets[i]))
  // links across the open ground: from the roots and what stands outside to everything, and between the buildings'
  // ways round, each corner to the nearest few of every other
  const loose = [...rootNodes, ...freeNodes]
  const ringAll = ringNodes.flat()
  for (let i = 0; i < loose.length; i++) {
    for (const other of [...loose.slice(i + 1), ...ringAll]) {
      const path = link(pts[loose[i]], pts[other])
      if (path) join(loose[i], other, path)
    }
  }
  for (let r = 0; r < ringNodes.length; r++) {
    for (let s = r + 1; s < ringNodes.length; s++) {
      for (const a of ringNodes[r]) {
        const near = [...ringNodes[s]].sort((x, y) => dist(pts[a], pts[x]) - dist(pts[a], pts[y])).slice(0, 3)
        for (const b of near) {
          const path = link(pts[a], pts[b])
          if (path) join(a, b, path)
        }
      }
    }
  }

  // ---- the tree: each target in turn, the nearest by the way, joined to the pipe already laid
  const goals = new Map<number, number>()
  entries.forEach((_, e) => entryNode[e] >= 0 && goals.set(entryNode[e], -1 - e))
  freeNodes.forEach((n, i) => goals.set(n, free[i]))
  const parent = new Map<number, { from: number; path: Vec[] }>()
  const laid = new Set(rootNodes)
  const orphans: number[] = []
  while (goals.size) {
    const d = pts.map(() => Infinity)
    const prev = new Map<number, Edge & { from: number }>()
    const queue: number[] = []
    for (const n of laid) {
      d[n] = 0
      queue.push(n)
    }
    let found = -1
    while (queue.length) {
      // a small graph: the nearest node left by a linear scan
      let k = 0
      for (let i = 1; i < queue.length; i++) if (d[queue[i]] < d[queue[k]]) k = i
      const u = queue.splice(k, 1)[0]
      if (goals.has(u) && !laid.has(u)) {
        found = u
        break
      }
      for (const e of adj[u]) {
        if (d[u] + e.cost < d[e.to] - 1e-12) {
          if (d[e.to] === Infinity) queue.push(e.to)
          d[e.to] = d[u] + e.cost
          prev.set(e.to, { ...e, from: u })
        }
      }
    }
    if (found < 0) {
      // cut off (a target walled in by buildings): joined straight to the nearest pipe, as the direct routing would
      orphans.push(...goals.keys())
      break
    }
    for (let n = found; !laid.has(n); ) {
      const e = prev.get(n)!
      parent.set(n, { from: e.from, path: e.path })
      laid.add(n)
      n = e.from
    }
    goals.delete(found)
  }
  for (const n of orphans) {
    const near = [...laid].sort((a, b) => dist(pts[a], pts[n]) - dist(pts[b], pts[n]))[0]
    parent.set(n, { from: near, path: router.square(pts[near], pts[n], true) })
    laid.add(n)
  }

  // ---- into a tree: chains of the graph's edges joined into one edge between junctions, then the entries' insides
  const children = new Map<number, number[]>()
  for (const [n, p] of parent) children.set(p.from, [...(children.get(p.from) ?? []), n])
  const nodes: TreeNode[] = []
  const edges: TreeEdge[] = []
  const targetOf = (n: number) => {
    const g = freeNodes.indexOf(n)
    return g >= 0 ? free[g] : -1
  }
  const entryOf = (n: number) => entryNode.indexOf(n)
  const keep = (n: number) => rootNodes.includes(n) || targetOf(n) >= 0 || entryOf(n) >= 0 || (children.get(n)?.length ?? 0) !== 1
  const emit = (n: number, up: number) => {
    const at = nodes.push({ p: pts[n], target: targetOf(n), parent: up }) - 1
    const e = entryOf(n)
    if (e >= 0) inside(e, at)
    for (const c of children.get(n) ?? []) {
      // follow the chain down to the next node kept
      const path = [...parent.get(c)!.path]
      let m = c
      while (!keep(m)) {
        m = children.get(m)![0]
        path.push(...parent.get(m)!.path.slice(1))
      }
      const to = emit(m, at)
      edges.push({ from: at, to, path: clean(path) })
    }
    return at
  }
  const inside = (e: number, at: number) => {
    const entry = entries[e]
    // through the wall, then square to the walls inside to what it feeds
    const wall = nodes.push({ p: entry.wall, target: -1, parent: at }) - 1
    edges.push({ from: at, to: wall, path: [entry.out, entry.wall] })
    const t = router.route([entry.wall], entry.targets.map((i) => targets[i]))
    const base = nodes.length - 1
    t.nodes.forEach((n, i) => {
      if (i === 0) return
      nodes.push({ p: n.p, target: n.target >= 0 ? entry.targets[n.target] : -1, parent: n.parent === 0 ? wall : base + n.parent })
    })
    for (const te of t.edges) edges.push({ from: te.from === 0 ? wall : base + te.from, to: te.to === 0 ? wall : base + te.to, path: te.path })
  }
  for (const r of rootNodes) emit(r, -1)
  // the routes set by hand, laid through their bends onto what was routed
  const tree = { nodes, edges }
  router.graft(
    tree,
    targets.flatMap((at, index) => (byHand(index) ? [{ index, at, guide: guides[index]! }] : [])),
  )
  return { tree, entries }
}

/** Whether segments a–b and c–d cross, not merely touch at an end. */
function crosses(a: Vec, b: Vec, c: Vec, d: Vec): boolean {
  const side = (p: Vec, q: Vec, r: Vec) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x)
  const [d1, d2, d3, d4] = [side(c, d, a), side(c, d, b), side(a, b, c), side(a, b, d)]
  return ((d1 > 1e-9 && d2 < -1e-9) || (d1 < -1e-9 && d2 > 1e-9)) && ((d3 > 1e-9 && d4 < -1e-9) || (d3 < -1e-9 && d4 > 1e-9))
}

/** A path without repeated points or points in the middle of a straight stretch. */
function clean(pts: readonly Vec[]): Vec[] {
  const out: Vec[] = []
  for (const p of pts) {
    if (out.length && dist(out[out.length - 1], p) < 1e-7) continue
    if (out.length >= 2) {
      const [a, b] = [out[out.length - 2], out[out.length - 1]]
      const cross = (b.x - a.x) * (p.y - b.y) - (b.y - a.y) * (p.x - b.x)
      if (Math.abs(cross) < 1e-9 && (b.x - a.x) * (p.x - b.x) + (b.y - a.y) * (p.y - b.y) > 0) out.pop()
    }
    out.push(p)
  }
  return out.length >= 2 ? out : [pts[0], pts[pts.length - 1]]
}

