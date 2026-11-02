import { add, closestOnSegment, dist, EPS, lerp, mul, sub, type Vec } from './geometry'
import { hasHinge, placeOpening, type PlacedOpening } from './openings'
import { segmentKind, type Layer, type Opening, type Plan, type Ref } from './plan'
import { layerFaces, regionAt, type LayerFaces, type Region } from './regions'
import { INTERIOR_WALL, layerWalls, WALL_HEIGHT, wallHeight, type LayerWalls } from './walls'

/**
 * The house in 3-D, for the Exterior tab: prisms, each an outline on the plan extruded between two heights above
 * the ground (m) and made of one material of a basic palette (materials are not picked per surface yet).
 * Everything comes from the plan:
 *
 * - walls at their thickness, joined as in plan (see walls.ts), as tall as their height or up to the top of the
 *   roof they carry, cut through by their doors, windows and gates, with the wall over a door or window and under
 *   a window;
 * - door and window frames, glass and closed leaves, and gate leaves;
 * - open edges along a roofed area as beams under its roof, on columns where no wall holds them;
 * - the floor of every named area, and a flat roof over the covered ones: rooms, and spaces that only walls and
 *   open edges bound (a gallery). An area an outline bounds (a pool, a terrace) is open to the sky.
 *
 * Only visible layers are built, as for the plan's shadows and totals.
 */

/** Tops of doors and windows, and windows' sills, in m above the floor; awnings (bathrooms, kitchens) sit high. */
export const DOOR_HEAD = 2.1
export const WINDOW_SILL = 0.9
export const HIGH_SILL = 1.5
/** A gate in an open edge (a fence) is this tall; in a wall, as tall as the wall. */
export const GATE_HEIGHT = 1.8
/** A flat roof's slab. */
export const ROOF_SLAB = 0.2
/** A beam along an open edge, under the roof. */
export const BEAM_DEPTH = 0.3
export const BEAM_WIDTH = 0.15
/** A square column's side. */
export const COLUMN = 0.2
export const FLOOR = 0.03

/** Walls under a roof stop this far under its top, so the two tops do not flicker where they overlap. */
const ROOF_LIP = 0.01
/** Each layer's floors sit this much higher than the layer's below, for the same reason. */
const LAYER_LIFT = 0.004
/** Frame members: width on the face and depth across the wall; leaves and glass are thinner. */
const FRAME = 0.05
const FRAME_DEPTH = 0.07
const LEAF = 0.045
const GLASS = 0.012

export type SolidKind = 'wall' | 'lintel' | 'sill' | 'beam' | 'column' | 'frame' | 'glass' | 'leaf' | 'floor' | 'roof'

/**
 * What a solid is made of: walls that face outside and the structure are `facade`, walls between rooms `interior`;
 * covered floors are `floor` and floors in the open `paving`.
 */
export type SolidMaterial = 'facade' | 'interior' | 'roof' | 'frame' | 'glass' | 'door' | 'gate' | 'floor' | 'paving'

export interface Solid {
  kind: SolidKind
  /** The outline on the plan (m, +y down; either way round) and its holes. */
  outline: Vec[]
  holes: Vec[][]
  bottom: number
  top: number
  material: SolidMaterial
  /** The plan item it is part of: a wall or an open edge, a door, window or gate, or an area. */
  ref: Ref
}

/** Where a layer's regions and walls come from: worked out here, or the editor's caches (see derived.ts). */
export interface SolidsSource {
  faces: (layer: Layer) => LayerFaces
  walls: (layer: Layer) => LayerWalls
}

const direct: SolidsSource = { faces: layerFaces, walls: (layer) => layerWalls(layer, layerFaces(layer).thickness) }

export function houseSolids(plan: Plan, source: SolidsSource = direct): Solid[] {
  const out: Solid[] = []
  plan.layers.forEach((layer, index) => {
    if (layer.visible) layerSolids(layer, index * LAYER_LIFT, source, out)
  })
  return out
}

/** Whether an area's region gets a roof: a room, or a space bounded by walls and open edges only. */
export const isRoofed = (region: Region): boolean => region.indoor || region.outline < EPS

function layerSolids(layer: Layer, lift: number, source: SolidsSource, out: Solid[]) {
  const faces = source.faces(layer)
  const ref = (kind: Ref['kind'], id: string): Ref => ({ layer: layer.id, kind, id })
  const wallIds = Object.keys(layer.segments).filter((id) => segmentKind(layer.segments[id]) === 'wall')
  const tallest = (ids: readonly string[]) => (ids.length ? Math.max(...ids.map((id) => wallHeight(layer.segments[id]))) : WALL_HEIGHT)

  // floors of the named areas, and roofs over the covered ones at the height of their tallest wall
  const roofs = new Map<Region, number>()
  for (const [id, area] of Object.entries(layer.areas)) {
    const region = regionAt(faces.regions, area.at)
    if (!region) continue
    const roofed = isRoofed(region)
    out.push({ kind: 'floor', outline: region.outer, holes: region.holes, bottom: lift, top: lift + FLOOR, material: roofed ? 'floor' : 'paving', ref: ref('area', id) })
    if (!roofed || roofs.has(region)) continue
    const h = tallest(region.wallIds.length ? region.wallIds : wallIds)
    roofs.set(region, h)
    out.push({ kind: 'roof', outline: region.outer, holes: region.holes, bottom: h, top: h + ROOF_SLAB, material: 'roof', ref: ref('area', id) })
  }

  // walls carrying a roof rise to its top
  const carried = new Map<string, number>()
  for (const [region, h] of roofs) for (const id of region.wallIds) carried.set(id, Math.max(carried.get(id) ?? 0, h + ROOF_SLAB - ROOF_LIP))
  const top = (id: string) => Math.max(wallHeight(layer.segments[id]), carried.get(id) ?? 0)
  const finish = (id: string): SolidMaterial => (faces.exterior.has(id) ? 'facade' : 'interior')

  const walls = source.walls(layer)
  walls.fills.forEach((fill, i) => {
    const id = walls.owners[i]
    out.push({ kind: 'wall', outline: fill, holes: [], bottom: 0, top: top(id), material: finish(id), ref: ref('segment', id) })
  })

  for (const [id, o] of Object.entries(layer.openings)) {
    const s = layer.segments[o.segment]
    const p = s && placeOpening(layer, o)
    if (!p) continue
    const inWall = segmentKind(s) === 'wall'
    const half = (faces.thickness.get(o.segment) ?? INTERIOR_WALL) / 2
    const host = inWall ? { height: wallHeight(s), top: top(o.segment), material: finish(o.segment), ref: ref('segment', o.segment) } : null
    openingSolids(o, p, half, host, ref('opening', id), out)
  }

  // beams along the open edges of roofed areas, under the roof, and columns at their ends that no wall holds (an
  // end within a wall's thickness of its line, joined to it or not)
  const heldByWall = (p: Vec) =>
    wallIds.some((id) => {
      const s = layer.segments[id]
      return closestOnSegment(p, layer.vertices[s.a], layer.vertices[s.b]).dist <= (faces.thickness.get(id) ?? 0) / 2 + EPS
    })
  const columns = new Map<string, { h: number; dir: Vec; ref: Ref }>()
  for (const [id, s] of Object.entries(layer.segments)) {
    if (segmentKind(s) !== 'open') continue
    const a = layer.vertices[s.a]
    const b = layer.vertices[s.b]
    const length = dist(a, b)
    if (length < EPS) continue
    const dir = mul(sub(b, a), 1 / length)
    const across = { x: -dir.y * 0.05, y: dir.x * 0.05 }
    const mid = lerp(a, b, 0.5)
    const sides = [add(mid, across), sub(mid, across)].map((q) => roofs.get(regionAt(faces.regions, q)!) ?? 0)
    const h = Math.max(...sides)
    if (!h) continue
    out.push({ kind: 'beam', outline: band(a, b, BEAM_WIDTH / 2), holes: [], bottom: h - BEAM_DEPTH, top: h, material: 'facade', ref: ref('segment', id) })
    for (const v of [s.a, s.b]) {
      if (!heldByWall(layer.vertices[v]) && (columns.get(v)?.h ?? 0) < h) columns.set(v, { h, dir, ref: ref('segment', id) })
    }
  }
  for (const [v, c] of columns) {
    const p = layer.vertices[v]
    const u = mul(c.dir, COLUMN / 2)
    out.push({ kind: 'column', outline: band(sub(p, u), add(p, u), COLUMN / 2), holes: [], bottom: 0, top: c.h - BEAM_DEPTH, material: 'facade', ref: c.ref })
  }
}

/** The rectangle `half` either side of the line from `a` to `b`. */
function band(a: Vec, b: Vec, half: number): Vec[] {
  const d = mul(sub(b, a), 1 / dist(a, b))
  const n = { x: -d.y * half, y: d.x * half }
  return [add(a, n), add(b, n), sub(b, n), sub(a, n)]
}

interface Host {
  /** The wall's own height, and where its top is (higher when it carries a roof). */
  height: number
  top: number
  material: SolidMaterial
  ref: Ref
}

/**
 * A door, window or gate: the wall over it and, for a window, under it (when it is in a wall), then its frame,
 * glass and leaves, closed. Positions along it run from its start (`u`, m) and across the wall from its line
 * (`v`, m, to the left of the segment's a→b).
 */
function openingSolids(o: Opening, p: PlacedOpening, half: number, host: Host | null, ref: Ref, out: Solid[]) {
  const w = dist(p.start, p.end)
  const at = (u: number, v: number) => add(add(p.start, mul(p.dir, u)), mul(p.left, v))
  const box = (u0: number, u1: number, v0: number, v1: number) => [at(u0, v0), at(u1, v0), at(u1, v1), at(u0, v1)]
  const put = (kind: SolidKind, outline: Vec[], bottom: number, top: number, material: SolidMaterial, of = ref) => {
    if (top - bottom > EPS && dist(outline[0], outline[1]) > EPS) out.push({ kind, outline, holes: [], bottom, top, material, ref: of })
  }
  const frame = (u0: number, u1: number, bottom: number, top: number) => put('frame', box(u0, u1, -FRAME_DEPTH / 2, FRAME_DEPTH / 2), bottom, top, 'frame')
  const glass = (u0: number, u1: number, v: number, bottom: number, top: number) => put('glass', box(u0, u1, v - GLASS / 2, v + GLASS / 2), bottom, top, 'glass')
  const leaf = (u0: number, u1: number, bottom: number, top: number, material: SolidMaterial, depth = LEAF) => put('leaf', box(u0, u1, -depth / 2, depth / 2), bottom, top, material)
  const whole = box(0, w, -half, half)

  if (o.kind === 'gate') {
    // no wall over a gate: it is as tall as its wall, or a fence's usual height
    const h = host ? host.height : GATE_HEIGHT
    if (o.style === 'double') {
      leaf(0.02, w / 2 - 0.01, 0.05, h, 'gate', 0.05)
      leaf(w / 2 + 0.01, w - 0.02, 0.05, h, 'gate', 0.05)
    } else leaf(0.02, w - 0.02, 0.05, h, 'gate', 0.05)
    return
  }

  const head = host ? Math.min(DOOR_HEAD, host.height) : DOOR_HEAD
  if (host) put('lintel', whole, head, host.top, host.material, host.ref)

  if (o.kind === 'window') {
    const sill = Math.min(o.style === 'awning' ? HIGH_SILL : WINDOW_SILL, head - 0.3)
    if (host) put('sill', whole, 0, sill, host.material, host.ref)
    frame(0, FRAME, sill, head)
    frame(w - FRAME, w, sill, head)
    frame(FRAME, w - FRAME, sill, sill + FRAME)
    frame(FRAME, w - FRAME, head - FRAME, head)
    if (o.style === 'sliding' || (o.style === 'casement' && !hasHinge(o))) frame(w / 2 - FRAME / 2, w / 2 + FRAME / 2, sill + FRAME, head - FRAME)
    if (o.style === 'double-hung') frame(FRAME, w - FRAME, (sill + head) / 2 - FRAME / 2, (sill + head) / 2 + FRAME / 2)
    glass(FRAME, w - FRAME, 0, sill + FRAME, head - FRAME)
    return
  }

  frame(0, FRAME, 0, head)
  frame(w - FRAME, w, 0, head)
  frame(FRAME, w - FRAME, head - FRAME, head)
  if (o.style === 'sliding') {
    // two glass panels, one behind the other, meeting on a stile
    glass(FRAME, w / 2 + FRAME / 2, -0.02, 0, head - FRAME)
    glass(w / 2 - FRAME / 2, w - FRAME, 0.02, 0, head - FRAME)
    frame(w / 2 - FRAME / 2, w / 2 + FRAME / 2, 0, head - FRAME)
  } else if (o.style === 'double') {
    leaf(FRAME, w / 2 - 0.005, 0.01, head - FRAME, 'door')
    leaf(w / 2 + 0.005, w - FRAME, 0.01, head - FRAME, 'door')
  } else leaf(FRAME, w - FRAME, 0.01, head - FRAME, 'door')
}
