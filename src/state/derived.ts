import type { Vec } from '../model/geometry'
import type { Area, Layer, Plan } from '../model/plan'
import { layerFaces, regionAt, regionLabel, type LayerFaces, type Region } from '../model/regions'
import { houseSolids, type Solid } from '../model/solids'
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

/** Areas of every visible layer, bottom layer first. */
export function visibleAreas(plan: Plan): PlacedArea[] {
  return plan.layers.filter((l) => l.visible).flatMap(getPlacedAreas)
}

/**
 * Covered area of the visible layers, to the walls' outside faces: the indoor areas (rooms) with the walls around
 * and in them, each wall counted once. Galleries and porches, and pools and paving, open to the outside across
 * open edges or outlines, are left out.
 */
export function coveredArea(plan: Plan): number {
  let total = 0
  for (const layer of plan.layers) {
    if (!layer.visible) continue
    const walls = new Set<string>()
    for (const { region } of getPlacedAreas(layer)) {
      if (!region?.indoor) continue
      total += region.floor
      for (const id of region.wallIds) walls.add(id)
    }
    const { footprint } = getWalls(layer)
    for (const id of walls) total += footprint.get(id) ?? 0
  }
  return total
}

// the house in 3-D depends on everything visible, so it is worked out again for every new plan, from the caches above
const solidsCache = new WeakMap<Plan, Solid[]>()

/** The house in 3-D for the Exterior tab: the visible layers' walls, openings, floors and roofs. */
export function getSolids(plan: Plan): Solid[] {
  let solids = solidsCache.get(plan)
  if (!solids) solidsCache.set(plan, (solids = houseSolids(plan, { faces: getFaces, walls: getWalls })))
  return solids
}
