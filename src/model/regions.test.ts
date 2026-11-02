import { describe, expect, it } from 'vitest'
import { addSegment, addVertex, draftLayer } from './edit'
import type { Vec } from './geometry'
import { createLayer, type Layer } from './plan'
import { labelPoint, layerRegions, pointInPolygon, regionAt } from './regions'
import { LOT } from './testPlan'

/** A layer from polylines given as point lists; `open` marks the chains drawn as open edges. */
function layerOf(chains: { points: Vec[]; closed?: boolean; open?: boolean }[]): Layer {
  const d = draftLayer(createLayer('L1', 'Walls'))
  for (const c of chains) {
    const ids = c.points.map((p) => addVertex(d, p))
    const kind = c.open ? 'open' : 'wall'
    for (let i = 1; i < ids.length; i++) addSegment(d, ids[i - 1], ids[i], kind)
    if (c.closed) addSegment(d, ids[ids.length - 1], ids[0], kind)
  }
  return d
}

const rect = (x: number, y: number, w: number, h: number): Vec[] => [
  { x, y },
  { x: x + w, y },
  { x: x + w, y: y + h },
  { x, y: y + h },
]

const areas = (layer: Layer) => layerRegions(layer).map((r) => +r.area.toFixed(4)).sort((a, b) => a - b)

describe('layerRegions', () => {
  it('finds the area of a closed outline: the sample lot is 855.38 m²', () => {
    const regions = layerRegions(layerOf([{ points: LOT, closed: true }]))
    expect(regions).toHaveLength(1)
    expect(regions[0].area).toBeCloseTo(855.38, 6)
    expect(regions[0].walls).toBeCloseTo(28 + 30.71 + 25 + Math.hypot(3, 3) + 27.71, 6)
  })

  it('splits rooms that share a wall', () => {
    const layer = layerOf([
      { points: rect(0, 0, 10, 4), closed: true },
      { points: [{ x: 6, y: 0 }, { x: 6, y: 4 }] },
    ])
    expect(areas(layer)).toEqual([16, 24])
  })

  it('closes regions where lines cross or touch without a shared vertex', () => {
    // both diagonals of a square, drawn as separate lines: four triangles
    const crossed = layerOf([
      { points: rect(0, 0, 4, 4), closed: true },
      { points: [{ x: 0, y: 0 }, { x: 4, y: 4 }] },
      { points: [{ x: 4, y: 0 }, { x: 0, y: 4 }] },
    ])
    expect(areas(crossed)).toEqual([4, 4, 4, 4])
    // a wall whose end only touches another wall (a T drawn without snapping)
    const touching = layerOf([
      { points: rect(0, 0, 10, 4), closed: true },
      { points: [{ x: 3, y: 4 }, { x: 3, y: 0 }] },
    ])
    expect(areas(touching)).toEqual([12, 28])
  })

  it('treats overlapping lines as one', () => {
    const layer = layerOf([
      { points: rect(0, 0, 10, 4), closed: true },
      { points: [{ x: 2, y: 0 }, { x: 7, y: 0 }] },
    ])
    expect(areas(layer)).toEqual([40])
  })

  it('ignores stubs: no extra area, and they are not part of the boundary length', () => {
    const regions = layerRegions(
      layerOf([
        { points: rect(0, 0, 10, 4), closed: true },
        { points: [{ x: 5, y: 0 }, { x: 5, y: 2 }] },
      ]),
    )
    expect(regions).toHaveLength(1)
    expect(regions[0].area).toBeCloseTo(40, 9)
    expect(regions[0].walls).toBeCloseTo(28, 9)
  })

  it('subtracts a free-standing block inside a room', () => {
    const layer = layerOf([
      { points: rect(0, 0, 10, 10), closed: true },
      { points: rect(4, 4, 2, 2), closed: true },
    ])
    const room = regionAt(layerRegions(layer), { x: 1, y: 1 })!
    expect(room.area).toBeCloseTo(96, 9)
    expect(room.holes).toHaveLength(1)
    expect(regionAt(layerRegions(layer), { x: 5, y: 5 })!.area).toBeCloseTo(4, 9)
  })

  it('lets open edges close a region and measures them apart', () => {
    // a house with a porch closed by an open edge at the front
    const layer = layerOf([
      { points: rect(0, 0, 8, 6), closed: true },
      { points: [{ x: 0, y: 6 }, { x: 0, y: 8 }] },
      { points: [{ x: 8, y: 6 }, { x: 8, y: 8 }] },
      { points: [{ x: 0, y: 8 }, { x: 8, y: 8 }], open: true },
    ])
    const porch = regionAt(layerRegions(layer), { x: 4, y: 7 })!
    expect(porch.area).toBeCloseTo(16, 9)
    expect(porch.open).toBeCloseTo(8, 9)
    expect(porch.walls).toBeCloseTo(12, 9)
  })

  it('finds nothing in an open chain', () => {
    expect(layerRegions(layerOf([{ points: LOT }]))).toEqual([])
  })
})

describe('regionAt', () => {
  it('picks the smallest region around the point, or null outside every region', () => {
    const layer = layerOf([
      { points: rect(0, 0, 10, 4), closed: true },
      { points: [{ x: 6, y: 0 }, { x: 6, y: 4 }] },
    ])
    const regions = layerRegions(layer)
    expect(regionAt(regions, { x: 8, y: 2 })!.area).toBeCloseTo(16, 9)
    expect(regionAt(regions, { x: 20, y: 2 })).toBeNull()
  })
})

describe('labelPoint', () => {
  it('centres a rectangle, and a long, slightly skewed room too', () => {
    const p = labelPoint(rect(0, 0, 10, 4))
    expect(p.x).toBeCloseTo(5, 9)
    expect(p.y).toBeCloseTo(2, 9)
    // 17.35 m long, 5.0 m wide at one end and 5.1 m at the other, like a hand-drawn room
    const skewed = labelPoint([{ x: 0, y: 0 }, { x: 17.35, y: 0 }, { x: 17.35, y: 5.1 }, { x: 0, y: 5 }])
    expect(skewed.x).toBeCloseTo(8.7, 1)
  })

  it('stays inside an L-shaped room, away from the corner', () => {
    const L = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 3 },
      { x: 3, y: 3 },
      { x: 3, y: 10 },
      { x: 0, y: 10 },
    ]
    const p = labelPoint(L)
    expect(pointInPolygon(p, L)).toBe(true)
    // the widest spot of a 3 m wide L is 1.5 m from its walls at best
    expect(Math.min(p.x, p.y, 10 - p.x, 10 - p.y)).toBeGreaterThan(1.2)
  })

  it('avoids holes', () => {
    const p = labelPoint(rect(0, 0, 10, 10), [rect(3, 3, 4, 4)])
    expect(pointInPolygon(p, rect(3, 3, 4, 4))).toBe(false)
  })
})

describe('outlines', () => {
  it('close an area like walls do, counted apart: a pool drawn with outlines', () => {
    const d = draftLayer(createLayer('L1', 'Pool'))
    const ids = rect(0, 0, 12, 5.5).map((p) => addVertex(d, p))
    for (let i = 0; i < 4; i++) addSegment(d, ids[i], ids[(i + 1) % 4], 'outline')
    const [pool] = layerRegions(d)
    expect(pool.area).toBeCloseTo(66, 9)
    expect([pool.walls, pool.open, pool.outline]).toEqual([0, 0, 35])
  })
})
