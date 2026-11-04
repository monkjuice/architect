import { describe, expect, it } from 'vitest'
import { COLUMNS, newColonnade } from './colonnades'
import { addArea, addOpening, addRoof, addSegment, addVertex, draftLayer, replaceLayer, setColonnade, updateLayer } from './edit'
import type { Vec } from './geometry'
import { createPlan, type Opening, type Plan, type Roof, type SegmentKind } from './plan'
import { COVERING, newRoof, SLAB } from './roofs'
import { BEAM_DEPTH, CHIMNEY_ABOVE, DOOR_HEAD, FLOOR, GATE_HEIGHT, HIGH_SILL, houseSolids, WINDOW_SILL, type Solid } from './solids'
import { WALL_HEIGHT } from './walls'

/** A plan whose first layer holds the chains, each line of a chain of its `kind`. */
function planOf(chains: { points: Vec[]; closed?: boolean; kind?: SegmentKind }[]): Plan {
  const plan = createPlan()
  const d = draftLayer(plan.layers[0])
  for (const c of chains) {
    const ids = c.points.map((p) => addVertex(d, p))
    const pairs = ids.slice(1).map((id, i) => [ids[i], id])
    if (c.closed) pairs.push([ids[ids.length - 1], ids[0]])
    for (const [a, b] of pairs) addSegment(d, a, b, c.kind ?? 'wall')
  }
  return replaceLayer(plan, d)
}

const rect = (x: number, y: number, w: number, h: number): Vec[] => [
  { x, y },
  { x: x + w, y },
  { x: x + w, y: y + h },
  { x, y: y + h },
]

/** A 10 × 4 room named "Living": s1 is its top wall, from (0,0) to (10,0). */
const room = () => addArea(planOf([{ points: rect(0, 0, 10, 4), closed: true }]), 'L1', { x: 5, y: 2 }, 'Living').plan

const roofed = (plan: Plan, patch: Partial<Roof> = {}) => addRoof(plan, 'L1', { ...newRoof(rect(0, 0, 10, 4), 'gable'), ...patch })!.plan

const withOpening = (plan: Plan, o: Partial<Opening> & Pick<Opening, 'kind' | 'style'>) =>
  addOpening(plan, 'L1', { segment: 's1', offset: 5, width: 1, hinge: 'a', swing: 'left', ...o } as Opening)!.plan

const of = (solids: Solid[], kind: Solid['kind']) => solids.filter((s) => s.kind === kind)

/** Every point of a solid on the plan. */
const plan2d = (s: Solid) => s.faces.flatMap((f) => f.pts)

describe('houseSolids', () => {
  it('builds a room: walls as tall as they are and a floor; no roof until one is drawn', () => {
    const solids = houseSolids(room())
    expect(of(solids, 'roof')).toHaveLength(0)
    const walls = of(solids, 'wall')
    expect(walls).toHaveLength(4)
    for (const w of walls) {
      expect([w.bottom, w.top]).toEqual([0, WALL_HEIGHT])
      // all four face outside
      expect(w.material).toBe('facade')
    }
    const [floor] = of(solids, 'floor')
    expect([floor.bottom, floor.top]).toEqual([0, FLOOR])
    expect(floor.material).toBe('floor')
    expect(floor.ref).toEqual({ layer: 'L1', kind: 'area', id: 'a1' })
  })

  it('closes every face round: a wall has six, each facing out', () => {
    const [wall] = of(houseSolids(room()), 'wall')
    expect(wall.faces.length).toBeGreaterThanOrEqual(6)
    // the faces' normals cancel out over a closed solid, weighted by area; for a box, opposite faces pair up
    const sum = wall.faces.reduce((acc, f) => ({ x: acc.x + f.normal.x, y: acc.y + f.normal.y, z: acc.z + f.normal.z }), { x: 0, y: 0, z: 0 })
    expect(Math.abs(sum.z)).toBeLessThan(1e-9)
  })

  it('puts a flat roof on the walls, with its parapet', () => {
    const solids = houseSolids(roofed(room(), { type: 'flat', overhang: 0, parapet: 0.3 }))
    const [roof] = of(solids, 'roof')
    expect([roof.bottom, roof.top]).toEqual([WALL_HEIGHT, WALL_HEIGHT + SLAB])
    expect(roof.material).toBe('slab')
    expect(roof.ref).toEqual({ layer: 'L1', kind: 'roof', id: 'r1' })
    const [parapet] = of(solids, 'parapet')
    expect(parapet.top).toBeCloseTo(WALL_HEIGHT + SLAB + 0.3)
    // the walls already reach the slab: nothing to fill
    expect(of(solids, 'infill')).toHaveLength(0)
  })

  it('fills the gable ends up to a pitched roof, and leaves the eaves walls as they are', () => {
    // a 45° gable whose ridge runs along the 10 m sides: it peaks 2 m over the walls at the middle
    const solids = houseSolids(roofed(room(), { type: 'gable', pitch: 45, overhang: 0.5 }))
    const [roof] = of(solids, 'roof')
    expect(roof.material).toBe('roof')
    expect(roof.top).toBeCloseTo(WALL_HEIGHT + 2 + COVERING)
    expect(roof.bottom).toBeCloseTo(WALL_HEIGHT - 0.5)
    const infill = of(solids, 'infill')
    expect(infill).toHaveLength(2)
    for (const g of infill) {
      expect(g.bottom).toBeCloseTo(WALL_HEIGHT)
      expect(g.top).toBeCloseTo(WALL_HEIGHT + 2)
      // the short walls, at x = 0 and x = 10
      expect(plan2d(g).every((p) => Math.abs(p.x) < 0.2 || Math.abs(p.x - 10) < 0.2)).toBe(true)
    }
  })

  it('cuts a door: the wall over it, a frame and a closed leaf', () => {
    const solids = houseSolids(withOpening(room(), { kind: 'door', style: 'single', width: 0.8 }))
    const [lintel] = of(solids, 'lintel')
    expect([lintel.bottom, lintel.top]).toEqual([DOOR_HEAD, WALL_HEIGHT])
    expect(lintel.ref).toEqual({ layer: 'L1', kind: 'segment', id: 's1' })
    expect(of(solids, 'sill')).toHaveLength(0)
    const leaves = of(solids, 'leaf')
    expect(leaves).toHaveLength(1)
    expect(leaves[0].material).toBe('door')
    expect(leaves[0].ref).toEqual({ layer: 'L1', kind: 'opening', id: 'o1' })
    expect(of(solids, 'frame').every((f) => f.material === 'frame')).toBe(true)
    // the wall is cut: two pieces on the top wall instead of one
    expect(of(solids, 'wall').filter((w) => w.ref.id === 's1')).toHaveLength(2)
  })

  it('puts a window between its sill and head, high for an awning', () => {
    for (const [style, sill] of [
      ['sliding', WINDOW_SILL],
      ['awning', HIGH_SILL],
    ] as const) {
      const solids = houseSolids(withOpening(room(), { kind: 'window', style }))
      expect(of(solids, 'sill')[0].top).toBe(sill)
      expect(of(solids, 'lintel')[0].bottom).toBe(DOOR_HEAD)
      const [glass] = of(solids, 'glass')
      expect(glass.bottom).toBeGreaterThan(sill)
      expect(glass.top).toBeLessThan(DOOR_HEAD)
    }
    // a sliding window has a mullion that a fixed one lacks
    const frames = (style: 'fixed' | 'sliding') => of(houseSolids(withOpening(room(), { kind: 'window', style })), 'frame').length
    expect(frames('sliding')).toBe(frames('fixed') + 1)
  })

  it('opens a gate the full height of its wall, and to the usual height in a fence', () => {
    const walled = houseSolids(withOpening(planOf([{ points: rect(0, 0, 10, 4), closed: true }]), { kind: 'gate', style: 'double', width: 3 }))
    expect(of(walled, 'lintel')).toHaveLength(0)
    expect(of(walled, 'leaf').map((l) => l.top)).toEqual([WALL_HEIGHT, WALL_HEIGHT])
    expect(of(walled, 'leaf')[0].material).toBe('gate')
    const fence = houseSolids(withOpening(planOf([{ points: [{ x: 0, y: 0 }, { x: 10, y: 0 }], kind: 'open' }]), { kind: 'gate', style: 'single' }))
    expect(of(fence, 'leaf')[0].top).toBe(GATE_HEIGHT)
  })

  it('carries a gallery’s open front on beams under its roof, with columns at the free corners', () => {
    // a room, and a gallery in front of it closed by open edges from (0,4) to (0,7) to (10,7) to (10,4)
    let plan = planOf([
      { points: rect(0, 0, 10, 4), closed: true },
      { points: [{ x: 0, y: 4 }, { x: 0, y: 7 }, { x: 10, y: 7 }, { x: 10, y: 4 }], kind: 'open' },
    ])
    expect(of(houseSolids(plan), 'beam')).toHaveLength(0)
    plan = addRoof(plan, 'L1', newRoof(rect(0, 0, 10, 7), 'flat'))!.plan
    const solids = houseSolids(plan)
    const beams = of(solids, 'beam')
    expect(beams).toHaveLength(3)
    expect(beams.every((b) => Math.abs(b.top - WALL_HEIGHT) < 1e-9 && Math.abs(b.bottom - (WALL_HEIGHT - BEAM_DEPTH)) < 1e-9)).toBe(true)
    // the gallery's two free corners; its other ends meet the room's walls
    const columns = of(solids, 'column')
    expect(columns).toHaveLength(2)
    expect(columns.every((c) => Math.abs(c.top - (WALL_HEIGHT - BEAM_DEPTH)) < 1e-9)).toBe(true)
  })

  it('slopes a beam under a shed roof', () => {
    // a free-standing open edge across a 45° shed rising away from y = 0
    let plan = planOf([{ points: [{ x: 5, y: 0 }, { x: 5, y: 4 }], kind: 'open' }])
    plan = addRoof(plan, 'L1', { ...newRoof(rect(0, 0, 10, 4), 'shed'), pitch: 45, overhang: 0, edge: 0 })!.plan
    const [beam] = of(houseSolids(plan), 'beam')
    expect(beam.top).toBeCloseTo(WALL_HEIGHT + 4)
    expect(beam.bottom).toBeCloseTo(WALL_HEIGHT - BEAM_DEPTH)
  })

  it('leaves a pool open and paved', () => {
    let plan = planOf([{ points: rect(0, 0, 8, 4), closed: true, kind: 'outline' }])
    plan = addArea(plan, 'L1', { x: 4, y: 2 }, 'Pool').plan
    expect(of(houseSolids(plan), 'floor')[0].material).toBe('paving')
  })

  it('makes walls that face outside facade and walls between rooms interior', () => {
    // two rooms side by side: the wall at x = 5 is between them
    const plan = planOf([{ points: rect(0, 0, 10, 4), closed: true }, { points: [{ x: 5, y: 0 }, { x: 5, y: 4 }] }])
    const walls = of(houseSolids(plan), 'wall')
    const inner = walls.filter((w) => plan2d(w).every((q) => Math.abs(q.x - 5) < 0.2))
    expect(inner.length).toBeGreaterThan(0)
    expect(inner.every((w) => w.material === 'interior')).toBe(true)
    expect(walls.filter((w) => !inner.includes(w)).every((w) => w.material === 'facade')).toBe(true)
  })

  it('stands a colonnade’s columns along its edge under its beam, level with the walls with no roof', () => {
    // a wall from (0,0) to (0,4), and a 10 m open edge from its foot: five Roman columns, the wall holding the sixth end
    let plan = planOf([{ points: [{ x: 0, y: 0 }, { x: 0, y: 4 }] }, { points: [{ x: 0, y: 4 }, { x: 10, y: 4 }], kind: 'open' }])
    plan = setColonnade(plan, [{ layer: 'L1', kind: 'segment', id: 's2' }], newColonnade('roman'))
    const solids = houseSolids(plan)
    const columns = of(solids, 'column')
    expect(columns).toHaveLength(5)
    expect(columns.every((c) => c.material === 'stone' && c.bottom === 0)).toBe(true)
    expect(columns[0].top).toBeCloseTo(WALL_HEIGHT - COLUMNS.roman.beam)
    const [beam] = of(solids, 'beam')
    expect([beam.bottom, beam.top].map((z) => Math.round(z * 1000) / 1000)).toEqual([WALL_HEIGHT - COLUMNS.roman.beam, WALL_HEIGHT])
    // a Roman column is wider at its capital than its shaft
    expect(Math.max(...columns[0].faces.flatMap((f) => f.pts.map((q) => q.x))) - 2).toBeGreaterThan(COLUMNS.roman.diameter / 2)
    const metal = houseSolids(setColonnade(plan, [{ layer: 'L1', kind: 'segment', id: 's2' }], newColonnade('metal')))
    // 10 m at 3 m at most: four bays, the wall holding one end
    expect(of(metal, 'column')).toHaveLength(4)
    expect(of(metal, 'column').every((c) => c.material === 'metal')).toBe(true)
  })

  it('carries a colonnade’s beam under the roof over it', () => {
    let plan = planOf([{ points: [{ x: 0, y: 4 }, { x: 10, y: 4 }], kind: 'open' }])
    plan = setColonnade(plan, [{ layer: 'L1', kind: 'segment', id: 's1' }], newColonnade('roman'))
    plan = addRoof(plan, 'L1', { ...newRoof(rect(0, 0, 10, 4), 'flat'), height: 3 })!.plan
    const solids = houseSolids(plan)
    expect(of(solids, 'beam')[0].top).toBeCloseTo(3)
    expect(of(solids, 'column')).toHaveLength(6)
    expect(of(solids, 'column')[0].top).toBeCloseTo(3 - COLUMNS.roman.beam)
  })

  it('builds a fireplace against its wall, leaving the wall whole, with a chimney through the roof', () => {
    const fireplace: Opening = { kind: 'fireplace', style: 'masonry', segment: 's1', offset: 5, width: 1.2, hinge: 'a', swing: 'right' }
    const plan = addOpening(room(), 'L1', fireplace)!.plan
    let solids = houseSolids(plan)
    expect(of(solids, 'wall').filter((w) => w.ref.id === 's1')).toHaveLength(1)
    expect(of(solids, 'lintel')).toHaveLength(0)
    expect(of(solids, 'fireplace').some((f) => f.material === 'soot')).toBe(true)
    // inside the room, below the top wall
    expect(of(solids, 'fireplace').every((f) => plan2d(f).every((q) => q.y > 0))).toBe(true)
    // no roof: the chimney stands a metre above its wall
    const chimney = () => Math.max(...of(solids, 'chimney').map((c) => c.top))
    expect(chimney()).toBeCloseTo(WALL_HEIGHT + CHIMNEY_ABOVE + 0.06)
    // under a 45° gable over the room, at the wall the ridge runs along: a metre above the roof there
    solids = houseSolids(roofed(plan, { type: 'gable', pitch: 45, overhang: 0 }))
    const roofTop = Math.max(...of(solids, 'chimney')[0].faces.flatMap((f) => f.pts.map((q) => q.z)))
    // the flue reaches 0.15 + 0.5 m into the room, where the underside is 0.65 m higher than at the eaves wall
    expect(roofTop).toBeCloseTo(WALL_HEIGHT + 0.65 + COVERING + CHIMNEY_ABOVE)
  })

  it('builds only visible layers', () => {
    const plan = updateLayer(roofed(room()), 'L1', { visible: false })
    expect(houseSolids(plan)).toEqual([])
  })
})
