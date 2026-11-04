import { add, closestOnSegment, dist, EPS, lerp, mul, signedArea, sub, type Vec } from './geometry'
import { hasHinge, placeOpening, type PlacedOpening } from './openings'
import { segmentKind, type Layer, type Opening, type Plan, type Ref, type Roof } from './plan'
import { layerFaces, pointInPolygon, regionAt, type LayerFaces, type Region } from './regions'
import { eavesOf, offsetPolygon, PARAPET_WALL, roofFaces, roofPlanes, roofThickness, SLAB, underside, undersideAlong } from './roofs'
import { INTERIOR_WALL, layerWalls, wallHeight, type LayerWalls } from './walls'

/**
 * The house in 3-D, for the Exterior and Elevations tabs: solids made of flat faces, each solid of one material
 * of a basic palette (materials are not picked per surface yet). Everything comes from the plan:
 *
 * - walls at their thickness, joined as in plan (see walls.ts), as tall as their height, cut through by their
 *   doors, windows and gates, with the wall over a door or window and under a window;
 * - door and window frames, glass and closed leaves, and gate leaves;
 * - the floor of every named area;
 * - the roofs drawn on the Roof tab (see roofs.ts), a flat roof's parapet, and the walls that face outside
 *   filled up to the roof over them (a gable end);
 * - open edges under a roof as beams following its underside, on columns where no wall holds them.
 *
 * Only visible layers are built, as for the plan's shadows and totals.
 */

/** Tops of doors and windows, and windows' sills, in m above the floor; awnings (bathrooms, kitchens) sit high. */
export const DOOR_HEAD = 2.1
export const WINDOW_SILL = 0.9
export const HIGH_SILL = 1.5
/** A gate in an open edge (a fence) is this tall; in a wall, as tall as the wall. */
export const GATE_HEIGHT = 1.8
/** A beam along an open edge, under the roof. */
export const BEAM_DEPTH = 0.3
export const BEAM_WIDTH = 0.15
/** A square column's side. */
export const COLUMN = 0.2
export const FLOOR = 0.03

/** Each layer's floors sit this much higher than the layer's below, so overlapping ones do not flicker. */
const LAYER_LIFT = 0.004
/** Frame members: width on the face and depth across the wall; leaves and glass are thinner. */
const FRAME = 0.05
const FRAME_DEPTH = 0.07
const LEAF = 0.045
const GLASS = 0.012

export type SolidKind = 'wall' | 'lintel' | 'sill' | 'infill' | 'beam' | 'column' | 'frame' | 'glass' | 'leaf' | 'floor' | 'roof' | 'parapet'

/**
 * What a solid is made of: walls that face outside and the structure are `facade`, walls between rooms `interior`;
 * a pitched roof is `roof` and a flat one `slab`; covered floors are `floor` and floors in the open `paving`.
 */
export type SolidMaterial = 'facade' | 'interior' | 'roof' | 'slab' | 'frame' | 'glass' | 'door' | 'gate' | 'floor' | 'paving'

/** A point in 3-D: x and y on the plan (m, +y down), z up from the floor. */
export interface Vec3 {
  x: number
  y: number
  z: number
}

/** A flat face with the way it faces (out of its solid, unit length). */
export interface Face {
  pts: Vec3[]
  holes: Vec3[][]
  normal: Vec3
}

export interface Solid {
  kind: SolidKind
  faces: Face[]
  /** Its lowest and highest points. */
  bottom: number
  top: number
  material: SolidMaterial
  /** The plan item it is part of: a wall or an open edge, a door, window or gate, an area or a roof. */
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

/** Whether an area is covered: a room, or a space bounded by walls and open edges only (a gallery). */
export const isCovered = (region: Region): boolean => region.indoor || region.outline < EPS

// ---- faces ------------------------------------------------------------------------------------------------

const v3 = (p: Vec, z: number): Vec3 => ({ x: p.x, y: p.y, z })

const norm = (v: Vec3): Vec3 => {
  const l = Math.hypot(v.x, v.y, v.z)
  return { x: v.x / l, y: v.y / l, z: v.z / l }
}

/** Running clockwise on screen (positive area), so a ring's outside is to the right of each edge. */
const clockwise = (ring: readonly Vec[]): Vec[] => (signedArea(ring) < 0 ? [...ring].reverse() : [...ring])

/** The faces of an outline (with holes) standing between two heights. */
function prismFaces(outline: readonly Vec[], holes: readonly (readonly Vec[])[], bottom: number, top: number): Face[] {
  const outer = clockwise(outline)
  const inner = holes.map(clockwise)
  const faces: Face[] = [
    { pts: outer.map((p) => v3(p, bottom)), holes: inner.map((h) => h.map((p) => v3(p, bottom))), normal: { x: 0, y: 0, z: -1 } },
    { pts: outer.map((p) => v3(p, top)), holes: inner.map((h) => h.map((p) => v3(p, top))), normal: { x: 0, y: 0, z: 1 } },
  ]
  const sides = (ring: Vec[], out: 1 | -1) =>
    ring.forEach((p, i) => {
      const q = ring[(i + 1) % ring.length]
      const d = sub(q, p)
      if (Math.hypot(d.x, d.y) < 1e-9) return
      faces.push({ pts: [v3(p, bottom), v3(q, bottom), v3(q, top), v3(p, top)], holes: [], normal: norm({ x: d.y * out, y: -d.x * out, z: 0 }) })
    })
  sides(outer, 1)
  for (const h of inner) sides(h, -1)
  return faces
}

/**
 * The faces of a shape drawn in a vertical plane and given a thickness across it: `profile` is in (distance along
 * `dir` from `a`, height), and the solid stands `half` either side of the plane.
 */
function profileFaces(a: Vec, dir: Vec, half: number, profile: readonly [number, number][]): Face[] {
  const ring = signedArea(profile.map(([s, z]) => ({ x: s, y: z }))) < 0 ? [...profile].reverse() : [...profile]
  const w = { x: -dir.y, y: dir.x }
  const at = (s: number, z: number, side: number): Vec3 => ({ x: a.x + dir.x * s + w.x * side * half, y: a.y + dir.y * s + w.y * side * half, z })
  const faces: Face[] = [
    { pts: ring.map(([s, z]) => at(s, z, 1)), holes: [], normal: { x: w.x, y: w.y, z: 0 } },
    { pts: ring.map(([s, z]) => at(s, z, -1)), holes: [], normal: { x: -w.x, y: -w.y, z: 0 } },
  ]
  ring.forEach(([s0, z0], i) => {
    const [s1, z1] = ring[(i + 1) % ring.length]
    const [ds, dz] = [s1 - s0, z1 - z0]
    if (Math.hypot(ds, dz) < 1e-9) return
    // out of the profile, in its own plane: to the right of the edge
    faces.push({ pts: [at(s0, z0, 1), at(s1, z1, 1), at(s1, z1, -1), at(s0, z0, -1)], holes: [], normal: norm({ x: dir.x * dz, y: dir.y * dz, z: -ds }) })
  })
  return faces
}

function solid(kind: SolidKind, faces: Face[], material: SolidMaterial, ref: Ref): Solid {
  const zs = faces.flatMap((f) => f.pts.map((p) => p.z))
  return { kind, faces, bottom: Math.min(...zs), top: Math.max(...zs), material, ref }
}

const prism = (kind: SolidKind, outline: readonly Vec[], holes: readonly (readonly Vec[])[], bottom: number, top: number, material: SolidMaterial, ref: Ref) =>
  solid(kind, prismFaces(outline, holes, bottom, top), material, ref)

/** A roof's slab: each slope's face on top and under it, and its edge round the eaves. */
function roofSolidFaces(roof: Roof): Face[] {
  const planes = roofPlanes(roof)
  const eaves = eavesOf(roof)
  const t = roofThickness(roof)
  const k = roof.type === 'flat' ? 0 : Math.tan((roof.pitch * Math.PI) / 180)
  const onEaves = (p: Vec) => eaves.some((e, i) => closestOnSegment(p, e, eaves[(i + 1) % eaves.length]).dist < 1e-6)
  const faces: Face[] = []
  for (const face of roofFaces(roof)) {
    const z = (p: Vec) => underside(roof, planes, p)
    const up = norm({ x: -k * face.plane.a, y: -k * face.plane.b, z: 1 })
    faces.push({ pts: face.pts.map((p) => v3(p, z(p) + t)), holes: [], normal: up })
    faces.push({ pts: face.pts.map((p) => v3(p, z(p))), holes: [], normal: { x: -up.x, y: -up.y, z: -up.z } })
    face.pts.forEach((p, i) => {
      const q = face.pts[(i + 1) % face.pts.length]
      if (!onEaves(lerp(p, q, 0.5))) return
      const d = sub(q, p)
      faces.push({ pts: [v3(p, z(p)), v3(q, z(q)), v3(q, z(q) + t), v3(p, z(p) + t)], holes: [], normal: norm({ x: d.y, y: -d.x, z: 0 }) })
    })
  }
  return faces
}

// ---- a layer ----------------------------------------------------------------------------------------------

function layerSolids(layer: Layer, lift: number, source: SolidsSource, out: Solid[]) {
  const faces = source.faces(layer)
  const ref = (kind: Ref['kind'], id: string): Ref => ({ layer: layer.id, kind, id })
  const wallIds = Object.keys(layer.segments).filter((id) => segmentKind(layer.segments[id]) === 'wall')
  const finish = (id: string): SolidMaterial => (faces.exterior.has(id) ? 'facade' : 'interior')

  for (const [id, area] of Object.entries(layer.areas)) {
    const region = regionAt(faces.regions, area.at)
    if (region) out.push(prism('floor', region.outer, region.holes, lift, lift + FLOOR, isCovered(region) ? 'floor' : 'paving', ref('area', id)))
  }

  const walls = source.walls(layer)
  walls.fills.forEach((fill, i) => {
    const id = walls.owners[i]
    out.push(prism('wall', fill, [], 0, wallHeight(layer.segments[id]), finish(id), ref('segment', id)))
  })

  for (const [id, o] of Object.entries(layer.openings)) {
    const s = layer.segments[o.segment]
    const p = s && placeOpening(layer, o)
    if (!p) continue
    const half = (faces.thickness.get(o.segment) ?? INTERIOR_WALL) / 2
    const host = segmentKind(s) === 'wall' ? { height: wallHeight(s), material: finish(o.segment), ref: ref('segment', o.segment) } : null
    openingSolids(o, p, half, host, ref('opening', id), out)
  }

  // roofs, and what stands up to them
  const roofs = Object.entries(layer.roofs).map(([id, roof]) => ({ id, roof, eaves: eavesOf(roof), planes: roofPlanes(roof) }))
  for (const { id, roof, eaves } of roofs) {
    out.push(solid('roof', roofSolidFaces(roof), roof.type === 'flat' ? 'slab' : 'roof', ref('roof', id)))
    if (roof.type === 'flat' && roof.parapet > 0) {
      const base = roof.height + SLAB
      out.push(prism('parapet', eaves, [offsetPolygon(eaves, -PARAPET_WALL)], base, base + roof.parapet, 'facade', ref('roof', id)))
    }
  }
  /** The roof over a plan point with the highest underside there; a point on its edge (a gallery's front under the eaves) counts. */
  const covers = (eaves: readonly Vec[], p: Vec) => pointInPolygon(p, eaves) || eaves.some((e, i) => closestOnSegment(p, e, eaves[(i + 1) % eaves.length]).dist <= 0.01)
  const over = (p: Vec) => {
    let best: (typeof roofs)[number] | undefined
    for (const r of roofs) {
      if (covers(r.eaves, p) && (!best || underside(r.roof, r.planes, p) > underside(best.roof, best.planes, p))) best = r
    }
    return best?.roof
  }
  /** A wall or edge's underside profile under `roof`, as (distance along it, height). */
  const profile = (roof: Roof, a: Vec, b: Vec): [number, number][] => undersideAlong(roof, a, b).map(({ t, z }) => [t * dist(a, b), z])

  // walls that face outside rise to the roof over them: a gable end's triangle, a shed's high side
  for (const id of wallIds) {
    if (!faces.exterior.has(id)) continue
    const s = layer.segments[id]
    const [a, b] = [layer.vertices[s.a], layer.vertices[s.b]]
    const length = dist(a, b)
    const roof = length > EPS ? over(lerp(a, b, 0.5)) : undefined
    if (!roof) continue
    const top = wallHeight(s)
    const under = profile(roof, a, b)
    if (Math.max(...under.map(([, z]) => z)) <= top + 1e-3) continue
    const shape: [number, number][] = [[0, top], [length, top], ...under.reverse().map(([u, z]): [number, number] => [u, Math.max(z, top)])]
    out.push(solid('infill', profileFaces(a, mul(sub(b, a), 1 / length), (faces.thickness.get(id) ?? INTERIOR_WALL) / 2, shape), finish(id), ref('segment', id)))
  }

  // beams along open edges under a roof, following its underside, and columns at their ends that no wall holds (an
  // end within a wall's thickness of its line, joined to it or not)
  const heldByWall = (p: Vec) =>
    wallIds.some((id) => {
      const s = layer.segments[id]
      return closestOnSegment(p, layer.vertices[s.a], layer.vertices[s.b]).dist <= (faces.thickness.get(id) ?? 0) / 2 + EPS
    })
  const columns = new Map<string, { h: number; dir: Vec; ref: Ref }>()
  for (const [id, s] of Object.entries(layer.segments)) {
    if (segmentKind(s) !== 'open') continue
    const [a, b] = [layer.vertices[s.a], layer.vertices[s.b]]
    const length = dist(a, b)
    const roof = length > EPS ? over(lerp(a, b, 0.5)) : undefined
    if (!roof) continue
    const dir = mul(sub(b, a), 1 / length)
    const under = profile(roof, a, b)
    const shape: [number, number][] = [...under.map(([u, z]): [number, number] => [u, z - BEAM_DEPTH]), ...[...under].reverse()]
    out.push(solid('beam', profileFaces(a, dir, BEAM_WIDTH / 2, shape), 'facade', ref('segment', id)))
    for (const [v, z] of [
      [s.a, under[0][1]],
      [s.b, under[under.length - 1][1]],
    ] as const) {
      if (!heldByWall(layer.vertices[v]) && (columns.get(v)?.h ?? -Infinity) < z) columns.set(v, { h: z, dir, ref: ref('segment', id) })
    }
  }
  for (const [v, c] of columns) {
    const p = layer.vertices[v]
    const u = mul(c.dir, COLUMN / 2)
    out.push(prism('column', band(sub(p, u), add(p, u), COLUMN / 2), [], 0, c.h - BEAM_DEPTH, 'facade', c.ref))
  }
}

/** The rectangle `half` either side of the line from `a` to `b`. */
function band(a: Vec, b: Vec, half: number): Vec[] {
  const d = mul(sub(b, a), 1 / dist(a, b))
  const n = { x: -d.y * half, y: d.x * half }
  return [add(a, n), add(b, n), sub(b, n), sub(a, n)]
}

interface Host {
  /** The wall's own height. */
  height: number
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
    if (top - bottom > EPS && dist(outline[0], outline[1]) > EPS) out.push(prism(kind, outline, [], bottom, top, material, of))
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
  if (host) put('lintel', whole, head, host.height, host.material, host.ref)

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
