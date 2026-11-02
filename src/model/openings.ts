import { add, clamp, closestOnSegment, cross, dist, dot, EPS, mul, sub, type Vec } from './geometry'
import { isEditable, type Layer, type Opening, type OpeningKind, type OpeningStyle, type Plan } from './plan'

export interface StyleInfo {
  kind: OpeningKind
  style: OpeningStyle
  title: string
  /** The width a new one gets until another is typed, in m: a typical clear width. */
  width: number
}

/** The door, window and gate styles, in the order the library lists them. */
export const STYLES: readonly StyleInfo[] = [
  { kind: 'door', style: 'single', title: 'Single', width: 0.8 },
  { kind: 'door', style: 'double', title: 'Double', width: 1.4 },
  { kind: 'door', style: 'sliding', title: 'Sliding', width: 1.6 },
  { kind: 'window', style: 'fixed', title: 'Fixed', width: 1.0 },
  { kind: 'window', style: 'sliding', title: 'Sliding', width: 1.5 },
  { kind: 'window', style: 'double-hung', title: 'Double hung', width: 0.9 },
  { kind: 'window', style: 'awning', title: 'Awning', width: 1.0 },
  { kind: 'window', style: 'casement', title: 'Casement', width: 1.2 },
  { kind: 'gate', style: 'single', title: 'Single', width: 1.0 },
  { kind: 'gate', style: 'double', title: 'Double', width: 3.0 },
  { kind: 'gate', style: 'sliding', title: 'Sliding', width: 4.0 },
]

export const styleKey = (kind: OpeningKind, style: OpeningStyle): string => `${kind}:${style}`

export const styleInfo = (kind: OpeningKind, style: OpeningStyle): StyleInfo => STYLES.find((s) => s.kind === kind && s.style === style)!

export const isStyleOf = (kind: OpeningKind, style: string): style is OpeningStyle => STYLES.some((s) => s.kind === kind && s.style === style)

/** Casements this wide or wider get two leaves meeting in the middle, in m. */
const CASEMENT_PAIR = 1.0

/** Whether it opens or slides to one side of the wall, which Flip side changes (fixed and double-hung windows do not). */
export const hasSide = (o: Pick<Opening, 'kind' | 'style'>): boolean => !(o.kind === 'window' && (o.style === 'fixed' || o.style === 'double-hung'))

/** Whether it hangs from one hinged leaf (or slides one way), which Flip hinge changes. */
export const hasHinge = (o: Pick<Opening, 'kind' | 'style' | 'width'>): boolean =>
  o.kind === 'window' ? o.style === 'casement' && o.width < CASEMENT_PAIR : o.kind === 'door' ? o.style === 'single' : o.style !== 'double'

/** A sliding gate's hinge is the end it slides away towards. */
export const slides = (o: Pick<Opening, 'kind' | 'style'>): boolean => o.kind === 'gate' && o.style === 'sliding'

/** Openings snap their distance to the nearer wall end to this step, in m. */
const GAP_STEP = 0.05

/** An opening laid out on its segment. */
export interface PlacedOpening {
  /** Its ends along the segment (in the a→b direction) and its centre. */
  start: Vec
  end: Vec
  center: Vec
  /** Unit vectors along the segment (a→b) and to its left. */
  dir: Vec
  left: Vec
  /** The segment's length, and the centre's distance from its `a` end once the opening is fitted on it. */
  length: number
  offset: number
  /** False when the segment is shorter than the opening. */
  fits: boolean
}

/** The centre that keeps an opening of `width` within a segment of `length`. */
export const fitOffset = (length: number, width: number, offset: number): number =>
  length <= width ? length / 2 : clamp(offset, width / 2, length - width / 2)

export function placeOpening(layer: Layer, o: Opening): PlacedOpening | null {
  const s = layer.segments[o.segment]
  if (!s) return null
  const a = layer.vertices[s.a]
  const b = layer.vertices[s.b]
  const length = dist(a, b)
  if (length < EPS) return null
  const dir = mul(sub(b, a), 1 / length)
  const offset = fitOffset(length, o.width, o.offset)
  const half = Math.min(o.width, length) / 2
  return {
    start: add(a, mul(dir, offset - half)),
    end: add(a, mul(dir, offset + half)),
    center: add(a, mul(dir, offset)),
    dir,
    left: { x: dir.y, y: -dir.x },
    length,
    offset,
    fits: o.width <= length + EPS,
  }
}

/** An arc for SVG: from a leaf's tip to the jamb it closes on. */
export interface Arc {
  from: Vec
  to: Vec
  radius: number
  sweep: 0 | 1
}

/** The pieces of an opening's plan symbol, in the coordinates of its placement. */
export interface OpeningParts {
  /** Short lines across the wall at a door's ends. */
  jambs: [Vec, Vec][]
  /** A window's frame across the wall. */
  frame?: Vec[]
  /** Glass along the wall: one pane, or staggered or parallel sashes. */
  glass: [Vec, Vec][]
  /** Sliding door panels, staggered across the wall. */
  panels: Vec[][]
  /** Hinged leaves drawn open at 90° (doors, casements, gates), and the arcs their tips sweep. */
  leaves: [Vec, Vec][]
  arcs: Arc[]
  /** Dashed outlines: an awning's sash open outward seen from above, a sliding gate where it parks when open. */
  dashed: Vec[][]
  /** Gate posts at the ends of the opening. */
  posts: Vec[][]
}

/**
 * The plan symbol of an opening, for a wall `half` thick on each side of its line (the wall's own, or a usual
 * one for a fence drawn as an open edge). Doors: jambs and one leaf, two leaves meeting in the middle, or two
 * sliding panels. Windows: a frame and one pane (fixed), two staggered sashes (sliding), two parallel sashes
 * (double hung), a pane and the sash projecting outside (awning), or leaves swinging outside (casement).
 * Gates: posts and one leaf, a pair, or a sliding panel with the stretch of fence it parks along. Everything
 * that opens to one side opens to `swing`.
 */
export function openingParts(p: PlacedOpening, o: Opening, half: number): OpeningParts {
  const w = dist(p.start, p.end)
  const side = o.swing === 'left' ? 1 : -1
  const out = mul(p.left, side)
  /** The point a fraction `t` of the way along the opening, `across` to its left. */
  const at = (t: number, across = 0) => add(add(p.start, mul(p.dir, t * w)), mul(p.left, across))
  const strip = (t0: number, t1: number, across: number, thick: number) => [
    at(t0, across + thick / 2),
    at(t1, across + thick / 2),
    at(t1, across - thick / 2),
    at(t0, across - thick / 2),
  ]
  const parts: OpeningParts = { jambs: [], glass: [], panels: [], leaves: [], arcs: [], dashed: [], posts: [] }
  const leaf = (hinge: Vec, jamb: Vec) => {
    const radius = dist(hinge, jamb)
    const tip = add(hinge, mul(out, radius))
    parts.leaves.push([hinge, tip])
    // SVG sweeps clockwise on screen with flag 1, which is a positive cross product in y-down coordinates
    parts.arcs.push({ from: tip, to: jamb, radius, sweep: cross(sub(tip, hinge), sub(jamb, hinge)) > 0 ? 1 : 0 })
  }

  if (o.kind === 'gate') {
    const post = (t: number) => {
      const c = at(t)
      const r = half * 0.9
      return [add(add(c, mul(p.dir, -r)), mul(p.left, r)), add(add(c, mul(p.dir, r)), mul(p.left, r)), add(add(c, mul(p.dir, r)), mul(p.left, -r)), add(add(c, mul(p.dir, -r)), mul(p.left, -r))]
    }
    parts.posts.push(post(0), post(1))
    if (o.style === 'single') {
      if (o.hinge === 'a') leaf(p.start, p.end)
      else leaf(p.end, p.start)
    } else if (o.style === 'double') {
      leaf(p.start, p.center)
      leaf(p.end, p.center)
    } else {
      // closed across the opening, and parked beside it along the fence, past the end it slides towards
      const toward = o.hinge === 'a' ? -1 : 1
      parts.panels.push(strip(0, 1, side * half * 0.6, half * 0.5))
      parts.dashed.push(toward > 0 ? strip(1, 2, side * half * 0.6, half * 0.5) : strip(-1, 0, side * half * 0.6, half * 0.5))
    }
    return parts
  }

  if (o.kind === 'door') {
    parts.jambs.push([at(0, half), at(0, -half)], [at(1, half), at(1, -half)])
    if (o.style === 'single') {
      if (o.hinge === 'a') leaf(p.start, p.end)
      else leaf(p.end, p.start)
    } else if (o.style === 'double') {
      leaf(p.start, p.center)
      leaf(p.end, p.center)
    } else {
      parts.panels.push(strip(0, 0.55, side * half * 0.45, half * 0.5), strip(0.45, 1, -side * half * 0.45, half * 0.5))
    }
    return parts
  }

  parts.frame = strip(0, 1, 0, 2 * half)
  const sash = half * 0.4
  if (o.style === 'sliding') parts.glass.push([at(0, side * sash), at(0.55, side * sash)], [at(0.45, -side * sash), at(1, -side * sash)])
  else if (o.style === 'double-hung') parts.glass.push([at(0, sash), at(1, sash)], [at(0, -sash), at(1, -sash)])
  else parts.glass.push([p.start, p.end])
  // awnings and casements open from the outer face of the wall
  const face = (t: number) => at(t, side * half)
  if (o.style === 'awning') parts.dashed.push([face(0), add(face(0.08), mul(out, w * 0.3)), add(face(0.92), mul(out, w * 0.3)), face(1)])
  if (o.style === 'casement') {
    if (!hasHinge(o)) {
      leaf(face(0), face(0.5))
      leaf(face(1), face(0.5))
    } else if (o.hinge === 'a') leaf(face(0), face(1))
    else leaf(face(1), face(0))
  }
  return parts
}

/** The stretches of a segment its openings take, as [from, to] distances from its `a` end, in order. */
export function openingSpans(layer: Layer, segment: string): [number, number][] {
  const spans: [number, number][] = []
  for (const o of Object.values(layer.openings)) {
    if (o.segment !== segment) continue
    const p = placeOpening(layer, o)
    if (p) spans.push([p.offset - Math.min(o.width, p.length) / 2, p.offset + Math.min(o.width, p.length) / 2])
  }
  return spans.sort((x, y) => x[0] - y[0])
}

/** The id of an opening on `segment` that one of `width` centred at `offset` would overlap. */
export function overlappingOpening(layer: Layer, segment: string, offset: number, width: number, ignore?: string): string | undefined {
  for (const [id, o] of Object.entries(layer.openings)) {
    if (id === ignore || o.segment !== segment) continue
    if (Math.abs(o.offset - offset) < (o.width + width) / 2 - EPS) return id
  }
  return undefined
}

export interface OpeningTarget {
  layer: string
  segment: string
  /** Centre distance from the segment's `a` end. */
  offset: number
  /** The side of the segment the cursor is on, looking from `a` to `b`: where a door or casement would open to. */
  side: 'left' | 'right'
  /** The hinge end nearer the segment's closer end, which is where doors usually hang. */
  hinge: 'a' | 'b'
  /** Free segment on either side: from its `a` end to the opening, and from the opening to its `b` end. */
  gaps: [number, number]
  /** Why the opening cannot go there, if it cannot. */
  problem?: string
}

export interface TargetOptions {
  /** How far from a segment the cursor may be, in m. */
  reach: number
  /** How close to the segment's middle the centre snaps to it, in m (default: `reach`). */
  snapReach?: number
  width: number
  activeLayer: string
  /** Only this layer (dragging an opening keeps it on its layer). */
  layer?: string
  /** How far a segment's drawn faces are from its line (walls drawn thick), added to `reach`. */
  halfWidth?: (layer: Layer, segment: string) => number
  /** Snap to the segment's middle and to round gaps. */
  snap: boolean
  /** An opening to leave out of the overlap check: the one being dragged. */
  ignore?: string
}

/**
 * Where an opening of `width` goes for cursor `p`: on the nearest segment of an editable layer (the active one
 * first on a tie), centred at the cursor's projection, kept within the segment, and snapped to the segment's
 * middle or to 5 cm gaps from its nearer end.
 */
export function openingTarget(plan: Plan, p: Vec, opts: TargetOptions): OpeningTarget | null {
  let best: { layer: Layer; segment: string; t: number; d: number } | null = null
  for (const layer of plan.layers) {
    if (!isEditable(layer) || (opts.layer && layer.id !== opts.layer)) continue
    for (const [id, s] of Object.entries(layer.segments)) {
      const c = closestOnSegment(p, layer.vertices[s.a], layer.vertices[s.b])
      if (c.dist > opts.reach + (opts.halfWidth?.(layer, id) ?? 0)) continue
      if (!best || c.dist < best.d - EPS || (Math.abs(c.dist - best.d) <= EPS && layer.id === opts.activeLayer)) best = { layer, segment: id, t: c.t, d: c.dist }
    }
  }
  if (!best) return null
  const { layer, segment } = best
  const s = layer.segments[segment]
  const a = layer.vertices[s.a]
  const b = layer.vertices[s.b]
  const length = dist(a, b)
  const w = opts.width
  let offset = fitOffset(length, w, best.t * length)
  if (opts.snap && length > w) {
    if (Math.abs(offset - length / 2) <= (opts.snapReach ?? opts.reach)) offset = length / 2
    else if (offset < length / 2) offset = fitOffset(length, w, Math.round((offset - w / 2) / GAP_STEP) * GAP_STEP + w / 2)
    else offset = fitOffset(length, w, length - w / 2 - Math.round((length - offset - w / 2) / GAP_STEP) * GAP_STEP)
  }
  const dir = mul(sub(b, a), 1 / length)
  const side = dot(sub(p, add(a, mul(dir, best.t * length))), { x: dir.y, y: -dir.x }) >= 0 ? 'left' : 'right'
  const gaps: [number, number] = [Math.max(0, offset - w / 2), Math.max(0, length - offset - w / 2)]
  const target: OpeningTarget = { layer: layer.id, segment, offset, side, hinge: gaps[0] <= gaps[1] ? 'a' : 'b', gaps }
  if (length < w - EPS) target.problem = `The wall is ${length.toFixed(2)} m, shorter than the opening.`
  else if (overlappingOpening(layer, segment, offset, w, opts.ignore)) target.problem = 'It would overlap another opening.'
  return target
}

/**
 * The opening a target describes: it opens to the cursor's side and hangs near the closer corner, or, for a
 * sliding gate, slides towards the side with more wall to park along. The hinge can be swapped.
 */
export function openingFor(kind: OpeningKind, style: OpeningStyle, t: OpeningTarget, width: number, otherHinge = false): Opening {
  const swap = otherHinge !== slides({ kind, style })
  const hinge = swap ? (t.hinge === 'a' ? 'b' : 'a') : t.hinge
  return { kind, style, segment: t.segment, offset: t.offset, width, hinge, swing: t.side } as Opening
}

/**
 * How much clear wall a sliding gate has to park along when open: from its edge on the side it slides towards
 * to the end of its segment or the next opening there, in m. Infinity for everything else.
 */
export function parkingRoom(layer: Layer, id: string): number {
  const o = layer.openings[id]
  const p = o && slides(o) ? placeOpening(layer, o) : null
  if (!o || !p) return Infinity
  const half = Math.min(o.width, p.length) / 2
  const towardsB = o.hinge === 'b'
  let room = towardsB ? p.length - (p.offset + half) : p.offset - half
  for (const [otherId, other] of Object.entries(layer.openings)) {
    if (otherId === id || other.segment !== o.segment) continue
    const gap = towardsB ? other.offset - other.width / 2 - (p.offset + half) : p.offset - half - (other.offset + other.width / 2)
    if (gap >= -EPS) room = Math.min(room, gap)
  }
  return Math.max(0, room)
}

/** The opening under `p` on an editable layer: near its stretch of wall or one of its leaves. */
export function openingAt(plan: Plan, p: Vec, reach: number): { layer: string; id: string } | null {
  let hit: { layer: string; id: string } | null = null
  let best = reach
  for (const layer of plan.layers) {
    if (!isEditable(layer)) continue
    for (const [id, o] of Object.entries(layer.openings)) {
      const placed = placeOpening(layer, o)
      if (!placed) continue
      let d = closestOnSegment(p, placed.start, placed.end).dist
      for (const [a, b] of openingParts(placed, o, 0).leaves) d = Math.min(d, closestOnSegment(p, a, b).dist)
      if (d < best) [best, hit] = [d, { layer: layer.id, id }]
    }
  }
  return hit
}
