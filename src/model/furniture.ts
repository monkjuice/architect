import { add, clamp, closestOnSegment, dist, dot, mul, sub, type Box, type Vec } from './geometry'
import { isEditable, segmentKind, type Furniture, type FurnitureKind, type Layer, type Plan } from './plan'

/**
 * Furniture and fixtures: counters, sinks, bathtubs, beds, tables and chairs. Each stands at a point turned to an
 * angle, its back up the sheet at 0, and is `width` across its front and `depth` from back to front. Things that
 * stand against a wall (counters, bathroom and outdoor sinks, bathtubs, beds) snap with their back to the nearest
 * wall face when they are put down; a kitchen sink only goes in a counter and is kept there, relative to it;
 * a chair snaps to face a table it is put next to.
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
  snap: 'wall' | 'counter' | 'table' | 'none'
}

/** The catalogue, in the order the library lists it. Beds are mattress sizes plus a frame and headboard. */
export const FURNITURE: readonly FurnitureInfo[] = [
  { kind: 'counter', title: 'Counter', width: 2.4, depth: 0.6, height: 0.9, snap: 'wall' },
  { kind: 'sink', style: 'outdoor', title: 'Outdoor sink', width: 0.7, depth: 0.5, height: 0.85, snap: 'wall' },
  { kind: 'sink', style: 'kitchen', title: 'Kitchen sink', width: 0.8, depth: 0.45, height: 0.9, snap: 'counter' },
  { kind: 'sink', style: 'bathroom', title: 'Bathroom sink', width: 0.6, depth: 0.45, height: 0.85, snap: 'wall' },
  { kind: 'bathtub', style: 'alcove', title: 'Alcove', width: 1.7, depth: 0.75, height: 0.55, snap: 'wall' },
  { kind: 'bathtub', style: 'clawfoot', title: 'Clawfoot', width: 1.65, depth: 0.78, height: 0.62, snap: 'wall' },
  { kind: 'bathtub', style: 'drop-in', title: 'Drop in', width: 1.85, depth: 0.95, height: 0.55, snap: 'wall' },
  { kind: 'bed', style: 'single', title: 'Single', width: 0.95, depth: 2.0, height: 1.0, snap: 'wall' },
  { kind: 'bed', style: 'double', title: 'Double', width: 1.45, depth: 2.0, height: 1.0, snap: 'wall' },
  { kind: 'bed', style: 'queen', title: 'Queen', width: 1.65, depth: 2.1, height: 1.0, snap: 'wall' },
  { kind: 'bed', style: 'king', title: 'King', width: 1.85, depth: 2.1, height: 1.0, snap: 'wall' },
  { kind: 'table', style: 'square', title: 'Square', width: 0.9, depth: 0.9, height: 0.75, snap: 'none' },
  { kind: 'table', style: 'circle', title: 'Circle', width: 1.1, depth: 1.1, height: 0.75, snap: 'none' },
  { kind: 'chair', title: 'Chair', width: 0.45, depth: 0.5, height: 0.9, snap: 'table' },
]

export const furnitureKey = (kind: FurnitureKind, style?: string): string => (style ? `${kind}:${style}` : kind)

const styleOf = (f: Furniture): string | undefined => ('style' in f ? f.style : undefined)

export const furnitureInfo = (kind: FurnitureKind, style?: string): FurnitureInfo => FURNITURE.find((i) => i.kind === kind && i.style === style)!

export const infoOf = (f: Furniture): FurnitureInfo => furnitureInfo(f.kind, styleOf(f))

/** How far from a wall face, a counter or a table a piece still snaps to it when it is put down, in m. */
export const FURNITURE_REACH_M = 0.4

/** How far a kitchen sink's centre stands in front of its counter's middle, in m: sinks sit to the front. */
const SINK_FORWARD = 0.03

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
  return placement(local(c, x, SINK_FORWARD), c.angle, f.width, f.depth)
}

/** Whether a plan point is on a piece (a round table is a disc, the rest rectangles). */
export function onFurniture(f: Furniture, pl: Placement, p: Vec): boolean {
  const q = toLocal(pl, p)
  if (f.kind === 'table' && f.style === 'circle') return (q.x / (pl.width / 2)) ** 2 + (q.y / (pl.depth / 2)) ** 2 <= 1
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
      return { layer: layer.id, at: local(c, offset - c.width / 2, SINK_FORWARD), angle: c.angle, counter: id, offset }
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

  if (info.snap === 'table') {
    for (const [id, f] of Object.entries(layer.furniture)) {
      if (f.kind !== 'table' || id === opts.ignore) continue
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
  if (kind === 'bathtub') return { kind, style: style as 'alcove', ...standing, shower: 3.5 }
  if (kind === 'counter' || kind === 'chair') return { kind, ...standing }
  return { kind, style, ...standing } as Furniture
}

// ---- a bathtub's shower head --------------------------------------------------------------------------------

/** How far inside the rim's outer edge the shower head stands, in m. */
const SHOWER_INSET = 0.04

/** The shower head's point on the plan, `s` round the rim (0–1 the back from the left, 1–2 the right, 2–3 the front, 3–4 the left). */
export function showerPoint(pl: Placement, s: number): Vec {
  const [hw, hd] = [pl.width / 2 - SHOWER_INSET, pl.depth / 2 - SHOWER_INSET]
  const k = Math.floor(clamp(s, 0, 3.9999))
  const t = clamp(s, 0, 4) - k
  const [x, y] = [
    [-hw + 2 * hw * t, -hd],
    [hw, -hd + 2 * hd * t],
    [hw - 2 * hw * t, hd],
    [-hw, hd - 2 * hd * t],
  ][k]
  return local(pl, x, y)
}

/** The rim position nearest a plan point. */
export function showerAt(pl: Placement, p: Vec): number {
  let best = { s: 0, d: Infinity }
  for (let k = 0; k < 4; k++) {
    const a = showerPoint(pl, k)
    const b = showerPoint(pl, k + 0.9999)
    const c = closestOnSegment(p, a, b)
    if (c.dist < best.d) best = { s: Math.min(k + c.t, 3.9999), d: c.dist }
  }
  return Math.round(best.s * 1000) / 1000
}

// ---- in plan ------------------------------------------------------------------------------------------------

/** One line of a piece's plan symbol: an outline (closed), a line, or a circle; `role` sets how it is drawn. */
export type SymbolPart =
  | { pts: Vec[]; closed: boolean; role: 'outline' | 'detail' | 'soft' | 'heavy' }
  | { c: Vec; r: number; role: 'outline' | 'detail' | 'soft' | 'heavy' }

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
      return [outline, { pts: [local(pl, -hw, hd - 0.04), local(pl, hw, hd - 0.04)], closed: false, role: 'detail' }]
    case 'sink': {
      if (f.style === 'bathroom') return [outline, { pts: ellipse(pl, -hw + 0.07, -hd + 0.1, hw - 0.07, hd - 0.05), closed: true, role: 'detail' }, drain(0, 0.03), { c: local(pl, 0, -hd + 0.05), r: 0.02, role: 'soft' }]
      const parts: SymbolPart[] = [outline, { pts: rounded(pl, -hw + 0.06, -hd + 0.08, hw - 0.06, hd - 0.05, 0.05), closed: true, role: 'detail' }, drain(0, 0.02)]
      if (f.style === 'kitchen') parts.push({ c: local(pl, 0, -hd + 0.04), r: 0.02, role: 'soft' })
      return parts
    }
    case 'bathtub': {
      const shower = showerPoint(pl, f.shower)
      const head: SymbolPart[] = [{ c: shower, r: 0.06, role: 'heavy' }]
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
    case 'table':
      return f.style === 'circle' ? [{ pts: ellipse(pl, -hw, -hd, hw, hd, 48), closed: true, role: 'outline' }] : [outline]
    case 'chair':
      return [
        { pts: box(-hw + 0.02, -hd + 0.08, hw - 0.02, hd), closed: true, role: 'outline' },
        { pts: box(-hw, -hd, hw, -hd + 0.08), closed: true, role: 'heavy' },
      ]
  }
}
