import { add, dist, dot, mul, sub, type Vec } from './geometry'
import type { Material } from './materials'
import type { Layer } from './plan'
import { regionAt, type Region } from './regions'

/**
 * Finishes: materials on the two sides of a wall and on the floors of areas. A wall's sides are named looking
 * from its `a` end to its `b` end, as a door's swing is, because each side usually faces a different room. Whether
 * a side or a floor is outdoors (anything but a room: the outside, a gallery, a pool) decides which materials suit
 * it (see materials.ts).
 */

export type WallSide = 'left' | 'right'

/** Out from the line a→b towards `side`, unit length (+y is down, so the left of a→b is (d.y, −d.x)). */
export function sideNormal(a: Vec, b: Vec, side: WallSide): Vec {
  const l = dist(a, b)
  const left = { x: (b.y - a.y) / l, y: -(b.x - a.x) / l }
  return side === 'left' ? left : mul(left, -1)
}

/** The side of the line a→b that `p` is on. */
export const sideOf = (a: Vec, b: Vec, p: Vec): WallSide => (dot(sub(p, a), { x: b.y - a.y, y: -(b.x - a.x) }) >= 0 ? 'left' : 'right')

/**
 * What one side of a wall faces: the region there (null for the outside) and whether that is outdoors: not a room,
 * or a lot (its boundary walls close it in, but it is land).
 */
export function wallSide(layer: Layer, regions: readonly Region[], half: number, segment: string, side: WallSide): { region: Region | null; outdoor: boolean } {
  const s = layer.segments[segment]
  const [a, b] = [layer.vertices[s.a], layer.vertices[s.b]]
  const region = regionAt(regions, add(mul(add(a, b), 0.5), mul(sideNormal(a, b, side), half + 0.05)))
  const lot = !!region && Object.values(layer.areas).some((area) => area.lot && regionAt(regions, area.at) === region)
  return { region, outdoor: !region?.indoor || lot }
}

/** A wall's face on one side, as a line `half` out from its centreline. */
export function faceLine(layer: Layer, segment: string, side: WallSide, half: number): [Vec, Vec] {
  const s = layer.segments[segment]
  const [a, b] = [layer.vertices[s.a], layer.vertices[s.b]]
  const n = mul(sideNormal(a, b, side), half)
  return [add(a, n), add(b, n)]
}

/** Why a material cannot finish a wall's side or a floor (outdoors or not), or null when it can. */
export function finishProblem(material: Material, surface: 'wall' | 'floor', outdoor: boolean): string | null {
  if (!material.surfaces.includes(surface)) return `${material.title} is not for ${surface}s.`
  if (outdoor && !material.outdoor) return `${material.title} is for indoors, and this ${surface === 'wall' ? 'side of the wall faces' : 'floor is'} outdoors.`
  if (!outdoor && !material.indoor) return `${material.title} is for outdoors, and this ${surface === 'wall' ? 'side of the wall faces a room' : 'floor is in a room'}.`
  return null
}
