import { describe, expect, it } from 'vitest'
import { addFurniture, addSegment, addVertex, deleteItems, draftLayer, moveFurniture, replaceLayer, turnFurniture } from './edit'
import {
  corners,
  furnitureAt,
  furnitureFor,
  furnitureInfo,
  furnitureSymbol,
  furnitureTarget,
  isCorner,
  placeFurniture,
  placement,
  showerAt,
  showerPoint,
  toLocal,
  type FurnitureOptions,
} from './furniture'
import type { Vec } from './geometry'
import { createPlan, type Furniture, type Plan } from './plan'
import { parsePlan, serializePlan } from './planFile'
import { houseSolids } from './solids'

const near = (a: Vec, b: Vec) => {
  expect(a.x).toBeCloseTo(b.x, 6)
  expect(a.y).toBeCloseTo(b.y, 6)
}

/** A 6 × 4 room of 0.30 m walls drawn clockwise from the origin: s1 is its top wall, along y = 0. */
function room(): Plan {
  const plan = createPlan()
  const d = draftLayer(plan.layers[0])
  const ids = [
    { x: 0, y: 0 },
    { x: 6, y: 0 },
    { x: 6, y: 4 },
    { x: 0, y: 4 },
  ].map((p) => addVertex(d, p))
  ids.forEach((id, i) => addSegment(d, id, ids[(i + 1) % 4]))
  return replaceLayer(plan, { ...d, segments: Object.fromEntries(Object.entries(d.segments).map(([k, s]) => [k, { ...s, thickness: 0.3 }])) })
}

const opts = (kind: Furniture['kind'], style: string | undefined, extra: Partial<FurnitureOptions> = {}): FurnitureOptions => {
  const info = furnitureInfo(kind, style)
  return { kind, style, width: info.width, depth: info.depth, angle: 0, layer: 'L1', reach: 0.3, snap: true, thickness: () => 0.3, ...extra }
}

const put = (plan: Plan, kind: Furniture['kind'], style: string | undefined, p: Vec, extra: Partial<FurnitureOptions> = {}) => {
  const o = opts(kind, style, extra)
  const t = furnitureTarget(plan, p, o)!
  expect(t.problem).toBeUndefined()
  return addFurniture(plan, 'L1', furnitureFor(kind, style, t, o.width, o.depth))!.plan
}

describe('furniture', () => {
  it('stands at its point, turned, its back up the sheet at 0', () => {
    const pl = placement({ x: 2, y: 1 }, 90, 2, 1)
    // turned a quarter clockwise: its front faces left, its back right
    near(corners(pl)[0], { x: 2.5, y: 0 })
    near(toLocal(pl, { x: 1.5, y: 1 }), { x: 0, y: 0.5 })
  })

  it('backs things up to the nearest wall face, facing into the room', () => {
    // near the top wall (y = 0, its face at 0.15): a bed's head against it, its foot towards +y
    const plan = put(room(), 'bed', 'queen', { x: 3, y: 0.8 })
    const bed = Object.values(plan.layers[0].furniture)[0] as Extract<Furniture, { kind: 'bed' }>
    expect(bed.angle).toBeCloseTo(0, 6)
    near(bed.at, { x: 3, y: 0.15 + 2.1 / 2 })
    // near the right wall (x = 6): turned to face left
    const right = put(room(), 'counter', undefined, { x: 5.6, y: 2 })
    const counter = Object.values(right.layers[0].furniture)[0] as Extract<Furniture, { kind: 'counter' }>
    expect(counter.angle).toBeCloseTo(90, 6)
    near(counter.at, { x: 6 - 0.15 - 0.3, y: 2 })
    // kept within the wall: a counter put by the corner does not hang past it
    const corner = put(room(), 'counter', undefined, { x: 0.3, y: 0.3 })
    expect(Object.values(corner.layers[0].furniture)[0]).toMatchObject({ at: { x: 1.2 } })
    // with snapping off it stays where it is put, as it is turned
    const free = furnitureTarget(room(), { x: 3, y: 0.8 }, opts('bed', 'queen', { snap: false, angle: 45 }))!
    expect(free).toMatchObject({ at: { x: 3, y: 0.8 }, angle: 45 })
  })

  it('only puts a kitchen sink in a counter, and keeps it there as the counter moves or goes', () => {
    const none = furnitureTarget(room(), { x: 3, y: 0.5 }, opts('sink', 'kitchen'))!
    expect(none.problem).toMatch(/counter/)
    let plan = put(room(), 'counter', undefined, { x: 3, y: 0.4 })
    plan = put(plan, 'sink', 'kitchen', { x: 3.3, y: 0.45 })
    const layer = plan.layers[0]
    const sink = layer.furniture.f2
    expect(sink).toMatchObject({ kind: 'sink', style: 'kitchen', counter: 'f1' })
    const at = placeFurniture(layer, sink)!.at
    expect(at.x).toBeCloseTo(3.3, 6)
    // the counter moves 1 m right and turns: the sink goes with it
    const moved = moveFurniture(plan, plan, [{ layer: 'L1', kind: 'furniture', id: 'f1' }], { x: 1, y: 0 })
    expect(placeFurniture(moved.layers[0], moved.layers[0].furniture.f2)!.at.x).toBeCloseTo(4.3, 6)
    expect(turnFurniture(plan, [{ layer: 'L1', kind: 'furniture', id: 'f2' }])).toBe(plan)
    const turned = turnFurniture(plan, [{ layer: 'L1', kind: 'furniture', id: 'f1' }])
    expect(placeFurniture(turned.layers[0], turned.layers[0].furniture.f2)!.angle).toBeCloseTo(90, 6)
    // the counter goes, its sink with it
    const gone = deleteItems(plan, [{ layer: 'L1', kind: 'furniture', id: 'f1' }])
    expect(gone.layers[0].furniture).toEqual({})
    // a file with a sink and no counter is refused
    const raw = JSON.parse(serializePlan(plan))
    delete raw.layers[0].furniture.f1
    expect(parsePlan(raw).ok).toBe(false)
  })

  it('turns a chair to face the table it is put by', () => {
    let plan = put(room(), 'table', 'circle', { x: 3, y: 2 }, { snap: false })
    plan = put(plan, 'chair', undefined, { x: 3, y: 2.9 })
    const chair = plan.layers[0].furniture.f2 as Extract<Furniture, { kind: 'chair' }>
    // below the table, its front up towards it
    expect(chair.angle).toBeCloseTo(180, 6)
    near(chair.at, { x: 3, y: 2 + 0.55 + 0.25 - 0.1 })
    let square = put(room(), 'table', 'square', { x: 3, y: 2 }, { snap: false })
    square = put(square, 'chair', undefined, { x: 2.2, y: 2.1 })
    const side = square.layers[0].furniture.f2 as Extract<Furniture, { kind: 'chair' }>
    // to the table's left, facing right
    expect(side.angle).toBeCloseTo(270, 6)
    expect(side.at.x).toBeLessThan(2.55)
  })

  it('moves a bathtub’s shower head round its rim', () => {
    const pl = placement({ x: 0, y: 0 }, 0, 1.7, 0.75)
    for (const s of [0.2, 1.5, 2.25, 3.5]) expect(showerAt(pl, showerPoint(pl, s))).toBeCloseTo(s, 3)
    // on the left end, halfway: the default
    near(showerPoint(pl, 3.5), { x: -0.85 + 0.04, y: 0 })
    const plan = put(room(), 'bathtub', 'alcove', { x: 3, y: 0.5 })
    const symbol = furnitureSymbol(plan.layers[0].furniture.f1, placeFurniture(plan.layers[0], plan.layers[0].furniture.f1)!)
    expect(symbol.some((p) => 'c' in p && p.role === 'heavy')).toBe(true)
  })

  it('backs a toilet and a bidet up to the wall, and builds them', () => {
    let plan = put(room(), 'toilet', undefined, { x: 2, y: 0.5 })
    plan = put(plan, 'bidet', undefined, { x: 2.8, y: 0.5 })
    const [toilet, bidet] = Object.values(plan.layers[0].furniture) as Extract<Furniture, { kind: 'toilet' | 'bidet' }>[]
    expect([toilet.kind, bidet.kind]).toEqual(['toilet', 'bidet'])
    expect(toilet.angle).toBeCloseTo(0, 6)
    near(toilet.at, { x: 2, y: 0.15 + 0.35 })
    near(bidet.at, { x: 2.8, y: 0.15 + 0.275 })
    const solids = houseSolids(plan).filter((x) => x.kind === 'furniture')
    // the cistern's top, and the bidet's rim
    expect(Math.max(...solids.filter((x) => x.ref.id === 'f1').map((x) => x.top))).toBeCloseTo(0.78)
    expect(Math.max(...solids.filter((x) => x.ref.id === 'f2').map((x) => x.top))).toBeGreaterThan(0.4)
  })

  it('builds a shower: a tray, a glass screen, and its head at the back, movable round the tray', () => {
    const plan = put(room(), 'shower', undefined, { x: 5.4, y: 0.6 })
    const shower = plan.layers[0].furniture.f1 as Extract<Furniture, { kind: 'shower' }>
    expect(shower.shower).toBe(0.5)
    const pl = placeFurniture(plan.layers[0], shower)!
    expect(showerAt(pl, showerPoint(pl, 2.4))).toBeCloseTo(2.4, 3)
    const solids = houseSolids(plan).filter((x) => x.kind === 'furniture')
    expect(solids.some((x) => x.material === 'glass' && Math.abs(x.top - 2) < 1e-9)).toBe(true)
    // the head, at 1.95 m and 3 cm thick
    expect(solids.some((x) => x.material === 'metal' && Math.abs(x.top - 1.98) < 1e-9)).toBe(true)
  })

  it('makes a corner bathtub a quarter of a disc, its shower head moving round its curved front', () => {
    const plan = put(room(), 'bathtub', 'corner', { x: 1, y: 1 })
    const tub = plan.layers[0].furniture.f1
    expect(isCorner(tub)).toBe(true)
    const pl = placeFurniture(plan.layers[0], tub)!
    const corner = corners(pl)[0]
    // on the curved front, 1.40 m round the back left corner (less the inset)
    for (const s of [1.2, 2, 2.8]) {
      const q = showerPoint(pl, s, true)
      expect(Math.hypot(q.x - corner.x, q.y - corner.y)).toBeCloseTo(1.4 - 0.04, 6)
      expect(showerAt(pl, q, true)).toBeCloseTo(s, 2)
    }
    const outline = furnitureSymbol(tub, pl).find((x) => 'pts' in x && x.role === 'outline')!
    expect('pts' in outline && outline.pts.length).toBeGreaterThan(10)
    const solids = houseSolids(plan).filter((x) => x.kind === 'furniture')
    expect(Math.max(...solids.filter((x) => x.material === 'ceramic').map((x) => x.top))).toBeCloseTo(0.55)
  })

  it('is picked by its footprint, the smaller piece first', () => {
    let plan = put(room(), 'counter', undefined, { x: 3, y: 0.4 })
    plan = put(plan, 'sink', 'kitchen', { x: 3, y: 0.45 })
    expect(furnitureAt(plan, { x: 3, y: 0.5 })).toEqual({ layer: 'L1', id: 'f2' })
    expect(furnitureAt(plan, { x: 1.9, y: 0.5 })).toEqual({ layer: 'L1', id: 'f1' })
    expect(furnitureAt(plan, { x: 3, y: 2 })).toBeNull()
  })

  it('builds in 3-D: a sink on the worktop, a shower riser to the head, a bed of its size; and keeps them in files', () => {
    let plan = put(room(), 'counter', undefined, { x: 3, y: 0.4 })
    plan = put(plan, 'sink', 'kitchen', { x: 3, y: 0.45 })
    plan = put(plan, 'bathtub', 'clawfoot', { x: 3, y: 3.5 })
    plan = put(plan, 'bed', 'single', { x: 0.6, y: 2 })
    const solids = houseSolids(plan).filter((s) => s.kind === 'furniture')
    const of = (id: string) => solids.filter((s) => s.ref.id === id)
    expect(Math.max(...of('f1').map((s) => s.top))).toBeCloseTo(0.9)
    expect(Math.min(...of('f2').map((s) => s.bottom))).toBeCloseTo(0.9)
    expect(Math.max(...of('f3').map((s) => s.top))).toBeCloseTo(1.98)
    expect(of('f3').some((s) => s.material === 'metal' && s.bottom === 0)).toBe(true)
    expect(Math.max(...of('f4').map((s) => s.top))).toBeCloseTo(1)
    const parsed = parsePlan(JSON.parse(serializePlan(plan)))
    expect(parsed.ok && Object.keys(parsed.plan.layers[0].furniture)).toEqual(['f1', 'f2', 'f3', 'f4'])
  })
})
