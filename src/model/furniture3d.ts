import { frustumFaces, prismFaces, profileFaces, ring, smoothSides, type Face, type Vec3 } from './faces'
import type { Vec } from './geometry'
import { ellipse, ISLAND_OVERHANG, local, quarterDisc, rounded, showerPoint, SOFA, sofaOutline, trestleBoards, trestleFrames, type Placement } from './furniture'
import type { Furniture } from './plan'
import type { SolidMaterial } from './solids'

/**
 * Furniture in 3-D, as simple blocks of the right size and height: a counter's cabinets, toe kick and worktop;
 * basins sunk into their tops with a tap; bathtubs and showers with a shower riser at the shower head; toilets and
 * bidets; beds with frame, headboard, mattress, pillows and cover; tables and chairs.
 */

export interface FurniturePart {
  faces: Face[]
  material: SolidMaterial
  /** A material id it is finished in (see materials.ts): a trestle table's oak. */
  finish?: string
}

/** The tops of things, in m above the floor. */
export const WORKTOP = 0.9
const VANITY = 0.86
const SHOWER_HEAD = 1.95

const sub2 = (a: Vec, b: Vec): Vec => ({ x: a.x - b.x, y: a.y - b.y })
const mul2 = (a: Vec, k: number): Vec => ({ x: a.x * k, y: a.y * k })

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
  /** A shower riser from `bottom` up to its head at `s` round the rim. */
  const riser = (s: number, bottom: number, corner = false) => {
    const at = showerPoint(pl, s, corner)
    put(ring(at, 0.012, 10), bottom, SHOWER_HEAD, 'metal', [], true)
    put(ring(at, 0.09, 16), SHOWER_HEAD, SHOWER_HEAD + 0.03, 'metal', [], true)
  }
  /** A tap at the back of a basin whose top is at `top`: a post and a spout reaching forward. */
  const tap = (top: number) => {
    post(0, -hd + 0.05, 0.018, top, top + 0.24, 'metal')
    put(box(-0.012, -hd + 0.05, 0.012, -hd + 0.2), top + 0.2, top + 0.24, 'metal')
  }

  switch (f.kind) {
    case 'counter':
      if (f.style === 'island') {
        // cabinets with a toe kick all round, under a worktop that overhangs the front for stools
        const front = hd - ISLAND_OVERHANG
        put(box(-hw + 0.07, -hd + 0.07, hw - 0.07, front - 0.07), 0, 0.1, 'soot')
        put(box(-hw + 0.02, -hd + 0.02, hw - 0.02, front), 0.1, WORKTOP - 0.04, 'wood')
      } else {
        put(box(-hw, -hd, hw, hd - 0.07), 0, 0.1, 'soot')
        put(box(-hw, -hd, hw, hd - 0.02), 0.1, WORKTOP - 0.04, 'wood')
      }
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
      if (f.style === 'corner') {
        const r = Math.min(pl.width, pl.depth)
        const inner = quarterDisc(pl, r - 0.2, 0.08)
        put(quarterDisc(pl, r), 0, rim, 'ceramic', [inner], true)
        put(inner, 0, 0.15, 'ceramic', [], true)
        riser(f.shower, rim, true)
        break
      }
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
      riser(f.shower, rim)
      break
    }
    case 'shower':
      // a low tray, its head on a riser, and a glass screen along two thirds of its front
      put(box(-hw, -hd, hw, hd), 0, 0.05, 'ceramic')
      riser(f.shower, 0.05)
      put(box(-hw, hd - 0.01, hw * 0.3, hd), 0.05, 2.0, 'glass')
      put(box(-hw, hd - 0.03, -hw + 0.02, hd), 0.05, 2.0, 'metal')
      break
    case 'toilet': {
      // a pedestal, the bowl on it with its seat, and the cistern behind
      const bowl = ellipse(pl, -hw + 0.02, -hd + 0.14, hw - 0.02, hd)
      put(rounded(pl, -0.12, -hd + 0.18, 0.12, hd - 0.18, 0.08), 0, 0.3, 'ceramic', [], true)
      put(bowl, 0.3, 0.4, 'ceramic', [ellipse(pl, -hw + 0.08, -hd + 0.26, hw - 0.08, hd - 0.06)], true)
      put(box(-hw + 0.04, -hd, hw - 0.04, -hd + 0.18), 0, 0.4, 'ceramic')
      put(box(-hw, -hd, hw, -hd + 0.18), 0.4, 0.78, 'ceramic')
      break
    }
    case 'bidet': {
      const inner = ellipse(pl, -hw + 0.06, -hd + 0.12, hw - 0.06, hd - 0.05)
      put(rounded(pl, -0.12, -hd + 0.12, 0.12, hd - 0.12, 0.08), 0, 0.3, 'ceramic', [], true)
      put(ellipse(pl, -hw, -hd + 0.03, hw, hd), 0.3, 0.4, 'ceramic', [inner], true)
      put(inner, 0.3, 0.32, 'ceramic', [], true)
      tap(0.4)
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
    case 'sofa': {
      // a plinth, the seat, the back along it and the arms, all upholstered (a sectional's return has no arm)
      const m = f.mirror ? -1 : 1
      const mb = (x0: number, y0: number, x1: number, y1: number) => box(Math.min(m * x0, m * x1), y0, Math.max(m * x0, m * x1), y1)
      const seat = 0.45
      const outline = sofaOutline(pl, f.style, f.mirror)
      put(outline, 0, 0.1, 'wood')
      put(outline, 0.1, seat, 'fabric')
      put(mb(-hw, -hd, hw, -hd + SOFA.back), seat, 0.85, 'fabric')
      put(mb(-hw, -hd + SOFA.back, -hw + SOFA.arm, f.style === 'sectional' ? -hd + SOFA.seat : hd), seat, 0.62, 'fabric')
      if (f.style !== 'sectional') put(mb(hw - SOFA.arm, -hd + SOFA.back, hw, hd), seat, 0.62, 'fabric')
      break
    }
    case 'table':
      if (f.style === 'trestle') {
        // a farmhouse trestle in solid oak: a thick top of long boards over leg frames (two square legs on a foot
        // rail, a bearer under the top), a stretcher low along the middle, and braces from it up to the top
        const [top, thick] = [0.78, 0.09]
        const under = top - thick
        const along = mul2(sub2(local(pl, 1, 0), local(pl, 0, 0)), 1)
        const xDir: Vec3 = { x: along.x, y: along.y, z: 0 }
        const yDir: Vec3 = { x: -along.y, y: along.x, z: 0 }
        const up: Vec3 = { x: 0, y: 0, z: 1 }
        const oak = (faces: Face[], grain: Vec3) => parts.push({ faces: faces.map((g) => ({ ...g, grain })), material: 'wood', finish: 'oak-solid' })
        const block = (x0: number, y0: number, x1: number, y1: number, z0: number, z1: number, grain: Vec3) => oak(prismFaces(box(x0, y0, x1, y1), [], z0, z1), grain)
        const edges = [...trestleBoards(pl.depth), hd]
        for (let i = 0; i + 1 < edges.length; i++) block(-hw, edges[i] + (i ? 0.003 : 0), hw, edges[i + 1] - (i + 2 < edges.length ? 0.003 : 0), under, top, xDir)
        const legY = hd - 0.16
        const frames = trestleFrames(pl.width)
        for (const x of frames) {
          for (const y of [-legY, legY]) block(x - 0.07, y - 0.07, x + 0.07, y + 0.07, 0, under, up)
          block(x - 0.06, -legY - 0.1, x + 0.06, legY + 0.1, 0.05, 0.17, yDir)
          block(x - 0.06, -hd + 0.06, x + 0.06, hd - 0.06, under - 0.1, under, yDir)
        }
        const [x0, x1] = [frames[0], frames[frames.length - 1]]
        block(x0, -0.05, x1, 0.05, 0.2, 0.32, xDir)
        // the braces, rising from the stretcher near each end frame towards the middle
        const reach = Math.min(0.9, (x1 - x0) / 4)
        for (const [from, dir] of [
          [x0 + 0.1, 1],
          [x1 - 0.1, -1],
        ] as const) {
          const [s0, s1] = [from, from + dir * reach]
          const rise = under - 0.1 - 0.32
          const len = Math.hypot(reach, rise)
          const grain: Vec3 = { x: (along.x * dir * reach) / len, y: (along.y * dir * reach) / len, z: rise / len }
          const profile: [number, number][] = [
            [s0, 0.32],
            [s0 + dir * 0.13, 0.32],
            [s1, under - 0.1],
            [s1 - dir * 0.13, under - 0.1],
          ]
          oak(profileFaces(local(pl, 0, 0), along, 0.04, profile), grain)
        }
        break
      }
      if (f.style === 'coffee') {
        // a low top on four legs, a shelf between them
        put(rounded(pl, -hw, -hd, hw, hd, 0.06), 0.38, 0.42, 'wood')
        put(box(-hw + 0.05, -hd + 0.05, hw - 0.05, hd - 0.05), 0.1, 0.12, 'wood')
        for (const [x, y] of [
          [-hw + 0.05, -hd + 0.05],
          [hw - 0.05, -hd + 0.05],
          [hw - 0.05, hd - 0.05],
          [-hw + 0.05, hd - 0.05],
        ]) {
          put(box(x - 0.02, y - 0.02, x + 0.02, y + 0.02), 0, 0.38, 'wood')
        }
      } else if (f.style === 'circle') {
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
    case 'tree': {
      // a trunk, and a crown of a few rounded lobes round the top of it, as tall as the catalogue's tree of its kind
      // is for its width
      const slender = f.style === 'slender'
      const height = (slender ? 11 / 3.5 : 7 / 6) * Math.max(hw, hd) * 2
      const r = Math.max(hw, hd)
      const crown = slender ? height * 0.25 : height * 0.35
      const c = local(pl, 0, 0)
      const lobe = (dx: number, dy: number, rx: number, z0: number, z1: number) => {
        const at = local(pl, dx, dy)
        const bands = 6
        const faces: Face[] = []
        for (let i = 0; i < bands; i++) {
          const [a0, a1] = [-Math.PI / 2 + (Math.PI * i) / bands, -Math.PI / 2 + (Math.PI * (i + 1)) / bands]
          const zm = (z0 + z1) / 2
          const h = (z1 - z0) / 2
          faces.push(...frustumFaces(at, Math.max(0.05, rx * Math.cos(a0)), Math.max(0.05, rx * Math.cos(a1)), zm + h * Math.sin(a0), zm + h * Math.sin(a1), 14))
        }
        parts.push({ faces: smoothSides(faces), material: 'foliage' })
      }
      parts.push({ faces: smoothSides(frustumFaces(c, Math.min(0.22, r * 0.07), Math.min(0.14, r * 0.045), 0, crown + 0.6, 10)), material: 'bark' })
      if (slender) {
        lobe(0, 0, r, crown, height)
      } else {
        lobe(0, 0, r * 0.8, crown, height * 0.92)
        lobe(r * 0.35, r * 0.15, r * 0.6, crown + 0.4, height)
        lobe(-r * 0.3, -r * 0.25, r * 0.6, crown + 0.6, height * 0.97)
      }
      break
    }
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
