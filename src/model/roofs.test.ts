import { describe, expect, it } from 'vitest'
import { polygonArea, type Vec } from './geometry'
import type { Roof } from './plan'
import {
  COVERING,
  eavesOf,
  isConvex,
  newRoof,
  nextEdge,
  normalized,
  offsetPolygon,
  roofFaces,
  roofPlanes,
  roofProblem,
  roofSummary,
  underside,
  undersideAlong,
  unionOutlines,
} from './roofs'

const rect = (x: number, y: number, w: number, h: number): Vec[] => [
  { x, y },
  { x: x + w, y },
  { x: x + w, y: y + h },
  { x, y: y + h },
]

/** An L: 10 × 4 along the top, and a 4 × 4 wing down the left. */
const L: Vec[] = [
  { x: 0, y: 0 },
  { x: 10, y: 0 },
  { x: 10, y: 4 },
  { x: 4, y: 4 },
  { x: 4, y: 8 },
  { x: 0, y: 8 },
]

/** A roof over the 10 × 4 rectangle, at 45° so heights are easy to read: edge 0 is its 10 m top side. */
const roof = (patch: Partial<Roof>): Roof => ({ outline: rect(0, 0, 10, 4), type: 'gable', pitch: 45, height: 3, overhang: 0, edge: 0, parapet: 0, ...patch })

const close = (a: number, b: number) => expect(a).toBeCloseTo(b, 6)

describe('roof outlines', () => {
  it('drops repeated points and points in line, and runs clockwise on screen', () => {
    const ring = normalized([{ x: 0, y: 0 }, { x: 0, y: 4 }, { x: 0, y: 4 }, { x: 5, y: 4 }, { x: 10, y: 4 }, { x: 10, y: 0 }])
    expect(ring).toHaveLength(4)
    expect(isConvex(ring)).toBe(true)
    expect(isConvex(L)).toBe(false)
  })

  it('moves an outline out with mitred corners', () => {
    const out = offsetPolygon(rect(0, 0, 10, 4), 0.5)
    close(polygonArea(out), 11 * 5)
    expect(out.some((p) => Math.abs(p.x + 0.5) < 1e-9 && Math.abs(p.y + 0.5) < 1e-9)).toBe(true)
    // a strip along the 36 m perimeter, a corner square at each of the five outside corners, less one at the inside one
    close(polygonArea(offsetPolygon(L, 0.5)), 56 + 0.5 * 36 + 5 * 0.25 - 0.25)
  })

  it('puts rooms that share walls together into the house’s outline', () => {
    // two rooms side by side and a third under the first: an L; the shared walls drop out
    const loops = unionOutlines([rect(0, 0, 4, 4), rect(4, 0, 6, 4), rect(0, 4, 4, 4)])
    expect(loops).toHaveLength(1)
    expect(loops[0]).toHaveLength(6)
    close(polygonArea(loops[0]), 56)
    // apart, they stay apart
    expect(unionOutlines([rect(0, 0, 2, 2), rect(5, 0, 2, 2)])).toHaveLength(2)
  })
})

describe('roof shapes', () => {
  it('builds a gable: two slopes meeting at a ridge over the middle', () => {
    const r = roof({ type: 'gable' })
    const faces = roofFaces(r)
    expect(faces).toHaveLength(2)
    const planes = roofPlanes(r)
    close(underside(r, planes, { x: 5, y: 0 }), 3)
    close(underside(r, planes, { x: 5, y: 2 }), 5)
    close(underside(r, planes, { x: 0, y: 2 }), 5)
    close(roofSummary(r).top, 5 + COVERING)
    // with the ridge across instead (edge 1, a 4 m side), it peaks over x = 5
    close(underside({ ...r, edge: 1 }, roofPlanes({ ...r, edge: 1 }), { x: 5, y: 1 }), 8)
  })

  it('builds a shed: one slope rising away from its low edge', () => {
    const r = roof({ type: 'shed', pitch: 45 })
    expect(roofFaces(r)).toHaveLength(1)
    const planes = roofPlanes(r)
    close(underside(r, planes, { x: 3, y: 0 }), 3)
    close(underside(r, planes, { x: 3, y: 4 }), 7)
    // the opposite edge as the low one
    close(underside({ ...r, edge: 2 }, roofPlanes({ ...r, edge: 2 }), { x: 3, y: 4 }), 3)
  })

  it('builds a hip: four slopes, a 6 m ridge between two hipped ends', () => {
    const r = roof({ type: 'hip' })
    const faces = roofFaces(r)
    expect(faces).toHaveLength(4)
    expect(faces.map((f) => f.pts.length).sort()).toEqual([3, 3, 4, 4])
    const planes = roofPlanes(r)
    close(underside(r, planes, { x: 2, y: 2 }), 5)
    close(underside(r, planes, { x: 8, y: 2 }), 5)
    close(underside(r, planes, { x: 1, y: 2 }), 4)
    expect(roofProblem(r)).toBeNull()
    expect(roofProblem({ ...r, outline: L })).toMatch(/convex/)
    expect(roofProblem({ ...r, type: 'gable', outline: L })).toBeNull()
  })

  it('keeps a flat roof level, and drops the eaves below the outline over an overhang', () => {
    const flat = roof({ type: 'flat', parapet: 0.3 })
    expect(roofFaces(flat)).toHaveLength(1)
    close(roofSummary(flat).top, 3 + 0.2 + 0.3)
    const eaved = roof({ type: 'gable', overhang: 0.5 })
    close(polygonArea(eavesOf(eaved)), 11 * 5)
    close(roofSummary(eaved).eaves, 2.5)
    close(roofSummary(eaved).surface, (11 * 5) / Math.cos(Math.PI / 4))
  })

  it('follows the underside along a wall, with a point at the ridge', () => {
    // the gable end wall at x = 0 runs across the ridge
    const along = undersideAlong(roof({ type: 'gable' }), { x: 0, y: 0 }, { x: 0, y: 4 })
    expect(along.map((s) => [s.t, Math.round(s.z * 1e6) / 1e6])).toEqual([
      [0, 3],
      [0.5, 5],
      [1, 3],
    ])
    // an eaves wall stays level
    expect(undersideAlong(roof({ type: 'gable' }), { x: 0, y: 0 }, { x: 10, y: 0 }).map((s) => s.z)).toEqual([3, 3])
  })

  it('turns a gable’s ridge to the other direction, and a shed to every side in turn', () => {
    expect(nextEdge(roof({ type: 'gable', edge: 0 }))).toBe(1)
    expect(nextEdge(roof({ type: 'gable', edge: 1 }))).toBe(2)
    expect([0, 1, 2, 3].map((edge) => nextEdge(roof({ type: 'shed', edge })))).toEqual([1, 2, 3, 0])
  })

  it('starts new roofs along the outline’s longest side', () => {
    const r = newRoof(rect(0, 0, 4, 10), 'gable')
    const [a, b] = [r.outline[r.edge], r.outline[(r.edge + 1) % 4]]
    expect(Math.abs(a.y - b.y)).toBeCloseTo(10)
    expect(newRoof(rect(0, 0, 4, 10), 'flat')).toMatchObject({ overhang: 0, parapet: 0.3 })
    expect(newRoof(rect(0, 0, 4, 10), 'hip')).toMatchObject({ overhang: 0.5, parapet: 0, pitch: 25 })
  })
})
