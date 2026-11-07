import { add, clamp, closestOnSegment, dist, dot, mul, sub, type Box, type Vec } from './geometry'
import { isEditable, segmentKind, type Furniture, type FurnitureKind, type Layer, type Plan } from './plan'

/**
 * Furniture and fixtures: counters, sinks, bathtubs, showers, toilets, bidets, beds, tables, chairs and stairs. Each stands
 * at a point turned to an angle, its back up the sheet at 0, and is `width` across its front and `depth` from back
 * to front. Things that stand against a wall (all but tables, chairs and islands) snap with their back to the nearest
 * wall face when they are put down; a kitchen sink only goes in a counter and is kept there, relative to it;
 * a chair snaps to face a table it is put next to, and a coffee table to stand in front of a sofa.
 */

export interface FurnitureInfo {
  kind: FurnitureKind
  /** Absent for the kinds that have no styles (counters, chairs). */
  style?: string
  title: string
  /** The size a new one gets, and its height, in m. */
  width: number
  depth: number
  height: number
  /** What it lines up with when it is put down. */
  snap: 'wall' | 'counter' | 'table' | 'sofa' | 'none'
}

/** The catalogue, in the order the library lists it. Beds are mattress sizes plus a frame and headboard. */
export const FURNITURE: readonly FurnitureInfo[] = [
  { kind: 'counter', title: 'Counter', width: 2.4, depth: 0.6, height: 0.9, snap: 'wall' },
  { kind: 'counter', style: 'island', title: 'Kitchen island', width: 2.0, depth: 1.0, height: 0.9, snap: 'none' },
  { kind: 'sink', style: 'outdoor', title: 'Outdoor sink', width: 0.7, depth: 0.5, height: 0.85, snap: 'wall' },
  { kind: 'sink', style: 'kitchen', title: 'Kitchen sink', width: 0.8, depth: 0.45, height: 0.9, snap: 'counter' },
  { kind: 'sink', style: 'bathroom', title: 'Bathroom sink', width: 0.6, depth: 0.45, height: 0.85, snap: 'wall' },
  { kind: 'bathtub', style: 'alcove', title: 'Alcove', width: 1.7, depth: 0.75, height: 0.55, snap: 'wall' },
  { kind: 'bathtub', style: 'clawfoot', title: 'Clawfoot', width: 1.65, depth: 0.78, height: 0.62, snap: 'wall' },
  { kind: 'bathtub', style: 'drop-in', title: 'Drop in', width: 1.85, depth: 0.95, height: 0.55, snap: 'wall' },
  { kind: 'bathtub', style: 'corner', title: 'Corner', width: 1.4, depth: 1.4, height: 0.55, snap: 'wall' },
  { kind: 'shower', title: 'Shower', width: 0.9, depth: 0.9, height: 2.0, snap: 'wall' },
  { kind: 'toilet', title: 'Toilet', width: 0.4, depth: 0.7, height: 0.78, snap: 'wall' },
  { kind: 'bidet', title: 'Bidet', width: 0.38, depth: 0.55, height: 0.4, snap: 'wall' },
  { kind: 'bed', style: 'single', title: 'Single', width: 0.95, depth: 2.0, height: 1.0, snap: 'wall' },
  { kind: 'bed', style: 'double', title: 'Double', width: 1.45, depth: 2.0, height: 1.0, snap: 'wall' },
  { kind: 'bed', style: 'queen', title: 'Queen', width: 1.65, depth: 2.1, height: 1.0, snap: 'wall' },
  { kind: 'bed', style: 'king', title: 'King', width: 1.85, depth: 2.1, height: 1.0, snap: 'wall' },
  { kind: 'sofa', style: 'armchair', title: 'Armchair', width: 0.9, depth: 0.9, height: 0.85, snap: 'wall' },
  { kind: 'sofa', style: 'loveseat', title: 'Loveseat', width: 1.6, depth: 0.9, height: 0.85, snap: 'wall' },
  { kind: 'sofa', style: 'three-seater', title: 'Three-seater', width: 2.2, depth: 0.95, height: 0.85, snap: 'wall' },
  { kind: 'sofa', style: 'sectional', title: 'Sectional', width: 2.8, depth: 1.7, height: 0.85, snap: 'wall' },
  { kind: 'sofa', style: 'teak-sofa', title: 'Teak outdoor sofa', width: 2.2, depth: 0.9, height: 0.75, snap: 'wall' },
  { kind: 'sofa', style: 'teak-armchair', title: 'Teak outdoor armchair', width: 0.85, depth: 0.85, height: 0.75, snap: 'none' },
  { kind: 'table', style: 'square', title: 'Square', width: 0.9, depth: 0.9, height: 0.75, snap: 'none' },
  { kind: 'table', style: 'trestle', title: 'Oak trestle', width: 3.2, depth: 1.1, height: 0.78, snap: 'none' },
  { kind: 'table', style: 'circle', title: 'Circle', width: 1.1, depth: 1.1, height: 0.75, snap: 'none' },
  { kind: 'table', style: 'coffee', title: 'Coffee', width: 1.2, depth: 0.6, height: 0.42, snap: 'sofa' },
  { kind: 'table', style: 'teak-coffee', title: 'Teak coffee table', width: 1.3, depth: 0.7, height: 0.4, snap: 'sofa' },
  { kind: 'chair', title: 'Chair', width: 0.45, depth: 0.5, height: 0.9, snap: 'table' },
  { kind: 'plant', style: 'olive', title: 'Olive tree in a pot', width: 1.2, depth: 1.2, height: 2.0, snap: 'none' },
  { kind: 'plant', style: 'shrub', title: 'Shrub in a pot', width: 0.6, depth: 0.6, height: 0.9, snap: 'none' },
  { kind: 'plant', style: 'bush', title: 'Bush', width: 1.0, depth: 1.0, height: 0.9, snap: 'none' },
  { kind: 'plant', style: 'agapanthus', title: 'Agapanthus', width: 0.7, depth: 0.7, height: 0.9, snap: 'none' },
  { kind: 'plant', style: 'lavender', title: 'Lavender', width: 0.6, depth: 0.6, height: 0.5, snap: 'none' },
  { kind: 'plant', style: 'climber', title: 'Climber (up a wall)', width: 1.6, depth: 0.3, height: 2.6, snap: 'wall' },
  { kind: 'tree', style: 'shade', title: 'Shade tree', width: 6, depth: 6, height: 7, snap: 'none' },
  { kind: 'tree', style: 'slender', title: 'Tall tree', width: 3.5, depth: 3.5, height: 11, snap: 'none' },
  { kind: 'stair', title: 'Straight stair', width: 0.9, depth: 4.5, height: 3, snap: 'none' },
]

export const furnitureKey = (kind: FurnitureKind, style?: string): string => (style ? `${kind}:${style}` : kind)

const styleOf = (f: Furniture): string | undefined => ('style' in f ? f.style : undefined)

export const furnitureInfo = (kind: FurnitureKind, style?: string): FurnitureInfo => FURNITURE.find((i) => i.kind === kind && i.style === style)!

export const infoOf = (f: Furniture): FurnitureInfo => furnitureInfo(f.kind, styleOf(f))

/** How far from a wall face, a counter or a table a piece still snaps to it when it is put down, in m. */
export const FURNITURE_REACH_M = 0.4

/** How far a kitchen sink's centre stands in front of its counter's middle, in m: sinks sit to the front. */
const SINK_FORWARD = 0.03

/** How far a kitchen island's worktop overhangs its cabinets at the front, for stools, in m. */
export const ISLAND_OVERHANG = 0.25

export const isIsland = (f: Furniture): boolean => f.kind === 'counter' && f.style === 'island'

/** Where a kitchen sink's centre sits across its counter, from the counter's middle: over an island's cabinets, not its overhang. */
const sinkAcross = (counter: Furniture): number => (isIsland(counter) ? -ISLAND_OVERHANG / 2 : 0) + SINK_FORWARD

/** Where a piece of furniture stands on the plan: its centre, its turn, its size, and its own axes. */
export interface Placement {
  at: Vec
  /** Degrees clockwise on screen. */
  angle: number
  width: number
  depth: number
  /** Unit vectors across its front (to its right, seen from the front: its left end is at −width/2) and from its back to its front. */
  u: Vec
  v: Vec
}

export function placement(at: Vec, angle: number, width: number, depth: number): Placement {
  const r = (angle * Math.PI) / 180
  return { at, angle, width, depth, u: { x: Math.cos(r), y: Math.sin(r) }, v: { x: -Math.sin(r), y: Math.cos(r) } }
}

/** A point in a placement's own frame: `x` across it from its middle, `y` from its middle towards its front. */
export const local = (pl: Placement, x: number, y: number): Vec => add(add(pl.at, mul(pl.u, x)), mul(pl.v, y))

export const toLocal = (pl: Placement, p: Vec): Vec => {
  const d = sub(p, pl.at)
  return { x: dot(d, pl.u), y: dot(d, pl.v) }
}

/** Its footprint's corners: back left, back right, front right, front left. */
export const corners = (pl: Placement): Vec[] => [local(pl, -pl.width / 2, -pl.depth / 2), local(pl, pl.width / 2, -pl.depth / 2), local(pl, pl.width / 2, pl.depth / 2), local(pl, -pl.width / 2, pl.depth / 2)]

/** Where a piece stands; a kitchen sink stands in its counter, kept within it. Null for a sink whose counter is gone. */
export function placeFurniture(layer: Layer, f: Furniture): Placement | null {
  if ('at' in f) return placement(f.at, f.angle, f.width, f.depth)
  const counter = layer.furniture[f.counter]
  if (!counter || counter.kind !== 'counter') return null
  const c = placement(counter.at, counter.angle, counter.width, counter.depth)
  const x = -c.width / 2 + clamp(f.offset, Math.min(f.width, c.width) / 2, c.width - Math.min(f.width, c.width) / 2)
  return placement(local(c, x, sinkAcross(counter)), c.angle, f.width, f.depth)
}

/** Whether a plan point is on a piece (a round table is a disc, the rest rectangles). */
export function onFurniture(f: Furniture, pl: Placement, p: Vec): boolean {
  const q = toLocal(pl, p)
  if ((f.kind === 'table' && f.style === 'circle') || f.kind === 'tree' || (f.kind === 'plant' && f.style !== 'climber')) return (q.x / (pl.width / 2)) ** 2 + (q.y / (pl.depth / 2)) ** 2 <= 1
  return Math.abs(q.x) <= pl.width / 2 && Math.abs(q.y) <= pl.depth / 2
}

/** The piece under `p` on an editable layer, the smallest first (a sink in its counter, a chair at its table); top layer first. */
export function furnitureAt(plan: Plan, p: Vec): { layer: string; id: string } | null {
  for (const layer of [...plan.layers].reverse()) {
    if (!isEditable(layer)) continue
    let best: { id: string; area: number } | null = null
    for (const [id, f] of Object.entries(layer.furniture)) {
      const pl = placeFurniture(layer, f)
      if (!pl || !onFurniture(f, pl, p)) continue
      if (!best || pl.width * pl.depth < best.area) best = { id, area: pl.width * pl.depth }
    }
    if (best) return { layer: layer.id, id: best.id }
  }
  return null
}

/** The pieces whose centres are inside `box`, on editable layers. */
export function furnitureInBox(plan: Plan, box: Box): { layer: string; id: string }[] {
  const out: { layer: string; id: string }[] = []
  for (const layer of plan.layers) {
    if (!isEditable(layer)) continue
    for (const [id, f] of Object.entries(layer.furniture)) {
      const at = placeFurniture(layer, f)?.at
      if (at && at.x >= box.x0 && at.x <= box.x1 && at.y >= box.y0 && at.y <= box.y1) out.push({ layer: layer.id, id })
    }
  }
  return out
}

// ---- putting furniture down ---------------------------------------------------------------------------------

/** Where a piece being put down goes. */
export interface FurnitureTarget {
  layer: string
  at: Vec
  angle: number
  /** A kitchen sink's counter and how far along it its centre is. */
  counter?: string
  offset?: number
  /** Why it cannot go there, if it cannot. */
  problem?: string
}

export interface FurnitureOptions {
  kind: FurnitureKind
  style?: string
  width: number
  depth: number
  /** The angle it keeps where nothing turns it. */
  angle: number
  /** The layer it goes on (the active one). */
  layer: string
  /** How far from a wall face, a table or a counter it still snaps, in m. */
  reach: number
  snap: boolean
  /** Each wall's thickness. */
  thickness: (layer: Layer, segment: string) => number
  /** The piece being dragged: a chair does not snap to itself. */
  ignore?: string
}

/** The angle that turns a piece's front to face `n` (a unit vector on the plan). */
export const facing = (n: Vec): number => (((Math.atan2(-n.x, n.y) * 180) / Math.PI) % 360 + 360) % 360

export function furnitureTarget(plan: Plan, p: Vec, opts: FurnitureOptions): FurnitureTarget | null {
  const layer = plan.layers.find((l) => l.id === opts.layer)
  if (!isEditable(layer)) return null
  const info = furnitureInfo(opts.kind, opts.style)
  const free: FurnitureTarget = { layer: layer.id, at: p, angle: opts.angle }

  if (info.snap === 'counter') {
    for (const [id, f] of Object.entries(layer.furniture)) {
      if (f.kind !== 'counter') continue
      const c = placement(f.at, f.angle, f.width, f.depth)
      const q = toLocal(c, p)
      if (Math.abs(q.x) > c.width / 2 + opts.reach || Math.abs(q.y) > c.depth / 2 + opts.reach) continue
      if (c.width < opts.width) return { ...free, problem: `The counter is ${c.width.toFixed(2)} m, shorter than the sink.` }
      const offset = clamp(q.x + c.width / 2, opts.width / 2, c.width - opts.width / 2)
      return { layer: layer.id, at: local(c, offset - c.width / 2, sinkAcross(f)), angle: c.angle, counter: id, offset }
    }
    return { ...free, problem: 'A kitchen sink goes in a counter: put a counter down first.' }
  }
  if (!opts.snap) return free

  if (info.snap === 'wall') {
    let best: { d: number; at: Vec; angle: number } | null = null
    for (const [id, s] of Object.entries(layer.segments)) {
      if (segmentKind(s) !== 'wall') continue
      const [a, b] = [layer.vertices[s.a], layer.vertices[s.b]]
      const length = dist(a, b)
      if (length < 1e-9) continue
      const c = closestOnSegment(p, a, b)
      const half = opts.thickness(layer, id) / 2
      // the cursor's distance from the wall face, on its side
      const fromFace = c.dist - half
      if (fromFace > opts.depth + opts.reach || fromFace < -half || (best && fromFace >= best.d)) continue
      const along = sub(b, a)
      const t = mul(along, 1 / length)
      let n = { x: -t.y, y: t.x }
      if (dot(sub(p, c.point), n) < 0) n = mul(n, -1)
      // kept along the wall so the piece does not hang past its ends
      const s0 = clamp(c.t * length, Math.min(opts.width / 2, length / 2), Math.max(length - opts.width / 2, length / 2))
      best = { d: fromFace, at: add(add(a, mul(t, s0)), mul(n, half + opts.depth / 2)), angle: facing(n) }
    }
    return best ? { layer: layer.id, at: best.at, angle: best.angle } : free
  }

  if (info.snap === 'sofa') {
    for (const f of Object.values(layer.furniture)) {
      if (f.kind !== 'sofa') continue
      const s = placement(f.at, f.angle, f.width, f.depth)
      const q = toLocal(s, p)
      // in front of its main seat: a sectional's seat stops short of its return, and is shallower
      const m = f.mirror ? -1 : 1
      const sectional = f.style === 'sectional'
      const [x0, x1] = sectional ? [-s.width / 2, s.width / 2 - SOFA.chaise].map((x) => m * x).sort((a, b) => a - b) : [-s.width / 2, s.width / 2]
      const front = sectional ? Math.min(-s.depth / 2 + SOFA.seat, s.depth / 2) : s.depth / 2
      if (q.x < x0 - opts.reach || q.x > x1 + opts.reach || q.y < front - opts.reach || q.y > front + COFFEE_GAP + opts.depth + opts.reach) continue
      return { layer: layer.id, at: local(s, (x0 + x1) / 2, front + COFFEE_GAP + opts.depth / 2), angle: s.angle }
    }
    return free
  }

  if (info.snap === 'table') {
    for (const [id, f] of Object.entries(layer.furniture)) {
      // chairs gather round dining tables, not coffee tables
      if (f.kind !== 'table' || isCoffee(f) || id === opts.ignore) continue
      const t = placement(f.at, f.angle, f.width, f.depth)
      const q = toLocal(t, p)
      if (f.style === 'circle') {
        const r = t.width / 2
        const d = Math.hypot(q.x, q.y)
        if (d > r + opts.depth + opts.reach || d < 1e-9) continue
        const out = mul(sub(p, t.at), 1 / dist(p, t.at))
        // the chair's front tucked a little under the table's edge
        return { layer: layer.id, at: add(t.at, mul(out, r + opts.depth / 2 - 0.1)), angle: facing(mul(out, -1)) }
      }
      const [hw, hd] = [t.width / 2, t.depth / 2]
      if (Math.abs(q.x) > hw + opts.depth + opts.reach || Math.abs(q.y) > hd + opts.depth + opts.reach) continue
      // the side the cursor is past the most, by how far it is past it for the table's size
      const side = Math.abs(q.x) / hw > Math.abs(q.y) / hd ? { x: Math.sign(q.x) || 1, y: 0 } : { x: 0, y: Math.sign(q.y) || 1 }
      const reachOut = (side.x ? hw : hd) + opts.depth / 2 - 0.1
      const alongSide = side.x ? clamp(q.y, -hd + opts.width / 2, hd - opts.width / 2) : clamp(q.x, -hw + opts.width / 2, hw - opts.width / 2)
      const lx = side.x ? side.x * reachOut : alongSide
      const ly = side.x ? alongSide : side.y * reachOut
      const out = add(mul(t.u, side.x), mul(t.v, side.y))
      return { layer: layer.id, at: local(t, lx, ly), angle: facing(mul(out, -1)) }
    }
  }
  return free
}

/** A piece put down where `t` says, at `width` × `depth`. */
export function furnitureFor(kind: FurnitureKind, style: string | undefined, t: FurnitureTarget, width: number, depth: number): Furniture {
  if (kind === 'sink' && style === 'kitchen') return { kind, style, counter: t.counter!, offset: t.offset!, width, depth }
  const standing = { at: t.at, angle: t.angle, width, depth }
  // a shower head starts at a tub's left end (a corner tub's, along its left wall by the corner), a shower's back
  if (kind === 'bathtub') return { kind, style: style as 'alcove', ...standing, shower: style === 'corner' ? 3.85 : 3.5 }
  if (kind === 'shower') return { kind, ...standing, shower: 0.5 }
  if (kind === 'counter') return style === 'island' ? { kind, style, ...standing } : { kind, ...standing }
  if (kind === 'chair' || kind === 'toilet' || kind === 'bidet' || kind === 'stair') return { kind, ...standing }
  return { kind, style, ...standing } as Furniture
}

// ---- a bathtub's shower head --------------------------------------------------------------------------------

/** How far inside the rim's outer edge the shower head stands, in m. */
const SHOWER_INSET = 0.04

/** A sofa's parts on the plan, in its own frame (see local): what is shared by the plan symbol and the 3-D. */
export const SOFA = {
  /** The back's depth, an arm's width, the seat's depth from the back, and a sectional's return width. */
  back: 0.2,
  arm: 0.18,
  seat: 0.95,
  chaise: 0.95,
}

/** How many seat cushions a sofa has along its main seat. */
export const sofaCushions = (style: string): number => (style.endsWith('armchair') ? 1 : style === 'loveseat' ? 2 : 3)

/** A low table that stands before a sofa (not one chairs gather round). */
export const isCoffee = (f: Furniture): boolean => f.kind === 'table' && (f.style === 'coffee' || f.style === 'teak-coffee')

/** A stair's tread (its going) as near as its length allows, m. */
const STAIR_TREAD = 0.28

/** How many treads a stair `depth` m long has; it has one riser more, the last up to the floor above. */
export const stairTreads = (depth: number): number => Math.max(1, Math.round(depth / STAIR_TREAD))

/** A plant's pot, across, m. */
export const potSize = (width: number): number => Math.min(0.6, width * 0.5)

/** Whether a plant stands in a pot (the rest grow in the ground). */
export const potted = (style: string): boolean => style === 'olive' || style === 'shrub'

/**
 * A sofa's footprint, local and before turning: a rectangle, or for a sectional an L, its return reaching the
 * full depth at its right end (left when mirrored).
 */
export function sofaOutline(pl: Placement, style: string, mirror = false): Vec[] {
  const [hw, hd] = [pl.width / 2, pl.depth / 2]
  const m = mirror ? -1 : 1
  if (style !== 'sectional') return [local(pl, -hw, -hd), local(pl, hw, -hd), local(pl, hw, hd), local(pl, -hw, hd)]
  const seatFront = Math.min(-hd + SOFA.seat, hd)
  const inner = hw - SOFA.chaise
  const pts: [number, number][] = [
    [-hw, -hd],
    [hw, -hd],
    [hw, hd],
    [inner, hd],
    [inner, seatFront],
    [-hw, seatFront],
  ]
  return pts.map(([x, y]) => local(pl, m * x, y))
}

/** How far in front of a sofa's seat a coffee table stands, in m: room for the legs. */
export const COFFEE_GAP = 0.4

/** Whether a piece has a shower head that can be moved round its rim. */
export const hasShower = (f: Furniture): f is Extract<Furniture, { shower: number }> => f.kind === 'bathtub' || f.kind === 'shower'

/** A corner bathtub: a quarter of a disc, its corner at the back left (in the room's corner), its front curved. */
export const isCorner = (f: Furniture): boolean => f.kind === 'bathtub' && f.style === 'corner'

/**
 * The shower head's point on the plan, `s` round the rim (0–1 the back from the left, 1–2 the right, 2–3 the
 * front, 3–4 the left); round a corner tub's curved front from 1 to 3.
 */
export function showerPoint(pl: Placement, s: number, corner = false): Vec {
  const [hw, hd] = [pl.width / 2 - SHOWER_INSET, pl.depth / 2 - SHOWER_INSET]
  const k = Math.floor(clamp(s, 0, 3.9999))
  const t = clamp(s, 0, 4) - k
  if (corner && k >= 1 && k <= 2) {
    const a = (((k - 1 + t) / 2) * Math.PI) / 2
    const r = Math.min(pl.width, pl.depth) - SHOWER_INSET
    return local(pl, -pl.width / 2 + r * Math.cos(a), -pl.depth / 2 + r * Math.sin(a))
  }
  const [x, y] = [
    [-hw + 2 * hw * t, -hd],
    [hw, -hd + 2 * hd * t],
    [hw - 2 * hw * t, hd],
    [-hw, hd - 2 * hd * t],
  ][k]
  return local(pl, x, y)
}

/** The rim position nearest a plan point. */
export function showerAt(pl: Placement, p: Vec, corner = false): number {
  let best = { s: 0, d: Infinity }
  // the rim in short straight steps, so a curved front is followed too
  const steps = 24
  for (let k = 0; k < 4; k++) {
    for (let i = 0; i < steps; i++) {
      const [s0, s1] = [k + i / steps, k + Math.min((i + 1) / steps, 0.9999)]
      const c = closestOnSegment(p, showerPoint(pl, s0, corner), showerPoint(pl, s1, corner))
      if (c.dist < best.d) best = { s: Math.min(s0 + c.t * (s1 - s0), 3.9999), d: c.dist }
    }
  }
  return Math.round(best.s * 1000) / 1000
}

/** A quarter disc of radius `r` round the back left corner, local, inset `by` from its straight sides. */
export function quarterDisc(pl: Placement, r: number, by = 0, n = 16): Vec[] {
  const [x0, y0] = [-pl.width / 2 + by, -pl.depth / 2 + by]
  return [local(pl, x0, y0), ...Array.from({ length: n + 1 }, (_, i) => local(pl, x0 + r * Math.cos((i / n) * (Math.PI / 2)), y0 + r * Math.sin((i / n) * (Math.PI / 2))))]
}

// ---- in plan ------------------------------------------------------------------------------------------------

/** One line of a piece's plan symbol: an outline (closed), a line, or a circle; `role` sets how it is drawn. */
export type SymbolPart =
  | { pts: Vec[]; closed: boolean; role: 'outline' | 'detail' | 'soft' | 'heavy' }
  | { c: Vec; r: number; role: 'outline' | 'detail' | 'soft' | 'heavy' }

/** A trestle table's top in boards about 0.35 m wide: where each starts across its depth (local y), from its back edge. */
export function trestleBoards(depth: number): number[] {
  const n = Math.max(2, Math.round(depth / 0.35))
  return Array.from({ length: n }, (_, i) => -depth / 2 + (depth * i) / n)
}

/** Where a trestle table's leg frames stand along it (local x): in from each end, and one more in the middle of a long one. */
export function trestleFrames(width: number): number[] {
  const end = width / 2 - Math.min(0.4, width * 0.09)
  return width > 4 ? [-end, 0, end] : [-end, end]
}

/** An ellipse inside the box x0..x1, y0..y1 (local), as a polygon. */
export const ellipse = (pl: Placement, x0: number, y0: number, x1: number, y1: number, n = 32): Vec[] =>
  Array.from({ length: n }, (_, i) => {
    const a = (2 * Math.PI * i) / n
    return local(pl, (x0 + x1) / 2 + ((x1 - x0) / 2) * Math.cos(a), (y0 + y1) / 2 + ((y1 - y0) / 2) * Math.sin(a))
  })

/** A rectangle with rounded corners of radius `r`, local. */
export function rounded(pl: Placement, x0: number, y0: number, x1: number, y1: number, r: number): Vec[] {
  const pts: Vec[] = []
  const rr = Math.min(r, (x1 - x0) / 2, (y1 - y0) / 2)
  const arc = (cx: number, cy: number, from: number) => {
    for (let i = 0; i <= 4; i++) {
      const a = from + (i * Math.PI) / 8
      pts.push(local(pl, cx + rr * Math.cos(a), cy + rr * Math.sin(a)))
    }
  }
  arc(x1 - rr, y0 + rr, -Math.PI / 2)
  arc(x1 - rr, y1 - rr, 0)
  arc(x0 + rr, y1 - rr, Math.PI / 2)
  arc(x0 + rr, y0 + rr, Math.PI)
  return pts
}

/**
 * A piece's plan symbol, as plans draw furniture: its outline, and the lines that say what it is: a counter's
 * worktop edge, a basin and its drain, a tub's basin with its drain and shower head, a bed's pillows and turned
 * sheet, a chair's back.
 */
export function furnitureSymbol(f: Furniture, pl: Placement): SymbolPart[] {
  const [hw, hd] = [pl.width / 2, pl.depth / 2]
  const box = (x0: number, y0: number, x1: number, y1: number) => [local(pl, x0, y0), local(pl, x1, y0), local(pl, x1, y1), local(pl, x0, y1)]
  const outline: SymbolPart = { pts: box(-hw, -hd, hw, hd), closed: true, role: 'outline' }
  const drain = (x: number, y: number): SymbolPart => ({ c: local(pl, x, y), r: 0.025, role: 'detail' })
  switch (f.kind) {
    case 'counter':
      // an island shows where its cabinets end under the worktop's overhang
      if (f.style === 'island') return [outline, { pts: [local(pl, -hw, hd - ISLAND_OVERHANG), local(pl, hw, hd - ISLAND_OVERHANG)], closed: false, role: 'soft' }]
      return [outline, { pts: [local(pl, -hw, hd - 0.04), local(pl, hw, hd - 0.04)], closed: false, role: 'detail' }]
    case 'sink': {
      if (f.style === 'bathroom') return [outline, { pts: ellipse(pl, -hw + 0.07, -hd + 0.1, hw - 0.07, hd - 0.05), closed: true, role: 'detail' }, drain(0, 0.03), { c: local(pl, 0, -hd + 0.05), r: 0.02, role: 'soft' }]
      const parts: SymbolPart[] = [outline, { pts: rounded(pl, -hw + 0.06, -hd + 0.08, hw - 0.06, hd - 0.05, 0.05), closed: true, role: 'detail' }, drain(0, 0.02)]
      if (f.style === 'kitchen') parts.push({ c: local(pl, 0, -hd + 0.04), r: 0.02, role: 'soft' })
      return parts
    }
    case 'bathtub': {
      const shower = showerPoint(pl, f.shower, f.style === 'corner')
      const head: SymbolPart[] = [{ c: shower, r: 0.06, role: 'heavy' }]
      if (f.style === 'corner') {
        const r = Math.min(pl.width, pl.depth)
        return [{ pts: quarterDisc(pl, r), closed: true, role: 'outline' }, { pts: quarterDisc(pl, r - 0.2, 0.08), closed: true, role: 'detail' }, drain(-hw + 0.3, -hd + 0.3), ...head]
      }
      if (f.style === 'clawfoot') {
        return [{ pts: ellipse(pl, -hw, -hd, hw, hd), closed: true, role: 'outline' }, { pts: ellipse(pl, -hw + 0.07, -hd + 0.07, hw - 0.07, hd - 0.07), closed: true, role: 'detail' }, drain(-hw + 0.3, 0), ...head]
      }
      const basin = f.style === 'drop-in' ? ellipse(pl, -hw + 0.12, -hd + 0.12, hw - 0.12, hd - 0.12) : rounded(pl, -hw + 0.08, -hd + 0.08, hw - 0.08, hd - 0.08, 0.2)
      return [outline, { pts: basin, closed: true, role: 'detail' }, drain(-hw + 0.25, 0), ...head]
    }
    case 'bed': {
      const two = pl.width >= 1.3
      const pillow = (x0: number, x1: number): SymbolPart => ({ pts: rounded(pl, x0, -hd + 0.1, x1, -hd + 0.42, 0.06), closed: true, role: 'soft' })
      return [
        outline,
        { pts: [local(pl, -hw, -hd + 0.05), local(pl, hw, -hd + 0.05)], closed: false, role: 'heavy' },
        ...(two ? [pillow(-hw + 0.08, -0.04), pillow(0.04, hw - 0.08)] : [pillow(-hw + 0.1, hw - 0.1)]),
        { pts: [local(pl, -hw, -hd + 0.62), local(pl, hw, -hd + 0.62)], closed: false, role: 'detail' },
        { pts: [local(pl, -hw, -hd + 0.62), local(pl, -hw + 0.3, -hd + 0.82)], closed: false, role: 'soft' },
      ]
    }
    case 'sofa': {
      // the outline, the back, the arms, and the cushions of the seat (a sectional's return has no arm)
      const m = f.mirror ? -1 : 1
      const l = (x: number, y: number) => local(pl, m * x, y)
      const back = -hd + SOFA.back
      const front = f.style === 'sectional' ? Math.min(-hd + SOFA.seat, hd) : hd
      const right = f.style === 'sectional' ? hw - SOFA.chaise : hw - SOFA.arm
      const left = -hw + SOFA.arm
      const parts: SymbolPart[] = [
        { pts: sofaOutline(pl, f.style, f.mirror), closed: true, role: 'outline' },
        { pts: [l(-hw, back), l(hw, back)], closed: false, role: 'detail' },
        { pts: [l(left, back), l(left, front)], closed: false, role: 'detail' },
      ]
      if (f.style === 'sectional') parts.push({ pts: [l(right, back), l(right, front)], closed: false, role: 'soft' })
      else parts.push({ pts: [l(right, back), l(right, front)], closed: false, role: 'detail' })
      const n = sofaCushions(f.style)
      for (let i = 1; i < n; i++) {
        const x = left + ((right - left) * i) / n
        parts.push({ pts: [l(x, back), l(x, front)], closed: false, role: 'soft' })
      }
      return parts
    }
    case 'table':
      if (f.style === 'teak-coffee') {
        // its slats
        const n = Math.max(3, Math.round(pl.depth / 0.1))
        return [outline, ...Array.from({ length: n - 1 }, (_, i): SymbolPart => ({ pts: [local(pl, -hw, -hd + (pl.depth * (i + 1)) / n), local(pl, hw, -hd + (pl.depth * (i + 1)) / n)], closed: false, role: 'soft' }))]
      }
      if (f.style === 'coffee') return [{ pts: rounded(pl, -hw, -hd, hw, hd, 0.06), closed: true, role: 'outline' }, { pts: rounded(pl, -hw + 0.06, -hd + 0.06, hw - 0.06, hd - 0.06, 0.04), closed: true, role: 'soft' }]
      if (f.style === 'trestle') {
        // its top's boards, and the leg frames under it
        const boards = trestleBoards(pl.depth)
        return [
          outline,
          ...boards.slice(1).map((y): SymbolPart => ({ pts: [local(pl, -hw, y), local(pl, hw, y)], closed: false, role: 'soft' })),
          ...trestleFrames(pl.width).map((x): SymbolPart => ({ pts: box(x - 0.07, -hd + 0.09, x + 0.07, hd - 0.09), closed: true, role: 'soft' })),
        ]
      }
      return f.style === 'circle' ? [{ pts: ellipse(pl, -hw, -hd, hw, hd, 48), closed: true, role: 'outline' }] : [outline]
    case 'shower':
      // a tray with its drain, the head on its edge, and the glass screen along its front
      return [
        outline,
        { pts: box(-hw + 0.05, -hd + 0.05, hw - 0.05, hd - 0.05), closed: true, role: 'soft' },
        { pts: [local(pl, -hw + 0.05, -hd + 0.05), local(pl, hw - 0.05, hd - 0.05)], closed: false, role: 'soft' },
        { pts: [local(pl, hw - 0.05, -hd + 0.05), local(pl, -hw + 0.05, hd - 0.05)], closed: false, role: 'soft' },
        drain(0, 0),
        { pts: [local(pl, -hw, hd), local(pl, hw * 0.3, hd)], closed: false, role: 'detail' },
        { c: showerPoint(pl, f.shower), r: 0.06, role: 'heavy' },
      ]
    case 'toilet':
      // the cistern against the wall and the bowl in front of it
      return [
        { pts: box(-hw, -hd, hw, -hd + 0.18), closed: true, role: 'outline' },
        { pts: ellipse(pl, -hw + 0.02, -hd + 0.14, hw - 0.02, hd), closed: true, role: 'outline' },
        { pts: ellipse(pl, -hw + 0.08, -hd + 0.26, hw - 0.08, hd - 0.06), closed: true, role: 'detail' },
      ]
    case 'bidet':
      return [
        { pts: ellipse(pl, -hw, -hd + 0.03, hw, hd), closed: true, role: 'outline' },
        { pts: ellipse(pl, -hw + 0.06, -hd + 0.12, hw - 0.06, hd - 0.05), closed: true, role: 'detail' },
        drain(0, 0.05),
        { c: local(pl, 0, -hd + 0.08), r: 0.02, role: 'soft' },
      ]
    case 'plant': {
      if (f.style === 'climber') {
        // its spread along the wall, and a few flowers
        return [
          { pts: rounded(pl, -hw, -hd, hw, hd, Math.min(hd, 0.12)), closed: true, role: 'soft' },
          ...[-0.3, 0, 0.3].map((x): SymbolPart => ({ c: local(pl, x * hw * 2, 0), r: 0.05, role: 'detail' })),
        ]
      }
      if (!potted(f.style)) {
        // its spread; an agapanthus's flower heads
        const flowers = f.style === 'agapanthus' ? [0, 1, 2, 3, 4].map((i): SymbolPart => ({ c: local(pl, Math.cos(i * 1.26) * hw * 0.45, Math.sin(i * 1.26) * hd * 0.45), r: 0.05, role: 'detail' })) : []
        return [{ pts: ellipse(pl, -hw, -hd, hw, hd, 24), closed: true, role: 'soft' }, ...flowers]
      }
      // its pot, and its foliage over it
      const r = potSize(pl.width) / 2
      return [
        { c: local(pl, 0, 0), r, role: 'outline' },
        { pts: ellipse(pl, -hw, -hd, hw, hd, 28), closed: true, role: 'soft' },
      ]
    }
    case 'tree':
      // its crown from above, and its trunk
      return [
        { pts: ellipse(pl, -hw, -hd, hw, hd, 40), closed: true, role: 'soft' },
        { pts: ellipse(pl, -hw * 0.6, -hd * 0.6, hw * 0.6, hd * 0.6, 28), closed: true, role: 'detail' },
        { c: local(pl, 0, 0), r: Math.min(0.2, hw * 0.08), role: 'heavy' },
      ]
    case 'chair':
      return [
        { pts: box(-hw + 0.02, -hd + 0.08, hw - 0.02, hd), closed: true, role: 'outline' },
        { pts: box(-hw, -hd, hw, -hd + 0.08), closed: true, role: 'heavy' },
      ]
    case 'stair': {
      // its treads, and the walking line up the flight from a dot at its foot (the front) to an arrow at its head
      const n = stairTreads(pl.depth)
      const t = pl.depth / n
      const head = -hd + Math.min(0.15, t / 2)
      const barb = Math.min(0.12, hw / 2)
      return [
        outline,
        ...Array.from({ length: n - 1 }, (_, i): SymbolPart => ({ pts: [local(pl, -hw, hd - t * (i + 1)), local(pl, hw, hd - t * (i + 1))], closed: false, role: 'soft' })),
        { c: local(pl, 0, hd - t / 2), r: 0.04, role: 'detail' },
        { pts: [local(pl, 0, hd - t / 2), local(pl, 0, head)], closed: false, role: 'detail' },
        { pts: [local(pl, -barb, head + 0.18), local(pl, 0, head), local(pl, barb, head + 0.18)], closed: false, role: 'detail' },
      ]
    }
  }
}
