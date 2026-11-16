import { boardAndDescendants, boardKey, boardPlace, frontOf } from './electrical'
import { add, closestOnSegment, dist, EPS, lerp, mul, type Vec } from './geometry'
import {
  createLayer,
  findLayer,
  isEditable,
  LAYER_COLORS,
  refExists,
  segmentKind,
  type Area,
  type Board,
  type BoardCircuit,
  type Colonnade,
  type CircuitKind,
  type Electrical,
  type FixturePlumbing,
  type HeatingMaterial,
  type PipeMaterial,
  type PipeNetwork,
  type PlumbingSettings,
  type FoundationSystem,
  type Furniture,
  type Layer,
  type Opening,
  type OpeningStyle,
  type Plan,
  type Ref,
  type Roof,
  type Service,
  type Segment,
  type SegmentKind,
  type Site,
} from './plan'
import { isStyleOf } from './openings'
import type { Snap } from './snap'

/**
 * Edits never mutate a plan: they return a new one that replaces only the layers they change, or the same
 * plan when nothing changes (the store then records no undo step).
 *
 * Inside an operation, a layer is edited through a draft: a copy whose vertex and segment maps are private,
 * so the operation writes to them directly. Points and segments are replaced, never mutated, because the
 * objects inside the maps are still shared with the previous plan.
 */

const ON_POINT = 1e-6

/** A copy of `layer` whose vertex, segment, area, opening, roof, furniture and service maps may be written to. */
export function draftLayer(layer: Layer): Layer {
  return {
    ...layer,
    vertices: { ...layer.vertices },
    segments: { ...layer.segments },
    areas: { ...layer.areas },
    openings: { ...layer.openings },
    roofs: { ...layer.roofs },
    furniture: { ...layer.furniture },
    services: { ...layer.services },
  }
}

export function replaceLayer(plan: Plan, layer: Layer): Plan {
  return { ...plan, layers: plan.layers.map((l) => (l.id === layer.id ? layer : l)) }
}

/** Applies `change` to a draft of one layer; returning false from it leaves the plan unchanged. */
export function editLayer(plan: Plan, layerId: string, change: (draft: Layer) => boolean | void): Plan {
  const layer = findLayer(plan, layerId)
  if (!layer) return plan
  const draft = draftLayer(layer)
  return change(draft) === false ? plan : replaceLayer(plan, draft)
}

/** The next free id with this prefix: v1, v2… for vertices, s1, s2… for segments. */
function nextId(prefix: string, map: Record<string, unknown>): string {
  let n = Object.keys(map).length + 1
  while (map[`${prefix}${n}`]) n++
  return `${prefix}${n}`
}

// ---- draft operations: they write to the draft's own maps ------------------------------------------------

export function addVertex(d: Layer, p: Vec): string {
  const id = nextId('v', d.vertices)
  d.vertices[id] = { x: p.x, y: p.y }
  return id
}

export function findVertexAt(layer: Layer, p: Vec, tolerance = ON_POINT): string | undefined {
  for (const [id, v] of Object.entries(layer.vertices)) if (dist(v, p) <= tolerance) return id
  return undefined
}

/**
 * Joins two vertices; returns the existing segment if they are already joined, null for a zero-length one. `like`
 * gives a new segment the kind, thickness and height of another (the one it is a piece or a copy of).
 */
export function addSegment(d: Layer, a: string, b: string, like: SegmentKind | Segment = 'wall'): string | null {
  if (a === b || !d.vertices[a] || !d.vertices[b] || dist(d.vertices[a], d.vertices[b]) < EPS) return null
  for (const [id, s] of Object.entries(d.segments)) {
    if ((s.a === a && s.b === b) || (s.a === b && s.b === a)) return id
  }
  const id = nextId('s', d.segments)
  d.segments[id] = typeof like === 'string' ? (like === 'wall' ? { a, b } : { a, b, kind: like }) : { ...like, a, b }
  return id
}

export function segmentsAt(layer: Layer, vertex: string): string[] {
  return Object.entries(layer.segments)
    .filter(([, s]) => s.a === vertex || s.b === vertex)
    .map(([id]) => id)
}

const passesThrough = (layer: Layer, id: string, p: Vec): boolean => {
  const s = layer.segments[id]
  return !!s && closestOnSegment(p, layer.vertices[s.a], layer.vertices[s.b]).dist < ON_POINT
}

/** Splits segment `id` at `p` (on it) and returns the vertex there: a new one, or an end when `p` is on one. */
export function splitSegment(d: Layer, id: string, p: Vec): string {
  const s = d.segments[id]
  const a = d.vertices[s.a]
  const b = d.vertices[s.b]
  const c = closestOnSegment(p, a, b)
  const point = c.dist < ON_POINT ? p : c.point
  if (dist(point, a) < ON_POINT) return s.a
  if (dist(point, b) < ON_POINT) return s.b
  const mid = addVertex(d, point)
  delete d.segments[id]
  const first = addSegment(d, s.a, mid, s)!
  const second = addSegment(d, mid, s.b, s)!
  // each door or window goes to the piece its centre is on
  const at = dist(a, point)
  for (const [oid, o] of Object.entries(d.openings)) {
    if (o.segment !== id) continue
    d.openings[oid] = o.offset < at ? { ...o, segment: first } : { ...o, segment: second, offset: o.offset - at }
  }
  return mid
}

/** Removes openings whose segment is gone. */
export function pruneOpenings(d: Layer) {
  for (const [id, o] of Object.entries(d.openings)) if (!d.segments[o.segment]) delete d.openings[id]
}

/**
 * After vertices of draft `d` moved (from their places in `before`): a door or window keeps its distance to
 * the nearer end of its segment, so stretching a wall from one end leaves the openings near the other in place.
 */
function followOpenings(before: Layer, d: Layer) {
  for (const [id, o] of Object.entries(d.openings)) {
    const s = d.segments[o.segment]
    const was = before.segments[o.segment]
    if (!s || !was) continue
    const oldLength = dist(before.vertices[was.a], before.vertices[was.b])
    const newLength = dist(d.vertices[s.a], d.vertices[s.b])
    if (Math.abs(newLength - oldLength) > EPS && o.offset > oldLength / 2) d.openings[id] = { ...o, offset: newLength - (oldLength - o.offset) }
  }
}

/**
 * Re-points the segments of `drop` to `keep`, removes `drop`, and drops segments that became loops or
 * duplicates; of a wall and another kind that became the same segment, the wall stays.
 */
export function mergeVertices(d: Layer, keep: string, drop: string) {
  if (keep === drop) return
  for (const [id, s] of Object.entries(d.segments)) {
    if (s.a === drop || s.b === drop) d.segments[id] = { ...s, a: s.a === drop ? keep : s.a, b: s.b === drop ? keep : s.b }
  }
  delete d.vertices[drop]
  const seen = new Map<string, string>()
  for (const [id, s] of Object.entries(d.segments)) {
    const key = s.a < s.b ? `${s.a}|${s.b}` : `${s.b}|${s.a}`
    const kept = seen.get(key)
    if (s.a === s.b) delete d.segments[id]
    else if (!kept) seen.set(key, id)
    else if (segmentKind(d.segments[kept]) !== 'wall' && segmentKind(s) === 'wall') {
      delete d.segments[kept]
      seen.set(key, id)
    } else delete d.segments[id]
  }
  pruneOpenings(d)
}

/** Removes vertices no segment uses. */
export function removeOrphans(d: Layer) {
  const used = new Set<string>()
  for (const s of Object.values(d.segments)) used.add(s.a).add(s.b)
  for (const id of Object.keys(d.vertices)) if (!used.has(id)) delete d.vertices[id]
}

/**
 * The vertex of draft `d` for a snapped point: the snapped vertex when it is on this layer, a new vertex
 * splitting the snapped segment, or a vertex at the point (an existing one there, else a new one). Snaps to
 * other layers only lend their position: layers do not connect.
 */
export function vertexForSnap(d: Layer, snap: Snap): string {
  if (snap.layer === d.id) {
    if (snap.vertex) {
      const v = d.vertices[snap.vertex]
      if (v && dist(v, snap.point) < ON_POINT) return snap.vertex
    }
    if (snap.segment) {
      // an earlier split in the same edit may have replaced the snapped segment: find the piece through the point
      const id = passesThrough(d, snap.segment, snap.point)
        ? snap.segment
        : Object.keys(d.segments).find((sid) => passesThrough(d, sid, snap.point))
      if (id) return splitSegment(d, id, snap.point)
    }
  }
  return findVertexAt(d, snap.point) ?? addVertex(d, snap.point)
}

// ---- plan operations -----------------------------------------------------------------------------------

/**
 * Draws a wall or an open edge on a layer from `from` (an existing vertex id, or a snapped point) to a snapped
 * point, connecting to or splitting whatever they snapped to. Null when nothing would be drawn.
 */
export function drawSegment(
  plan: Plan,
  layerId: string,
  from: string | Snap,
  to: Snap,
  kind: SegmentKind = 'wall',
): { plan: Plan; a: string; b: string } | null {
  const layer = findLayer(plan, layerId)
  if (!layer) return null
  const d = draftLayer(layer)
  const a = typeof from === 'string' ? from : vertexForSnap(d, from)
  const b = vertexForSnap(d, to)
  const before = Object.keys(d.segments).length
  if (addSegment(d, a, b, kind) === null) return null
  const changed = Object.keys(d.segments).length !== before || Object.keys(d.vertices).length !== Object.keys(layer.vertices).length
  return changed ? { plan: replaceLayer(plan, d), a, b } : null
}

/** Sets vertex positions, grouped by layer; doors and windows follow their walls (see followOpenings). */
export function setVertices(plan: Plan, positions: ReadonlyMap<string, ReadonlyMap<string, Vec>>): Plan {
  let next = plan
  for (const [layerId, moves] of positions) {
    const before = findLayer(next, layerId)
    if (!before) continue
    next = editLayer(next, layerId, (d) => {
      for (const [id, p] of moves) if (d.vertices[id]) d.vertices[id] = { x: p.x, y: p.y }
      followOpenings(before, d)
    })
  }
  return next
}

/**
 * Connects a vertex that was dropped on a snap target of its own layer: merges it into the vertex there, or
 * into a new vertex splitting the segment there. Returns the vertex that remains.
 */
export function connectVertex(plan: Plan, layerId: string, vertex: string, snap: Snap): { plan: Plan; vertex: string } {
  const layer = findLayer(plan, layerId)
  if (!layer || snap.layer !== layerId || !(snap.kind === 'vertex' || snap.kind === 'edge' || snap.kind === 'midpoint')) {
    return { plan, vertex }
  }
  const d = draftLayer(layer)
  const target = vertexForSnap(d, snap)
  if (target === vertex) return { plan, vertex }
  mergeVertices(d, target, vertex)
  return { plan: replaceLayer(plan, d), vertex: target }
}

/**
 * Deletes segments, vertices (with every segment on them) and areas on editable layers, then unused vertices.
 * Deleting walls leaves the areas they enclosed; those show as not enclosed until closed again.
 */
export function deleteItems(plan: Plan, refs: readonly Ref[]): Plan {
  let next = plan
  for (const layerId of new Set(refs.map((r) => r.layer))) {
    if (!isEditable(findLayer(next, layerId))) continue
    // electrical items leave the lines alone, so the regions worked out from them stay
    const onLayer = refs.filter((r) => r.layer === layerId)
    const electrical = onLayer.filter((r) => r.kind === 'electrical')
    if (electrical.length) {
      const gone = electrical.map((r) => ({ ref: { layer: layerId, id: r.id }, item: findLayer(next, layerId)?.electrical[r.id] }))
      next = withElectrical(next, layerId, (items) => electrical.forEach((r) => delete items[r.id]))
      // a deleted board's sub-boards: those in its enclosure go with it, the others are fed from its own parent
      for (const { ref, item } of gone) if (item?.kind === 'board') next = detachChildren(next, ref, item.parent ?? null)
    }
    if (electrical.length === onLayer.length) continue
    next = editLayer(next, layerId, (d) => {
      for (const ref of refs) {
        if (ref.layer !== layerId || ref.kind === 'electrical') continue
        if (ref.kind === 'segment') delete d.segments[ref.id]
        else if (ref.kind === 'area') delete d.areas[ref.id]
        else if (ref.kind === 'opening') delete d.openings[ref.id]
        else if (ref.kind === 'roof') delete d.roofs[ref.id]
        else if (ref.kind === 'furniture') delete d.furniture[ref.id]
        else if (ref.kind === 'service') delete d.services[ref.id]
        else for (const id of segmentsAt(d, ref.id)) delete d.segments[id]
      }
      removeOrphans(d)
      pruneOpenings(d)
      pruneFurniture(d)
    })
  }
  return pruneFixturePlumbing(next)
}

/** Drops the plumbing choices of fixtures that are gone. */
function pruneFixturePlumbing(plan: Plan): Plan {
  const fixtures = plan.plumbing?.fixtures
  if (!fixtures) return plan
  const kept = Object.fromEntries(Object.entries(fixtures).filter(([key]) => refExists(plan, { layer: key.slice(0, key.indexOf(':')), kind: 'furniture', id: key.slice(key.indexOf(':') + 1) })))
  return Object.keys(kept).length === Object.keys(fixtures).length ? plan : withPlumbing(plan, { ...plan.plumbing, fixtures: kept })
}

/** Makes segments walls, open edges or outlines; the same plan when they already are. */
export function setSegmentKind(plan: Plan, refs: readonly Ref[], kind: SegmentKind): Plan {
  let next = plan
  for (const layerId of new Set(refs.filter((r) => r.kind === 'segment').map((r) => r.layer))) {
    next = editLayer(next, layerId, (d) => {
      let changed = false
      for (const ref of refs) {
        const s = ref.layer === layerId && ref.kind === 'segment' ? d.segments[ref.id] : undefined
        if (!s || segmentKind(s) === kind) continue
        // a wall's own thickness and height stay, for when it is turned back into a wall
        const next = { ...s }
        if (kind === 'wall') delete next.kind
        else next.kind = kind
        d.segments[ref.id] = next
        changed = true
      }
      return changed
    })
  }
  return next
}

/** What updateWalls changes: a number sets it, null goes back to the automatic thickness or the usual height. */
export interface WallPatch {
  thickness?: number | null
  height?: number | null
}

/** Sets the thickness or height of the walls among `refs`; the same plan when nothing changes. */
export function updateWalls(plan: Plan, refs: readonly Ref[], patch: WallPatch): Plan {
  let next = plan
  for (const layerId of new Set(refs.filter((r) => r.kind === 'segment').map((r) => r.layer))) {
    next = editLayer(next, layerId, (d) => {
      let changed = false
      for (const ref of refs) {
        const s = ref.layer === layerId && ref.kind === 'segment' ? d.segments[ref.id] : undefined
        if (!s || segmentKind(s) !== 'wall') continue
        const w = { ...s }
        for (const key of ['thickness', 'height'] as const) {
          const value = patch[key]
          if (value === null) delete w[key]
          else if (value !== undefined && value > 0) w[key] = value
        }
        if (w.thickness === s.thickness && w.height === s.height) continue
        d.segments[ref.id] = w
        changed = true
      }
      return changed
    })
  }
  return next
}

/** What setFooting changes: a number sets it, null goes back to the one worked out from the wall (see foundations.ts). */
export interface FootingPatch {
  width?: number | null
  depth?: number | null
}

/** Sets the footing width or depth of the walls among `refs`; the same plan when nothing changes. */
export function setFooting(plan: Plan, refs: readonly Ref[], patch: FootingPatch): Plan {
  let next = plan
  for (const layerId of new Set(refs.filter((r) => r.kind === 'segment').map((r) => r.layer))) {
    next = editLayer(next, layerId, (d) => {
      let changed = false
      for (const ref of refs) {
        const s = ref.layer === layerId && ref.kind === 'segment' ? d.segments[ref.id] : undefined
        if (!s || segmentKind(s) !== 'wall') continue
        const f = { ...s.footing }
        for (const key of ['width', 'depth'] as const) {
          const value = patch[key]
          if (value === null) delete f[key]
          else if (value !== undefined && value > 0) f[key] = value
        }
        if (f.width === s.footing?.width && f.depth === s.footing?.depth) continue
        const w = { ...s }
        if (f.width === undefined && f.depth === undefined) delete w.footing
        else w.footing = f
        d.segments[ref.id] = w
        changed = true
      }
      return changed
    })
  }
  return next
}

/** Sets how the house stands on the ground; the same plan when it already does. */
export function setFoundationSystem(plan: Plan, system: FoundationSystem): Plan {
  return (plan.foundation?.system ?? 'strip') === system ? plan : { ...plan, foundation: { system } }
}

/** Puts a colonnade on the open edges among `refs`, or takes theirs away with null; the same plan when nothing changes. */
export function setColonnade(plan: Plan, refs: readonly Ref[], colonnade: Colonnade | null): Plan {
  let next = plan
  for (const layerId of new Set(refs.filter((r) => r.kind === 'segment').map((r) => r.layer))) {
    next = editLayer(next, layerId, (d) => {
      let changed = false
      for (const ref of refs) {
        const s = ref.layer === layerId && ref.kind === 'segment' ? d.segments[ref.id] : undefined
        if (!s || segmentKind(s) !== 'open') continue
        if (colonnade === null ? !s.colonnade : s.colonnade?.style === colonnade.style && s.colonnade.spacing === colonnade.spacing) continue
        const c = { ...s }
        if (colonnade === null) delete c.colonnade
        else c.colonnade = { ...colonnade }
        d.segments[ref.id] = c
        changed = true
      }
      return changed
    })
  }
  return next
}

/** Finishes one side of a wall with a material (an id), or clears it with null; the same plan when nothing changes. */
export function setWallFinish(plan: Plan, layerId: string, segmentId: string, side: 'left' | 'right', material: string | null): Plan {
  return editLayer(plan, layerId, (d) => {
    const s = d.segments[segmentId]
    if (!s || segmentKind(s) !== 'wall' || (s.finish?.[side] ?? null) === material) return false
    const finish = { ...s.finish }
    if (material === null) delete finish[side]
    else finish[side] = material
    const next = { ...s }
    if (finish.left || finish.right) next.finish = finish
    else delete next.finish
    d.segments[segmentId] = next
  })
}

// ---- areas: they only touch a layer's area map, so its lines (and the regions worked out from them) stay the same

function withAreas(plan: Plan, layerId: string, change: (areas: Record<string, Area>) => boolean | void): Plan {
  const layer = findLayer(plan, layerId)
  if (!layer) return plan
  const areas = { ...layer.areas }
  return change(areas) === false ? plan : replaceLayer(plan, { ...layer, areas })
}

/** Adds a named area whose region is the one enclosing `at`. */
export function addArea(plan: Plan, layerId: string, at: Vec, name: string): { plan: Plan; id: string } {
  let id = ''
  const next = withAreas(plan, layerId, (areas) => {
    id = nextId('a', areas)
    areas[id] = { name, at: { x: at.x, y: at.y } }
  })
  return { plan: next, id }
}

export function updateArea(plan: Plan, layerId: string, id: string, patch: Partial<Area>): Plan {
  return withAreas(plan, layerId, (areas) => {
    const area = areas[id]
    if (!area || (patch.name ?? area.name) === area.name && (!patch.at || (patch.at.x === area.at.x && patch.at.y === area.at.y))) return false
    areas[id] = { ...area, ...patch }
  })
}

/** Finishes the floor of the areas among `refs` with a material (an id), or clears it with null; the same plan when nothing changes. */
export function setAreaFloor(plan: Plan, refs: readonly Ref[], material: string | null): Plan {
  let next = plan
  for (const layerId of new Set(refs.filter((r) => r.kind === 'area').map((r) => r.layer))) {
    next = withAreas(next, layerId, (areas) => {
      let changed = false
      for (const ref of refs) {
        const area = ref.layer === layerId && ref.kind === 'area' ? areas[ref.id] : undefined
        if (!area || (area.floor ?? null) === material) continue
        const a = { ...area }
        if (material === null) delete a.floor
        else a.floor = material
        areas[ref.id] = a
        changed = true
      }
      return changed
    })
  }
  return next
}

/** Makes an area a pool `depth` m deep, or takes its depth off with 0; the same plan when nothing changes. */
export function setAreaDepth(plan: Plan, layerId: string, id: string, depth: number): Plan {
  return withAreas(plan, layerId, (areas) => {
    const area = areas[id]
    if (!area || (area.depth ?? 0) === depth) return false
    const a = { ...area }
    if (depth > 0) a.depth = Math.min(5, depth)
    else delete a.depth
    areas[id] = a
  })
}

/** Marks the areas among `refs` as lots (the land, not rooms) or not; the same plan when nothing changes. */
export function setAreaLot(plan: Plan, refs: readonly Ref[], lot: boolean): Plan {
  let next = plan
  for (const layerId of new Set(refs.filter((r) => r.kind === 'area').map((r) => r.layer))) {
    next = withAreas(next, layerId, (areas) => {
      let changed = false
      for (const ref of refs) {
        const area = ref.layer === layerId && ref.kind === 'area' ? areas[ref.id] : undefined
        if (!area || !!area.lot === lot) continue
        const a = { ...area }
        if (lot) a.lot = true
        else delete a.lot
        areas[ref.id] = a
        changed = true
      }
      return changed
    })
  }
  return next
}

/** Sets area anchor points, grouped by layer (they move with the walls of a selection being dragged). */
export function setAreaAnchors(plan: Plan, positions: ReadonlyMap<string, ReadonlyMap<string, Vec>>): Plan {
  let next = plan
  for (const [layerId, moves] of positions) {
    next = withAreas(next, layerId, (areas) => {
      for (const [id, p] of moves) if (areas[id]) areas[id] = { ...areas[id], at: { x: p.x, y: p.y } }
    })
  }
  return next
}

/** Moves areas to another layer (they keep their names and points). */
export function moveAreas(plan: Plan, from: string, ids: readonly string[], to: string): { plan: Plan; ids: string[] } {
  const src = findLayer(plan, from)
  const dst = findLayer(plan, to)
  if (!src || !dst || from === to) return { plan, ids: [...ids] }
  const srcAreas = { ...src.areas }
  const dstAreas = { ...dst.areas }
  const moved: string[] = []
  for (const id of ids) {
    const area = srcAreas[id]
    if (!area) continue
    const nid = nextId('a', dstAreas)
    dstAreas[nid] = area
    delete srcAreas[id]
    moved.push(nid)
  }
  const next = replaceLayer(plan, { ...src, areas: srcAreas })
  return { plan: replaceLayer(next, { ...findLayer(next, to)!, areas: dstAreas }), ids: moved }
}

/** Gives a segment a new length by moving one end along it: the end with fewer other connections moves. */
export function setSegmentLength(plan: Plan, layerId: string, segmentId: string, length: number): Plan {
  const before = findLayer(plan, layerId)
  return editLayer(plan, layerId, (d) => {
    const s = d.segments[segmentId]
    if (!s || !(length > 0)) return false
    const a = d.vertices[s.a]
    const b = d.vertices[s.b]
    const current = dist(a, b)
    if (current < EPS || Math.abs(current - length) < EPS) return false
    if (segmentsAt(d, s.a).length < segmentsAt(d, s.b).length) d.vertices[s.a] = lerp(b, a, length / current)
    else d.vertices[s.b] = lerp(a, b, length / current)
    followOpenings(before!, d)
  })
}

/** Moves segments to another layer, copying their vertices (shared ones stay behind for the rest). */
export function moveSegments(plan: Plan, from: string, ids: readonly string[], to: string): { plan: Plan; ids: string[] } {
  const src = findLayer(plan, from)
  const dst = findLayer(plan, to)
  if (!src || !dst || from === to) return { plan, ids: [...ids] }
  const s = draftLayer(src)
  const t = draftLayer(dst)
  const copies = new Map<string, string>()
  const copy = (vid: string) => {
    let id = copies.get(vid)
    if (!id) {
      id = findVertexAt(t, s.vertices[vid]) ?? addVertex(t, s.vertices[vid])
      copies.set(vid, id)
    }
    return id
  }
  const moved: string[] = []
  for (const id of ids) {
    const seg = s.segments[id]
    if (!seg) continue
    const added = addSegment(t, copy(seg.a), copy(seg.b), seg)
    delete s.segments[id]
    if (!added) continue
    moved.push(added)
    // doors and windows go along; on a segment that already ran the other way, they are mirrored onto it
    const reversed = t.segments[added].a !== copies.get(seg.a)
    const length = dist(s.vertices[seg.a], s.vertices[seg.b])
    for (const [oid, o] of Object.entries(s.openings)) {
      if (o.segment !== id) continue
      delete s.openings[oid]
      t.openings[nextId('o', t.openings)] = reversed ? reverseOpening({ ...o, segment: added }, length) : { ...o, segment: added }
    }
  }
  removeOrphans(s)
  removeOrphans(t)
  return { plan: replaceLayer(replaceLayer(plan, s), t), ids: moved }
}

/** The same opening described from the segment's other end. */
function reverseOpening(o: Opening, length: number): Opening {
  return { ...o, offset: length - o.offset, hinge: o.hinge === 'a' ? 'b' : 'a', swing: o.swing === 'left' ? 'right' : 'left' }
}

// ---- doors and windows: they only touch a layer's opening map, so its lines stay the same

function withOpenings(plan: Plan, layerId: string, change: (openings: Record<string, Opening>) => boolean | void): Plan {
  const layer = findLayer(plan, layerId)
  if (!layer) return plan
  const openings = { ...layer.openings }
  return change(openings) === false ? plan : replaceLayer(plan, { ...layer, openings })
}

/** Adds a door or window to a segment of the layer; null when the segment does not exist. */
export function addOpening(plan: Plan, layerId: string, opening: Opening): { plan: Plan; id: string } | null {
  if (!findLayer(plan, layerId)?.segments[opening.segment]) return null
  let id = ''
  const next = withOpenings(plan, layerId, (openings) => {
    id = nextId('o', openings)
    openings[id] = opening
  })
  return { plan: next, id }
}

export type OpeningPatch = Partial<Pick<Opening, 'segment' | 'offset' | 'width' | 'hinge' | 'swing'>> & { style?: OpeningStyle; finish?: string; height?: number; sill?: number }

/** Changes a door or window; a style of the other kind is refused. The same plan when nothing changes. */
export function updateOpening(plan: Plan, layerId: string, id: string, patch: OpeningPatch): Plan {
  return withOpenings(plan, layerId, (openings) => {
    const o = openings[id]
    if (!o || (patch.style && !isStyleOf(o.kind, patch.style))) return false
    const next = { ...o, ...patch } as Opening
    // undefined takes a fireplace's finish off
    if ('finish' in next && next.finish === undefined) delete next.finish
    if ((Object.keys(next) as (keyof Opening)[]).every((k) => next[k] === o[k]) && Object.keys(next).length === Object.keys(o).length) return false
    openings[id] = next
  })
}

// ---- roofs: they only touch a layer's roof map, so its lines stay the same

function withRoofs(plan: Plan, layerId: string, change: (roofs: Record<string, Roof>) => boolean | void): Plan {
  const layer = findLayer(plan, layerId)
  if (!layer) return plan
  const roofs = { ...layer.roofs }
  return change(roofs) === false ? plan : replaceLayer(plan, { ...layer, roofs })
}

export function addRoof(plan: Plan, layerId: string, roof: Roof): { plan: Plan; id: string } | null {
  if (!findLayer(plan, layerId)) return null
  let id = ''
  const next = withRoofs(plan, layerId, (roofs) => {
    id = nextId('r', roofs)
    roofs[id] = roof
  })
  return { plan: next, id }
}

/** Changes a roof; the same plan when nothing changes. An edge index past the outline's end wraps round. */
export function updateRoof(plan: Plan, layerId: string, id: string, patch: Partial<Roof>): Plan {
  return withRoofs(plan, layerId, (roofs) => {
    const roof = roofs[id]
    if (!roof) return false
    const next = { ...roof, ...patch }
    next.edge %= next.outline.length
    // undefined takes a finish off
    for (const k of ['finish', 'soffit', 'skylights', 'lights'] as const) if (next[k] === undefined) delete next[k]
    if ((Object.keys(next) as (keyof Roof)[]).every((k) => next[k] === roof[k])) return false
    roofs[id] = next
  })
}

/** Moves whole roofs by `delta`, starting from their outlines in `from` (the plan before a drag). */
export function moveRoofs(plan: Plan, from: Plan, refs: readonly Ref[], delta: Vec): Plan {
  let next = plan
  for (const ref of refs) {
    const roof = ref.kind === 'roof' ? findLayer(from, ref.layer)?.roofs[ref.id] : undefined
    if (roof) next = updateRoof(next, ref.layer, ref.id, { outline: roof.outline.map((p) => ({ x: p.x + delta.x, y: p.y + delta.y })) })
  }
  return next
}

// ---- furniture: it only touches a layer's furniture map

function withFurniture(plan: Plan, layerId: string, change: (furniture: Record<string, Furniture>) => boolean | void): Plan {
  const layer = findLayer(plan, layerId)
  if (!layer) return plan
  const furniture = { ...layer.furniture }
  return change(furniture) === false ? plan : replaceLayer(plan, { ...layer, furniture })
}

/** Removes kitchen sinks whose counter is gone. */
export function pruneFurniture(d: Layer) {
  for (const [id, f] of Object.entries(d.furniture)) if (f.kind === 'sink' && f.style === 'kitchen' && d.furniture[f.counter]?.kind !== 'counter') delete d.furniture[id]
}

export function addFurniture(plan: Plan, layerId: string, item: Furniture): { plan: Plan; id: string } | null {
  if (!findLayer(plan, layerId)) return null
  let id = ''
  const next = withFurniture(plan, layerId, (furniture) => {
    id = nextId('f', furniture)
    furniture[id] = item
  })
  return { plan: next, id }
}

/** Replaces a piece of furniture; the same plan when nothing changes. */
export function updateFurniture(plan: Plan, layerId: string, id: string, item: Furniture): Plan {
  return withFurniture(plan, layerId, (furniture) => {
    const old = furniture[id]
    if (!old || JSON.stringify(old) === JSON.stringify(item)) return false
    furniture[id] = item
  })
}

/**
 * Moves furniture by `delta` from where it stood in `from` (the plan before a drag). A kitchen sink goes with its
 * counter, so it is not moved by itself.
 */
export function moveFurniture(plan: Plan, from: Plan, refs: readonly Ref[], delta: Vec): Plan {
  let next = plan
  for (const ref of refs) {
    const f = ref.kind === 'furniture' ? findLayer(from, ref.layer)?.furniture[ref.id] : undefined
    if (f && 'at' in f) next = updateFurniture(next, ref.layer, ref.id, { ...f, at: { x: f.at.x + delta.x, y: f.at.y + delta.y } })
  }
  return next
}

/** Turns furniture a quarter turn clockwise (or by `degrees`) where it stands; kitchen sinks turn with their counter. */
export function turnFurniture(plan: Plan, refs: readonly Ref[], degrees = 90): Plan {
  let next = plan
  for (const ref of refs) {
    const f = ref.kind === 'furniture' ? findLayer(next, ref.layer)?.furniture[ref.id] : undefined
    if (f && 'angle' in f) next = updateFurniture(next, ref.layer, ref.id, { ...f, angle: (((f.angle + degrees) % 360) + 360) % 360 })
  }
  return next
}

// ---- electrical boards and points: they only touch a layer's electrical map

function withElectrical(plan: Plan, layerId: string, change: (items: Record<string, Electrical>) => boolean | void): Plan {
  const layer = findLayer(plan, layerId)
  if (!layer) return plan
  const electrical = { ...layer.electrical }
  return change(electrical) === false ? plan : replaceLayer(plan, { ...layer, electrical })
}

export function addElectrical(plan: Plan, layerId: string, item: Electrical): { plan: Plan; id: string } | null {
  if (!findLayer(plan, layerId)) return null
  let id = ''
  const next = withElectrical(plan, layerId, (items) => {
    id = nextId('e', items)
    items[id] = item
  })
  return { plan: next, id }
}

/** Replaces a board or point; the same plan when nothing changes. Undefined fields are dropped (back to the usual). */
export function updateElectrical(plan: Plan, layerId: string, id: string, item: Electrical): Plan {
  return withElectrical(plan, layerId, (items) => {
    const old = items[id]
    const next = Object.fromEntries(Object.entries(item).filter(([, v]) => v !== undefined)) as Electrical
    if (!old || old.kind !== next.kind || JSON.stringify(old) === JSON.stringify(next)) return false
    items[id] = next
  })
}

/**
 * Sets the layers a board feeds. A layer feeds from one board only, so a layer another board fed moves to this one.
 * The same plan when nothing changes.
 */
export function setBoardLayers(plan: Plan, layerId: string, id: string, layers: readonly string[]): Plan {
  const board = findLayer(plan, layerId)?.electrical[id]
  if (board?.kind !== 'board') return plan
  const wanted = [...new Set(layers)].filter((l) => findLayer(plan, l))
  let next = plan
  for (const layer of plan.layers) {
    for (const [eid, e] of Object.entries(layer.electrical)) {
      if (e.kind !== 'board') continue
      const fed = layer.id === layerId && eid === id ? wanted : e.layers.filter((l) => !wanted.includes(l))
      if (fed.length !== e.layers.length || fed.some((l, i) => l !== e.layers[i])) next = updateElectrical(next, layer.id, eid, { ...e, layers: fed })
    }
  }
  return next
}

/** Sets the hand-drawn way of the cable into a point or a sub-board, or with null goes back to the worked-out one. */
export function setRoute(plan: Plan, layerId: string, id: string, route: readonly Vec[] | null): Plan {
  const item = findLayer(plan, layerId)?.electrical[id]
  if (!item) return plan
  return updateElectrical(plan, layerId, id, { ...item, route: route?.map((p) => ({ x: p.x, y: p.y })) })
}

/**
 * Adds a circuit defined by hand to a board, for the points of layer `forLayer` (usually one it feeds); its points
 * join it through `setPointCircuit`. Null when the board, or the layer, does not exist.
 */
export function addCircuit(plan: Plan, layerId: string, boardId: string, kind: CircuitKind, forLayer: string, name = ''): { plan: Plan; id: string } | null {
  const board = findLayer(plan, layerId)?.electrical[boardId]
  if (board?.kind !== 'board' || !findLayer(plan, forLayer)) return null
  const id = nextCircuitId(plan)
  const next = updateElectrical(plan, layerId, boardId, { ...board, circuits: { ...board.circuits, [id]: { type: kind, name, layer: forLayer } } })
  return { plan: next, id }
}

/**
 * A circuit id no board has and no point refers to, so a point's `circuit` names one circuit in the whole plan
 * (wherever its board is) and a point left on a deleted board's circuit is never taken by a new one.
 */
function nextCircuitId(plan: Plan): string {
  const used = new Set<string>()
  for (const layer of plan.layers) {
    for (const e of Object.values(layer.electrical)) {
      if (e.kind === 'board') for (const id of Object.keys(e.circuits)) used.add(id)
      else if (e.circuit) used.add(e.circuit)
    }
  }
  let n = used.size + 1
  while (used.has(`c${n}`)) n++
  return `c${n}`
}

/**
 * Moves a circuit defined by hand from one board to another, with its points (`members`, the points now on it), to
 * the end of the other's list: they are fed from there from now on. It keeps its id when no other board has it, else
 * gets a new one its points follow. Null when either board or the circuit is missing, or both boards are one.
 */
export function moveCircuit(
  plan: Plan,
  from: { layer: string; id: string },
  id: string,
  to: { layer: string; id: string },
  members: readonly { layer: string; id: string }[],
): { plan: Plan; id: string } | null {
  const source = findLayer(plan, from.layer)?.electrical[from.id]
  const target = findLayer(plan, to.layer)?.electrical[to.id]
  const def = source?.kind === 'board' ? source.circuits[id] : undefined
  if (source?.kind !== 'board' || target?.kind !== 'board' || !def || (from.layer === to.layer && from.id === to.id)) return null
  const shared = plan.layers.some((l) => Object.entries(l.electrical).some(([bid, e]) => e.kind === 'board' && !(l.id === from.layer && bid === from.id) && id in e.circuits))
  const newId = shared ? nextCircuitId(plan) : id
  const circuits = { ...source.circuits }
  delete circuits[id]
  let next = updateElectrical(plan, from.layer, from.id, { ...source, circuits })
  const moved = findLayer(next, to.layer)!.electrical[to.id] as Board
  next = updateElectrical(next, to.layer, to.id, { ...moved, circuits: { ...moved.circuits, [newId]: def } })
  if (newId !== id) for (const m of members) next = setPointCircuit(next, m.layer, m.id, newId)
  return { plan: next, id: newId }
}

/** Renames a circuit, or changes what it may hold; the same plan when nothing changes. */
export function updateCircuit(plan: Plan, layerId: string, boardId: string, id: string, patch: Partial<BoardCircuit>): Plan {
  const board = findLayer(plan, layerId)?.electrical[boardId]
  const circuit = board?.kind === 'board' ? board.circuits[id] : undefined
  if (!board || board.kind !== 'board' || !circuit) return plan
  const next = { ...circuit, ...patch }
  if (next.type === circuit.type && next.name === circuit.name && next.layer === circuit.layer) return plan
  return updateElectrical(plan, layerId, boardId, { ...board, circuits: { ...board.circuits, [id]: next } })
}

/** Removes a circuit defined by hand; its points go back to being grouped automatically. */
export function removeCircuit(plan: Plan, layerId: string, boardId: string, id: string): Plan {
  const board = findLayer(plan, layerId)?.electrical[boardId]
  if (board?.kind !== 'board' || !board.circuits[id]) return plan
  const circuits = { ...board.circuits }
  const layer = circuits[id].layer
  delete circuits[id]
  let next = updateElectrical(plan, layerId, boardId, { ...board, circuits })
  next = withElectrical(next, layer, (items) => {
    let changed = false
    for (const [pid, e] of Object.entries(items)) {
      if (e.kind !== 'board' && e.circuit === id) {
        items[pid] = { ...e, circuit: undefined }
        changed = true
      }
    }
    return changed
  })
  return next
}

/** Puts a point on a circuit defined by hand (its id on the layer's board), or with null back to automatic grouping. */
export function setPointCircuit(plan: Plan, layerId: string, id: string, circuit: string | null): Plan {
  const item = findLayer(plan, layerId)?.electrical[id]
  if (!item || item.kind === 'board' || (item.circuit ?? null) === circuit) return plan
  return updateElectrical(plan, layerId, id, { ...item, circuit: circuit ?? undefined })
}

/**
 * The sub-boards of a board that is gone: one in its enclosure goes with it (and so do its own, in turn); one on a
 * wall of its own is fed from the gone board's parent (`grandparent`), or with none becomes a main board feeding no
 * layer yet (its areas dropped).
 */
function detachChildren(plan: Plan, parent: { layer: string; id: string }, grandparent: { layer: string; board: string } | null): Plan {
  let next = plan
  for (const layer of plan.layers) {
    for (const [id, e] of Object.entries(layer.electrical)) {
      if (e.kind !== 'board' || e.parent?.layer !== parent.layer || e.parent.board !== parent.id) continue
      if (e.integrated) {
        next = withElectrical(next, layer.id, (items) => {
          delete items[id]
        })
        next = detachChildren(next, { layer: layer.id, id }, grandparent)
      } else if (grandparent && findLayer(next, grandparent.layer)?.electrical[grandparent.board]?.kind === 'board') {
        next = updateElectrical(next, layer.id, id, { ...e, parent: { ...grandparent } })
      } else next = updateElectrical(next, layer.id, id, { ...e, parent: undefined, areas: [] })
    }
  }
  return next
}

// ---- the HVAC's choices

/** Gives the areas among `refs` a radiant floor, or takes it off; the same plan when nothing changes. */
export function setAreaRadiant(plan: Plan, refs: readonly Ref[], radiant: boolean): Plan {
  let next = plan
  for (const layerId of new Set(refs.filter((r) => r.kind === 'area').map((r) => r.layer))) {
    next = withAreas(next, layerId, (areas) => {
      let changed = false
      for (const ref of refs) {
        const a = ref.layer === layerId && ref.kind === 'area' ? areas[ref.id] : undefined
        if (!a || !!a.radiant === radiant) continue
        const copy = { ...a }
        if (radiant) copy.radiant = true
        else delete copy.radiant
        areas[ref.id] = copy
        changed = true
      }
      return changed
    })
  }
  return next
}

/** Sets what the heating circuits are made of; undefined goes back to the usual (PEX). */
export function setHeatingMaterial(plan: Plan, material: HeatingMaterial | undefined): Plan {
  if (plan.hvac?.materials?.heating === material) return plan
  if (material === undefined) {
    const { hvac: _, ...rest } = plan
    return rest
  }
  return { ...plan, hvac: { ...plan.hvac, materials: { heating: material } } }
}

// ---- the plumbing's choices: plan-level, dropped when nothing is chosen

function withPlumbing(plan: Plan, next: PlumbingSettings): Plan {
  const materials = next.materials && Object.values(next.materials).some((m) => m !== undefined) ? next.materials : undefined
  const fixtures = next.fixtures && Object.keys(next.fixtures).length ? next.fixtures : undefined
  if (!materials && !fixtures) {
    if (!plan.plumbing) return plan
    const { plumbing: _, ...rest } = plan
    return rest
  }
  return { ...plan, plumbing: { ...(materials ? { materials } : {}), ...(fixtures ? { fixtures } : {}) } }
}

/** Sets what a network's pipes are made of; undefined goes back to the usual material. The same plan when nothing changes. */
export function setPipeMaterial(plan: Plan, network: PipeNetwork, material: PipeMaterial | undefined): Plan {
  if ((plan.plumbing?.materials?.[network] ?? undefined) === material) return plan
  const materials = { ...plan.plumbing?.materials } as Record<PipeNetwork, PipeMaterial | undefined>
  if (material === undefined) delete materials[network]
  else materials[network] = material
  return withPlumbing(plan, { ...plan.plumbing, materials: materials as PlumbingSettings['materials'] })
}

/** Sets what a fixture's connections or trap are made of (undefined: the usual); the fixture is a furniture ref. */
export function setFixturePlumbing(plan: Plan, ref: Ref, patch: Partial<FixturePlumbing>): Plan {
  const key = `${ref.layer}:${ref.id}`
  const was = plan.plumbing?.fixtures?.[key] ?? {}
  const next: FixturePlumbing = { ...was }
  for (const k of ['connection', 'trap'] as const) {
    if (!(k in patch)) continue
    if (patch[k] === undefined) delete next[k]
    else next[k] = patch[k]
  }
  if (next.connection === was.connection && next.trap === was.trap) return plan
  const fixtures = { ...plan.plumbing?.fixtures }
  if (next.connection === undefined && next.trap === undefined) delete fixtures[key]
  else fixtures[key] = next
  return withPlumbing(plan, { ...plan.plumbing, fixtures })
}

// ---- service equipment: it only touches a layer's service map

function withServices(plan: Plan, layerId: string, change: (services: Record<string, Service>) => boolean | void): Plan {
  const layer = findLayer(plan, layerId)
  if (!layer) return plan
  const services = { ...layer.services }
  return change(services) === false ? plan : replaceLayer(plan, { ...layer, services })
}

/** Puts a piece of equipment (a tank, a pump, a heater, a biodigestor…) on a layer. */
export function addService(plan: Plan, layerId: string, service: Service): { plan: Plan; id: string } | null {
  if (!findLayer(plan, layerId)) return null
  let id = ''
  const next = withServices(plan, layerId, (services) => {
    id = nextId('q', services)
    services[id] = service
  })
  return { plan: next, id }
}

/** Replaces a piece of equipment (moved, turned, resized, its hot water changed); the same plan when nothing changes. */
export function updateService(plan: Plan, layerId: string, id: string, service: Service): Plan {
  return withServices(plan, layerId, (services) => {
    const old = services[id]
    if (!old || JSON.stringify(old) === JSON.stringify(service)) return false
    services[id] = service
  })
}

/** Moves equipment by `delta` from where it stood in `from` (the plan before a drag). */
export function moveServices(plan: Plan, from: Plan, refs: readonly Ref[], delta: Vec): Plan {
  let next = plan
  for (const ref of refs) {
    const s = ref.kind === 'service' ? findLayer(from, ref.layer)?.services[ref.id] : undefined
    if (s) next = updateService(next, ref.layer, ref.id, { ...s, at: { x: s.at.x + delta.x, y: s.at.y + delta.y } })
  }
  return next
}

/** Turns equipment a quarter turn clockwise (or by `degrees`) where it stands. */
export function turnServices(plan: Plan, refs: readonly Ref[], degrees = 90): Plan {
  let next = plan
  for (const ref of refs) {
    const s = ref.kind === 'service' ? findLayer(next, ref.layer)?.services[ref.id] : undefined
    if (s) next = updateService(next, ref.layer, ref.id, { ...s, angle: (((s.angle + degrees) % 360) + 360) % 360 })
  }
  return next
}

/**
 * Sets the board a board is fed from (a sub-board, which feeds areas, not layers), or with null feeds it straight
 * from the meter (a main board, which feeds layers, not areas, and stands on its own wall); refused if that would
 * feed it from itself or from one of its own sub-boards (a loop). The same plan when nothing changes.
 */
export function setBoardParent(plan: Plan, layerId: string, id: string, parent: { layer: string; board: string } | null): Plan {
  const board = findLayer(plan, layerId)?.electrical[id]
  if (board?.kind !== 'board') return plan
  if (parent) {
    if (findLayer(plan, parent.layer)?.electrical[parent.board]?.kind !== 'board') return plan
    if (boardAndDescendants(plan, { layer: layerId, id }).has(boardKey({ layer: parent.layer, id: parent.board }))) return plan
  }
  if ((board.parent?.layer ?? null) === (parent?.layer ?? null) && (board.parent?.board ?? null) === (parent?.board ?? null)) return plan
  const next = { ...board }
  if (parent) {
    next.parent = { ...parent }
    next.layers = []
  } else {
    delete next.parent
    delete next.integrated
    next.areas = []
  }
  return updateElectrical(plan, layerId, id, next)
}

/**
 * Sets the areas a sub-board feeds. An area feeds from one sub-board only, so an area another sub-board fed moves to
 * this one. The same plan when nothing changes.
 */
export function setBoardAreas(plan: Plan, layerId: string, id: string, areas: readonly { layer: string; area: string }[]): Plan {
  const board = findLayer(plan, layerId)?.electrical[id]
  if (board?.kind !== 'board' || !board.parent) return plan
  const same = (a: { layer: string; area: string }, b: { layer: string; area: string }) => a.layer === b.layer && a.area === b.area
  const wanted = areas.filter((a, i) => findLayer(plan, a.layer)?.areas[a.area] && areas.findIndex((b) => same(a, b)) === i)
  let next = plan
  for (const layer of plan.layers) {
    for (const [eid, e] of Object.entries(layer.electrical)) {
      if (e.kind !== 'board' || !e.parent) continue
      const fed = layer.id === layerId && eid === id ? wanted : e.areas.filter((a) => !wanted.some((w) => same(a, w)))
      if (fed.length !== e.areas.length || fed.some((a, i) => !same(a, e.areas[i]))) next = updateElectrical(next, layer.id, eid, { ...e, areas: fed.map((a) => ({ ...a })) })
    }
  }
  return next
}

/** How far from its parent a sub-board taken out of its parent's enclosure starts, along the wall, m. */
const OUT_OF_ENCLOSURE = 0.6

/**
 * Puts a sub-board in its parent's enclosure (it takes its parent's place) or out of it, onto the wall beside its
 * parent, to be dragged where it goes. The same plan when nothing changes.
 */
export function setBoardIntegrated(plan: Plan, layerId: string, id: string, integrated: boolean): Plan {
  const layer = findLayer(plan, layerId)
  const board = layer?.electrical[id]
  if (!layer || board?.kind !== 'board' || !board.parent || !!board.integrated === integrated) return plan
  const place = boardPlace(plan, { layer, id, board: { ...board, integrated: true } })
  const next = { ...board, angle: place.angle }
  if (integrated) {
    next.integrated = true
    next.at = { ...place.at }
    delete next.route
  } else {
    delete next.integrated
    const f = frontOf(place.angle)
    next.at = add(place.at, mul({ x: -f.y, y: f.x }, OUT_OF_ENCLOSURE))
  }
  return updateElectrical(plan, layerId, id, next)
}

/** Changes where the plan is in the world (north, latitude…); the same plan when nothing changes. */
export function updateSite(plan: Plan, patch: Partial<Site>): Plan {
  const site = { ...plan.site, ...patch }
  return (Object.keys(site) as (keyof Site)[]).every((k) => site[k] === plan.site[k]) ? plan : { ...plan, site }
}

export function addLayer(plan: Plan, name?: string): { plan: Plan; id: string } {
  let n = plan.layers.length + 1
  while (findLayer(plan, `L${n}`)) n++
  const id = `L${n}`
  const color = LAYER_COLORS[plan.layers.length % LAYER_COLORS.length]
  return { plan: { ...plan, layers: [...plan.layers, createLayer(id, name ?? `Layer ${n}`, color)] }, id }
}

export type LayerPatch = Partial<Pick<Layer, 'name' | 'color' | 'visible' | 'locked' | 'level' | 'storey'>>

export function updateLayer(plan: Plan, id: string, patch: LayerPatch): Plan {
  const layer = findLayer(plan, id)
  if (!layer || Object.entries(patch).every(([key, value]) => layer[key as keyof LayerPatch] === value)) return plan
  return { ...plan, layers: plan.layers.map((l) => (l.id === id ? { ...l, ...patch } : l)) }
}

/** Removes a layer with everything on it; a plan keeps at least one. Returns an error message when refused. */
export function removeLayer(plan: Plan, id: string): Plan | string {
  if (plan.layers.length <= 1) return 'A plan keeps at least one layer.'
  const removed = findLayer(plan, id)
  // boards stop feeding it
  const layers = plan.layers.flatMap((l) => {
    if (l.id === id) return []
    const fed = Object.entries(l.electrical).filter(([, e]) => e.kind === 'board' && (e.layers.includes(id) || e.areas.some((a) => a.layer === id)))
    if (!fed.length) return [l]
    const electrical = { ...l.electrical }
    for (const [eid, e] of fed) if (e.kind === 'board') electrical[eid] = { ...e, layers: e.layers.filter((x) => x !== id), areas: e.areas.filter((a) => a.layer !== id) }
    return [{ ...l, electrical }]
  })
  let next: Plan = { ...plan, layers }
  // its boards' sub-boards on other layers: fed from the gone board's parent, or main boards
  for (const [eid, e] of Object.entries(removed?.electrical ?? {})) if (e.kind === 'board') next = detachChildren(next, { layer: id, id: eid }, e.parent && e.parent.layer !== id ? e.parent : null)
  return next
}

/** Moves a layer up (drawn later, +1) or down (-1) the stack. */
export function moveLayer(plan: Plan, id: string, step: 1 | -1): Plan {
  const i = plan.layers.findIndex((l) => l.id === id)
  const j = i + step
  if (i < 0 || j < 0 || j >= plan.layers.length) return plan
  const layers = [...plan.layers]
  ;[layers[i], layers[j]] = [layers[j], layers[i]]
  return { ...plan, layers }
}
