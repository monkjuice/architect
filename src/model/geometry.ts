/** Plain 2D vector math. World units are meters; +x to the right and +y down, as in SVG. */

export interface Vec {
  x: number
  y: number
}

export interface Box {
  x0: number
  y0: number
  x1: number
  y1: number
}

export const EPS = 1e-9

export const vec = (x: number, y: number): Vec => ({ x, y })
export const add = (a: Vec, b: Vec): Vec => ({ x: a.x + b.x, y: a.y + b.y })
export const sub = (a: Vec, b: Vec): Vec => ({ x: a.x - b.x, y: a.y - b.y })
export const mul = (a: Vec, k: number): Vec => ({ x: a.x * k, y: a.y * k })
export const dot = (a: Vec, b: Vec): number => a.x * b.x + a.y * b.y
export const cross = (a: Vec, b: Vec): number => a.x * b.y - a.y * b.x
export const len = (a: Vec): number => Math.hypot(a.x, a.y)
export const dist = (a: Vec, b: Vec): number => Math.hypot(a.x - b.x, a.y - b.y)
export const lerp = (a: Vec, b: Vec, t: number): Vec => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t })
export const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v))
export const toDeg = (rad: number): number => (rad * 180) / Math.PI
export const toRad = (deg: number): number => (deg * Math.PI) / 180

export function rotate(p: Vec, angle: number): Vec {
  const c = Math.cos(angle)
  const s = Math.sin(angle)
  return { x: p.x * c - p.y * s, y: p.x * s + p.y * c }
}

/** Wraps an angle into (-π, π]. */
export function normalizeAngle(a: number): number {
  const r = a % (2 * Math.PI)
  if (r > Math.PI) return r - 2 * Math.PI
  if (r <= -Math.PI) return r + 2 * Math.PI
  return r
}

/** Unit vector at `angle`. Near-zero components are flushed so axis-aligned results stay exact. */
export function direction(angle: number): Vec {
  const flush = (v: number) => (Math.abs(v) < 1e-12 ? 0 : v)
  return { x: flush(Math.cos(angle)), y: flush(Math.sin(angle)) }
}

/** Projects `p` onto the ray from `origin` whose angle is the nearest multiple of `step` (45° by default). */
export function constrainAngle(origin: Vec, p: Vec, step = Math.PI / 4): { point: Vec; dir: Vec } {
  const d = sub(p, origin)
  const dir = direction(Math.round(Math.atan2(d.y, d.x) / step) * step)
  return { point: add(origin, mul(dir, dot(d, dir))), dir }
}

export function closestOnSegment(p: Vec, a: Vec, b: Vec): { point: Vec; t: number; dist: number } {
  const ab = sub(b, a)
  const l2 = dot(ab, ab)
  const t = l2 < EPS * EPS ? 0 : clamp(dot(sub(p, a), ab) / l2, 0, 1)
  const point = lerp(a, b, t)
  return { point, t, dist: dist(p, point) }
}

/**
 * Intersection of the infinite line through `o` along `dir` with segment a-b, or null when they are parallel
 * or it falls outside the segment. `t` is the position along `dir`, `u` the position along a-b (0..1).
 */
export function lineSegmentIntersection(o: Vec, dir: Vec, a: Vec, b: Vec): { point: Vec; t: number; u: number } | null {
  const ab = sub(b, a)
  const denom = cross(dir, ab)
  if (Math.abs(denom) < EPS) return null
  const ao = sub(a, o)
  const t = cross(ao, ab) / denom
  const u = cross(ao, dir) / denom
  if (u < 0 || u > 1) return null
  return { point: add(o, mul(dir, t)), t, u }
}

/** Area of a simple polygon (shoelace formula), always positive. */
export function polygonArea(pts: readonly Vec[]): number {
  return Math.abs(signedArea(pts))
}

/** Shoelace area, positive when the polygon runs clockwise on screen (+y down). */
export function signedArea(pts: readonly Vec[]): number {
  let s = 0
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]
    const b = pts[(i + 1) % pts.length]
    s += a.x * b.y - b.x * a.y
  }
  return s / 2
}

export function polylineLength(pts: readonly Vec[], closed = false): number {
  let total = 0
  for (let i = 1; i < pts.length; i++) total += dist(pts[i - 1], pts[i])
  if (closed && pts.length > 2) total += dist(pts[pts.length - 1], pts[0])
  return total
}

export function boundsOf(pts: readonly Vec[]): Box | null {
  if (!pts.length) return null
  const box = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity }
  for (const p of pts) {
    box.x0 = Math.min(box.x0, p.x)
    box.y0 = Math.min(box.y0, p.y)
    box.x1 = Math.max(box.x1, p.x)
    box.y1 = Math.max(box.y1, p.y)
  }
  return box
}

export const inBox = (p: Vec, b: Box): boolean => p.x >= b.x0 && p.x <= b.x1 && p.y >= b.y0 && p.y <= b.y1

/** Parses a typed length such as "4.5", "4,5" or "28,00 m". Returns NaN when it is not a number. */
export function parseLength(text: string): number {
  const cleaned = text.trim().toLowerCase().replace(/m$/, '').trim().replace(',', '.')
  if (cleaned === '') return NaN
  const n = Number(cleaned)
  return Number.isFinite(n) ? n : NaN
}

/** Angle of a→b in degrees, counter-clockwise from +x as it looks on screen, in [0, 360). */
export function screenAngleDeg(a: Vec, b: Vec): number {
  const deg = toDeg(Math.atan2(a.y - b.y, b.x - a.x))
  return ((deg % 360) + 360) % 360
}
