import { prismFaces, ring, smoothSides, type Face } from './faces'
import type { Vec } from './geometry'
import { ellipse, local, rounded, showerPoint, type Placement } from './furniture'
import type { Furniture } from './plan'
import type { SolidMaterial } from './solids'

/**
 * Furniture in 3-D, as simple blocks of the right size and height: a counter's cabinets, toe kick and worktop;
 * basins sunk into their tops with a tap; bathtubs with a real basin and a shower riser at the shower head; beds
 * with frame, headboard, mattress, pillows and cover; tables and chairs.
 */

export interface FurniturePart {
  faces: Face[]
  material: SolidMaterial
}

/** The tops of things, in m above the floor. */
export const WORKTOP = 0.9
const VANITY = 0.86
const SHOWER_HEAD = 1.95

export function furnitureParts(f: Furniture, pl: Placement): FurniturePart[] {
  const [hw, hd] = [pl.width / 2, pl.depth / 2]
  const parts: FurniturePart[] = []
  const box = (x0: number, y0: number, x1: number, y1: number): Vec[] => [local(pl, x0, y0), local(pl, x1, y0), local(pl, x1, y1), local(pl, x0, y1)]
  const put = (outline: Vec[], bottom: number, top: number, material: SolidMaterial, holes: Vec[][] = [], round = false) => {
    const faces = prismFaces(outline, holes, bottom, top)
    parts.push({ faces: round ? smoothSides(faces) : faces, material })
  }
  /** A round post centred at local (x, y). */
  const post = (x: number, y: number, r: number, bottom: number, top: number, material: SolidMaterial) => put(ring(local(pl, x, y), r, 12), bottom, top, material, [], true)
  /** A tap at the back of a basin whose top is at `top`: a post and a spout reaching forward. */
  const tap = (top: number) => {
    post(0, -hd + 0.05, 0.018, top, top + 0.24, 'metal')
    put(box(-0.012, -hd + 0.05, 0.012, -hd + 0.2), top + 0.2, top + 0.24, 'metal')
  }

  switch (f.kind) {
    case 'counter':
      put(box(-hw, -hd, hw, hd - 0.07), 0, 0.1, 'soot')
      put(box(-hw, -hd, hw, hd - 0.02), 0.1, WORKTOP - 0.04, 'wood')
      put(box(-hw, -hd, hw, hd), WORKTOP - 0.04, WORKTOP, 'stone')
      break
    case 'sink':
      if (f.style === 'kitchen') {
        // on the counter's worktop: a steel rim round the dark of the basin
        const inner = rounded(pl, -hw + 0.06, -hd + 0.08, hw - 0.06, hd - 0.05, 0.05)
        put(box(-hw, -hd, hw, hd), WORKTOP, WORKTOP + 0.006, 'metal', [inner])
        put(inner, WORKTOP, WORKTOP + 0.002, 'soot')
        tap(WORKTOP + 0.006)
      } else if (f.style === 'bathroom') {
        // a vanity unit, its top with the basin sunk into it
        const bowl = ellipse(pl, -hw + 0.07, -hd + 0.1, hw - 0.07, hd - 0.05)
        put(box(-hw, -hd, hw, hd), 0, VANITY - 0.06, 'wood')
        put(box(-hw, -hd, hw, hd), VANITY - 0.06, VANITY, 'ceramic', [bowl])
        put(bowl, VANITY - 0.16, VANITY - 0.06, 'ceramic', [], true)
        tap(VANITY)
      } else {
        // a stone basin on a pedestal
        const inner = rounded(pl, -hw + 0.06, -hd + 0.08, hw - 0.06, hd - 0.05, 0.05)
        put(box(-0.15, -0.15, 0.15, 0.15), 0, 0.68, 'stone')
        put(box(-hw, -hd, hw, hd), 0.68, 0.85, 'stone', [inner])
        put(inner, 0.68, 0.72, 'stone')
        tap(0.85)
      }
      break
    case 'bathtub': {
      let rim = 0.55
      if (f.style === 'clawfoot') {
        rim = 0.62
        const inner = ellipse(pl, -hw + 0.07, -hd + 0.07, hw - 0.07, hd - 0.07)
        put(ellipse(pl, -hw, -hd, hw, hd), 0.15, rim, 'ceramic', [inner], true)
        put(inner, 0.15, 0.25, 'ceramic', [], true)
        for (const [x, y] of [
          [-hw + 0.25, -hd + 0.14],
          [hw - 0.25, -hd + 0.14],
          [hw - 0.25, hd - 0.14],
          [-hw + 0.25, hd - 0.14],
        ]) {
          post(x, y, 0.035, 0, 0.15, 'metal')
        }
      } else if (f.style === 'drop-in') {
        const inner = ellipse(pl, -hw + 0.12, -hd + 0.12, hw - 0.12, hd - 0.12)
        put(box(-hw, -hd, hw, hd), 0, rim, 'stone', [inner])
        put(inner, 0, 0.15, 'ceramic', [], true)
      } else {
        const inner = rounded(pl, -hw + 0.08, -hd + 0.08, hw - 0.08, hd - 0.08, 0.2)
        put(box(-hw, -hd, hw, hd), 0, rim, 'ceramic', [inner])
        put(inner, 0, 0.15, 'ceramic')
      }
      // the shower: a riser from the rim up to its head
      const s = showerPoint(pl, f.shower)
      put(ring(s, 0.012, 10), rim, SHOWER_HEAD, 'metal', [], true)
      put(ring(s, 0.09, 16), SHOWER_HEAD, SHOWER_HEAD + 0.03, 'metal', [], true)
      break
    }
    case 'bed': {
      const two = pl.width >= 1.3
      put(box(-hw, -hd, hw, hd), 0, 0.32, 'wood')
      put(box(-hw, -hd, hw, -hd + 0.06), 0.32, 1.0, 'wood')
      put(box(-hw + 0.03, -hd + 0.06, hw - 0.03, hd - 0.03), 0.32, 0.55, 'interior')
      const pillow = (x0: number, x1: number) => put(rounded(pl, x0, -hd + 0.1, x1, -hd + 0.42, 0.06), 0.55, 0.66, 'interior')
      if (two) {
        pillow(-hw + 0.08, -0.04)
        pillow(0.04, hw - 0.08)
      } else pillow(-hw + 0.1, hw - 0.1)
      put(box(-hw + 0.01, -hd + 0.62, hw - 0.01, hd - 0.01), 0.55, 0.6, 'fabric')
      break
    }
    case 'table':
      if (f.style === 'circle') {
        put(ellipse(pl, -hw, -hd, hw, hd, 48), 0.71, 0.75, 'wood', [], true)
        post(0, 0, 0.05, 0.04, 0.71, 'wood')
        post(0, 0, Math.min(0.28, hw * 0.5), 0, 0.04, 'wood')
      } else {
        put(box(-hw, -hd, hw, hd), 0.71, 0.75, 'wood')
        for (const [x, y] of [
          [-hw + 0.04, -hd + 0.04],
          [hw - 0.04, -hd + 0.04],
          [hw - 0.04, hd - 0.04],
          [-hw + 0.04, hd - 0.04],
        ]) {
          put(box(x - 0.025, y - 0.025, x + 0.025, y + 0.025), 0, 0.71, 'wood')
        }
      }
      break
    case 'chair':
      put(box(-hw + 0.02, -hd + 0.05, hw - 0.02, hd), 0.42, 0.46, 'wood')
      for (const [x, y] of [
        [-hw + 0.04, -hd + 0.07],
        [hw - 0.04, -hd + 0.07],
        [hw - 0.04, hd - 0.03],
        [-hw + 0.04, hd - 0.03],
      ]) {
        put(box(x - 0.017, y - 0.017, x + 0.017, y + 0.017), 0, 0.42, 'wood')
      }
      put(box(-hw + 0.02, -hd, hw - 0.02, -hd + 0.05), 0.42, 0.9, 'wood')
      break
  }
  return parts
}
