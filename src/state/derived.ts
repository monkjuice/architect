import { boundsOf, type Vec } from '../model/geometry'
import { findLayer, storeyOf, type Area, type Layer, type Plan } from '../model/plan'
import { labelPoint, layerFaces, regionAt, regionLabel, type LayerFaces, type Region } from '../model/regions'
import { foundationPlan, type FoundationPlan } from '../model/foundations'
import { houseSolids, type Solid } from '../model/solids'
import { materialsList, type TakeoffRow } from '../model/takeoff'
import { INTERIOR_WALL, layerWalls, type LayerWalls } from '../model/walls'
import { getPrefs } from './prefs'

/**
 * Data worked out from the plan, cached per object: edits replace only what they change (see edit.ts), so
 * an unchanged object means an unchanged result.
 */

// regions and wall thicknesses depend on a layer's lines only, so they are keyed by its vertex and segment maps:
// renaming or moving an area replaces the layer object but keeps both maps
const facesCache = new WeakMap<Layer['vertices'], WeakMap<Layer['segments'], LayerFaces>>()

function getFaces(layer: Layer): LayerFaces {
  let bySegments = facesCache.get(layer.vertices)
  if (!bySegments) facesCache.set(layer.vertices, (bySegments = new WeakMap()))
  let faces = bySegments.get(layer.segments)
  if (!faces) bySegments.set(layer.segments, (faces = layerFaces(layer)))
  return faces
}

export const getRegions = (layer: Layer): Region[] => getFaces(layer).regions

/** Each wall's thickness: its own or automatic. Walls only. */
export const getThickness = (layer: Layer): ReadonlyMap<string, number> => getFaces(layer).thickness

/** Whether a wall faces outside (automatic walls that do are exterior walls). */
export const facesOutside = (layer: Layer, segment: string): boolean => getFaces(layer).exterior.has(segment)

/** The thickness a door, window or gate is drawn for: its wall's, or a usual one in a fence drawn as an open edge. */
export const hostThickness = (layer: Layer, segment: string): number => getThickness(layer).get(segment) ?? INTERIOR_WALL

/** How far a line's drawn faces are from it: half a wall's thickness when walls are drawn thick, else nothing. */
export const drawnHalfWidth = (layer: Layer, segment: string): number => (getPrefs().thickWalls ? (getThickness(layer).get(segment) ?? 0) / 2 : 0)

// walls as drawn also depend on the openings cut through them
const wallsCache = new WeakMap<Layer, LayerWalls>()

export function getWalls(layer: Layer): LayerWalls {
  let walls = wallsCache.get(layer)
  if (!walls) wallsCache.set(layer, (walls = layerWalls(layer, getThickness(layer))))
  return walls
}

/** An area with the region it names (null when its point is not enclosed) and where its label goes. */
export interface PlacedArea {
  layer: Layer
  id: string
  area: Area
  region: Region | null
  label: Vec
}

const placedCache = new WeakMap<Layer, PlacedArea[]>()

export function getPlacedAreas(layer: Layer): PlacedArea[] {
  let placed = placedCache.get(layer)
  if (!placed) {
    const regions = getRegions(layer)
    placed = Object.entries(layer.areas).map(([id, area]) => {
      const region = regionAt(regions, area.at)
      return { layer, id, area, region, label: region ? regionLabel(region) : area.at }
    })
    placedCache.set(layer, placed)
  }
  return placed
}

/** An area's size: a lot's to its boundary lines (the lot lines), a room's floor inside its walls; null when not enclosed. */
export const areaSize = (a: PlacedArea): number | null => (a.region ? (a.area.lot ? a.region.area : a.region.floor) : null)

const planAreasCache = new WeakMap<Plan, PlacedArea[]>()

/**
 * The areas of every layer, bottom layer first, with a lot's label on its open ground: clear of the box around
 * each other visible layer's areas (the house, a pool), which a lot's middle often falls in, where its label would
 * cover them and take their clicks. Boxes rather than every room keep this quick enough to redo on every edit.
 */
export function planAreas(plan: Plan): PlacedArea[] {
  let all = planAreasCache.get(plan)
  if (!all) {
    const placed = plan.layers.flatMap(getPlacedAreas)
    all = placed.map((a) => {
      if (!a.area.lot || !a.region) return a
      const over = plan.layers.flatMap((layer) => {
        const box = layer !== a.layer && layer.visible ? boundsOf(getPlacedAreas(layer).flatMap((o) => (o.region && !o.area.lot ? o.region.outer : []))) : null
        return box ? [[{ x: box.x0, y: box.y0 }, { x: box.x1, y: box.y0 }, { x: box.x1, y: box.y1 }, { x: box.x0, y: box.y1 }]] : []
      })
      return over.length ? { ...a, label: labelPoint(a.region.outer, [...a.region.holes, ...over]) } : a
    })
    planAreasCache.set(plan, all)
  }
  return all
}

/** Areas of every visible layer, bottom layer first. */
export function visibleAreas(plan: Plan): PlacedArea[] {
  return planAreas(plan).filter((a) => a.layer.visible)
}

/**
 * Covered area of the visible layers (on floor `storey` only, when given), to the walls' outside faces: the indoor
 * areas (rooms) with the walls around and in them, each wall counted once. Galleries and porches, and pools and
 * paving, open to the outside across open edges or outlines, are left out, and so are lots.
 */
export function coveredArea(plan: Plan, storey?: number): number {
  let total = 0
  for (const layer of plan.layers) {
    if (!layer.visible || (storey !== undefined && storeyOf(layer) !== storey)) continue
    const walls = new Set<string>()
    for (const { region, area } of getPlacedAreas(layer)) {
      if (!region?.indoor || area.lot) continue
      total += region.floor
      for (const id of region.wallIds) walls.add(id)
    }
    const { footprint } = getWalls(layer)
    for (const id of walls) total += footprint.get(id) ?? 0
  }
  return total
}

const storeyCache = new WeakMap<Plan, Map<string, Plan>>()

/**
 * The plan as the canvas works on it: only the layers on the active layer's floor, and with `below` those on the
 * floor under it too (drawn faded, and snapped to). For finding things under the cursor only: an edit made from it
 * would drop the other floors.
 */
export function storeyView(plan: Plan, activeLayer: string, below = false): Plan {
  const storey = storeyOf(findLayer(plan, activeLayer))
  const under = below ? Math.max(-1, ...plan.layers.map(storeyOf).filter((s) => s < storey)) : storey
  const key = `${storey}:${under}`
  let views = storeyCache.get(plan)
  if (!views) storeyCache.set(plan, (views = new Map()))
  let view = views.get(key)
  if (!view) {
    const layers = plan.layers.filter((l) => storeyOf(l) === storey || storeyOf(l) === under)
    views.set(key, (view = layers.length === plan.layers.length ? plan : { ...plan, layers }))
  }
  return view
}

// the house in 3-D depends on everything visible, so it is worked out again for every new plan, from the caches above
const solidsCache = new WeakMap<Plan, Solid[]>()

/** The house in 3-D for the Exterior tab: the visible layers' walls, openings, floors and roofs. */
export function getSolids(plan: Plan): Solid[] {
  let solids = solidsCache.get(plan)
  if (!solids) solidsCache.set(plan, (solids = houseSolids(plan, { faces: getFaces, walls: getWalls })))
  return solids
}

const takeoffCache = new WeakMap<Plan, TakeoffRow[]>()

/** The materials list for the Materials tab, from the visible layers and their solids. */
export function getTakeoff(plan: Plan): TakeoffRow[] {
  let rows = takeoffCache.get(plan)
  if (!rows) takeoffCache.set(plan, (rows = materialsList(plan, getSolids(plan), { faces: getFaces, walls: getWalls })))
  return rows
}

const foundationCache = new WeakMap<Plan, FoundationPlan>()

/** The foundation plan for the Foundation tab, from the visible layers. */
export function getFoundation(plan: Plan): FoundationPlan {
  let f = foundationCache.get(plan)
  if (!f) foundationCache.set(plan, (f = foundationPlan(plan, getSolids(plan), { faces: getFaces, walls: getWalls })))
  return f
}
