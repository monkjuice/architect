import { dist, EPS, polygonArea, polylineLength } from './geometry'
import { columnSpots, GLAZED_BASE, layerColonnades } from './colonnades'
import type { Face, Vec3 } from './faces'
import { sideNormal, wallSide, type WallSide } from './finishes'
import { findMaterial } from './materials'
import { placeOpening } from './openings'
import { segmentKind, storeyOf, type Layer, type Plan, type Roof } from './plan'
import { layerFaces, pointInPolygon, regionAt, regionLabel, type Region } from './regions'
import { eavesOf, growLights, pergolaRafters, roofPlanes, roofSummary, underside } from './roofs'
import { DOOR_HEAD, GATE_HEIGHT, houseSolids, isCovered, windowSill, type Solid, type SolidsSource } from './solids'
import { INTERIOR_WALL, layerWalls, wallHeight } from './walls'

/**
 * The materials list: what the house needs to be built, worked out from the visible layers and their 3-D solids,
 * chapter by chapter in the order of an Argentine cómputo métrico (foundations, structure, masonry, damp-proofing,
 * plaster, sub-floors, floors, finishes, ceilings, roofing, doors and windows, glazing, metalwork, pools, fixtures,
 * garden), then the basic materials its mortars and concretes take.
 *
 * What the plan draws is measured: wall sides net of their openings (gable ends included, from the solids), floors
 * inside the walls, roof surfaces, openings by size, columns, pools, fixtures. What lies behind it is assumed from
 * usual practice for a house of brick walls on strip footings with ring beams and tie columns (confined masonry),
 * joist and block slabs, and the build-ups below, chosen by what each wall separates and how thick it is.
 * Foundations are assumed until the Foundation tab exists, and a structural design will change the concrete.
 *
 * Each row is a key and its parameters, the same in every language: takeoffText.ts says what it is and how it was
 * worked out, in English or Spanish, and prices.ts what it costs.
 */

export const CHAPTERS = [
  'foundations',
  'structure',
  'masonry',
  'insulation',
  'plaster',
  'subfloors',
  'floors',
  'cladding',
  'ceilings',
  'roofing',
  'openings',
  'glazing',
  'metalwork',
  'pools',
  'fixtures',
  'garden',
  'basic',
] as const

export type Chapter = (typeof CHAPTERS)[number]
export type Unit = 'm²' | 'm³' | 'm' | 'u' | 'kg' | 'bags'
export type Side = 'interior' | 'exterior'

/** What tells one row of a key from another: a material, a style and size, a side, a wall's build-up. */
export interface RowParams {
  /** A material id (see materials.ts). */
  material?: string
  /** Extra for cuts, as a fraction (0.1). */
  waste?: number
  side?: Side
  /** A wall's build-up (see wallBuildUp) and thickness, m. */
  build?: WallBuild
  thickness?: number
  /** An opening's, a fixture's or a plant's style; for fixtures and plants, what it is. */
  style?: string
  kind?: string
  /** An opening's or a stair's size, m. */
  w?: number
  h?: number
  /** A floor in the open rather than covered. */
  outdoor?: boolean
  mix?: Mix
}

export interface TakeoffRow {
  chapter: Chapter
  /** What it is: a key of takeoffText.ts, and with its parameters, of prices.ts. */
  key: string
  params: RowParams
  quantity: number
  unit: Unit
  /** Where in the plan: layer, area or room names. */
  where: string[]
}

/** Mortars and concretes, per m³ of mix: cement and lime in kg, sand and gravel (or brick rubble) in m³. */
export const MIXES = {
  concrete: { cement: 350, lime: 0, sand: 0.55, gravel: 0.7 },
  lean: { cement: 40, lime: 85, sand: 0.45, gravel: 0.9 },
  masonry: { cement: 65, lime: 165, sand: 1.1, gravel: 0 },
  finish: { cement: 30, lime: 230, sand: 1.0, gravel: 0 },
  screed: { cement: 450, lime: 0, sand: 1.05, gravel: 0 },
} as const

export type Mix = keyof typeof MIXES

/** Bags: cement in 50 kg, hydrated lime in 25 kg. Rebar per m³ of reinforced concrete, kg. Hydrofuge per kg of cement in damp-proofing. */
export const BAG = { cement: 50, lime: 25 }
export const REBAR = 90
export const HYDROFUGE = 0.02

/** Bricks and blocks: their row's key, how many per m² of wall (breakage included) and the mortar they take, m³ per m². */
export const BRICKS = {
  solid12: { key: 'brick.solid', units: 60, mortar: 0.035 },
  facing12: { key: 'brick.facing', units: 60, mortar: 0.035 },
  solid24: { key: 'brick.solid', units: 120, mortar: 0.085 },
  facing24: { key: 'brick.facing', units: 120, mortar: 0.085 },
  hollow8: { key: 'brick.hollow8', units: 16, mortar: 0.012 },
  hollow12: { key: 'brick.hollow12', units: 16, mortar: 0.016 },
  hollow18: { key: 'brick.hollow18', units: 16, mortar: 0.022 },
}

type Brick = keyof typeof BRICKS

export type WallBuild = 'double' | 'exterior18' | 'exterior12' | 'partition18' | 'partition12' | 'partition8' | 'solid24' | 'solid12'

/**
 * A wall's build-up, by what it separates and how thick it is: a room from the outside (the envelope), two rooms (a
 * partition) or nothing indoors (a boundary or garden wall). Its leaves from the outside in; a solid brick leaf
 * facing the outside is facing brick when that side is finished in brick. The insulated one has 5 cm of EPS and a
 * vapour barrier in its cavity.
 */
export function wallBuildUp(kind: 'envelope' | 'partition' | 'boundary', thickness: number): { build: WallBuild; leaves: Brick[]; insulated?: boolean } {
  if (kind === 'envelope') {
    if (thickness >= 0.25) return { build: 'double', leaves: ['solid12', 'hollow8'], insulated: true }
    return thickness >= 0.17 ? { build: 'exterior18', leaves: ['hollow18'] } : { build: 'exterior12', leaves: ['hollow12'] }
  }
  if (kind === 'boundary') return thickness >= 0.25 ? { build: 'solid24', leaves: ['solid24'] } : { build: 'solid12', leaves: ['solid12'] }
  if (thickness >= 0.17) return { build: 'partition18', leaves: ['hollow18'] }
  return thickness >= 0.1 ? { build: 'partition12', leaves: ['hollow12'] } : { build: 'partition8', leaves: ['hollow8'] }
}

/** Plaster: the base coat and the finish coat, m³ of mix per m². */
export const PLASTER = { base: 0.02, finish: 0.005 }
/** A strip footing under a wall: its width beyond the wall's thickness (at least `min`) and its depth, m. */
export const FOOTING = { extra: 0.15, min: 0.3, deep: 0.6, shallow: 0.4 }
/** A ring beam's depth, and tie columns' side and the most they stand apart along a load-bearing wall, m. */
export const RING_BEAM = 0.2
export const TIE_COLUMN = { side: 0.2, spacing: 4 }
/** A ground floor's lean concrete sub-floor, an outdoor paving's base and the screed over every built floor, m. */
export const SUB_FLOOR = 0.12
export const PAVING_BASE = 0.1
export const SCREED = 0.03
/**
 * A joist and block slab (losa de viguetas): prestressed joists 0.50 m apart, ceramic blocks between them and a 5 cm
 * concrete topping on a welded mesh; per m² of slab.
 */
export const JOIST_SLAB = { joists: 2, blocks: 8, concrete: 0.065, mesh: 1.1 }
/** A flat roof over its slab: a sloping lean concrete fill (its average depth, m), a membrane's laps and upturns, a drain per area. */
export const FLAT_ROOF = { slope: 0.08, membrane: 1.15, drainArea: 40 }
/** A pool's concrete shell, m thick; how much deeper than the pool its dig goes, m. */
export const POOL_SHELL = 0.2
export const POOL_DIG = 0.25
/** Extra for cuts and breakage: tiles and boards, sheets and rolls, the rest. */
export const WASTE = { tiles: 0.1, sheet: 0.05, other: 0.05 }
/** A grow light's bar, m; a gutter's length per downpipe, m. */
export const GROW_BAR = 1.2
export const PER_DOWNPIPE = 10

const round = (x: number) => Math.round(x * 100) / 100

/** A planar ring's area in 3-D (Newell's method). */
function ringArea(pts: readonly Vec3[]): number {
  let [x, y, z] = [0, 0, 0]
  pts.forEach((p, i) => {
    const q = pts[(i + 1) % pts.length]
    x += (p.y - q.y) * (p.z + q.z)
    y += (p.z - q.z) * (p.x + q.x)
    z += (p.x - q.x) * (p.y + q.y)
  })
  return Math.hypot(x, y, z) / 2
}

const faceArea = (f: Face) => ringArea(f.pts) - f.holes.reduce((sum, h) => sum + ringArea(h), 0)

/** The area of a thin solid (a pane, a slab) seen from its broad side: its largest face. */
const broadSide = (s: Solid) => Math.max(...s.faces.map(faceArea))

/** The area a solid stands on: its largest level face. */
const footprint = (s: Solid) => Math.max(0, ...s.faces.filter((f) => Math.abs(f.normal.z) > 0.99).map(faceArea))

const direct: SolidsSource = { faces: layerFaces, walls: (layer) => layerWalls(layer, layerFaces(layer).thickness) }

type Add = (chapter: Chapter, key: string, unit: Unit, quantity: number, where?: string, params?: RowParams) => void

export function materialsList(plan: Plan, solids: readonly Solid[] = houseSolids(plan), source: SolidsSource = direct): TakeoffRow[] {
  const rows = new Map<string, TakeoffRow>()
  const mixes = new Map<Mix, number>()
  let rebar = 0
  let hydrofuge = 0

  const add: Add = (chapter, key, unit, quantity, where, params = {}) => {
    if (!(quantity > 1e-9)) return
    const id = `${chapter}|${key}|${unit}|${JSON.stringify(params)}`
    let row = rows.get(id)
    if (!row) rows.set(id, (row = { chapter, key, params, quantity: 0, unit, where: [] }))
    row.quantity += quantity
    if (where && !row.where.includes(where)) row.where.push(where)
  }
  const mix = (m: Mix, volume: number) => mixes.set(m, (mixes.get(m) ?? 0) + volume)
  /** Reinforced concrete: its volume, and the concrete and rebar it takes. */
  const concrete = (chapter: Chapter, key: string, volume: number, where: string) => {
    add(chapter, key, 'm³', volume, where)
    mix('concrete', volume)
    rebar += volume * REBAR
  }
  const joistSlab = (area: number, key: string, where: string) => {
    add('structure', key, 'm²', area, where)
    add('structure', 'slab.joists', 'm', area * JOIST_SLAB.joists, where)
    add('structure', 'slab.blocks', 'u', area * JOIST_SLAB.blocks, where)
    add('structure', 'slab.mesh', 'm²', area * JOIST_SLAB.mesh, where)
    add('structure', 'slab.topping', 'm³', area * JOIST_SLAB.concrete, where)
    mix('concrete', area * JOIST_SLAB.concrete)
  }
  const plaster = (area: number, key: string, where: string, params: RowParams = {}, coats: 'both' | 'base' = 'both') => {
    add('plaster', key, 'm²', area, where, params)
    mix('masonry', area * PLASTER.base)
    if (coats === 'both') mix('finish', area * PLASTER.finish)
  }

  // wall sides, net of their openings and up to the roof, from the solids: the faces that face each side
  const sides = new Map<string, Record<WallSide, number>>()
  for (const s of solids) {
    if (s.ref.kind !== 'segment' || !['wall', 'lintel', 'sill', 'infill'].includes(s.kind)) continue
    const layer = plan.layers.find((l) => l.id === s.ref.layer)
    const seg = layer?.segments[s.ref.id]
    if (!layer || !seg || segmentKind(seg) !== 'wall') continue
    const left = sideNormal(layer.vertices[seg.a], layer.vertices[seg.b], 'left')
    const key = `${layer.id}:${s.ref.id}`
    const area = sides.get(key) ?? { left: 0, right: 0 }
    for (const f of s.faces) {
      const along = f.normal.x * left.x + f.normal.y * left.y
      if (along > 0.99) area.left += faceArea(f)
      else if (along < -0.99) area.right += faceArea(f)
    }
    sides.set(key, area)
  }

  const visible = plan.layers.filter((l) => l.visible)
  // what is built over a point: a roof on its floor or above, a floor above
  const roofed = visible.flatMap((l) => Object.values(l.roofs).map((r) => ({ storey: storeyOf(l), eaves: eavesOf(r) })))
  const floored = visible.flatMap((l) =>
    Object.values(l.areas).flatMap((a) => {
      const r = storeyOf(l) && !a.lot ? regionAt(source.faces(l).regions, a.at) : null
      return r ? [{ storey: storeyOf(l), outer: r.outer }] : []
    }),
  )
  for (const layer of visible) {
    const faces = source.faces(layer)
    const storey = storeyOf(layer)
    const ground = storey === 0
    // a wall's side is indoors on a room: walled off, not a lot, and named or built over. An enclosed space that is
    // neither (land between boundary walls, marked as a lot on another layer) is outdoors
    const room = (region: Region | null) => {
      if (!region) return false
      if (Object.values(layer.areas).some((a) => !a.lot && regionAt(faces.regions, a.at) === region)) return true
      const p = regionLabel(region)
      return roofed.some((r) => r.storey >= storey && pointInPolygon(p, r.eaves)) || floored.some((f) => f.storey > storey && pointInPolygon(p, f.outer))
    }
    const where = layer.name
    const tieColumns = new Map<string, number>()

    for (const [id, s] of Object.entries(layer.segments)) {
      if (segmentKind(s) !== 'wall') continue
      const [a, b] = [layer.vertices[s.a], layer.vertices[s.b]]
      const length = dist(a, b)
      if (length < EPS) continue
      const t = faces.thickness.get(id) ?? INTERIOR_WALL
      const [left, right] = (['left', 'right'] as WallSide[]).map((side) => wallSide(layer, faces.regions, t / 2, id, side))
      const outdoor = { left: left.outdoor || !room(left.region), right: right.outdoor || !room(right.region) }
      const kind = outdoor.left && outdoor.right ? 'boundary' : outdoor.left || outdoor.right ? 'envelope' : 'partition'
      const area = sides.get(`${layer.id}:${id}`) ?? { left: 0, right: 0 }
      const wall = (area.left + area.right) / 2
      const { build, leaves, insulated } = wallBuildUp(kind, t)
      const outside: WallSide | null = kind === 'envelope' ? (outdoor.left ? 'left' : 'right') : null
      const brickFinish = (side: WallSide) => findMaterial(s.finish?.[side])?.pattern === 'brick'

      // masonry: the wall's area at its mid-plane, its leaves' bricks and mortar
      add('masonry', 'wall', 'm²', wall, where, { build, thickness: round(t) })
      leaves.forEach((leaf, i) => {
        // the outer leaf of an envelope wall (a boundary wall's only one) shows on the outside
        const exposed = i === 0 && (outside ? brickFinish(outside) : kind === 'boundary' && (brickFinish('left') || brickFinish('right')))
        const brick = BRICKS[exposed && leaf === 'solid12' ? 'facing12' : exposed && leaf === 'solid24' ? 'facing24' : leaf]
        add('masonry', brick.key, 'u', wall * brick.units, where)
        add('masonry', 'mortar.masonry', 'm³', wall * brick.mortar, where)
        mix('masonry', wall * brick.mortar)
      })
      if (insulated) {
        add('insulation', 'eps.wall', 'm²', wall * (1 + WASTE.sheet), where)
        add('insulation', 'barrier.wall', 'm²', wall * 1.1, where)
      }

      // each side's finish: plaster and paint, exposed brick, or a cladding on a base coat
      for (const side of ['left', 'right'] as WallSide[]) {
        const sideArea = area[side]
        const facing: Side = outdoor[side] ? 'exterior' : 'interior'
        const m = findMaterial(s.finish?.[side])
        // the face of a solid brick leaf: an insulated wall's outside, a boundary wall's either side
        const solidFace = (side === outside && leaves[0].startsWith('solid')) || kind === 'boundary'
        if (!m) {
          plaster(sideArea, 'plaster.unchosen', where, { side: facing })
          add('plaster', 'paint', 'm²', sideArea, where, { side: facing })
        } else if (m.pattern === 'brick' && solidFace) {
          add('cladding', 'brick.pointing', 'm²', sideArea, where, { material: m.id })
          if (m.id === 'brick-white') add('plaster', 'paint', 'm²', sideArea, where, { side: facing })
        } else if (m.group === 'Plaster and paint') {
          plaster(sideArea, 'plaster.material', where, { material: m.id, side: facing })
          if (m.id === 'plaster-white') add('plaster', 'paint', 'm²', sideArea, where, { side: facing })
          if (m.id === 'plaster-sand') add('cladding', 'coating.textured', 'm²', sideArea, where)
        } else {
          plaster(sideArea, 'plaster.base', where, {}, 'base')
          const waste = m.pattern === 'tiles' || m.pattern === 'planks' || m.pattern === 'brick' ? WASTE.tiles : WASTE.other
          add('cladding', 'cladding', 'm²', sideArea * (1 + waste), where, { material: m.id, waste })
        }
      }

      // what it stands on and what ties it: footings, damp-proofing and ring beams; tie columns along load-bearing walls
      const bearing = kind !== 'partition'
      if (ground) {
        const width = Math.max(FOOTING.min, t + FOOTING.extra)
        const deep = t >= 0.25 ? FOOTING.deep : FOOTING.shallow
        add('foundations', 'excavation.footing', 'm³', length * width * deep, where)
        add('foundations', 'footing', 'm³', length * width * deep, where)
        mix('lean', length * width * deep)
        if (bearing) concrete('foundations', 'beam.foundation', length * t * RING_BEAM, where)
        const dpc = length * (2 * t + 0.3)
        add('insulation', 'dpc', 'm²', dpc, where)
        mix('screed', dpc * 0.02)
        hydrofuge += dpc * 0.02 * MIXES.screed.cement * HYDROFUGE
      }
      if (bearing) {
        concrete('structure', 'beam.ring', length * t * RING_BEAM, where)
        const h = wallHeight(s)
        for (const k of columnSpots(length, TIE_COLUMN.spacing)) {
          const p = { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k }
          const spot = `${p.x.toFixed(2)},${p.y.toFixed(2)}`
          tieColumns.set(spot, Math.max(tieColumns.get(spot) ?? 0, h))
        }
      }
      // a precast lintel over each door and window that does not reach the top of the wall
      for (const o of Object.values(layer.openings)) {
        if (o.segment !== id || (o.kind !== 'door' && o.kind !== 'window')) continue
        if ((o.height ?? DOOR_HEAD) < wallHeight(s) - 1e-3) add('masonry', 'lintel', 'm', o.width + 0.4, where)
      }
    }
    for (const h of tieColumns.values()) {
      add('structure', 'column.tie.count', 'u', 1, where)
      concrete('structure', 'column.tie', TIE_COLUMN.side * TIE_COLUMN.side * h, where)
    }

    // floors: what each named area stands on and is finished in; rooms' skirting and ceilings
    for (const [areaId, area] of Object.entries(layer.areas)) {
      const r = regionAt(faces.regions, area.at)
      if (!r || area.lot) continue
      const m = findMaterial(area.floor)
      if (area.depth) {
        // its lining's faces: its floor and the walls down to it
        const basin = solids.find((s) => s.ref.layer === layer.id && s.ref.kind === 'area' && s.ref.id === areaId && s.material === 'ceramic')
        const lining = basin ? basin.faces.reduce((sum, f) => sum + faceArea(f), 0) : 0
        add('pools', 'pool.dig', 'm³', r.area * (area.depth + POOL_DIG), area.name)
        concrete('pools', 'pool.shell', lining * POOL_SHELL, area.name)
        add('pools', 'pool.waterproofing', 'm²', lining, area.name)
        add('pools', 'pool.lining', 'm²', lining * (1 + WASTE.tiles), area.name, m && !m.clear ? { material: m.id } : {})
        continue
      }
      const covered = isCovered(r)
      const floor = r.floor
      if (m?.group === 'Ground and garden') {
        if (m.id !== 'dirt') add('garden', 'garden.cover', 'm²', floor, area.name, { material: m.id })
        continue
      }
      if (ground) {
        add('subfloors', covered ? 'subfloor' : 'paving.base', 'm²', floor, area.name)
        mix('lean', floor * (covered ? SUB_FLOOR : PAVING_BASE))
        if (covered) add('insulation', 'barrier.floor', 'm²', floor * 1.1, area.name)
      }
      add('subfloors', 'screed', 'm²', floor, area.name)
      mix('screed', floor * SCREED)
      if (m) {
        const waste = m.pattern === 'tiles' || m.checker ? WASTE.tiles : WASTE.other
        add('floors', 'floor', 'm²', floor * (1 + waste), area.name, { material: m.id, waste })
      } else add('floors', 'floor.unchosen', 'm²', floor, area.name, { outdoor: !covered })
      if (r.indoor) {
        add('floors', 'skirting', 'm', r.walls, area.name)
        // its ceiling: the soffit of the roof over it on its layer, or plaster
        const roof = Object.values(layer.roofs).find((rf) => pointInPolygon(area.at, eavesOf(rf)))
        const ceiling = findMaterial(roof?.soffit)
        if (ceiling) add('ceilings', 'ceiling', 'm²', floor * (1 + WASTE.other), area.name, { material: ceiling.id })
        else plaster(floor, 'plaster.ceiling', area.name)
      }
    }

    // roofs
    for (const roof of Object.values(layer.roofs)) roofRows(roof, layer, add, mix, joistSlab, plaster)

    // doors, windows and gates by kind, style and size
    for (const o of Object.values(layer.openings)) {
      const s = layer.segments[o.segment]
      const p = s && placeOpening(layer, o)
      if (!p) continue
      const w = round(Math.min(o.width, p.length))
      const wall = segmentKind(s) === 'wall' ? wallHeight(s) : Infinity
      if (o.kind === 'fireplace') add('fixtures', 'fireplace', 'u', 1, where, { style: o.style })
      else if (o.kind === 'gate') add('openings', 'gate', 'u', 1, where, { style: o.style, w, h: round(Number.isFinite(wall) ? wall : GATE_HEIGHT) })
      else {
        const head = Math.min(o.height ?? DOOR_HEAD, wall)
        const sill = o.kind === 'window' ? Math.min(windowSill(o), head - 0.3) : 0
        add('openings', o.kind, 'u', 1, where, { style: o.style, w, h: round(head - sill) })
      }
    }

    // fixtures, the stair and the garden's plants (furniture that stands free is left out)
    for (const f of Object.values(layer.furniture)) {
      const style = 'style' in f ? f.style : undefined
      if (f.kind === 'counter') add('fixtures', 'counter', 'm', f.width, where, style ? { style } : {})
      else if (f.kind === 'stair') add('fixtures', 'stair', 'u', 1, where, { w: round(f.width), h: round(f.depth) })
      else if (f.kind === 'tree' || f.kind === 'plant') add('garden', 'plant', 'u', 1, where, { kind: f.kind, style })
      else if (['sink', 'bathtub', 'shower', 'toilet', 'bidet'].includes(f.kind)) add('fixtures', 'fixture', 'u', 1, where, style ? { kind: f.kind, style } : { kind: f.kind })
    }

    // glazed edges, colonnades and plain open-edge beams and columns, measured on the solids
    const styles = new Map(layerColonnades(layer, faces.thickness).map((c) => [c.segment, c.colonnade.style]))
    for (const s of solids) {
      if (s.ref.layer !== layer.id || s.ref.kind !== 'segment') continue
      const seg = layer.segments[s.ref.id]
      if (!seg) continue
      const style = styles.get(s.ref.id)
      const length = dist(layer.vertices[seg.a], layer.vertices[seg.b])
      const h = s.top - s.bottom
      if (s.kind === 'column') {
        if (style === 'roman') add('metalwork', 'column.roman', 'u', 1, where)
        else if (style === 'glazed') add('metalwork', 'tube.glazed.post', 'm', h, where)
        else if (style === 'metal') add('metalwork', 'post.steel100', 'm', h, where)
        else if (style === 'timber') {
          if (s.material === 'wood') add('metalwork', 'post.teak', 'm', h, where)
          else if (h < 0.151) add('metalwork', 'post.shoe', 'u', 1, where)
        } else if (s.material === 'facade') concrete('structure', 'column.open', footprint(s) * h, where)
      } else if (s.kind === 'beam') {
        if (style === 'roman') add('metalwork', 'beam.stone', 'm', length, where)
        else if (style === 'glazed') add('metalwork', 'tube.glazed.rail', 'm', length, where)
        else if (style === 'metal') add('metalwork', 'beam.steel', 'm', length, where)
        else if (style === 'timber') add('metalwork', 'beam.teak', 'm', length, where)
        else concrete('structure', 'beam.open', 0.15 * 0.3 * length, where)
      } else if (s.kind === 'sill' && segmentKind(seg) === 'open') {
        const volume = broadSide(s) * GLAZED_BASE.width
        add('structure', 'glazed.base', 'm³', volume, where)
        mix('concrete', volume)
      } else if (s.kind === 'railing' && s.material === 'metal' && h < 0.06) add('metalwork', 'railing', 'm', length, where)
    }
  }

  // glass, by what holds it, from the solids
  for (const s of solids) {
    if (s.material !== 'glass' || s.finish === 'water') continue
    const where = plan.layers.find((l) => l.id === s.ref.layer)?.name
    if (s.ref.kind === 'opening') add('glazing', 'glass.openings', 'm²', broadSide(s), where)
    else if (s.kind === 'railing') add('glazing', 'glass.railing', 'm²', broadSide(s), where)
    else if (s.kind === 'glass' && s.ref.kind === 'segment') add('glazing', 'glass.glazed', 'm²', broadSide(s), where)
    // a skylight's pane is two faces, up and down
    else if (s.kind === 'glass' && s.ref.kind === 'roof') add('glazing', 'glass.skylight', 'm²', s.faces.reduce((sum, f) => sum + faceArea(f), 0) / 2, where)
  }
  for (const s of solids) {
    if (s.kind === 'chimney' && s.material === 'brick') add('fixtures', 'chimney', 'm', s.top - s.bottom, plan.layers.find((l) => l.id === s.ref.layer)?.name)
  }

  // upper floors' slabs and a raised ground floor's fill, from the solids
  for (const s of solids) {
    const layer = plan.layers.find((l) => l.id === s.ref.layer)
    if (!layer || s.kind !== 'floor' || s.material !== 'slab' || s.ref.kind !== 'area') continue
    const top = footprint(s)
    if (storeyOf(layer)) joistSlab(top, 'slab.floor', layer.name)
    else add('foundations', 'fill', 'm³', top * (s.top - s.bottom), layer.name)
  }

  // what the mortars and concretes take
  const total = { cement: 0, lime: 0, sand: 0, gravel: 0 }
  for (const [m, volume] of mixes) {
    add('basic', 'mix', 'm³', volume, undefined, { mix: m })
    for (const k of ['cement', 'lime', 'sand', 'gravel'] as const) total[k] += volume * MIXES[m][k]
  }
  add('basic', 'cement', 'bags', Math.ceil(total.cement / BAG.cement))
  add('basic', 'lime', 'bags', Math.ceil(total.lime / BAG.lime))
  add('basic', 'sand', 'm³', total.sand)
  add('basic', 'gravel', 'm³', total.gravel)
  add('basic', 'rebar', 'kg', rebar)
  add('basic', 'hydrofuge', 'kg', hydrofuge)

  return [...rows.values()].sort((x, y) => CHAPTERS.indexOf(x.chapter) - CHAPTERS.indexOf(y.chapter))
}

/** One roof: its slab or frame, covering, insulation, gutters and downpipes, eaves soffit, a glass roof's grow lights. */
function roofRows(
  roof: Roof,
  layer: Layer,
  add: Add,
  mix: (m: Mix, volume: number) => void,
  joistSlab: (area: number, key: string, where: string) => void,
  plaster: (area: number, key: string, where: string) => void,
) {
  const where = layer.name
  const { planArea, surface } = roofSummary(roof)
  const eaves = eavesOf(roof)
  const cover = findMaterial(roof.finish)
  if (roof.type === 'flat') {
    joistSlab(planArea, 'slab.roof', where)
    add('roofing', 'roof.fill', 'm²', planArea, where)
    mix('lean', planArea * FLAT_ROOF.slope)
    add('insulation', 'eps.roof', 'm²', planArea * (1 + WASTE.sheet), where)
    add('roofing', 'roof.membrane', 'm²', planArea * FLAT_ROOF.membrane, where)
    if (cover) add('roofing', 'roof.cover', 'm²', planArea * (1 + WASTE.other), where, { material: cover.id, waste: WASTE.other })
    add('roofing', 'roof.drain', 'u', Math.max(1, Math.ceil(planArea / FLAT_ROOF.drainArea)), where)
    if (roof.parapet > 0) {
      const run = polylineLength(eaves, true)
      add('masonry', 'parapet', 'm²', run * roof.parapet, where)
      add('masonry', BRICKS.hollow12.key, 'u', run * roof.parapet * BRICKS.hollow12.units, where)
      mix('masonry', run * roof.parapet * BRICKS.hollow12.mortar)
      plaster(run * roof.parapet * 2, 'plaster.parapet', where)
      add('roofing', 'coping', 'm', run, where)
    }
    return
  }
  if (roof.type === 'pergola' || roof.type === 'glass') {
    const rafters = pergolaRafters(roof).reduce((sum, [a, b]) => sum + dist(a, b), 0)
    if (roof.type === 'pergola') {
      add('metalwork', 'rafter.teak', 'm', rafters, where)
      if (cover) add('roofing', 'roof.cover', 'm²', surface * (1 + WASTE.sheet), where, { material: cover.id, waste: WASTE.sheet })
      return
    }
    add('metalwork', 'bar.glazing', 'm', rafters, where)
    add('roofing', 'glass.roof', 'm²', surface, where)
    const lights = growLights(roof)
    add('roofing', 'growlight', 'u', lights.reduce((sum, [a, b]) => sum + Math.ceil(dist(a, b) / GROW_BAR), 0), where)
    add('roofing', 'growlight.rods', 'm', lights.reduce((sum, [a, b]) => sum + dist(a, b), 0), where)
  } else {
    // a pitched roof: its covering on steel purlins (metal) or timber rafters and battens (tiles), insulated
    const metal = cover?.group === 'Metal'
    const waste = metal ? WASTE.sheet : WASTE.tiles
    if (cover) add('roofing', 'roof.cover', 'm²', surface * (1 + waste), where, { material: cover.id, waste })
    else add('roofing', 'roof.cover.unchosen', 'm²', surface, where)
    add('insulation', 'glasswool.roof', 'm²', surface * (1 + WASTE.sheet), where)
    if (metal) add('roofing', 'purlin.c100', 'm', surface, where)
    else {
      add('roofing', 'rafter.timber', 'm', surface * 2, where)
      add('roofing', 'batten.timber', 'm', surface * 3, where)
    }
  }
  // gutters along its eaves at the lowest height (a shed's low side, a gable's eaves, all round a hip), downpipes
  const planes = roofPlanes(roof)
  const low = Math.min(...eaves.map((p) => underside(roof, planes, p)))
  let gutter = 0
  eaves.forEach((p, i) => {
    const q = eaves[(i + 1) % eaves.length]
    if (underside(roof, planes, p) < low + 0.01 && underside(roof, planes, q) < low + 0.01) gutter += dist(p, q)
  })
  add('roofing', 'gutter', 'm', gutter, where)
  add('roofing', 'downpipe', 'u', gutter ? Math.max(1, Math.ceil(gutter / PER_DOWNPIPE)) : 0, where)
  // its soffit under the overhang
  const soffit = findMaterial(roof.soffit)
  const overhang = planArea - polygonArea(roof.outline)
  if (soffit && overhang > 0.01) add('ceilings', 'soffit.eaves', 'm²', overhang, where, { material: soffit.id })
}
