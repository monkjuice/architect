import { frustumFaces, prismFaces, profileFaces, ring, smoothSides, type Face, type Vec3 } from './faces'
import type { Vec } from './geometry'
import { ellipse, ISLAND_OVERHANG, local, potSize, potted, quarterDisc, rounded, showerPoint, SOFA, sofaCushions, sofaOutline, stairTreads, trestleBoards, trestleFrames, type Placement } from './furniture'
import type { Furniture } from './plan'
import type { SolidMaterial } from './solids'

/**
 * Furniture in 3-D, as simple blocks of the right size and height: a counter's cabinets, toe kick and worktop;
 * basins sunk into their tops with a tap; bathtubs and showers with a shower riser at the shower head; toilets and
 * bidets; beds with frame, headboard, mattress, pillows and cover; tables and chairs; a stair's flight.
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

/** A piece's own axes in plan, for the grain of its parts: along it, across it (front to back), and up. */
function axes(pl: Placement): { x: Vec3; y: Vec3; z: Vec3 } {
  const o = local(pl, 0, 0)
  const [x, y] = [sub2(local(pl, 1, 0), o), sub2(local(pl, 0, 1), o)]
  return { x: { x: x.x, y: x.y, z: 0 }, y: { x: y.x, y: y.y, z: 0 }, z: { x: 0, y: 0, z: 1 } }
}
const mul2 = (a: Vec, k: number): Vec => ({ x: a.x * k, y: a.y * k })

/** `rise`: how high a stair climbs, to the floor above (see storeys.ts). */
export function furnitureParts(f: Furniture, pl: Placement, rise = 3): FurniturePart[] {
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
      if (f.style === 'teak-sofa' || f.style === 'teak-armchair') {
        // an outdoor sofa: a teak frame (posts, rails, slatted arms and back) under thick linen cushions
        const { x: X, y: Y, z: Z } = axes(pl)
        const wood = (x0: number, y0: number, x1: number, y1: number, z0: number, z1: number, grain: Vec3) =>
          parts.push({ faces: prismFaces(box(x0, y0, x1, y1), [], z0, z1).map((g) => ({ ...g, grain })), material: 'wood', finish: 'teak' })
        const [arm, post] = [0.09, 0.06]
        for (const x of [-hw, hw - post]) {
          for (const y of [-hd, hd - post]) wood(x, y, x + post, y + post, 0, y < 0 ? 0.7 : 0.6, Z)
          // the arm: a board on slats
          wood(x + (x < 0 ? 0 : post - arm), -hd, x + (x < 0 ? arm : post), hd, 0.6, 0.64, Y)
          for (let k = 1; k <= 4; k++) {
            const y = -hd + post + ((pl.depth - 2 * post) * k) / 5
            wood(x + 0.015, y - 0.02, x + post - 0.015, y + 0.02, 0.18, 0.6, Z)
          }
          wood(x, -hd + post, x + post, hd - post, 0.14, 0.2, Y)
        }
        wood(-hw + post, hd - 0.05, hw - post, hd, 0.14, 0.3, X)
        wood(-hw + post, -hd, hw - post, -hd + 0.05, 0.14, 0.3, X)
        for (const z of [0.36, 0.48, 0.6]) wood(-hw + post, -hd, hw - post, -hd + 0.04, z, z + 0.08, X)
        // the cushions: one seat and one back cushion to each place
        const n = sofaCushions(f.style)
        const [x0, x1] = [-hw + arm + 0.01, hw - arm - 0.01]
        for (let i = 0; i < n; i++) {
          const [a, b] = [x0 + ((x1 - x0) * i) / n + 0.005, x0 + ((x1 - x0) * (i + 1)) / n - 0.005]
          put(rounded(pl, a, -hd + 0.06, b, hd - 0.02, 0.04), 0.3, 0.44, 'linen')
          put(rounded(pl, a, -hd + 0.05, b, -hd + 0.22, 0.04), 0.44, 0.8, 'linen')
        }
        break
      }
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
      if (f.style === 'teak-coffee') {
        // a low teak table: slats on a frame, four square legs
        const { x: X, y: Y, z: Z } = axes(pl)
        const wood = (x0: number, y0: number, x1: number, y1: number, z0: number, z1: number, grain: Vec3) =>
          parts.push({ faces: prismFaces(box(x0, y0, x1, y1), [], z0, z1).map((g) => ({ ...g, grain })), material: 'wood', finish: 'teak' })
        const n = Math.max(3, Math.round(pl.depth / 0.1))
        for (let i = 0; i < n; i++) wood(-hw, -hd + (pl.depth * i) / n + 0.008, hw, -hd + (pl.depth * (i + 1)) / n - 0.008, 0.37, 0.4, X)
        for (const [x, y] of [
          [-hw + 0.04, -hd + 0.04],
          [hw - 0.11, -hd + 0.04],
          [hw - 0.11, hd - 0.11],
          [-hw + 0.04, hd - 0.11],
        ]) {
          wood(x, y, x + 0.07, y + 0.07, 0, 0.37, Z)
        }
        wood(-hw + 0.04, -hd + 0.06, hw - 0.04, -hd + 0.09, 0.3, 0.37, X)
        wood(-hw + 0.04, hd - 0.09, hw - 0.04, hd - 0.06, 0.3, 0.37, X)
        wood(-hw + 0.06, -hd + 0.04, -hw + 0.09, hd - 0.04, 0.3, 0.37, Y)
        wood(hw - 0.09, -hd + 0.04, hw - 0.06, hd - 0.04, 0.3, 0.37, Y)
        break
      }
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
    case 'plant': {
      if (!potted(f.style)) {
        // in the ground: each one a little different, by where it stands
        let seed = Math.abs(Math.round(pl.at.x * 1000 + pl.at.y * 7919)) % 2147483647 || 1
        const rand = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646
        const info = { bush: 0.9 / 1.0, agapanthus: 0.9 / 0.7, lavender: 0.5 / 0.6, climber: 2.6 / 1.6 }[f.style as 'bush']
        const tall = info * (f.style === 'climber' ? pl.width : Math.max(pl.width, pl.depth))
        const blob = (dx: number, dy: number, r: number, z0: number, z1: number, material: SolidMaterial) => {
          const at = local(pl, dx, dy)
          const faces: Face[] = []
          for (let i = 0; i < 5; i++) {
            const [a0, a1] = [-Math.PI / 2 + (Math.PI * i) / 5, -Math.PI / 2 + (Math.PI * (i + 1)) / 5]
            const [zm, h] = [(z0 + z1) / 2, (z1 - z0) / 2]
            faces.push(...frustumFaces(at, Math.max(0.01, r * Math.cos(a0)), Math.max(0.01, r * Math.cos(a1)), zm + h * Math.sin(a0), zm + h * Math.sin(a1), 10))
          }
          parts.push({ faces: smoothSides(faces), material })
        }
        const r = Math.max(hw, hd)
        if (f.style === 'bush') {
          blob(0, 0, r * 0.85, 0, tall, 'foliage')
          for (let i = 0; i < 3; i++) blob((rand() - 0.5) * r, (rand() - 0.5) * r, r * (0.5 + rand() * 0.2), tall * 0.15, tall * (0.8 + rand() * 0.15), 'foliage')
        } else if (f.style === 'lavender') {
          blob(0, 0, r, 0, tall * 0.7, 'foliage')
          blob(0, 0, r * 0.9, tall * 0.35, tall, 'lavender')
        } else if (f.style === 'agapanthus') {
          // a mound of strap leaves, and tall stems each with a round head of flowers
          blob(0, 0, r * 0.9, 0, tall * 0.4, 'foliage')
          for (let i = 0; i < 7; i++) {
            const [a, d] = [rand() * Math.PI * 2, rand() * r * 0.5]
            const [x, y] = [Math.cos(a) * d, Math.sin(a) * d]
            const top = tall * (0.75 + rand() * 0.25)
            parts.push({ faces: frustumFaces(local(pl, x, y), 0.008, 0.006, tall * 0.2, top, 5), material: 'foliage' })
            blob(x, y, 0.07 + rand() * 0.03, top - 0.06, top + 0.1, 'flower')
          }
        } else {
          // a climber: a stem, and leaves spread up the wall behind it, white flowers among them
          parts.push({ faces: smoothSides(frustumFaces(local(pl, 0, -hd + 0.06), 0.03, 0.02, 0, tall * 0.4, 8)), material: 'bark' })
          for (let i = 0; i < 16; i++) {
            const [x, z] = [(rand() - 0.5) * pl.width * 0.9, 0.3 + rand() * (tall - 0.5)]
            const s = 0.18 + rand() * 0.14
            blob(x, -hd + Math.min(s, hd), s, z - s, z + s, 'foliage')
            if (rand() < 0.6) blob(x + (rand() - 0.5) * 0.2, -hd + Math.min(s, hd) + s * 0.8, 0.05, z - 0.05, z + 0.05, 'blossom')
          }
        }
        break
      }
      // a tapering stone pot, its soil, and the plant: a small olive tree (a trunk under a crown of grey-green
      // lobes), or a shrub of a few lobes sitting on the pot
      const pot = potSize(pl.width) / 2
      const potTop = f.style === 'olive' ? 0.55 : 0.42
      const c = local(pl, 0, 0)
      parts.push({ faces: smoothSides(frustumFaces(c, pot * 0.78, pot, 0, potTop, 18)), material: 'stone' })
      parts.push({ faces: frustumFaces(c, pot * 0.9, pot * 0.9, potTop - 0.05, potTop - 0.03, 18), material: 'bark' })
      const lobe = (dx: number, dy: number, r: number, z0: number, z1: number, material: SolidMaterial) => {
        const at = local(pl, dx, dy)
        const faces: Face[] = []
        for (let i = 0; i < 6; i++) {
          const [a0, a1] = [-Math.PI / 2 + (Math.PI * i) / 6, -Math.PI / 2 + (Math.PI * (i + 1)) / 6]
          const [zm, h] = [(z0 + z1) / 2, (z1 - z0) / 2]
          faces.push(...frustumFaces(at, Math.max(0.02, r * Math.cos(a0)), Math.max(0.02, r * Math.cos(a1)), zm + h * Math.sin(a0), zm + h * Math.sin(a1), 12))
        }
        parts.push({ faces: smoothSides(faces), material })
      }
      const r = Math.max(hw, hd)
      if (f.style === 'olive') {
        const crown = 1.15
        parts.push({ faces: smoothSides(frustumFaces(c, 0.05, 0.035, potTop - 0.05, crown + 0.2, 8)), material: 'bark' })
        lobe(0, 0, r * 0.75, crown, 2.0, 'olive')
        lobe(r * 0.3, r * 0.2, r * 0.5, crown + 0.15, 1.9, 'olive')
        lobe(-r * 0.3, -r * 0.15, r * 0.5, crown + 0.2, 1.95, 'olive')
      } else {
        lobe(0, 0, r * 0.9, potTop - 0.05, potTop + 0.5, 'foliage')
        lobe(r * 0.3, 0, r * 0.6, potTop + 0.05, potTop + 0.48, 'foliage')
      }
      break
    }
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
    case 'stair': {
      // a concrete flight from its front up to its back, its underside sloping 15 cm under the steps; its last riser
      // is the edge of the floor above
      const n = stairTreads(pl.depth)
      const [t, r] = [pl.depth / n, rise / (n + 1)]
      const waist = Math.min((0.15 * Math.hypot(t, r)) / t, n * r)
      const profile: [number, number][] = [[0, 0]]
      for (let k = 0; k < n; k++) profile.push([k * t, (k + 1) * r], [(k + 1) * t, (k + 1) * r])
      profile.push([pl.depth, n * r - waist], [(waist * t) / r, 0])
      const up = { x: -pl.v.x, y: -pl.v.y }
      parts.push({ faces: profileFaces(local(pl, 0, hd), up, hw, profile), material: 'stone' })
      break
    }
  }
  return parts
}
