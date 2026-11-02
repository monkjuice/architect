import { add, cross, dist, EPS, lerp, mul, signedArea, sub, type Vec } from './geometry'
import { openingSpans } from './openings'
import { segmentKind, type Layer, type Segment } from './plan'

/**
 * Walls as built. Lines are drawn and snapped on their centrelines; a wall stands its thickness around its line
 * and its height tall. Both are optional on a segment. Without a thickness a wall is automatic: exterior (0.30 m)
 * when it faces outside on either side, meaning the outside itself or a region open to it across open edges or
 * outlines (a gallery, a pool), and interior (0.15 m) between two indoor rooms; regions.ts works out which.
 * Without a height it is 2.70 m.
 *
 * In plan, walls are drawn the way a plan's cut shows them: at their thickness and filled, the faces of walls
 * that meet joined at mitred corners (bevelled when very sharp) with no line across the joint, and cut through by
 * their doors and windows.
 */

export const EXTERIOR_WALL = 0.3
export const INTERIOR_WALL = 0.15
export const WALL_HEIGHT = 2.7

/** A sharp outer corner whose mitre would reach farther than this many half thicknesses from the joint is bevelled. */
export const MITRE_LIMIT = 4

export const wallHeight = (s: Segment): number => s.height ?? WALL_HEIGHT

export interface LayerWalls {
  /** Filled shapes: each wall between its openings, and the bevels of sharp corners; all run the same way round. */
  fills: Vec[][]
  /** The wall each fill belongs to, by index (a bevel belongs to the wall before it round the joint). */
  owners: string[]
  /** Lines drawn: the walls' faces, their ends at openings and at free ends, and steps where the thickness changes at a joint. */
  edges: [Vec, Vec][]
  /** Each wall's footprint in m², openings included (a doorway is built-up area too). */
  footprint: Map<string, number>
}

/** Rotated a quarter turn, to the side of increasing angle. */
const perp = (u: Vec): Vec => ({ x: -u.y, y: u.x })

/** Where a wall's two faces end at one of its vertices: on the `perp` side of its direction away from the vertex, and on the other. */
interface FaceEnds {
  plus: Vec
  minus: Vec
}

/** A layer's walls as drawn, `thickness` being each wall's (see layerFaces in regions.ts). */
export function layerWalls(layer: Layer, thickness: ReadonlyMap<string, number>): LayerWalls {
  const walls = Object.entries(layer.segments).filter(([id, s]) => segmentKind(s) === 'wall' && thickness.has(id) && dist(layer.vertices[s.a], layer.vertices[s.b]) > EPS)
  // the walls at each vertex, by the angle they leave it at
  const at = new Map<string, { id: string; u: Vec; half: number; angle: number }[]>()
  for (const [id, s] of walls) {
    const a = layer.vertices[s.a]
    const b = layer.vertices[s.b]
    const u = mul(sub(b, a), 1 / dist(a, b))
    const half = thickness.get(id)! / 2
    for (const [v, dir] of [
      [s.a, u],
      [s.b, mul(u, -1)],
    ] as const) {
      if (!at.has(v)) at.set(v, [])
      at.get(v)!.push({ id, u: dir, half, angle: Math.atan2(dir.y, dir.x) })
    }
  }

  const out: LayerWalls = { fills: [], owners: [], edges: [], footprint: new Map() }
  const ends = new Map<string, FaceEnds>()
  const endsOf = (v: string, id: string) => {
    let e = ends.get(`${v}|${id}`)
    if (!e) ends.set(`${v}|${id}`, (e = { plus: layer.vertices[v], minus: layer.vertices[v] }))
    return e
  }
  for (const [v, list] of at) {
    const p = layer.vertices[v]
    list.sort((x, y) => x.angle - y.angle)
    if (list.length === 1) {
      const n = mul(perp(list[0].u), list[0].half)
      ends.set(`${v}|${list[0].id}`, { plus: add(p, n), minus: sub(p, n) })
      continue
    }
    list.forEach((w, k) => {
      // the corner between this wall's plus face and the next one's minus face, in the sector between them: it
      // is always where those faces meet when the sector is less than a half turn (an inside corner); an outside
      // corner is bevelled when its mitre would be too long, and walls in line get a step when their thicknesses differ
      const next = list[(k + 1) % list.length]
      let sector = next.angle - w.angle
      if (sector <= 0) sector += 2 * Math.PI
      const P = add(p, mul(perp(w.u), w.half))
      const Q = sub(p, mul(perp(next.u), next.half))
      const denom = cross(w.u, next.u)
      let corner: Vec | null = null
      if (Math.abs(denom) > 1e-9) {
        const c = add(P, mul(w.u, cross(sub(Q, P), next.u) / denom))
        const reach = dist(c, p) / Math.max(w.half, next.half)
        if (sector < Math.PI ? reach < 100 : reach <= MITRE_LIMIT) corner = c
      }
      endsOf(v, w.id).plus = corner ?? P
      endsOf(v, next.id).minus = corner ?? Q
      if (!corner && dist(P, Q) > EPS) {
        out.edges.push([P, Q])
        out.fills.push([p, P, Q])
        out.owners.push(w.id)
      }
    })
  }

  for (const [id, s] of walls) {
    const a = layer.vertices[s.a]
    const b = layer.vertices[s.b]
    const length = dist(a, b)
    const n = mul(perp(mul(sub(b, a), 1 / length)), thickness.get(id)! / 2)
    // from a to b, the face on the +n side runs from a's plus end to b's minus end, the other from a's minus end to b's plus end
    const ea = endsOf(s.a, id)
    const eb = endsOf(s.b, id)
    out.footprint.set(id, Math.abs(signedArea([ea.plus, eb.minus, b, eb.plus, ea.minus, a])))
    const free = (v: string) => at.get(v)!.length === 1
    const piece = (d0: number, d1: number) => {
      const fromA = d0 <= EPS
      const toB = d1 >= length - EPS
      const c0 = lerp(a, b, d0 / length)
      const c1 = lerp(a, b, d1 / length)
      const p0 = fromA ? ea.plus : add(c0, n)
      const m0 = fromA ? ea.minus : sub(c0, n)
      const p1 = toB ? eb.minus : add(c1, n)
      const m1 = toB ? eb.plus : sub(c1, n)
      // through the vertex itself at a joint, so the walls meeting there fill it between them
      out.fills.push([p0, p1, ...(toB ? [b] : []), m1, m0, ...(fromA ? [a] : [])])
      out.owners.push(id)
      out.edges.push([p0, p1], [m0, m1])
      if (!fromA || free(s.a)) out.edges.push([p0, m0])
      if (!toB || free(s.b)) out.edges.push([p1, m1])
    }
    let from = 0
    for (const [start, end] of [...openingSpans(layer, id), [length, length] as [number, number]]) {
      if (start - from > EPS) piece(from, start)
      from = Math.max(from, end)
    }
  }
  // one path filled with the nonzero rule paints overlaps once only if every shape runs the same way round
  out.fills = out.fills.map((f) => (signedArea(f) < 0 ? f.reverse() : f))
  return out
}
