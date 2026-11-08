import { dist, EPS } from './geometry'
import { wallSide, type WallSide } from './finishes'
import { segmentKind, storeyOf, type Layer, type Plan } from './plan'
import { pointInPolygon, regionAt, regionLabel, type Region } from './regions'
import { eavesOf } from './roofs'
import type { SolidsSource } from './solids'
import { INTERIOR_WALL } from './walls'

/**
 * What each wall separates, for building it and for what it stands on: a room from the outside (the envelope), two
 * rooms (a partition), or nothing indoors (a boundary or garden wall). A side is indoors on a room: a space walled
 * off, not a lot, and named or built over (a roof on its floor or above, a floor above). An enclosed space that is
 * neither (land between boundary walls, marked as a lot on another layer) is outdoors.
 */

export type WallUse = 'envelope' | 'partition' | 'boundary'

export interface WallInfo {
  layer: Layer
  segment: string
  thickness: number
  use: WallUse
  /** Whether each side is outdoors. */
  outdoor: Record<WallSide, boolean>
}

/** The walls of the visible layers with what they separate. */
export function wallUses(plan: Plan, source: SolidsSource): WallInfo[] {
  const visible = plan.layers.filter((l) => l.visible)
  const roofed = visible.flatMap((l) => Object.values(l.roofs).map((r) => ({ storey: storeyOf(l), eaves: eavesOf(r) })))
  const floored = visible.flatMap((l) =>
    Object.values(l.areas).flatMap((a) => {
      const r = storeyOf(l) && !a.lot ? regionAt(source.faces(l).regions, a.at) : null
      return r ? [{ storey: storeyOf(l), outer: r.outer }] : []
    }),
  )
  const out: WallInfo[] = []
  for (const layer of visible) {
    const faces = source.faces(layer)
    const storey = storeyOf(layer)
    const room = (region: Region | null) => {
      if (!region) return false
      if (Object.values(layer.areas).some((a) => !a.lot && regionAt(faces.regions, a.at) === region)) return true
      const p = regionLabel(region)
      return roofed.some((r) => r.storey >= storey && pointInPolygon(p, r.eaves)) || floored.some((f) => f.storey > storey && pointInPolygon(p, f.outer))
    }
    for (const [id, s] of Object.entries(layer.segments)) {
      if (segmentKind(s) !== 'wall' || dist(layer.vertices[s.a], layer.vertices[s.b]) < EPS) continue
      const t = faces.thickness.get(id) ?? INTERIOR_WALL
      const [left, right] = (['left', 'right'] as WallSide[]).map((side) => wallSide(layer, faces.regions, t / 2, id, side))
      const outdoor = { left: left.outdoor || !room(left.region), right: right.outdoor || !room(right.region) }
      const use: WallUse = outdoor.left && outdoor.right ? 'boundary' : outdoor.left || outdoor.right ? 'envelope' : 'partition'
      out.push({ layer, segment: id, thickness: t, use, outdoor })
    }
  }
  return out
}
