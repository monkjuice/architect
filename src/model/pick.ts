import { closestOnSegment, dist, inBox, polygonArea, type Box, type Vec } from './geometry'
import { isEditable, segmentKind, type Layer, type Plan, type Ref } from './plan'

/** Editable layers, the active one first, then the rest from the top of the stack down. */
function pickOrder(plan: Plan, activeLayer: string): Layer[] {
  const layers = plan.layers.filter(isEditable).reverse()
  const i = layers.findIndex((l) => l.id === activeLayer)
  if (i > 0) layers.unshift(...layers.splice(i, 1))
  return layers
}

/**
 * The item under world point `p` on an editable layer: a vertex within `vertexReach`, else a segment within
 * `segmentReach` (both in world units) of its line, or of its faces for a wall drawn thick (`halfWidth`, its
 * faces' distance from its line). Ties go to the active layer.
 */
export function hitTest(
  plan: Plan,
  p: Vec,
  activeLayer: string,
  vertexReach: number,
  segmentReach: number,
  halfWidth?: (layer: Layer, segment: string) => number,
): Ref | null {
  const layers = pickOrder(plan, activeLayer)
  let hit: Ref | null = null
  let best = vertexReach
  for (const layer of layers) {
    for (const [id, v] of Object.entries(layer.vertices)) {
      const d = dist(v, p)
      if (d < best) [best, hit] = [d, { layer: layer.id, kind: 'vertex', id }]
    }
  }
  if (hit) return hit
  best = segmentReach
  for (const layer of layers) {
    for (const [id, s] of Object.entries(layer.segments)) {
      const d = closestOnSegment(p, layer.vertices[s.a], layer.vertices[s.b]).dist - (halfWidth?.(layer, id) ?? 0)
      if (d < best) [best, hit] = [d, { layer: layer.id, kind: 'segment', id }]
    }
  }
  return hit
}

/** Segments of editable layers lying wholly inside `box`. */
export function segmentsInBox(plan: Plan, box: Box): Ref[] {
  const refs: Ref[] = []
  for (const layer of plan.layers.filter(isEditable)) {
    for (const [id, s] of Object.entries(layer.segments)) {
      if (inBox(layer.vertices[s.a], box) && inBox(layer.vertices[s.b], box)) refs.push({ layer: layer.id, kind: 'segment', id })
    }
  }
  return refs
}

/** The vertices a selection moves, by layer: selected vertices and both ends of selected segments (areas move on their own). */
export function selectedVertices(plan: Plan, refs: readonly Ref[]): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>()
  for (const ref of refs) {
    const layer = plan.layers.find((l) => l.id === ref.layer)
    if (!isEditable(layer)) continue
    const ids = ref.kind === 'vertex' ? [ref.id] : layer.segments[ref.id] ? [layer.segments[ref.id].a, layer.segments[ref.id].b] : []
    if (!out.has(layer.id)) out.set(layer.id, new Set())
    for (const id of ids) out.get(layer.id)!.add(id)
  }
  return out
}

/** The vertices of segments `ids` in loop order when they form exactly one closed loop, otherwise null. */
export function orderedLoop(layer: Layer, ids: readonly string[]): Vec[] | null {
  if (ids.length < 3) return null
  const next = new Map<string, string[]>()
  for (const id of ids) {
    const s = layer.segments[id]
    if (!s) return null
    for (const [u, v] of [
      [s.a, s.b],
      [s.b, s.a],
    ]) {
      if (!next.has(u)) next.set(u, [])
      next.get(u)!.push(v)
    }
  }
  for (const around of next.values()) if (around.length !== 2) return null
  const start = layer.segments[ids[0]].a
  const order = [start]
  let prev = ''
  let cur = start
  for (;;) {
    const [n1, n2] = next.get(cur)!
    const step = n1 !== prev ? n1 : n2
    if (step === start) break
    order.push(step)
    ;[prev, cur] = [cur, step]
    if (order.length > next.size) return null
  }
  return order.length === next.size ? order.map((id) => layer.vertices[id]) : null
}

/** Total length of segments (and how much of it is not wall), and the enclosed area when they form one closed loop. */
export function measureSegments(layer: Layer, ids: readonly string[]): { length: number; open: number; area?: number } {
  let length = 0
  let open = 0
  for (const id of ids) {
    const s = layer.segments[id]
    if (!s) continue
    const d = dist(layer.vertices[s.a], layer.vertices[s.b])
    length += d
    if (segmentKind(s) !== 'wall') open += d
  }
  const loop = orderedLoop(layer, ids)
  return loop ? { length, open, area: polygonArea(loop) } : { length, open }
}

/** Areas of editable layers whose point lies inside `box`. */
export function areasInBox(plan: Plan, box: Box): Ref[] {
  const refs: Ref[] = []
  for (const layer of plan.layers.filter(isEditable)) {
    for (const [id, area] of Object.entries(layer.areas)) if (inBox(area.at, box)) refs.push({ layer: layer.id, kind: 'area', id })
  }
  return refs
}
