import { frustumFaces, prismFaces, profileFaces, ring, smoothSides, type Face } from './faces'
import { ellipse, local, type Placement } from './furniture'
import type { Vec } from './geometry'
import type { Service } from './plan'
import { isDisc, serviceInfo } from './services'
import type { SolidMaterial } from './solids'

/**
 * The Plumbing and HVAC tabs' equipment in 3-D, at its real size and where it is fitted: tanks standing on the roof
 * over them (or on a steel tower where none is), water heaters and heat pumps on the floor, a boiler, a split unit,
 * an extractor and a manifold on the wall at their usual heights, radiators low on the wall with their fins, a range
 * hood over the cooker; outdoor units with their fan; and of what is buried (a cistern, a septic tank or biodigestor,
 * a chamber, a soakaway, the sewer) only what shows at ground level: lids, a biodigestor's neck, a well's head.
 *
 * Buried pieces start a little under the ground, so a raised layer's floor level does not lift them off it (see
 * houseSolids: only what stands on the floor is raised).
 */

export interface ServicePart {
  faces: Face[]
  material: SolidMaterial
}

/** Where things are fitted, m above the floor: a boiler's underside, a split's top, an extractor's, a hood's canopy, wall cabinets' undersides. */
export const MOUNT = { boiler: 1.0, split: 2.35, extractor: 2.2, hood: 1.6, cabinet: 0.35, radiator: 0.15 }
/** A tank's tower where no roof is over it, and its base on a roof, m. */
export const TANK_STAND = { tower: 2.4, base: 0.1, leg: 0.08 }
/** How far a buried piece reaches under the ground, and how far its lid stands above it, m. */
const BURIED = { under: 0.3, lid: 0.05 }

/**
 * A piece's parts. `roofTop`: for a tank, the height of the roof's top under it (the highest point of it under the
 * tank's footprint), so it stands there; undefined when no roof is over it.
 */
export function serviceParts(s: Service, pl: Placement, roofTop?: number): ServicePart[] {
  const info = serviceInfo(s.kind)
  const [hw, hd] = [pl.width / 2, pl.depth / 2]
  const parts: ServicePart[] = []
  const box = (x0: number, y0: number, x1: number, y1: number): Vec[] => [local(pl, x0, y0), local(pl, x1, y0), local(pl, x1, y1), local(pl, x0, y1)]
  const put = (outline: Vec[], bottom: number, top: number, material: SolidMaterial, holes: Vec[][] = [], round = false) => {
    const faces = prismFaces(outline, holes, bottom, top)
    parts.push({ faces: round ? smoothSides(faces) : faces, material })
  }
  /** The footprint: an ellipse for what is round, else the rectangle, shrunk by `by` on each side. */
  const footprint = (by = 0): Vec[] => (isDisc(s.kind) ? ellipse(pl, -hw + by, -hd + by, hw - by, hd - by, 32) : box(-hw + by, -hd + by, hw - by, hd - by))
  /** A round post at local (x, y). */
  const post = (x: number, y: number, r: number, bottom: number, top: number, material: SolidMaterial) => put(ring(local(pl, x, y), r, 12), bottom, top, material, [], true)
  /** A disc in the vertical plane of the front, `forward` beyond it: a fan's grille, a control. */
  const frontDisc = (x: number, z: number, r: number, material: SolidMaterial, forward = 0) => {
    const profile: [number, number][] = Array.from({ length: 24 }, (_, i) => {
      const a = (i * 2 * Math.PI) / 24
      return [r + r * Math.cos(a), z + r * Math.sin(a)]
    })
    parts.push({ faces: profileFaces(local(pl, x - r, hd + 0.006 + forward), pl.u, 0.006, profile), material })
  }
  /** A lid at ground level over something buried: a concrete slab over its footprint, reaching under the ground. */
  const lid = (material: SolidMaterial = 'slab') => put(footprint(), -BURIED.under, BURIED.lid, material, [], isDisc(s.kind))
  /** A square access cover on a lid. */
  const cover = (side: number, x = 0, y = 0) => put(box(x - side / 2, y - side / 2, x + side / 2, y + side / 2), BURIED.lid, BURIED.lid + 0.015, 'metal')

  switch (s.kind) {
    case 'tank': {
      // on the roof over it on a concrete base, or on a steel tower
      const r = Math.min(hw, hd)
      let base = TANK_STAND.tower
      if (roofTop !== undefined) {
        base = roofTop + TANK_STAND.base
        put(box(-hw, -hd, hw, hd), roofTop - 0.3, base, 'slab')
      } else {
        const leg = TANK_STAND.leg
        for (const [x, y] of [
          [-hw + leg, -hd + leg],
          [hw - leg, -hd + leg],
          [hw - leg, hd - leg],
          [-hw + leg, hd - leg],
        ]) {
          put(box(x - leg / 2, y - leg / 2, x + leg / 2, y + leg / 2), 0, base, 'metal')
        }
        put(box(-hw, -hd, hw, hd), base - 0.06, base, 'metal')
        put(box(-hw + 0.1, -0.03, hw - 0.1, 0.03), 0.8, 0.86, 'metal')
      }
      const height = info.height
      parts.push({ faces: smoothSides(frustumFaces(pl.at, r, r * 0.96, base, base + height, 32)), material: 'plastic' })
      parts.push({ faces: smoothSides(frustumFaces(pl.at, r * 0.45, r * 0.4, base + height, base + height + 0.08, 24)), material: 'plastic' })
      break
    }
    case 'cistern':
      lid()
      cover(0.6)
      break
    case 'well':
      // a concrete ring round the bore, a steel lid on it
      put(footprint(), -0.2, 0.45, 'slab', [footprint(0.12)], true)
      put(footprint(0.12), 0.4, 0.42, 'metal', [], true)
      break
    case 'well-pump':
      // in the well: what shows is its discharge head and cable box
      post(0, 0, 0.04, 0.42, 0.75, 'metal')
      put(box(-0.08, -0.05, 0.08, 0.05), 0.75, 0.9, 'metal')
      break
    case 'mains-water':
      // the meter box: a concrete niche with a steel door on its front
      put(box(-hw, -hd, hw, hd), -0.1, 0.6, 'slab')
      put(box(-hw + 0.05, hd, hw - 0.05, hd + 0.01), 0.1, 0.5, 'metal')
      break
    case 'pump':
      // a motor on a base, the pump body at its end
      put(box(-hw, -hd, hw, hd), 0, 0.05, 'metal')
      // the motor: a cylinder lying along the pump (a circle across its front direction, drawn out along it)
      parts.push({ faces: profileFaces(local(pl, -hw * 0.2, -0.11), pl.v, hw * 0.5, circle(0.11, 0.17, 0.11)), material: 'metal' })
      post(hw - 0.12, 0, Math.min(0.1, hd), 0.05, 0.3, 'ceramic')
      break
    case 'filter':
      put(footprint(), 0, info.height, 'plastic', [], true)
      put(footprint(0.03), info.height, info.height + 0.08, 'metal', [], true)
      break
    case 'manifold':
    case 'underfloor-manifold': {
      // a cabinet on the wall, its pipes down to the floor
      const top = MOUNT.cabinet + info.height
      put(box(-hw, -hd, hw, hd), MOUNT.cabinet, top, s.kind === 'manifold' ? 'metal' : 'ceramic')
      const n = Math.max(2, Math.round(pl.width / 0.1))
      for (let i = 0; i < n; i++) post(-hw + ((i + 0.5) * pl.width) / n, 0, 0.01, 0, MOUNT.cabinet, 'metal')
      break
    }
    case 'tap':
      // a garden tap on a short post
      post(0, 0, 0.03, 0, 0.6, 'metal')
      put(box(-0.012, 0, 0.012, 0.1), 0.52, 0.55, 'metal')
      break
    case 'heater-gas':
    case 'heater-electric': {
      // a storage heater on the floor; a gas one with its flue up
      const r = Math.min(hw, hd)
      parts.push({ faces: smoothSides(frustumFaces(pl.at, r, r, 0, info.height, 32)), material: 'ceramic' })
      frontDisc(0, 0.35, 0.05, 'soot', r - hd)
      if (s.kind === 'heater-gas') parts.push({ faces: smoothSides(frustumFaces(pl.at, 0.05, 0.05, info.height, info.height + 0.6, 12)), material: 'metal' })
      break
    }
    case 'boiler': {
      // hung on the wall: a white case, its controls low on the front, its flue out of the top
      const top = MOUNT.boiler + info.height
      put(box(-hw, -hd, hw, hd), MOUNT.boiler, top, 'ceramic')
      put(box(-hw + 0.03, hd, hw - 0.03, hd + 0.01), MOUNT.boiler + 0.03, MOUNT.boiler + 0.12, 'soot')
      post(0, -hd + 0.08, 0.05, top, top + 0.35, 'metal')
      break
    }
    case 'heat-pump':
    case 'split-outdoor': {
      // an outdoor unit on its feet: a case with a fan behind a round grille
      put(box(-hw + 0.05, -hd + 0.05, -hw + 0.1, hd - 0.05), 0, 0.08, 'metal')
      put(box(hw - 0.1, -hd + 0.05, hw - 0.05, hd - 0.05), 0, 0.08, 'metal')
      put(box(-hw, -hd, hw, hd), 0.08, 0.08 + info.height, 'ceramic')
      const r = Math.min(info.height * 0.38, hw * 0.45)
      frontDisc(-hw * 0.25, 0.08 + info.height / 2, r, 'soot')
      break
    }
    case 'split-indoor': {
      // high on the wall, its louvre under the front
      const bottom = MOUNT.split - info.height
      put(box(-hw, -hd, hw, hd), bottom + 0.06, MOUNT.split, 'ceramic')
      put(box(-hw + 0.02, -hd, hw - 0.02, hd - 0.03), bottom, bottom + 0.06, 'soot')
      break
    }
    case 'radiator': {
      // fins side by side, low on the wall
      const fins = Math.max(3, Math.round(pl.width / 0.08))
      const w = pl.width / fins
      for (let i = 0; i < fins; i++) put(box(-hw + i * w + 0.004, -hd, -hw + (i + 1) * w - 0.004, hd), MOUNT.radiator, MOUNT.radiator + info.height, 'ceramic')
      break
    }
    case 'extractor':
      put(box(-hw, -hd, hw, hd), MOUNT.extractor - info.height, MOUNT.extractor, 'ceramic')
      for (let k = 1; k < 5; k++) {
        const z = MOUNT.extractor - (info.height * k) / 5
        put(box(-hw + 0.03, hd, hw - 0.03, hd + 0.005), z - 0.01, z, 'soot')
      }
      break
    case 'range-hood': {
      // a canopy over the cooker, narrowing into its chimney up the wall
      put(box(-hw, -hd, hw, hd), MOUNT.hood, MOUNT.hood + 0.12, 'metal')
      const neck = box(-hw * 0.35, -hd, hw * 0.35, -hd + pl.depth * 0.5)
      put(neck, MOUNT.hood + 0.12, MOUNT.hood + 0.12 + 0.9, 'metal')
      break
    }
    case 'floor-drain':
      // a grille in the floor
      put(box(-hw, -hd, hw, hd), -0.02, 0.004, 'metal')
      for (let k = 1; k < 4; k++) {
        const x = -hw + (pl.width * k) / 4
        put(box(x - 0.006, -hd + 0.02, x + 0.006, hd - 0.02), 0.004, 0.006, 'soot')
      }
      break
    case 'grease-trap':
    case 'chamber':
    case 'sewer':
      lid()
      cover(Math.min(pl.width, pl.depth) * 0.7)
      break
    case 'septic':
      // its lid, with two covers: one over each chamber
      lid()
      cover(0.5, -hw * 0.5, 0)
      cover(0.5, hw * 0.5, 0)
      break
    case 'biodigestor': {
      // buried; its round neck and lid show
      const r = Math.min(0.3, Math.min(hw, hd) * 0.5)
      parts.push({ faces: smoothSides(frustumFaces(pl.at, r, r, -BURIED.under, 0.25, 24)), material: 'plastic' })
      parts.push({ faces: smoothSides(frustumFaces(pl.at, r + 0.03, r - 0.02, 0.25, 0.32, 24)), material: 'plastic' })
      break
    }
    case 'soakaway':
      lid()
      cover(0.6)
      break
    case 'gas-meter':
      put(box(-hw, -hd, hw, hd), 0, info.height, 'slab')
      put(box(-hw + 0.04, hd, hw - 0.04, hd + 0.01), info.height - 0.45, info.height - 0.05, 'metal')
      break
    case 'gas-cylinders': {
      put(box(-hw, -hd, hw, hd), 0, info.height, 'slab')
      const n = Math.max(1, Math.round(pl.width / 0.5))
      const w = pl.width / n
      for (let i = 0; i < n; i++) put(box(-hw + i * w + 0.03, hd, -hw + (i + 1) * w - 0.03, hd + 0.01), 0.1, info.height - 0.1, 'metal')
      break
    }
    case 'gas-valve':
      put(box(-hw, -hd, hw, hd), -0.2, 0.03, 'slab')
      put(box(-hw + 0.03, -hd + 0.03, hw - 0.03, hd - 0.03), 0.03, 0.04, 'metal')
      break
    case 'gas-outlet':
      post(0, 0, 0.015, 0, info.height, 'metal')
      put(box(-0.05, -0.01, 0.05, 0.01), info.height - 0.1, info.height - 0.08, 'plastic')
      break
    case 'gas-heater':
      put(box(-hw, -hd, hw, hd), MOUNT.radiator, MOUNT.radiator + info.height, 'ceramic')
      put(box(-hw + 0.04, hd, hw - 0.04, hd + 0.005), MOUNT.radiator + 0.08, MOUNT.radiator + info.height * 0.55, 'soot')
      break
  }
  return parts
}

/** A circle in a vertical profile: centred (s, z), radius r. */
function circle(s: number, z: number, r: number): [number, number][] {
  return Array.from({ length: 16 }, (_, i) => {
    const a = (i * 2 * Math.PI) / 16
    return [s + r * Math.cos(a), z + r * Math.sin(a)]
  })
}
