import { add, closestOnSegment, constrainAngle, dist, dot, EPS, lerp, lineSegmentIntersection, mul, sub, type Vec } from './geometry'
import type { Plan } from './plan'

export type SnapKind = 'free' | 'vertex' | 'midpoint' | 'edge' | 'align'

export interface Snap {
  point: Vec
  kind: SnapKind
  /** The layer, vertex or segment the point landed on (vertex, midpoint and edge snaps). */
  layer?: string
  vertex?: string
  segment?: string
  /** For 'align': the vertex the point lines up with along the constrained direction. */
  guide?: Vec
  /** The point is one of the caller's `extraPoints`, not a vertex of the plan. */
  extra?: boolean
}

export interface SnapOptions {
  /** How far snapping reaches, in world units (a screen radius divided by the zoom). */
  reach: number
  /** Anchor of the line being drawn; with `constrain`, the point stays on a 45° ray from it. */
  from?: Vec
  constrain?: boolean
  /** False turns geometry snapping off (Alt held); the constraint still applies. */
  enabled?: boolean
  /** "layer:vertex" and "layer:segment" keys to ignore, e.g. the vertex being dragged and its segments. */
  skipVertices?: ReadonlySet<string>
  skipSegments?: ReadonlySet<string>
  /** Extra vertex-like targets, e.g. the first point of a measurement so it can be closed. */
  extraPoints?: readonly Vec[]
}

/**
 * The point a tool should use for cursor position `p`. Existing geometry on visible layers wins, in this
 * order: vertices, segment midpoints, the nearest point of a segment. With a constraint the result stays on the
 * constrained ray: a vertex near it is lined up with (an 'align' snap) and segments are cut where the ray
 * crosses them.
 */
export function findSnap(plan: Plan, p: Vec, opts: SnapOptions): Snap {
  const constrained = opts.constrain && opts.from ? constrainAngle(opts.from, p) : null
  const target = constrained ? constrained.point : p
  if (opts.enabled === false) return { point: target, kind: 'free' }
  const layers = plan.layers.filter((l) => l.visible)

  let vertex: { point: Vec; layer?: string; vertex?: string; extra?: boolean } | null = null
  let best = opts.reach
  for (const layer of layers) {
    for (const [id, v] of Object.entries(layer.vertices)) {
      if (opts.skipVertices?.has(`${layer.id}:${id}`)) continue
      const d = dist(v, target)
      if (d <= best) [best, vertex] = [d, { point: v, layer: layer.id, vertex: id }]
    }
  }
  for (const point of opts.extraPoints ?? []) {
    const d = dist(point, target)
    if (d <= best) [best, vertex] = [d, { point, extra: true }]
  }
  if (vertex) {
    const exact = { ...vertex, point: { ...vertex.point }, kind: 'vertex' as const }
    if (!constrained) return exact
    const q = add(opts.from!, mul(constrained.dir, dot(sub(vertex.point, opts.from!), constrained.dir)))
    return dist(q, vertex.point) < EPS ? exact : { point: q, kind: 'align', guide: { ...vertex.point } }
  }

  let mid: Snap | null = null
  let edge: Snap | null = null
  let bestMid = opts.reach
  let bestEdge = opts.reach
  for (const layer of layers) {
    for (const [id, s] of Object.entries(layer.segments)) {
      if (opts.skipSegments?.has(`${layer.id}:${id}`)) continue
      const a = layer.vertices[s.a]
      const b = layer.vertices[s.b]
      if (constrained) {
        const hit = lineSegmentIntersection(opts.from!, constrained.dir, a, b)
        if (!hit || hit.t < EPS) continue
        const d = dist(hit.point, target)
        if (d <= bestEdge) [bestEdge, edge] = [d, { point: hit.point, kind: 'edge', layer: layer.id, segment: id }]
        continue
      }
      const m = lerp(a, b, 0.5)
      const dm = dist(m, target)
      if (dm <= bestMid) [bestMid, mid] = [dm, { point: m, kind: 'midpoint', layer: layer.id, segment: id }]
      const c = closestOnSegment(target, a, b)
      if (c.dist <= bestEdge) [bestEdge, edge] = [c.dist, { point: c.point, kind: 'edge', layer: layer.id, segment: id }]
    }
  }
  return mid ?? edge ?? { point: target, kind: 'free' }
}
