import { dist, EPS, polygonArea, polylineLength } from './geometry'
import { columnSpots, GLAZED_BASE, layerColonnades } from './colonnades'
import type { Face, Vec3 } from './faces'
import { sideNormal, wallSide, type WallSide } from './finishes'
import { furnitureInfo } from './furniture'
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
 * joist and block slabs, and the build-ups below, chosen by what each wall separates and how thick it is. Every row
 * says how it was worked out. Foundations are assumed until the Foundation tab exists, and a structural design will
 * change the concrete.
 */

export const CHAPTERS = [
  'Earthworks and foundations',
  'Concrete structure',
  'Masonry',
  'Damp-proofing and insulation',
  'Plaster and paint',
  'Sub-floors and screeds',
  'Floors and skirting',
  'Wall finishes',
  'Ceilings',
  'Roofing',
  'Doors and windows',
  'Glazing',
  'Metalwork and timber',
  'Pools',
  'Fixtures',
  'Garden',
  'Basic materials',
] as const

export type Chapter = (typeof CHAPTERS)[number]
export type Unit = 'm²' | 'm³' | 'm' | 'u' | 'kg' | 'bags'

export interface TakeoffRow {
  chapter: Chapter
  item: string
  quantity: number
  unit: Unit
  /** How it was measured or what was assumed. */
  basis: string
  /** Where in the plan: layer, area or room names. */
  where: string[]
}

/** Mortars and concretes, per m³ of mix: cement and lime in kg, sand and gravel (or brick rubble) in m³. */
export const MIXES = {
  concrete: { title: 'Concrete H-21', cement: 350, lime: 0, sand: 0.55, gravel: 0.7 },
  lean: { title: 'Lean concrete with brick rubble (1/4:1:4:8)', cement: 40, lime: 85, sand: 0.45, gravel: 0.9 },
  masonry: { title: 'Masonry mortar and base coat (1/4:1:4)', cement: 65, lime: 165, sand: 1.1, gravel: 0 },
  finish: { title: 'Finish coat (1/8:1:3)', cement: 30, lime: 230, sand: 1.0, gravel: 0 },
  screed: { title: 'Cement mortar (1:3), screeds and damp-proofing', cement: 450, lime: 0, sand: 1.05, gravel: 0 },
} as const

type Mix = keyof typeof MIXES

/** Bags: cement in 50 kg, hydrated lime in 25 kg. Rebar per m³ of reinforced concrete, kg. Hydrofuge per kg of cement in damp-proofing. */
export const BAG = { cement: 50, lime: 25 }
export const REBAR = 90
const HYDROFUGE = 0.02

/** Bricks and blocks: how many per m² of wall (breakage included) and the mortar they take, m³ per m². */
export const BRICKS = {
  solid12: { item: 'Solid common brick 5.5 × 12 × 25 cm', units: 60, mortar: 0.035 },
  facing12: { item: 'Facing brick 5.5 × 12 × 25 cm (ladrillo visto)', units: 60, mortar: 0.035 },
  solid24: { item: 'Solid common brick 5.5 × 12 × 25 cm', units: 120, mortar: 0.085 },
  facing24: { item: 'Facing brick 5.5 × 12 × 25 cm (ladrillo visto)', units: 120, mortar: 0.085 },
  hollow8: { item: 'Hollow ceramic brick 8 × 18 × 33 cm', units: 16, mortar: 0.012 },
  hollow12: { item: 'Hollow ceramic brick 12 × 18 × 33 cm', units: 16, mortar: 0.016 },
  hollow18: { item: 'Hollow ceramic brick 18 × 18 × 33 cm', units: 16, mortar: 0.022 },
}

type Brick = keyof typeof BRICKS

/**
 * A wall's build-up, by what it separates and how thick it is: a room from the outside (the envelope), two rooms (a
 * partition) or nothing indoors (a boundary or garden wall). Its leaves from the outside in; a solid brick leaf
 * facing the outside is facing brick when that side is finished in brick.
 */
interface WallBuildUp {
  title: string
  leaves: Brick[]
  /** 5 cm of EPS and a vapour barrier in its cavity. */
  insulated?: boolean
}

export function wallBuildUp(kind: 'envelope' | 'partition' | 'boundary', thickness: number): WallBuildUp {
  if (kind === 'envelope') {
    if (thickness >= 0.25) return { title: 'Insulated double wall: 12 cm solid brick, cavity, 5 cm EPS, 8 cm hollow brick', leaves: ['solid12', 'hollow8'], insulated: true }
    return thickness >= 0.17 ? { title: 'Exterior wall of 18 cm hollow brick', leaves: ['hollow18'] } : { title: 'Exterior wall of 12 cm hollow brick', leaves: ['hollow12'] }
  }
  if (kind === 'boundary') return thickness >= 0.25 ? { title: 'Solid brick wall, 24 cm', leaves: ['solid24'] } : { title: 'Solid brick wall, 12 cm', leaves: ['solid12'] }
  if (thickness >= 0.17) return { title: 'Partition of 18 cm hollow brick', leaves: ['hollow18'] }
  return thickness >= 0.1 ? { title: 'Partition of 12 cm hollow brick', leaves: ['hollow12'] } : { title: 'Partition of 8 cm hollow brick', leaves: ['hollow8'] }
}

/** Plaster: the base coat and the finish coat, m³ of mix per m². */
const PLASTER = { base: 0.02, finish: 0.005 }
/** A strip footing under a wall: its width beyond the wall's thickness (at least `min`) and its depth, m. */
const FOOTING = { extra: 0.15, min: 0.3, deep: 0.6, shallow: 0.4 }
/** A ring beam's depth, and tie columns' side and the most they stand apart along a load-bearing wall, m. */
const RING_BEAM = 0.2
const TIE_COLUMN = { side: 0.2, spacing: 4 }
/** A ground floor's lean concrete sub-floor and the screed over every built floor, m. */
const SUB_FLOOR = 0.12
const PAVING_BASE = 0.1
const SCREED = 0.03
/**
 * A joist and block slab (losa de viguetas): prestressed joists 0.50 m apart, ceramic blocks between them and a 5 cm
 * concrete topping on a welded mesh; per m² of slab.
 */
const JOIST_SLAB = { joists: 2, blocks: 8, concrete: 0.065, mesh: 1.1 }
/** A flat roof over its slab: a sloping lean concrete fill (its average depth, m), and a membrane's laps and upturns. */
const FLAT_ROOF = { slope: 0.08, membrane: 1.15, drainArea: 40 }
/** A pool's concrete shell, m thick; how much deeper than the pool its dig goes, m. */
const POOL_SHELL = 0.2
const POOL_DIG = 0.25
/** Extra for cuts and breakage: tiles and boards, sheets and rolls, the rest. */
const WASTE = { tiles: 1.1, sheet: 1.05, other: 1.05 }

const round = (x: number) => Math.round(x * 100) / 100
const size = (w: number, h: number) => `${round(w).toFixed(2)} × ${round(h).toFixed(2)} m`

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

export function materialsList(plan: Plan, solids: readonly Solid[] = houseSolids(plan), source: SolidsSource = direct): TakeoffRow[] {
  const rows = new Map<string, TakeoffRow>()
  const mixes = new Map<Mix, number>()
  let rebar = 0
  let hydrofuge = 0

  const add = (chapter: Chapter, item: string, unit: Unit, quantity: number, basis: string, where?: string) => {
    if (!(quantity > 1e-9)) return
    const key = `${chapter}|${item}|${unit}`
    let row = rows.get(key)
    if (!row) rows.set(key, (row = { chapter, item, quantity: 0, unit, basis, where: [] }))
    row.quantity += quantity
    if (where && !row.where.includes(where)) row.where.push(where)
  }
  const mix = (m: Mix, volume: number) => mixes.set(m, (mixes.get(m) ?? 0) + volume)
  /** Reinforced concrete: its volume, and the concrete and rebar it takes. */
  const concrete = (chapter: Chapter, item: string, volume: number, basis: string, where: string) => {
    add(chapter, item, 'm³', volume, `${basis}; H-21 with ${REBAR} kg/m³ of rebar`, where)
    mix('concrete', volume)
    rebar += volume * REBAR
  }
  const joistSlab = (area: number, item: string, where: string) => {
    add('Concrete structure', item, 'm²', area, 'Joist and block slab: prestressed joists 0.50 m apart, ceramic blocks, 5 cm topping on a mesh', where)
    add('Concrete structure', 'Prestressed concrete joists', 'm', area * JOIST_SLAB.joists, `${JOIST_SLAB.joists} m per m² of slab`, where)
    add('Concrete structure', 'Ceramic slab blocks 12 × 42 × 25 cm', 'u', area * JOIST_SLAB.blocks, `${JOIST_SLAB.blocks} per m² of slab`, where)
    add('Concrete structure', 'Welded mesh 15 × 15 cm, Ø 4.2 mm', 'm²', area * JOIST_SLAB.mesh, 'Slab area, laps included', where)
    add('Concrete structure', 'Slab topping and ribs (H-21)', 'm³', area * JOIST_SLAB.concrete, `${JOIST_SLAB.concrete} m³ per m² of slab`, where)
    mix('concrete', area * JOIST_SLAB.concrete)
  }
  const plaster = (area: number, item: string, basis: string, where: string, coats: 'both' | 'base' = 'both') => {
    add('Plaster and paint', item, 'm²', area, basis, where)
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
      const build = wallBuildUp(kind, t)
      const outside: WallSide | null = kind === 'envelope' ? (outdoor.left ? 'left' : 'right') : null
      const brickFinish = (side: WallSide) => findMaterial(s.finish?.[side])?.pattern === 'brick'

      // masonry: the wall's area at its mid-plane, its leaves' bricks and mortar
      add('Masonry', `${build.title} (${Math.round(t * 100)} cm)`, 'm²', wall, 'Both sides, net of openings, up to the roof over it, averaged', where)
      build.leaves.forEach((leaf, i) => {
        // the outer leaf of an envelope wall (a boundary wall's only one) shows on the outside
        const exposed = i === 0 && (outside ? brickFinish(outside) : kind === 'boundary' && (brickFinish('left') || brickFinish('right')))
        const brick = BRICKS[exposed && leaf === 'solid12' ? 'facing12' : exposed && leaf === 'solid24' ? 'facing24' : leaf]
        const per = leaf.startsWith('hollow') ? `${brick.units} per m² of wall` : `${BRICKS.solid12.units} per m² of a 12 cm leaf, ${BRICKS.solid24.units} of a 24 cm wall`
        add('Masonry', brick.item, 'u', wall * brick.units, `${per}, breakage included`, where)
        add('Masonry', 'Masonry mortar (1/4:1:4)', 'm³', wall * brick.mortar, 'Per brick type, joints of 1–1.5 cm', where)
        mix('masonry', wall * brick.mortar)
      })
      if (build.insulated) {
        add('Damp-proofing and insulation', 'EPS board 50 mm (wall cavity)', 'm²', wall * WASTE.sheet, 'Envelope walls 25 cm or more, 5% for cuts', where)
        add('Damp-proofing and insulation', 'Polyethylene vapour barrier 200 µm', 'm²', wall * 1.1, 'Wall cavity, 10% for laps', where)
      }

      // each side's finish: plaster and paint, exposed brick, or a cladding on a base coat
      for (const side of ['left', 'right'] as WallSide[]) {
        const sideArea = area[side]
        const out = outdoor[side]
        const m = findMaterial(s.finish?.[side])
        // the face of a solid brick leaf: an insulated wall's outside, a boundary wall's either side
        const solidFace = (side === outside && build.leaves[0].startsWith('solid')) || kind === 'boundary'
        if (!m) {
          plaster(sideArea, `Plaster, ${out ? 'exterior' : 'interior'} (finish not chosen)`, 'Not finished in the plan: assumed plastered and painted', where)
          add('Plaster and paint', `Latex paint, ${out ? 'exterior' : 'interior'} (finish not chosen)`, 'm²', sideArea, 'Not finished in the plan: two coats', where)
        } else if (m.pattern === 'brick' && solidFace) {
          add('Wall finishes', `${m.title}: pointing and sealer`, 'm²', sideArea, 'Facing brick left exposed', where)
          if (m.id === 'brick-white') add('Plaster and paint', `Latex paint, ${out ? 'exterior' : 'interior'}`, 'm²', sideArea, 'Painted brick: two coats', where)
        } else if (m.group === 'Plaster and paint') {
          plaster(sideArea, `${m.title}, ${out ? 'exterior' : 'interior'}`, 'Base and finish coats', where)
          if (m.id === 'plaster-white') add('Plaster and paint', `Latex paint, ${out ? 'exterior' : 'interior'}`, 'm²', sideArea, 'Over white plaster: two coats', where)
          if (m.id === 'plaster-sand') add('Wall finishes', 'Textured coating (revestimiento plástico)', 'm²', sideArea, 'Over the base coat', where)
        } else {
          plaster(sideArea, 'Base coat under claddings', 'Under a tile, stone, wood or brick cladding', where, 'base')
          const waste = m.pattern === 'tiles' || m.pattern === 'planks' || m.pattern === 'brick' ? WASTE.tiles : WASTE.other
          add('Wall finishes', m.title, 'm²', sideArea * waste, `${Math.round((waste - 1) * 100)}% for cuts`, where)
        }
      }

      // what it stands on and what ties it: footings, damp-proofing and ring beams; tie columns along load-bearing walls
      const bearing = kind !== 'partition'
      if (ground) {
        const width = Math.max(FOOTING.min, t + FOOTING.extra)
        const deep = t >= 0.25 ? FOOTING.deep : FOOTING.shallow
        const trench = `The wall's thickness + ${FOOTING.extra} m wide (at least ${FOOTING.min} m), ${FOOTING.deep} m deep under walls of 25 cm or more and ${FOOTING.shallow} m under the rest`
        add('Earthworks and foundations', 'Excavation for strip footings', 'm³', length * width * deep, `${trench}, along each wall (assumed)`, where)
        add('Earthworks and foundations', 'Strip footing, lean concrete with brick rubble', 'm³', length * width * deep, 'The same trench, filled (assumed until the Foundation tab)', where)
        mix('lean', length * width * deep)
        if (bearing) concrete('Earthworks and foundations', 'Foundation ring beam', length * t * RING_BEAM, `The wall's thickness × ${RING_BEAM * 100} cm, on the footing of each load-bearing wall`, where)
        const dpc = length * (2 * t + 0.3)
        add('Damp-proofing and insulation', 'Damp-proof course (capa aisladora, cajón)', 'm²', dpc, 'Two horizontal layers and their sides: (2 × thickness + 0.30) per m of wall', where)
        mix('screed', dpc * 0.02)
        hydrofuge += dpc * 0.02 * MIXES.screed.cement * HYDROFUGE
      }
      if (bearing) {
        concrete('Concrete structure', 'Ring beam on top of walls (encadenado)', length * t * RING_BEAM, `The wall's thickness × ${RING_BEAM * 100} cm, on each load-bearing wall`, where)
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
        if ((o.height ?? DOOR_HEAD) < wallHeight(s) - 1e-3) add('Masonry', 'Precast concrete lintel', 'm', o.width + 0.4, 'Opening width + 0.20 m bearing each side', where)
      }
    }
    for (const h of tieColumns.values()) {
      add('Concrete structure', 'Tie column (columna de encadenado)', 'u', 1, `At the ends of load-bearing walls and at most ${TIE_COLUMN.spacing} m apart`, where)
      concrete('Concrete structure', 'Tie columns', TIE_COLUMN.side * TIE_COLUMN.side * h, `${TIE_COLUMN.side * 100} × ${TIE_COLUMN.side * 100} cm, as tall as their walls`, where)
    }

    // floors: what each named area stands on and is finished in; rooms' skirting and ceilings
    for (const [areaId, area] of Object.entries(layer.areas)) {
      const r = regionAt(faces.regions, area.at)
      if (!r || area.lot) continue
      const m = findMaterial(area.floor)
      if (area.depth) {
        // its lining's faces: its floor and the walls down to it
        const basin = solids.find((s) => s.ref.layer === layer.id && s.ref.kind === 'area' && s.ref.id === areaId && s.material === 'ceramic')
        const liningArea = basin ? basin.faces.reduce((sum, f) => sum + faceArea(f), 0) : 0
        add('Pools', 'Excavation', 'm³', r.area * (area.depth + POOL_DIG), `Its area × (depth + ${POOL_DIG} m)`, area.name)
        concrete('Pools', 'Reinforced concrete shell', liningArea * POOL_SHELL, `${POOL_SHELL * 100} cm under its floor and walls`, area.name)
        add('Pools', 'Waterproofing (cementitious, two coats)', 'm²', liningArea, 'Its floor and walls', area.name)
        add('Pools', m && !m.clear ? m.title : 'Pool tile (lining not chosen)', 'm²', liningArea * WASTE.tiles, 'Its floor and walls, 10% for cuts', area.name)
        continue
      }
      const covered = isCovered(r)
      const floor = r.floor
      if (m?.group === 'Ground and garden') {
        if (m.id !== 'dirt') add('Garden', m.title, 'm²', floor, 'Its area', area.name)
        continue
      }
      if (ground) {
        const depth = covered ? SUB_FLOOR : PAVING_BASE
        add('Sub-floors and screeds', covered ? 'Sub-floor, lean concrete 12 cm' : 'Paving base, lean concrete 10 cm', 'm²', floor, 'Inside its walls, on compacted ground', area.name)
        mix('lean', floor * depth)
        if (covered) add('Damp-proofing and insulation', 'Polyethylene under the sub-floor 200 µm', 'm²', floor * 1.1, '10% for laps', area.name)
      }
      add('Sub-floors and screeds', 'Cement screed 3 cm (carpeta)', 'm²', floor, 'Under its floor finish', area.name)
      mix('screed', floor * SCREED)
      const waste = m?.pattern === 'tiles' || m?.checker ? WASTE.tiles : WASTE.other
      add('Floors and skirting', m ? m.title : `Floor finish not chosen (${covered ? 'covered' : 'outdoor'})`, 'm²', floor * (m ? waste : 1), m ? `Inside its walls, ${Math.round((waste - 1) * 100)}% for cuts` : 'Inside its walls', area.name)
      if (r.indoor) {
        add('Floors and skirting', 'Skirting', 'm', r.walls, 'Along its walls (centrelines), doors not deducted', area.name)
        // its ceiling: the soffit of the roof over it on its layer, or plaster
        const roof = Object.values(layer.roofs).find((rf) => pointInPolygon(area.at, eavesOf(rf)))
        const ceiling = findMaterial(roof?.soffit)
        if (ceiling) add('Ceilings', ceiling.title, 'm²', floor * WASTE.other, 'The soffit of the roof over it, 5% for cuts', area.name)
        else plaster(floor, 'Plaster ceiling (applied or suspended)', 'Its floor area', area.name)
      }
    }

    // roofs
    for (const roof of Object.values(layer.roofs)) roofRows(roof, layer, { add, mix, joistSlab, plaster })

    // doors, windows and gates by kind, style and size
    for (const o of Object.values(layer.openings)) {
      const s = layer.segments[o.segment]
      const p = s && placeOpening(layer, o)
      if (!p) continue
      const w = Math.min(o.width, p.length)
      const wall = segmentKind(s) === 'wall' ? wallHeight(s) : Infinity
      if (o.kind === 'fireplace') {
        add('Fixtures', o.style === 'parrilla' ? 'Parrilla (built-in grill), brick' : 'Masonry fireplace', 'u', 1, `${w.toFixed(2)} m wide`, where)
        continue
      }
      if (o.kind === 'gate') {
        add('Doors and windows', `Gate, ${o.style}, ${size(w, Number.isFinite(wall) ? wall : GATE_HEIGHT)}`, 'u', 1, 'Width × height', where)
        continue
      }
      const head = Math.min(o.height ?? DOOR_HEAD, wall)
      if (o.kind === 'door') add('Doors and windows', `Door, ${o.style}, ${size(w, head)}`, 'u', 1, 'Width × height, frame included', where)
      else {
        const sill = Math.min(windowSill(o), head - 0.3)
        add('Doors and windows', `Window, ${o.style}, ${size(w, head - sill)}`, 'u', 1, `Width × height, sill at ${sill.toFixed(2)} m`, where)
      }
    }

    // fixtures, the stair and the garden's plants (furniture that stands free is left out)
    for (const f of Object.values(layer.furniture)) {
      const style = 'style' in f ? f.style : undefined
      const info = furnitureInfo(f.kind, style)
      if (f.kind === 'counter') add('Fixtures', info.title, 'm', f.width, 'Its length', where)
      else if (f.kind === 'stair') add('Fixtures', `${info.title}, ${size(f.width, f.depth)}`, 'u', 1, 'Width × run', where)
      else if (f.kind === 'tree' || f.kind === 'plant') add('Garden', info.title, 'u', 1, 'Counted', where)
      else if (['sink', 'bathtub', 'shower', 'toilet', 'bidet'].includes(f.kind)) add('Fixtures', f.kind === 'bathtub' ? `Bathtub, ${info.title.toLowerCase()}` : info.title, 'u', 1, 'Counted', where)
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
        if (style === 'roman') add('Metalwork and timber', 'Roman stone column', 'u', 1, `${h.toFixed(2)} m tall`, where)
        else if (style === 'glazed') add('Metalwork and timber', 'Galvanized steel tube 50 × 50 mm (glazed sides, posts)', 'm', h, 'Post heights', where)
        else if (style === 'metal') add('Metalwork and timber', 'Steel post Ø 100 mm', 'm', h, 'Post heights', where)
        else if (style === 'timber') {
          if (s.material === 'wood') add('Metalwork and timber', 'Teak post 14 × 14 cm', 'm', h, 'Post heights', where)
          else if (h < 0.151) add('Metalwork and timber', 'Steel post shoe with two knee braces', 'u', 1, 'One per timber post', where)
        } else if (s.material === 'facade') concrete('Concrete structure', 'Columns under open-edge beams', footprint(s) * h, 'Where no wall holds a beam end', where)
      } else if (s.kind === 'beam') {
        if (style === 'roman') add('Metalwork and timber', 'Stone beam over Roman columns', 'm', length, 'Its edge', where)
        else if (style === 'glazed') add('Metalwork and timber', 'Galvanized steel tube 60 × 80 mm (glazed sides, top rail)', 'm', length, 'Its edge', where)
        else if (style === 'metal') add('Metalwork and timber', 'Steel beam 120 × 200 mm', 'm', length, 'Its edge', where)
        else if (style === 'timber') add('Metalwork and timber', 'Teak beam 14 × 22 cm', 'm', length, 'Its edge', where)
        else concrete('Concrete structure', 'Beams along open edges', 0.15 * 0.3 * length, '15 × 30 cm under the roof', where)
      } else if (s.kind === 'sill' && segmentKind(seg) === 'open') {
        const volume = broadSide(s) * GLAZED_BASE.width
        add('Concrete structure', 'Concrete base of glazed sides', 'm³', volume, `${GLAZED_BASE.width * 100} cm wide, ${GLAZED_BASE.height * 100} cm tall, doors left out`, where)
        mix('concrete', volume)
      } else if (s.kind === 'railing' && s.material === 'metal' && h < 0.06) {
        add('Metalwork and timber', 'Glass railing: steel posts every 1.5 m and a handrail', 'm', length, 'Along open edges with a floor on one side', where)
      }
    }
  }

  // glass, by what holds it, from the solids
  for (const s of solids) {
    if (s.material !== 'glass' || s.finish === 'water') continue
    const layer = plan.layers.find((l) => l.id === s.ref.layer)
    const where = layer?.name ?? ''
    if (s.ref.kind === 'opening') add('Glazing', 'Glass in windows and doors (double glazing advised)', 'm²', broadSide(s), 'Each pane', where)
    else if (s.kind === 'railing') add('Glazing', 'Laminated safety glass 5+5 (railings)', 'm²', broadSide(s), 'Each panel', where)
    else if (s.kind === 'glass' && s.ref.kind === 'segment') add('Glazing', 'Tempered glass 5 mm (glazed sides)', 'm²', broadSide(s), 'Each run, between base and rail', where)
    // a skylight's pane is two faces, up and down
    else if (s.kind === 'glass' && s.ref.kind === 'roof') add('Glazing', 'Laminated glass 4+4 (skylights)', 'm²', s.faces.reduce((sum, f) => sum + faceArea(f), 0) / 2, 'Each skylight', where)
  }
  for (const s of solids) {
    if (s.kind === 'chimney' && s.material === 'brick') add('Fixtures', 'Chimney flue, brick', 'm', s.top - s.bottom, 'From the fireplace to above the roof', plan.layers.find((l) => l.id === s.ref.layer)?.name)
  }

  // upper floors' slabs and a raised ground floor's fill, from the solids
  for (const s of solids) {
    const layer = plan.layers.find((l) => l.id === s.ref.layer)
    if (!layer || s.kind !== 'floor' || s.material !== 'slab' || s.ref.kind !== 'area') continue
    const top = Math.max(...s.faces.filter((f) => f.normal.z > 0.99).map(faceArea), 0)
    if (storeyOf(layer)) joistSlab(top, 'Floor slab (upper floor)', layer.name)
    else add('Earthworks and foundations', 'Compacted fill under the raised floor', 'm³', top * (s.top - s.bottom), 'Under its rooms and galleries, out to the walls', layer.name)
  }

  // what the mortars and concretes take
  const total = { cement: 0, lime: 0, sand: 0, gravel: 0 }
  for (const [m, volume] of mixes) {
    add('Basic materials', MIXES[m].title, 'm³', volume, 'All the work above')
    for (const k of ['cement', 'lime', 'sand', 'gravel'] as const) total[k] += volume * MIXES[m][k]
  }
  add('Basic materials', 'Portland cement, 50 kg bags', 'bags', Math.ceil(total.cement / BAG.cement), 'From the mixes')
  add('Basic materials', 'Hydrated lime, 25 kg bags', 'bags', Math.ceil(total.lime / BAG.lime), 'From the mixes')
  add('Basic materials', 'Sand', 'm³', total.sand, 'From the mixes')
  add('Basic materials', 'Gravel and brick rubble', 'm³', total.gravel, 'From the mixes')
  add('Basic materials', 'Rebar (ADN 420)', 'kg', rebar, `${REBAR} kg per m³ of reinforced concrete`)
  add('Basic materials', 'Hydrofuge', 'kg', hydrofuge, '2% of the cement in the damp-proofing')

  return [...rows.values()].sort((x, y) => CHAPTERS.indexOf(x.chapter) - CHAPTERS.indexOf(y.chapter))
}

interface Adders {
  add: (chapter: Chapter, item: string, unit: Unit, quantity: number, basis: string, where?: string) => void
  mix: (m: Mix, volume: number) => void
  joistSlab: (area: number, item: string, where: string) => void
  plaster: (area: number, item: string, basis: string, where: string) => void
}

/** One roof: its slab or frame, covering, insulation, gutters and downpipes, eaves soffit, a glass roof's grow lights. */
function roofRows(roof: Roof, layer: Layer, { add, mix, joistSlab, plaster }: Adders) {
  const where = layer.name
  const { planArea, surface } = roofSummary(roof)
  const eaves = eavesOf(roof)
  const cover = findMaterial(roof.finish)
  if (roof.type === 'flat') {
    joistSlab(planArea, 'Roof slab (flat roof)', where)
    add('Roofing', 'Sloping fill, lean concrete (average 8 cm)', 'm²', planArea, 'Over the slab, down to its drains', where)
    mix('lean', planArea * FLAT_ROOF.slope)
    add('Damp-proofing and insulation', 'EPS board 50 mm (flat roof)', 'm²', planArea * WASTE.sheet, '5% for cuts', where)
    add('Roofing', 'Asphalt membrane 4 mm with aluminium foil', 'm²', planArea * FLAT_ROOF.membrane, 'Laps and upturns: 15%', where)
    if (cover) add('Roofing', cover.title, 'm²', planArea * WASTE.other, 'Over the membrane', where)
    add('Roofing', 'Roof drain', 'u', Math.max(1, Math.ceil(planArea / FLAT_ROOF.drainArea)), `One per ${FLAT_ROOF.drainArea} m²`, where)
    if (roof.parapet > 0) {
      const run = polylineLength(eaves, true)
      add('Masonry', 'Parapet of 12 cm hollow brick', 'm²', run * roof.parapet, 'Round the slab', where)
      add('Masonry', BRICKS.hollow12.item, 'u', run * roof.parapet * BRICKS.hollow12.units, `${BRICKS.hollow12.units} per m²`, where)
      mix('masonry', run * roof.parapet * BRICKS.hollow12.mortar)
      plaster(run * roof.parapet * 2, 'Plaster, exterior (parapets)', 'Both sides', where)
      add('Roofing', 'Parapet coping', 'm', run, 'Round the slab', where)
    }
    return
  }
  if (roof.type === 'pergola' || roof.type === 'glass') {
    const rafters = pergolaRafters(roof).reduce((sum, [a, b]) => sum + dist(a, b), 0)
    if (roof.type === 'pergola') {
      add('Metalwork and timber', 'Teak rafter 7 × 20 cm (pergola)', 'm', rafters, 'Every 0.60 m, eaves to eaves', where)
      if (cover) add('Roofing', `${cover.title} (pergola)`, 'm²', surface * WASTE.sheet, 'Its slope, 5% for laps', where)
      return
    }
    add('Metalwork and timber', 'Galvanized steel glazing bar 40 × 60 mm (glass roof)', 'm', rafters, 'Every 0.75 m, eaves to eaves', where)
    add('Roofing', 'Laminated glass 3+3 (glass roof)', 'm²', surface, 'Its slope', where)
    const lights = growLights(roof)
    if (lights.length) {
      const run = lights.reduce((sum, [a, b]) => sum + dist(a, b), 0)
      add('Roofing', 'LED grow light, 1.2 m bar', 'u', lights.reduce((sum, [a, b]) => sum + Math.ceil(dist(a, b) / 1.2), 0), 'Rows of bars, 1.2 m each', where)
      add('Roofing', 'Grow light hanging rods and cable tray', 'm', run, 'Along each row', where)
    }
  } else {
    // a pitched roof: its covering on steel purlins (metal) or timber rafters and battens (tiles), insulated
    const metal = cover?.group === 'Metal'
    add('Roofing', cover ? cover.title : 'Roof covering not chosen', 'm²', surface * (metal ? WASTE.sheet : WASTE.tiles), `Its slopes, ${metal ? 5 : 10}% for laps and cuts`, where)
    add('Damp-proofing and insulation', 'Glass wool 50 mm with aluminium foil (roof)', 'm²', surface * WASTE.sheet, 'Its slopes, 5% for laps', where)
    if (metal) add('Roofing', 'Steel C purlin 100 mm, 1 m apart', 'm', surface, '1 m per m² of slope', where)
    else {
      add('Roofing', 'Timber rafter 2 × 6 in, 0.50 m apart', 'm', surface * 2, '2 m per m² of slope', where)
      add('Roofing', 'Timber batten 1 × 2 in', 'm', surface * 3, '3 m per m² of slope', where)
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
  add('Roofing', 'Gutter, galvanized sheet', 'm', gutter, 'Along its low eaves', where)
  add('Roofing', 'Downpipe Ø 100 mm', 'u', gutter ? Math.max(1, Math.ceil(gutter / 10)) : 0, 'One per 10 m of gutter', where)
  // its soffit under the overhang
  const soffit = findMaterial(roof.soffit)
  const overhang = planArea - polygonArea(roof.outline)
  if (soffit && overhang > 0.01) add('Ceilings', `${soffit.title} (eaves soffit)`, 'm²', overhang, 'Under its overhang', where)
}

/** The list as CSV, one row per line (chapter, item, quantity, unit, where, basis), quantities to two decimals. */
export function takeoffCsv(rows: readonly TakeoffRow[]): string {
  const cell = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)
  const lines = [['Chapter', 'Item', 'Quantity', 'Unit', 'Where', 'Basis'].join(',')]
  for (const r of rows) lines.push([r.chapter, r.item, r.quantity.toFixed(r.unit === 'u' || r.unit === 'bags' ? 0 : 2), r.unit, r.where.join('; '), r.basis].map(cell).join(','))
  return `${lines.join('\n')}\n`
}
