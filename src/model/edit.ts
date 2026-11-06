import { closestOnSegment, dist, EPS, lerp, type Vec } from './geometry'
import {
  createLayer,
  findLayer,
  isEditable,
  LAYER_COLORS,
  segmentKind,
  type Area,
  type Colonnade,
  type Furniture,
  type Layer,
  type Opening,
  type OpeningStyle,
  type Plan,
  type Ref,
  type Roof,
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

/** A copy of `layer` whose vertex, segment, area, opening and roof maps may be written to. */
export function draftLayer(layer: Layer): Layer {
  return {
    ...layer,
    vertices: { ...layer.vertices },
    segments: { ...layer.segments },
    areas: { ...layer.areas },
    openings: { ...layer.openings },
    roofs: { ...layer.roofs },
    furniture: { ...layer.furniture },
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
    next = editLayer(next, layerId, (d) => {
      for (const ref of refs) {
        if (ref.layer !== layerId) continue
        if (ref.kind === 'segment') delete d.segments[ref.id]
        else if (ref.kind === 'area') delete d.areas[ref.id]
        else if (ref.kind === 'opening') delete d.openings[ref.id]
        else if (ref.kind === 'roof') delete d.roofs[ref.id]
        else if (ref.kind === 'furniture') delete d.furniture[ref.id]
        else for (const id of segmentsAt(d, ref.id)) delete d.segments[id]
      }
      removeOrphans(d)
      pruneOpenings(d)
      pruneFurniture(d)
    })
  }
  return next
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

export type OpeningPatch = Partial<Pick<Opening, 'segment' | 'offset' | 'width' | 'hinge' | 'swing'>> & { style?: OpeningStyle; finish?: string }

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
    for (const k of ['finish', 'soffit'] as const) if (next[k] === undefined) delete next[k]
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

export type LayerPatch = Partial<Pick<Layer, 'name' | 'color' | 'visible' | 'locked' | 'level'>>

export function updateLayer(plan: Plan, id: string, patch: LayerPatch): Plan {
  const layer = findLayer(plan, id)
  if (!layer || Object.entries(patch).every(([key, value]) => layer[key as keyof LayerPatch] === value)) return plan
  return { ...plan, layers: plan.layers.map((l) => (l.id === id ? { ...l, ...patch } : l)) }
}

/** Removes a layer with everything on it; a plan keeps at least one. Returns an error message when refused. */
export function removeLayer(plan: Plan, id: string): Plan | string {
  if (plan.layers.length <= 1) return 'A plan keeps at least one layer.'
  return { ...plan, layers: plan.layers.filter((l) => l.id !== id) }
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
