import { add, dist, mul, signedArea, sub, type Vec } from './geometry'

/**
 * Flat faces of solids in 3-D, each with the way it faces stated, and builders for the shapes the house is made
 * of: outlines stood up between two heights (prisms), shapes in a vertical plane given a thickness (a gable end,
 * a beam under a slope), round shafts. Nothing here depends on the handedness of the axes: whoever draws a face
 * winds it to its normal.
 */

/** A point in 3-D: x and y on the plan (m, +y down), z up from the floor. */
export interface Vec3 {
  x: number
  y: number
  z: number
}

/** A flat face with the way it faces (out of its solid, unit length). */
export interface Face {
  pts: Vec3[]
  holes: Vec3[][]
  normal: Vec3
  /** One facet of a round surface (a column's shaft): drawings leave out the lines between such facets. */
  smooth?: boolean
}

export const v3 = (p: Vec, z: number): Vec3 => ({ x: p.x, y: p.y, z })

export const norm = (v: Vec3): Vec3 => {
  const l = Math.hypot(v.x, v.y, v.z)
  return { x: v.x / l, y: v.y / l, z: v.z / l }
}

/** Running clockwise on screen (positive area), so a ring's outside is to the right of each edge. */
export const clockwise = (ring: readonly Vec[]): Vec[] => (signedArea(ring) < 0 ? [...ring].reverse() : [...ring])

/** The faces of an outline (with holes) standing between two heights. */
export function prismFaces(outline: readonly Vec[], holes: readonly (readonly Vec[])[], bottom: number, top: number): Face[] {
  const outer = clockwise(outline)
  const inner = holes.map(clockwise)
  const faces: Face[] = [
    { pts: outer.map((p) => v3(p, bottom)), holes: inner.map((h) => h.map((p) => v3(p, bottom))), normal: { x: 0, y: 0, z: -1 } },
    { pts: outer.map((p) => v3(p, top)), holes: inner.map((h) => h.map((p) => v3(p, top))), normal: { x: 0, y: 0, z: 1 } },
  ]
  const sides = (ring: Vec[], out: 1 | -1) =>
    ring.forEach((p, i) => {
      const q = ring[(i + 1) % ring.length]
      const d = sub(q, p)
      if (Math.hypot(d.x, d.y) < 1e-9) return
      faces.push({ pts: [v3(p, bottom), v3(q, bottom), v3(q, top), v3(p, top)], holes: [], normal: norm({ x: d.y * out, y: -d.x * out, z: 0 }) })
    })
  sides(outer, 1)
  for (const h of inner) sides(h, -1)
  return faces
}

/**
 * The faces of a shape drawn in a vertical plane and given a thickness across it: `profile` is in (distance along
 * `dir` from `a`, height), and the solid stands `half` either side of the plane.
 */
export function profileFaces(a: Vec, dir: Vec, half: number, profile: readonly [number, number][]): Face[] {
  const ring = signedArea(profile.map(([s, z]) => ({ x: s, y: z }))) < 0 ? [...profile].reverse() : [...profile]
  const w = { x: -dir.y, y: dir.x }
  const at = (s: number, z: number, side: number): Vec3 => ({ x: a.x + dir.x * s + w.x * side * half, y: a.y + dir.y * s + w.y * side * half, z })
  const faces: Face[] = [
    { pts: ring.map(([s, z]) => at(s, z, 1)), holes: [], normal: { x: w.x, y: w.y, z: 0 } },
    { pts: ring.map(([s, z]) => at(s, z, -1)), holes: [], normal: { x: -w.x, y: -w.y, z: 0 } },
  ]
  ring.forEach(([s0, z0], i) => {
    const [s1, z1] = ring[(i + 1) % ring.length]
    const [ds, dz] = [s1 - s0, z1 - z0]
    if (Math.hypot(ds, dz) < 1e-9) return
    // out of the profile, in its own plane: to the right of the edge
    faces.push({ pts: [at(s0, z0, 1), at(s1, z1, 1), at(s1, z1, -1), at(s0, z0, -1)], holes: [], normal: norm({ x: dir.x * dz, y: dir.y * dz, z: -ds }) })
  })
  return faces
}

/** Marks the sides of a round solid (all but its top and bottom) as facets of one smooth surface. */
export const smoothSides = (faces: Face[]): Face[] => faces.map((f) => (Math.abs(f.normal.z) < 0.99 ? { ...f, smooth: true } : f))

/** A circle as a polygon of `n` sides. */
export const ring = (c: Vec, r: number, n: number): Vec[] =>
  Array.from({ length: n }, (_, i) => ({ x: c.x + r * Math.cos((2 * Math.PI * i) / n), y: c.y + r * Math.sin((2 * Math.PI * i) / n) }))

/** A round shaft narrowing (or widening) from radius `r0` at `z0` to `r1` at `z1`. */
export function frustumFaces(c: Vec, r0: number, r1: number, z0: number, z1: number, n: number): Face[] {
  const low = ring(c, r0, n)
  const high = ring(c, r1, n)
  const faces: Face[] = [
    { pts: low.map((p) => v3(p, z0)), holes: [], normal: { x: 0, y: 0, z: -1 } },
    { pts: high.map((p) => v3(p, z1)), holes: [], normal: { x: 0, y: 0, z: 1 } },
  ]
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n
    const a = (2 * Math.PI * (i + 0.5)) / n
    // out from the axis, tipped up as much as the shaft narrows
    faces.push({ pts: [v3(low[i], z0), v3(low[j], z0), v3(high[j], z1), v3(high[i], z1)], holes: [], normal: norm({ x: Math.cos(a) * (z1 - z0), y: Math.sin(a) * (z1 - z0), z: r0 - r1 }) })
  }
  return faces
}

/** The rectangle `half` either side of the line from `a` to `b`. */
export function band(a: Vec, b: Vec, half: number): Vec[] {
  const d = mul(sub(b, a), 1 / dist(a, b))
  const n = { x: -d.y * half, y: d.x * half }
  return [add(a, n), add(b, n), sub(b, n), sub(a, n)]
}
