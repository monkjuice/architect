import { addLayer, updateLayer } from './edit'
import { segmentKind, storeyOf, type Layer, type Plan } from './plan'
import { WALL_HEIGHT, wallHeight } from './walls'

/**
 * Floors (storeys). Every layer is on one: the ground floor, or up to three floors above it. A floor above stands on
 * a slab UPPER_SLAB thick whose top is at its layer's level, under its named areas (rooms, galleries, a balcony, a
 * loft) out to its walls' outside faces, so a space left unnamed (a stairwell, the void over a double-height room)
 * has no floor. There an open edge with a floor on one side only (a balcony's front, a loft's edge, round a
 * stairwell) gets a railing; an outline is a plain edge, as where a stair arrives. A stair climbs from its layer's
 * floor to the next floor up.
 */

/** An upper floor's slab under it (the ceiling of the floor below), m. */
export const UPPER_SLAB = 0.3
export const MAX_STOREY = 3
/** A railing's height over its floor, m. */
export const RAILING = 1

const ORDINALS = ['Ground', '1st', '2nd', '3rd']

export const storeyName = (storey: number): string => `${ORDINALS[storey] ?? `${storey}th`} floor`

/** The floors the plan's layers are on, from the ground up. */
export const storeys = (plan: Plan): number[] => [...new Set(plan.layers.map(storeyOf))].sort((a, b) => a - b)

export const levelOf = (layer: Layer): number => layer.level ?? 0

/** A layer's tallest wall, or the usual height when it has none. */
function tallest(layer: Layer): number {
  const heights = Object.values(layer.segments).flatMap((s) => (segmentKind(s) === 'wall' ? [wallHeight(s)] : []))
  return heights.length ? Math.max(...heights) : WALL_HEIGHT
}

/**
 * The level a floor stands at: its lowest layer's, or for a floor with no layers yet, the top of the walls on the
 * floor below plus a slab (3.00 m over a ground floor of 2.70 m walls).
 */
export function storeyLevel(plan: Plan, storey: number): number {
  if (storey <= 0) return 0
  const on = plan.layers.filter((l) => storeyOf(l) === storey)
  if (on.length) return Math.min(...on.map(levelOf))
  const below = plan.layers.filter((l) => storeyOf(l) === storey - 1)
  const top = below.length ? Math.max(...below.map((l) => levelOf(l) + tallest(l))) : storeyLevel(plan, storey - 1) + WALL_HEIGHT
  return Math.round((top + UPPER_SLAB) * 1000) / 1000
}

/** How high a stair on `layer` climbs: up to the floor above, or with none a floor's usual height. */
export function stairRise(plan: Plan, layer: Layer): number {
  const storey = storeyOf(layer)
  const above = plan.layers.some((l) => storeyOf(l) === storey + 1)
  const rise = above ? storeyLevel(plan, storey + 1) - levelOf(layer) : tallest(layer) + UPPER_SLAB
  return rise > 0.5 ? rise : WALL_HEIGHT + UPPER_SLAB
}

/** A layer on a new floor over the top one, at its level (see storeyLevel); null when the plan has every floor. */
export function addStorey(plan: Plan): { plan: Plan; id: string } | null {
  const storey = Math.max(...plan.layers.map(storeyOf)) + 1
  if (storey > MAX_STOREY) return null
  const added = addLayer(plan, storeyName(storey))
  return { plan: updateLayer(added.plan, added.id, { storey, level: storeyLevel(plan, storey) }), id: added.id }
}
