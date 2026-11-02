import { describe, expect, it } from 'vitest'
import { addArea, addOpening, addSegment, addVertex, draftLayer, replaceLayer, updateLayer } from './edit'
import type { Vec } from './geometry'
import { createPlan, type Opening, type Plan, type SegmentKind } from './plan'
import { BEAM_DEPTH, DOOR_HEAD, FLOOR, GATE_HEIGHT, HIGH_SILL, houseSolids, ROOF_SLAB, WINDOW_SILL, type Solid } from './solids'
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

const withOpening = (plan: Plan, o: Partial<Opening> & Pick<Opening, 'kind' | 'style'>) =>
  addOpening(plan, 'L1', { segment: 's1', offset: 5, width: 1, hinge: 'a', swing: 'left', ...o } as Opening)!.plan

const of = (solids: Solid[], kind: Solid['kind']) => solids.filter((s) => s.kind === kind)

describe('houseSolids', () => {
  it('builds a room: walls up to the top of its roof, a floor and a flat roof', () => {
    const solids = houseSolids(room())
    const [roof] = of(solids, 'roof')
    expect(of(solids, 'roof')).toHaveLength(1)
    expect([roof.bottom, roof.top]).toEqual([WALL_HEIGHT, WALL_HEIGHT + ROOF_SLAB])
    expect(roof.material).toBe('roof')
    const walls = of(solids, 'wall')
    expect(walls).toHaveLength(4)
    for (const w of walls) {
      expect(w.bottom).toBe(0)
      expect(w.top).toBeGreaterThan(WALL_HEIGHT + ROOF_SLAB - 0.02)
      expect(w.top).toBeLessThan(WALL_HEIGHT + ROOF_SLAB)
      // all four face outside
      expect(w.material).toBe('facade')
    }
    const [floor] = of(solids, 'floor')
    expect([floor.bottom, floor.top]).toEqual([0, FLOOR])
    expect(floor.material).toBe('floor')
    expect(floor.ref).toEqual({ layer: 'L1', kind: 'area', id: 'a1' })
  })

  it('leaves unnamed outlines without floor or roof', () => {
    const solids = houseSolids(planOf([{ points: rect(0, 0, 10, 4), closed: true }]))
    expect(of(solids, 'floor')).toHaveLength(0)
    expect(of(solids, 'roof')).toHaveLength(0)
    expect(of(solids, 'wall').every((w) => w.top === WALL_HEIGHT)).toBe(true)
  })

  it('cuts a door: the wall over it, a frame and a closed leaf', () => {
    const solids = houseSolids(withOpening(room(), { kind: 'door', style: 'single', width: 0.8 }))
    const [lintel] = of(solids, 'lintel')
    expect(lintel.bottom).toBe(DOOR_HEAD)
    expect(lintel.top).toBe(of(solids, 'wall')[0].top)
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

  it('roofs a gallery and carries its open front on a beam and columns', () => {
    // a room, and a gallery in front of it closed by open edges from (0,4) to (0,7) to (10,7) to (10,4)
    let plan = planOf([
      { points: rect(0, 0, 10, 4), closed: true },
      { points: [{ x: 0, y: 4 }, { x: 0, y: 7 }, { x: 10, y: 7 }, { x: 10, y: 4 }], kind: 'open' },
    ])
    plan = addArea(plan, 'L1', { x: 5, y: 2 }, 'Living').plan
    plan = addArea(plan, 'L1', { x: 5, y: 5.5 }, 'Gallery').plan
    const solids = houseSolids(plan)
    expect(of(solids, 'roof')).toHaveLength(2)
    const beams = of(solids, 'beam')
    expect(beams).toHaveLength(3)
    expect(beams.every((b) => b.top === WALL_HEIGHT && b.bottom === WALL_HEIGHT - BEAM_DEPTH)).toBe(true)
    // the gallery's two free corners; its other ends meet the room's walls
    const columns = of(solids, 'column')
    expect(columns).toHaveLength(2)
    expect(columns.every((c) => c.top === WALL_HEIGHT - BEAM_DEPTH)).toBe(true)
    // the wall between room and gallery faces a space the outside reaches, so it is a facade
    expect(of(solids, 'wall').every((w) => w.material === 'facade')).toBe(true)
  })

  it('leaves a pool open to the sky, paved', () => {
    let plan = planOf([{ points: rect(0, 0, 8, 4), closed: true, kind: 'outline' }])
    plan = addArea(plan, 'L1', { x: 4, y: 2 }, 'Pool').plan
    expect(of(houseSolids(plan), 'roof')).toHaveLength(0)
    expect(of(houseSolids(plan), 'floor')[0].material).toBe('paving')
  })

  it('makes walls that face outside facade and walls between rooms interior', () => {
    // two rooms side by side: the wall at x = 5 is between them
    const plan = planOf([{ points: rect(0, 0, 10, 4), closed: true }, { points: [{ x: 5, y: 0 }, { x: 5, y: 4 }] }])
    const walls = of(houseSolids(plan), 'wall')
    const inner = walls.filter((w) => w.outline.every((q) => Math.abs(q.x - 5) < 0.2))
    expect(inner.length).toBeGreaterThan(0)
    expect(inner.every((w) => w.material === 'interior')).toBe(true)
    expect(walls.filter((w) => !inner.includes(w)).every((w) => w.material === 'facade')).toBe(true)
  })

  it('builds only visible layers', () => {
    const plan = updateLayer(room(), 'L1', { visible: false })
    expect(houseSolids(plan)).toEqual([])
  })
})
