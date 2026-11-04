import { add, closestOnSegment, dist, EPS, lerp, mul, sub, type Vec } from './geometry'
import { band, frustumFaces, norm, prismFaces, profileFaces, ring, smoothSides, v3, type Face } from './faces'
import { COLUMNS, heldByWall, layerColonnades } from './colonnades'
import { placeFurniture } from './furniture'
import { furnitureParts } from './furniture3d'
import { besideWall, FIREPLACE_DEPTH, fireplaceShape, HEARTH, hasHinge, placeOpening, type PlacedOpening } from './openings'
import { segmentKind, type ColumnStyle, type Layer, type Opening, type Plan, type Ref, type Roof } from './plan'
import { layerFaces, pointInPolygon, regionAt, type LayerFaces, type Region } from './regions'
import { eavesOf, offsetPolygon, PARAPET_WALL, roofFaces, roofPlanes, roofThickness, SLAB, underside, undersideAlong } from './roofs'
import { INTERIOR_WALL, layerWalls, WALL_HEIGHT, wallHeight, type LayerWalls } from './walls'

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
 * - open edges under a roof as beams following its underside, on columns where no wall holds them; a colonnade's
 *   columns (Roman or metal) along its edge under its own beam, under a roof or not;
 * - fireplaces against their walls, with a chimney up through the roof over them;
 * - furniture and fixtures where they stand (see furniture3d.ts).
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
/** A chimney stands this far above the roof where it comes through (or above its wall with no roof over it). */
export const CHIMNEY_ABOVE = 1
/** A fireplace's surround is this tall, its mantel shelf on top. */
export const MANTEL = 1.1

/** Each layer's floors sit this much higher than the layer's below, so overlapping ones do not flicker. */
const LAYER_LIFT = 0.004
/** Frame members: width on the face and depth across the wall; leaves and glass are thinner. */
const FRAME = 0.05
const FRAME_DEPTH = 0.07
const LEAF = 0.045
const GLASS = 0.012

export type SolidKind =
  | 'wall'
  | 'lintel'
  | 'sill'
  | 'infill'
  | 'beam'
  | 'column'
  | 'frame'
  | 'glass'
  | 'leaf'
  | 'floor'
  | 'roof'
  | 'parapet'
  | 'fireplace'
  | 'chimney'
  | 'furniture'

/**
 * What a solid is made of: walls that face outside and the structure are `facade`, walls between rooms `interior`;
 * a pitched roof is `roof` and a flat one `slab`; covered floors are `floor` and floors in the open `paving`.
 * Roman columns are `stone` and metal ones `metal`; fireplaces and chimneys are `brick`, with a `soot` firebox.
 * Furniture adds `ceramic` (basins, tubs), `wood` and `fabric` (a bed's cover).
 */
export type SolidMaterial =
  | 'facade'
  | 'interior'
  | 'roof'
  | 'slab'
  | 'frame'
  | 'glass'
  | 'door'
  | 'gate'
  | 'floor'
  | 'paving'
  | 'stone'
  | 'metal'
  | 'brick'
  | 'soot'
  | 'ceramic'
  | 'wood'
  | 'fabric'

export type { Face, Vec3 } from './faces'

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

/**
 * One column standing from the floor to `top`, squared to `dir`. Roman: a plinth, a round base, a shaft that
 * narrows towards the top, a flaring capital and a square abacus. Metal: a round steel post between two plates.
 */
function columnFaces(style: ColumnStyle, p: Vec, top: number, dir: Vec): Face[] {
  const d = COLUMNS[style].diameter
  const square = (side: number) => band(sub(p, mul(dir, side / 2)), add(p, mul(dir, side / 2)), side / 2)
  if (style === 'metal') {
    return [...prismFaces(square(0.22), [], 0, 0.012), ...smoothSides(prismFaces(ring(p, d / 2, 12), [], 0.012, top - 0.012)), ...prismFaces(square(0.18), [], top - 0.012, top)]
  }
  const r = d / 2
  return [
    ...prismFaces(square(1.3 * d), [], 0, 0.08),
    ...smoothSides(prismFaces(ring(p, 1.12 * r, 20), [], 0.08, 0.16)),
    ...smoothSides(frustumFaces(p, r, 0.86 * r, 0.16, top - 0.2, 20)),
    ...smoothSides(frustumFaces(p, 0.88 * r, 1.25 * r, top - 0.2, top - 0.1, 20)),
    ...prismFaces(square(1.3 * d), [], top - 0.1, top),
  ]
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
    if (!p || o.kind === 'fireplace') continue
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

  // colonnades: their columns under a beam that follows the roof over them, or level at the walls' height
  const tallest = wallIds.length ? Math.max(...wallIds.map((id) => wallHeight(layer.segments[id]))) : WALL_HEIGHT
  const colonnadeColumns: Vec[] = []
  for (const c of layerColonnades(layer, faces.thickness)) {
    const info = COLUMNS[c.colonnade.style]
    const length = dist(c.a, c.b)
    const dir = mul(sub(c.b, c.a), 1 / length)
    const roof = over(lerp(c.a, c.b, 0.5))
    const under: [number, number][] = roof
      ? profile(roof, c.a, c.b)
      : [
          [0, tallest],
          [length, tallest],
        ]
    const material: SolidMaterial = c.colonnade.style === 'roman' ? 'stone' : 'metal'
    const shape: [number, number][] = [...under.map(([u, z]): [number, number] => [u, z - info.beam]), ...[...under].reverse()]
    const width = c.colonnade.style === 'roman' ? 1.1 * info.diameter : 0.12
    out.push(solid('beam', profileFaces(c.a, dir, width / 2, shape), material, ref('segment', c.segment)))
    for (const { t, p } of c.columns) {
      const top = heightAlong(under, t * length) - info.beam
      if (top > 0.6) out.push(solid('column', columnFaces(c.colonnade.style, p, top, dir), material, ref('segment', c.segment)))
      colonnadeColumns.push(p)
    }
  }

  // other open edges under a roof: beams following its underside, and columns at their ends that no wall or
  // colonnade holds
  const columns = new Map<string, { h: number; dir: Vec; ref: Ref }>()
  for (const [id, s] of Object.entries(layer.segments)) {
    if (segmentKind(s) !== 'open' || s.colonnade) continue
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
      const at = layer.vertices[v]
      if (heldByWall(layer, faces.thickness, at) || colonnadeColumns.some((q) => dist(q, at) < 1e-6)) continue
      if ((columns.get(v)?.h ?? -Infinity) < z) columns.set(v, { h: z, dir, ref: ref('segment', id) })
    }
  }
  for (const [v, c] of columns) {
    const p = layer.vertices[v]
    const u = mul(c.dir, COLUMN / 2)
    out.push(prism('column', band(sub(p, u), add(p, u), COLUMN / 2), [], 0, c.h - BEAM_DEPTH, 'facade', c.ref))
  }

  // fireplaces, each with a chimney up through the roof over it
  for (const [id, o] of Object.entries(layer.openings)) {
    const s = layer.segments[o.segment]
    const p = o.kind === 'fireplace' && s ? placeOpening(layer, o) : null
    if (!p) continue
    const half = (faces.thickness.get(o.segment) ?? INTERIOR_WALL) / 2
    const flue = fireplaceShape(p, o, half).flue
    const roof = over(mul(flue.reduce(add, { x: 0, y: 0 }), 1 / flue.length))
    fireplaceSolids(o, p, half, roof, wallHeight(s), ref('opening', id), out)
  }

  for (const [id, f] of Object.entries(layer.furniture)) {
    const pl = placeFurniture(layer, f)
    if (!pl) continue
    for (const part of furnitureParts(f, pl)) out.push(solid('furniture', part.faces, part.material, ref('furniture', id)))
  }
}

/** Height along a profile of (distance, height) points, in order of distance. */
function heightAlong(profile: readonly [number, number][], u: number): number {
  for (let i = 1; i < profile.length; i++) {
    const [u0, z0] = profile[i - 1]
    const [u1, z1] = profile[i]
    if (u <= u1 + 1e-9) return u1 - u0 < 1e-12 ? z1 : z0 + ((z1 - z0) * (u - u0)) / (u1 - u0)
  }
  return profile[profile.length - 1][1]
}

/**
 * A masonry fireplace on its side of the wall: a base, the cheeks and back round a dark firebox, a head under a
 * stone mantel shelf and a stone hearth before it; then its chimney, from the mantel up through the roof to
 * CHIMNEY_ABOVE over it (over its wall, with no roof), under a stone cap.
 */
function fireplaceSolids(o: Opening, p: PlacedOpening, half: number, roof: Roof | undefined, wall: number, ref: Ref, out: Solid[]) {
  const w = dist(p.start, p.end)
  const rect = besideWall(p, o, half)
  const d = FIREPLACE_DEPTH
  const fire = Math.min(0.75, w * 0.6)
  const [f0, f1] = [(w - fire) / 2, (w + fire) / 2]
  const put = (kind: SolidKind, outline: Vec[], bottom: number, top: number, material: SolidMaterial) => out.push(prism(kind, outline, [], bottom, top, material, ref))
  put('fireplace', rect(-0.1, w + 0.1, d, d + HEARTH), 0, 0.04, 'stone')
  put('fireplace', rect(0, w, 0, d), 0, 0.15, 'brick')
  put('fireplace', rect(0, f0, 0, d), 0.15, 0.75, 'brick')
  put('fireplace', rect(f1, w, 0, d), 0.15, 0.75, 'brick')
  put('fireplace', rect(f0, f1, 0, d * 0.35), 0.15, 0.75, 'brick')
  put('fireplace', rect(f0, f1, d * 0.35, d - 0.02), 0.15, 0.75, 'soot')
  put('fireplace', rect(0, w, 0, d), 0.75, MANTEL, 'brick')
  put('fireplace', rect(-0.05, w + 0.05, 0, d + 0.05), MANTEL, MANTEL + 0.06, 'stone')
  const flue = fireplaceShape(p, o, half).flue
  let top = wall + CHIMNEY_ABOVE
  if (roof) {
    const planes = roofPlanes(roof)
    top = Math.max(...flue.map((q) => underside(roof, planes, q))) + roofThickness(roof) + (roof.type === 'flat' ? roof.parapet : 0) + CHIMNEY_ABOVE
  }
  put('chimney', flue, MANTEL + 0.06, top, 'brick')
  put('chimney', offsetPolygon(flue, 0.05), top, top + 0.06, 'stone')
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
