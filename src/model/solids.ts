import { add, closestOnSegment, dist, EPS, lerp, mul, sub, type Vec } from './geometry'
import { band, clipFace, frustumFaces, norm, prismFaces, profileFaces, ring, smoothSides, v3, type Face, type Vec3 } from './faces'
import { COLUMNS, heldByWall, layerColonnades } from './colonnades'
import { placeFurniture } from './furniture'
import { furnitureParts } from './furniture3d'
import { sideNormal, wallSide, type WallSide } from './finishes'
import { findMaterial } from './materials'
import { besideWall, FIREPLACE_DEPTH, fireplaceShape, HEARTH, hasHinge, PARRILLA_CHEEK, PARRILLA_DEPTH, placeOpening, type PlacedOpening } from './openings'
import { segmentKind, type ColumnStyle, type Layer, type Opening, type Plan, type Ref, type Roof } from './plan'
import { layerFaces, pointInPolygon, regionAt, type LayerFaces, type Region } from './regions'
import { eavesOf, offsetPolygon, PARAPET_WALL, roofFaces, roofPlanes, roofThickness, SLAB, underside, undersideAlong, unionOutlines } from './roofs'
import { EXTERIOR_WALL, INTERIOR_WALL, layerWalls, WALL_HEIGHT, wallHeight, type LayerWalls } from './walls'

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
/** A lot's ground cover (a lawn), under the floors that stand on it. */
export const GROUND = 0.01
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
  | 'foliage'
  | 'bark'

export type { Face, Vec3 } from './faces'

export interface Solid {
  kind: SolidKind
  faces: Face[]
  /** Its lowest and highest points. */
  bottom: number
  top: number
  material: SolidMaterial
  /** A material id it is finished in all over, over `material`: an area's floor. */
  finish?: string
  /** An opening it needs in the ground (and in a lot's lawn): a pool's rim. */
  hole?: Vec[]
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
  // pools, wherever they are drawn, open the ground and the lawns over them: each pool whole, its steps with it
  const pools = plan.layers.flatMap((layer) => {
    if (!layer.visible) return []
    const regions = source.faces(layer).regions
    const deep = Object.values(layer.areas).flatMap((a) => {
      const r = a.depth ? regionAt(regions, a.at) : null
      return r ? [r.outer] : []
    })
    return deep.length ? unionOutlines(deep) : []
  })
  plan.layers.forEach((layer, index) => {
    if (!layer.visible) return
    const start = out.length
    layerSolids(layer, index * LAYER_LIFT, source, out, pools)
    // a raised layer: everything on it up to its floor level (but what is under the ground), on its groundworks
    const level = layer.level ?? 0
    if (level <= 0) return
    for (const s of out.slice(start)) if (s.bottom >= -1e-6) raise(s, level)
    out.push(...groundworks(layer, level, source))
  })
  return out
}

function raise(s: Solid, dz: number) {
  const up = (p: Vec3): Vec3 => ({ ...p, z: p.z + dz })
  s.faces = s.faces.map((f) => ({ ...f, pts: f.pts.map(up), holes: f.holes.map((h) => h.map(up)) }))
  s.bottom += dz
  s.top += dz
}

/** Steps: each this high at most and this deep, m. */
const STEP = { rise: 0.18, tread: 0.3 }

/**
 * What a raised layer stands on: a plinth under its covered areas (rooms and galleries) out to its walls' outside
 * faces, from the ground to its floor level; and steps down to the ground outside its doors to the outside and along
 * its galleries' open edges, as many as keep each under STEP.rise.
 */
function groundworks(layer: Layer, level: number, source: SolidsSource): Solid[] {
  const faces = source.faces(layer)
  const out: Solid[] = []
  const placed = Object.entries(layer.areas).flatMap(([id, a]) => {
    const r = regionAt(faces.regions, a.at)
    return r && isCovered(r) && !a.lot && !a.depth ? [{ id, r }] : []
  })
  if (!placed.length) return out
  const covered = new Set(placed.map((p) => p.r))
  const areaRef: Ref = { layer: layer.id, kind: 'area', id: placed[0].id }
  for (const ring of unionOutlines([...covered].map((r) => r.outer))) out.push(prism('floor', offsetPolygon(ring, EXTERIOR_WALL / 2), [], 0, level, 'slab', areaRef))

  const risers = Math.max(1, Math.ceil(level / STEP.rise - 1e-9))
  const rise = level / risers
  /** The steps before a stretch of `w` m, `rect` giving rectangles out from it (along, from, to). */
  const steps = (rect: (u0: number, u1: number, v0: number, v1: number) => Vec[], w: number, ref: Ref) => {
    for (let k = 1; k < risers; k++) out.push(prism('floor', rect(0, w, (k - 1) * STEP.tread, k * STEP.tread), [], 0, level - k * rise, 'stone', ref))
  }
  const outside = (q: Vec) => {
    const r = regionAt(faces.regions, q)
    return !r || !covered.has(r)
  }
  // doors to the outside
  for (const [id, o] of Object.entries(layer.openings)) {
    const s = layer.segments[o.segment]
    const p = o.kind === 'door' && s ? placeOpening(layer, o) : null
    if (!p) continue
    const half = (faces.thickness.get(o.segment) ?? INTERIOR_WALL) / 2
    for (const side of ['left', 'right'] as WallSide[]) {
      const { region } = wallSide(layer, faces.regions, half, o.segment, side)
      if (region && covered.has(region)) continue
      const w = dist(p.start, p.end) + 0.3
      const rect = besideWall({ ...p, start: add(p.start, mul(p.dir, -0.15)) }, { swing: side }, half)
      steps(rect, w, { layer: layer.id, kind: 'opening', id })
    }
  }
  // the open edges of galleries
  for (const [id, s] of Object.entries(layer.segments)) {
    if (segmentKind(s) !== 'open') continue
    const [a, b] = [layer.vertices[s.a], layer.vertices[s.b]]
    const w = dist(a, b)
    if (w < EPS) continue
    const dir = mul(sub(b, a), 1 / w)
    const mid = lerp(a, b, 0.5)
    for (const side of ['left', 'right'] as WallSide[]) {
      const n = sideNormal(a, b, side)
      if (outside(add(mid, mul(n, -0.3))) || !outside(add(mid, mul(n, 0.3)))) continue
      const rect = (u0: number, u1: number, v0: number, v1: number): Vec[] =>
        [
          [u0, v0],
          [u1, v0],
          [u1, v1],
          [u0, v1],
        ].map(([u, v]) => add(add(a, mul(dir, u)), mul(n, EXTERIOR_WALL / 2 + v)))
      steps(rect, w, { layer: layer.id, kind: 'segment', id })
    }
  }
  return out
}

/** How far below a pool's rim its water is, m. */
export const POOL_WATER = 0.1

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

/** The upward normal of a ring of points that are (near enough) in one plane, by Newell's method. */
function upward(pts: readonly Vec3[]): Vec3 {
  const n = { x: 0, y: 0, z: 0 }
  pts.forEach((p, i) => {
    const q = pts[(i + 1) % pts.length]
    n.x += (p.y - q.y) * (p.z + q.z)
    n.y += (p.z - q.z) * (p.x + q.x)
    n.z += (p.x - q.x) * (p.y + q.y)
  })
  const u = norm(n)
  return u.z < 0 ? { x: -u.x, y: -u.y, z: -u.z } : u
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

function layerSolids(layer: Layer, lift: number, source: SolidsSource, out: Solid[], pools: readonly Vec[][]) {
  const faces = source.faces(layer)
  const ref = (kind: Ref['kind'], id: string): Ref => ({ layer: layer.id, kind, id })
  const wallIds = Object.keys(layer.segments).filter((id) => segmentKind(layer.segments[id]) === 'wall')
  const finish = (id: string): SolidMaterial => (faces.exterior.has(id) ? 'facade' : 'interior')

  // the depth of each pool (and step of one) on the layer, by its region
  const poolDepths = new Map<Region, number>()
  for (const a of Object.values(layer.areas)) {
    const r = a.depth ? regionAt(faces.regions, a.at) : null
    if (r) poolDepths.set(r, a.depth!)
  }
  for (const [id, area] of Object.entries(layer.areas)) {
    const region = regionAt(faces.regions, area.at)
    if (!region) continue
    // a lot is the ground itself unless it is finished, then a thin cover the house's floors stand on, open over
    // the pools in it
    if (area.lot) {
      const open = pools.filter((pool) => pool.every((p) => pointInPolygon(p, region.outer)))
      if (findMaterial(area.floor)) out.push({ ...prism('floor', region.outer, [...region.holes, ...open], lift, lift + GROUND, 'paving', ref('area', id)), finish: area.floor })
      continue
    }
    // a pool: its lining, walls and floor facing in, sunk into the ground, and its water just under the rim. The
    // lining is its floor material (white tile when that is water itself)
    if (area.depth) {
      const material = findMaterial(area.floor)
      const deep = area.depth
      // its floor, and its sides: down from the rim, or from the floor of a shallower part of the pool beside it (a
      // step), so no wall stands up through the water between them
      const bottom = prismFaces(region.outer, region.holes, lift - deep, lift).find((f) => f.normal.z < -0.5)!
      const lining: Face[] = [{ ...bottom, normal: { x: 0, y: 0, z: 1 } }]
      const inside = (q: Vec) => pointInPolygon(q, region.outer) && !region.holes.some((h) => pointInPolygon(q, h))
      for (const ring of [region.outer, ...region.holes]) {
        ring.forEach((a, i) => {
          const b = ring[(i + 1) % ring.length]
          const len = dist(a, b)
          if (len < EPS) return
          const mid = lerp(a, b, 0.5)
          let n = { x: (b.y - a.y) / len, y: -(b.x - a.x) / len }
          if (inside(add(mid, mul(n, 0.02)))) n = mul(n, -1)
          const beside = regionAt(faces.regions, add(mid, mul(n, 0.05)))
          const next = (beside && poolDepths.get(beside)) ?? 0
          if (next >= deep - 1e-9) return
          lining.push({ pts: [v3(a, lift - deep), v3(b, lift - deep), v3(b, lift - next), v3(a, lift - next)], holes: [], normal: { x: -n.x, y: -n.y, z: 0 } })
        })
      }
      const basin = solid('floor', lining, 'ceramic', ref('area', id))
      if (material && !material.clear) basin.finish = area.floor
      basin.hole = pools.find((ring) => pointInPolygon(area.at, ring)) ?? region.outer
      out.push(basin)
      out.push({ ...prism('floor', region.outer, region.holes, lift - POOL_WATER - 0.01, lift - POOL_WATER, 'glass', ref('area', id)), finish: 'water' })
      continue
    }
    const floor = prism('floor', region.outer, region.holes, lift, lift + FLOOR, isCovered(region) ? 'floor' : 'paving', ref('area', id))
    if (findMaterial(area.floor)) floor.finish = area.floor
    out.push(floor)
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
    // its covering on top (and on a pitched roof's fascia), its soffit underneath
    const [cover, under] = [roof.finish, roof.soffit].map((m) => (findMaterial(m) ? m : undefined))
    const faces = roofSolidFaces(roof).map((f) => {
      const finish = f.normal.z > 0.01 ? cover : f.normal.z < -0.01 ? under : roof.type === 'flat' ? undefined : cover
      return finish ? { ...f, finish } : f
    })
    out.push(solid('roof', faces, roof.type === 'flat' ? 'slab' : 'roof', ref('roof', id)))
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

  // walls (and the wall over their doors and windows) stop at the underside of the roof over their middle where it
  // is lower than their tops, all along them (a wall's end can reach into a corner under another roof): the highest
  // roof whose outline the middle is in, or the lowest overhang over it when it is in none. A gallery's end walls stop
  // under its nearly flat roof, tucked under the house's eaves; the wall the gallery leans on stands in the house's
  // roof, which is higher, so it keeps its height
  const roofOver = (m: Vec) => {
    const at = (r: (typeof roofs)[number]) => underside(r.roof, r.planes, m)
    const within = roofs.filter((r) => covers(r.roof.outline, m)).sort((a, b) => at(b) - at(a))
    return within[0] ?? roofs.filter((r) => covers(r.eaves, m)).sort((a, b) => at(a) - at(b))[0]
  }
  for (const s of roofs.length ? out : []) {
    if (s.ref.layer !== layer.id || s.ref.kind !== 'segment' || (s.kind !== 'wall' && s.kind !== 'lintel')) continue
    const seg = layer.segments[s.ref.id]
    const r = seg && roofOver(lerp(layer.vertices[seg.a], layer.vertices[seg.b], 0.5))
    if (!r) continue
    const ceiling = (p: Vec) => underside(r.roof, r.planes, p)
    const { top, bottom } = s
    const atTop = (p: Vec3) => p.z > top - 1e-6
    if (!s.faces.some((f) => f.pts.some((p) => atTop(p) && ceiling(p) < p.z - 1e-3))) continue
    s.faces = s.faces.map((f) => {
      const pts = f.pts.map((p) => (atTop(p) ? { ...p, z: Math.max(bottom, Math.min(p.z, ceiling(p))) } : p))
      return f.normal.z > 0.99 ? { ...f, pts, normal: upward(pts) } : { ...f, pts }
    })
    s.top = Math.max(...s.faces.flatMap((f) => f.pts.map((p) => p.z)))
  }

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

  // each side of a finished wall, on every piece of it (the wall itself, over and under openings, a gable end): the
  // faces that face that side, told by their normals, and the side's half of the faces across the wall (its ends,
  // the reveals of doors and windows), split at its centreline
  for (const s of out) {
    if (s.ref.layer !== layer.id || s.ref.kind !== 'segment' || !['wall', 'lintel', 'sill', 'infill'].includes(s.kind)) continue
    const seg = layer.segments[s.ref.id]
    const finish = seg?.finish
    if (!finish || segmentKind(seg) !== 'wall') continue
    const a = layer.vertices[seg.a]
    const left = sideNormal(a, layer.vertices[seg.b], 'left')
    const toLeft = (p: Vec3) => (p.x - a.x) * left.x + (p.y - a.y) * left.y
    const tag = (f: Face, side: string | undefined): Face => (side && findMaterial(side) ? { ...f, finish: side } : f)
    s.faces = s.faces.flatMap((f) => {
      const along = f.normal.x * left.x + f.normal.y * left.y
      if (along > 0.99) return [tag(f, finish.left)]
      if (along < -0.99) return [tag(f, finish.right)]
      // the top and bottom stay in the wall's own material
      if (Math.abs(f.normal.z) > 0.01 || f.holes.length) return [f]
      if (finish.left === finish.right) return [tag(f, finish.left)]
      return [clipFace(f, toLeft), clipFace(f, (p) => -toLeft(p))].flatMap((half, i) => (half ? [tag(half, i ? finish.right : finish.left)] : []))
    })
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

/** A parrilla's heights: its stone counter, the top of its fire opening, the top of its hood, in m. */
const PARRILLA = { counter: 0.9, fire: 1.7, hood: 2.3 }

/**
 * A masonry fireplace on its side of the wall: a base, the cheeks and back round a dark firebox, a head under a
 * stone mantel shelf and a stone hearth before it. A parrilla (an Argentine grill): a base with a niche for firewood
 * under a stone counter, a wide fire opening over it with the grill and an ember basket (brasero) in it, and a hood
 * over that. Then, from either, its chimney up through the roof to CHIMNEY_ABOVE over it (over its wall, with no
 * roof), under a stone cap. Its masonry is exposed brick or the material it is finished in.
 */
function fireplaceSolids(o: Opening, p: PlacedOpening, half: number, roof: Roof | undefined, wall: number, ref: Ref, out: Solid[]) {
  const w = dist(p.start, p.end)
  const rect = besideWall(p, o, half)
  const finish = o.kind === 'fireplace' && findMaterial(o.finish) ? o.finish : undefined
  const put = (kind: SolidKind, outline: Vec[], bottom: number, top: number, material: SolidMaterial) => {
    const s = prism(kind, outline, [], bottom, top, material, ref)
    if (finish && material === 'brick') s.finish = finish
    out.push(s)
  }
  let base: number
  if (o.style === 'parrilla') {
    const [d, c, back] = [PARRILLA_DEPTH, Math.min(PARRILLA_CHEEK, w / 4), 0.12]
    const { counter, fire, hood } = PARRILLA
    // the hearth stands a little proud of the floor (level with it, the two flickered)
    put('fireplace', rect(-0.1, w + 0.1, d, d + HEARTH), 0, FLOOR + 0.02, 'stone')
    put('fireplace', rect(0, w, 0, d), 0, 0.1, 'brick')
    put('fireplace', rect(0, c, 0, d), 0.1, 0.75, 'brick')
    put('fireplace', rect(w - c, w, 0, d), 0.1, 0.75, 'brick')
    put('fireplace', rect(c, w - c, 0, d - 0.45), 0.1, 0.75, 'brick')
    put('fireplace', rect(c, w - c, d - 0.45, d - 0.44), 0.1, 0.75, 'soot')
    // firewood stacked in the niche, ends out
    const along = (u: number, v: number) => add(add(p.start, mul(p.dir, u)), mul(p.left, (o.swing === 'left' ? 1 : -1) * (half + v)))
    const log = 0.055
    for (let row = 0, z = 0.1 + log; z + log <= 0.62; row++, z += log * 1.75) {
      for (let u = c + log + 0.01 + (row % 2) * log; u + log <= w - c - 0.01; u += 2 * log + 0.004) {
        const section = Array.from({ length: 8 }, (_, k): [number, number] => [u + log * Math.cos((k * Math.PI) / 4), z + log * Math.sin((k * Math.PI) / 4)])
        out.push(solid('fireplace', profileFaces(along(0, d - 0.24), p.dir, 0.2, section), 'bark', ref))
      }
    }
    put('fireplace', rect(0, w, 0, d), 0.75, counter - 0.04, 'brick')
    put('fireplace', rect(-0.03, w + 0.03, 0, d + 0.05), counter - 0.04, counter, 'stone')
    put('fireplace', rect(0, c, 0, d), counter, fire, 'brick')
    put('fireplace', rect(w - c, w, 0, d), counter, fire, 'brick')
    put('fireplace', rect(c, w - c, 0, back), counter, fire, 'brick')
    put('fireplace', rect(c, w - c, back, back + 0.01), counter, fire, 'soot')
    put('fireplace', rect(c, w - c, back, d), counter, counter + 0.01, 'soot')
    // the grill: bars from front to back on two rails, a little over the counter; the brasero in a back corner
    put('fireplace', rect(c + 0.03, w - c - 0.03, back + 0.04, back + 0.06), counter + 0.2, counter + 0.23, 'metal')
    put('fireplace', rect(c + 0.03, w - c - 0.03, d - 0.05, d - 0.03), counter + 0.2, counter + 0.23, 'metal')
    for (let u = c + 0.06; u < w - c - 0.05; u += 0.07) put('fireplace', rect(u, u + 0.012, back + 0.04, d - 0.03), counter + 0.23, counter + 0.245, 'metal')
    put('fireplace', rect(c + 0.03, Math.min(c + 0.33, w / 2), back + 0.03, back + 0.33), counter + 0.32, counter + 0.62, 'metal')
    put('fireplace', rect(0, w, 0, d), fire, hood, 'brick')
    base = hood
  } else {
    const d = FIREPLACE_DEPTH
    const fire = Math.min(0.75, w * 0.6)
    const [f0, f1] = [(w - fire) / 2, (w + fire) / 2]
    put('fireplace', rect(-0.1, w + 0.1, d, d + HEARTH), 0, 0.04, 'stone')
    put('fireplace', rect(0, w, 0, d), 0, 0.15, 'brick')
    put('fireplace', rect(0, f0, 0, d), 0.15, 0.75, 'brick')
    put('fireplace', rect(f1, w, 0, d), 0.15, 0.75, 'brick')
    put('fireplace', rect(f0, f1, 0, d * 0.35), 0.15, 0.75, 'brick')
    put('fireplace', rect(f0, f1, d * 0.35, d - 0.02), 0.15, 0.75, 'soot')
    put('fireplace', rect(0, w, 0, d), 0.75, MANTEL, 'brick')
    put('fireplace', rect(-0.05, w + 0.05, 0, d + 0.05), MANTEL, MANTEL + 0.06, 'stone')
    base = MANTEL + 0.06
  }
  const flue = fireplaceShape(p, o, half).flue
  let top = wall + CHIMNEY_ABOVE
  if (roof) {
    const planes = roofPlanes(roof)
    top = Math.max(...flue.map((q) => underside(roof, planes, q))) + roofThickness(roof) + (roof.type === 'flat' ? roof.parapet : 0) + CHIMNEY_ABOVE
  }
  put('chimney', flue, base, top, 'brick')
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

  // a door its own height or the usual one; no taller than its wall, and with no wall over it when as tall
  const height = o.kind === 'door' && o.height ? o.height : DOOR_HEAD
  const head = host ? Math.min(height, host.height) : height
  if (host && host.height - head > 1e-3) put('lintel', whole, head, host.height, host.material, host.ref)

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
