import { describe, expect, it } from 'vitest'
import { addOpening, addSegment, addVertex, draftLayer } from './edit'
import { dist, type Vec } from './geometry'
import { createLayer, createPlan, type Layer, type SegmentKind } from './plan'
import { layerFaces } from './regions'
import { layerWalls } from './walls'

/** A layer from polylines; `kind` and `thickness` apply to every line of a chain. */
function layerOf(chains: { points: Vec[]; closed?: boolean; kind?: SegmentKind; thickness?: number }[]): Layer {
  const d = draftLayer(createLayer('L1', 'Walls'))
  for (const c of chains) {
    const ids = c.points.map((p) => addVertex(d, p))
    const pairs = ids.slice(1).map((id, i) => [ids[i], id])
    if (c.closed) pairs.push([ids[ids.length - 1], ids[0]])
    for (const [a, b] of pairs) {
      const id = addSegment(d, a, b, c.kind ?? 'wall')!
      if (c.thickness) d.segments[id] = { ...d.segments[id], thickness: c.thickness }
    }
  }
  return d
}

const rect = (x: number, y: number, w: number, h: number): Vec[] => [
  { x, y },
  { x: x + w, y },
  { x: x + w, y: y + h },
  { x, y: y + h },
]

/** Thicknesses by the line each segment runs along, for readable expectations. */
const thicknessAt = (layer: Layer, a: Vec, b: Vec) => {
  const { thickness } = layerFaces(layer)
  const id = Object.keys(layer.segments).find((k) => {
    const s = layer.segments[k]
    const [p, q] = [layer.vertices[s.a], layer.vertices[s.b]]
    return (dist(p, a) < 1e-9 && dist(q, b) < 1e-9) || (dist(p, b) < 1e-9 && dist(q, a) < 1e-9)
  })!
  return thickness.get(id)
}

// two rooms, 6 × 4 and 4 × 4, side by side
const house = () =>
  layerOf([
    { points: rect(0, 0, 10, 4), closed: true },
    { points: [{ x: 6, y: 0 }, { x: 6, y: 4 }] },
  ])

describe('automatic wall thickness', () => {
  it('is 0.30 m for walls facing outside and 0.15 m between walled rooms', () => {
    const layer = house()
    const { regions, thickness } = layerFaces(layer)
    expect(regions.every((r) => r.indoor)).toBe(true)
    expect(thicknessAt(layer, { x: 6, y: 0 }, { x: 6, y: 4 })).toBe(0.15)
    // the wall between meets the outer ones without splitting them: four outer walls
    expect([...thickness.values()].filter((t) => t === 0.3)).toHaveLength(4)
  })

  it('makes a wall between a room and a gallery an exterior one', () => {
    // a gallery along the bottom of a room, closed by open edges
    const layer = layerOf([
      { points: rect(0, 0, 6, 4), closed: true },
      { points: [{ x: 0, y: 4 }, { x: 0, y: 6 }, { x: 6, y: 6 }, { x: 6, y: 4 }], kind: 'open' },
    ])
    const { regions } = layerFaces(layer)
    expect(regions.map((r) => r.indoor).sort()).toEqual([false, true])
    expect(thicknessAt(layer, { x: 6, y: 4 }, { x: 0, y: 4 })).toBe(0.3)
  })

  it('keeps rooms open onto each other indoors: an open-plan kitchen', () => {
    // living and kitchen with an open edge between them, a bedroom beside both
    const layer = layerOf([
      { points: rect(0, 0, 10, 8), closed: true },
      { points: [{ x: 6, y: 0 }, { x: 6, y: 8 }] },
      { points: [{ x: 0, y: 4 }, { x: 6, y: 4 }], kind: 'open' },
    ])
    const { regions } = layerFaces(layer)
    expect(regions.map((r) => r.indoor)).toEqual([true, true, true])
    expect(thicknessAt(layer, { x: 6, y: 0 }, { x: 6, y: 8 })).toBe(0.15)
  })

  it('gives way to a wall’s own thickness', () => {
    const layer = layerOf([{ points: rect(0, 0, 6, 4), closed: true, thickness: 0.2 }])
    expect([...layerFaces(layer).thickness.values()]).toEqual([0.2, 0.2, 0.2, 0.2])
    expect(layerFaces(layer).exterior.size).toBe(4)
  })
})

describe('floor area inside the walls', () => {
  it('takes each wall’s own half thickness off a room', () => {
    const regions = layerFaces(house()).regions.sort((a, b) => a.area - b.area)
    expect(regions.map((r) => r.area)).toEqual([16, 24])
    // 0.30 m outer walls, a 0.15 m wall between: 3.775 × 3.70 and 5.775 × 3.70
    expect(regions[0].floor).toBeCloseTo(3.775 * 3.7, 9)
    expect(regions[1].floor).toBeCloseTo(5.775 * 3.7, 9)
  })

  it('takes off a stub wall poking into the room', () => {
    const layer = layerOf([
      { points: rect(0, 0, 10, 4), closed: true },
      { points: [{ x: 5, y: 0 }, { x: 5, y: 1 }] },
    ])
    const [room] = layerFaces(layer).regions
    expect(room.indoor).toBe(true)
    // the stub faces the room on both sides: 0.15 m thick, 0.85 m of it past the outer wall's face
    expect(room.floor).toBeCloseTo(9.7 * 3.7 - 0.85 * 0.15, 9)
  })

  it('leaves open edges and outlines where they are', () => {
    const pool = layerOf([{ points: rect(0, 0, 8, 4), closed: true, kind: 'outline' }])
    expect(layerFaces(pool).regions[0].floor).toBeCloseTo(32, 9)
    // a gallery: the room's wall (0.30) on one side, open edges on the others
    const gallery = layerOf([
      { points: rect(0, 0, 6, 4), closed: true },
      { points: [{ x: 0, y: 4 }, { x: 0, y: 6 }, { x: 6, y: 6 }, { x: 6, y: 4 }], kind: 'open' },
    ])
    const open = layerFaces(gallery).regions.find((r) => !r.indoor)!
    expect(open.floor).toBeCloseTo(6 * (2 - 0.15), 9)
  })

  it('takes off a free-standing block and its walls', () => {
    const layer = layerOf([{ points: rect(0, 0, 10, 10), closed: true }, { points: rect(4, 4, 2, 2), closed: true }])
    const room = layerFaces(layer).regions.find((r) => r.holes.length)!
    // the block's walls face the room on one side and its own inside on the other, both indoors: 0.15 m
    expect(room.floor).toBeCloseTo(9.7 * 9.7 - 2.15 * 2.15, 9)
    expect(room.wallIds).toHaveLength(8)
  })
})

describe('layerWalls', () => {
  const wallsOf = (layer: Layer) => layerWalls(layer, layerFaces(layer).thickness)

  it('joins a corner with a mitre and no line across it', () => {
    const layer = layerOf([{ points: [{ x: 4, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 3 }] }])
    const walls = wallsOf(layer)
    // two faces each and a cap at each free end: no line across the joint
    expect(walls.edges).toHaveLength(6)
    const ends = walls.edges.flat()
    expect(ends.some((p) => dist(p, { x: -0.15, y: -0.15 }) < 1e-9)).toBe(true)
    expect(ends.some((p) => dist(p, { x: 0.15, y: 0.15 }) < 1e-9)).toBe(true)
    // the two walls tile the L between them: 4.15 × 0.30 + 0.30 × 2.85
    const total = [...walls.footprint.values()].reduce((a, b) => a + b, 0)
    expect(total).toBeCloseTo(4.15 * 0.3 + 0.3 * 2.85, 9)
  })

  it('runs a wall straight through a T junction', () => {
    const d = draftLayer(createLayer('L1', 'Walls'))
    const [a, m, b, t] = [{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 10, y: 0 }, { x: 5, y: 4 }].map((p) => addVertex(d, p))
    addSegment(d, a, m)
    addSegment(d, m, b)
    addSegment(d, m, t)
    const walls = wallsOf(d)
    // three walls, two faces and a free end each: the far face runs on, the near one turns into the stem
    expect(walls.edges).toHaveLength(9)
    const ends = walls.edges.flat()
    expect(ends.filter((p) => dist(p, { x: 5, y: -0.15 }) < 1e-9)).toHaveLength(2)
    expect(ends.filter((p) => dist(p, { x: 4.85, y: 0.15 }) < 1e-9)).toHaveLength(2)
  })

  it('steps where the thickness changes along a line', () => {
    const layer = layerOf([
      { points: [{ x: 0, y: 0 }, { x: 5, y: 0 }], thickness: 0.3 },
      { points: [{ x: 5, y: 0 }, { x: 10, y: 0 }], thickness: 0.15 },
    ])
    // the second chain starts on a new vertex at (5, 0): join them
    const d = draftLayer(layer)
    const [v1, v2] = Object.entries(d.vertices).filter(([, p]) => p.x === 5).map(([id]) => id)
    for (const s of Object.values(d.segments)) if (s.a === v2) s.a = v1
    delete d.vertices[v2]
    const steps = wallsOf(d).edges.filter(([p, q]) => Math.abs(p.x - 5) < 1e-9 && Math.abs(q.x - 5) < 1e-9)
    expect(steps.map(([p, q]) => +dist(p, q).toFixed(4)).sort()).toEqual([0.075, 0.075])
  })

  it('bevels a very sharp outside corner', () => {
    const tip = { x: 0, y: 0 }
    const layer = layerOf([{ points: [{ x: 5, y: -0.5 }, tip, { x: 5, y: 0.5 }] }])
    const walls = wallsOf(layer)
    // no corner miles past the tip, and the bevel is filled
    for (const p of walls.edges.flat()) expect(dist(p, tip)).toBeLessThan(6)
    expect(walls.fills.some((f) => f.length === 3)).toBe(true)
  })

  it('is cut by its doors and windows', () => {
    let plan = createPlan()
    plan = { ...plan, layers: [layerOf([{ points: [{ x: 0, y: 0 }, { x: 10, y: 0 }] }])] }
    plan = addOpening(plan, 'L1', { kind: 'door', style: 'single', segment: 's1', offset: 5, width: 1, hinge: 'a', swing: 'left' })!.plan
    const walls = wallsOf(plan.layers[0])
    expect(walls.fills).toHaveLength(2)
    // two faces per piece, a jamb at each side of the door, a cap at each free end
    expect(walls.edges).toHaveLength(8)
    // the doorway is still built-up area
    expect(walls.footprint.get('s1')).toBeCloseTo(10 * 0.3, 9)
  })
})
