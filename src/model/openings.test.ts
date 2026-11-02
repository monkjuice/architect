import { describe, expect, it } from 'vitest'
import { addOpening, deleteItems, drawSegment, moveSegments, setSegmentLength, setVertices, updateOpening } from './edit'
import { hasHinge, hasSide, openingAt, openingFor, openingParts, openingSpans, openingTarget, parkingRoom, placeOpening, slides, STYLES } from './openings'
import { DOOR_STYLES, GATE_STYLES, WINDOW_STYLES, type Opening, type Plan } from './plan'
import { parsePlan, serializePlan } from './planFile'
import { makePlan } from './testPlan'

/** A 10 × 4 room drawn clockwise from the origin: s1 is its top wall, from (0,0) to (10,0). */
const room = () =>
  makePlan([
    {
      points: [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 4 },
        { x: 0, y: 4 },
      ],
      closed: true,
    },
  ])

type Door = Extract<Opening, { kind: 'door' }>
type Win = Extract<Opening, { kind: 'window' }>

const door = (offset: number, extra: Partial<Door> = {}): Door => ({
  kind: 'door',
  style: 'single',
  segment: 's1',
  offset,
  width: 0.8,
  hinge: 'a',
  swing: 'right',
  ...extra,
})

const win = (segment: string, offset: number, width: number, extra: Partial<Win> = {}): Win => ({
  kind: 'window',
  style: 'fixed',
  segment,
  offset,
  width,
  hinge: 'a',
  swing: 'left',
  ...extra,
})

const withOpening = (plan: Plan, o: Opening) => addOpening(plan, 'L1', o)!.plan
const opening = (plan: Plan, id = 'o1') => plan.layers[0].openings[id]

describe('placing openings', () => {
  it('lays an opening out along its wall', () => {
    const plan = withOpening(room(), door(3))
    const p = placeOpening(plan.layers[0], opening(plan))!
    expect(p.start).toEqual({ x: 2.6, y: 0 })
    expect(p.end).toEqual({ x: 3.4, y: 0 })
    expect(p.left).toEqual({ x: 0, y: -1 })
    expect(openingSpans(plan.layers[0], 's1')).toEqual([[2.6, 3.4]])
  })

  it('keeps an opening on its wall, and says when the wall is too short', () => {
    const plan = withOpening(room(), door(0.1))
    expect(placeOpening(plan.layers[0], opening(plan))!.offset).toBeCloseTo(0.4, 9)
    const wide = withOpening(room(), win('s2', 2, 5))
    expect(placeOpening(wide.layers[0], opening(wide))!.fits).toBe(false)
  })

  it('opens a door to its swing side, the arc sweeping from the leaf tip to the far jamb', () => {
    const plan = withOpening(room(), door(3))
    const parts = openingParts(placeOpening(plan.layers[0], opening(plan))!, opening(plan), 0.075)
    const [[hinge, tip]] = parts.leaves
    expect(hinge).toEqual({ x: 2.6, y: 0 })
    expect(tip.x).toBeCloseTo(2.6, 9)
    expect(tip.y).toBeCloseTo(0.8, 9) // right of a→b along +x is +y, into the room
    expect(parts.arcs[0]).toMatchObject({ to: { x: 3.4, y: 0 } })
    expect(parts.arcs[0].radius).toBeCloseTo(0.8, 9)
    expect(parts.jambs).toHaveLength(2)
  })
})

describe('openingTarget', () => {
  const opts = { reach: 0.3, width: 0.8, activeLayer: 'L1', snap: true }

  it('finds the nearest wall, the side the cursor is on and the hinge near the closer end', () => {
    const t = openingTarget(room(), { x: 2.02, y: 0.2 }, opts)!
    expect(t).toMatchObject({ segment: 's1', side: 'right', hinge: 'a' })
    expect(t.gaps[0]).toBeCloseTo(1.6, 9) // snapped to a 5 cm gap from the corner
    expect(openingTarget(room(), { x: 7, y: -0.2 }, opts)).toMatchObject({ side: 'left', hinge: 'b' })
    expect(openingTarget(room(), { x: 5, y: 2 }, opts)).toBeNull()
  })

  it('snaps to the middle of the wall', () => {
    expect(openingTarget(room(), { x: 5.2, y: 0.1 }, opts)!.offset).toBe(5)
    expect(openingTarget(room(), { x: 5.2, y: 0.1 }, { ...opts, snap: false })!.offset).toBeCloseTo(5.2, 9)
  })

  it('refuses walls that are too short and overlaps', () => {
    expect(openingTarget(room(), { x: 10.1, y: 2 }, { ...opts, width: 5 })!.problem).toMatch(/shorter/)
    const plan = withOpening(room(), door(3))
    expect(openingTarget(plan, { x: 3.5, y: 0.1 }, opts)!.problem).toMatch(/overlap/)
    expect(openingTarget(plan, { x: 3.5, y: 0.1 }, { ...opts, ignore: 'o1' })!.problem).toBeUndefined()
  })
})

describe('openings follow their walls', () => {
  it('keeps the distance to the nearer end when a wall is stretched', () => {
    const plan = withOpening(withOpening(room(), door(2)), door(8))
    // move the top-right corner (v2) out by 2 m: the door near the left corner stays, the one near v2 follows
    const moved = setVertices(plan, new Map([['L1', new Map([['v2', { x: 12, y: 0 }]])]]))
    expect(opening(moved, 'o1').offset).toBe(2)
    expect(opening(moved, 'o2').offset).toBe(10)
    const shorter = setSegmentLength(plan, 'L1', 's1', 9)
    const moves = [opening(shorter, 'o1').offset, opening(shorter, 'o2').offset]
    expect(moves.filter((o) => o === 2 || o === 8)).toHaveLength(1) // only the one by the fixed end kept its offset
  })

  it('moves to the piece of a wall its centre is on when the wall is split', () => {
    const plan = withOpening(withOpening(room(), door(2)), door(8))
    const split = drawSegment(plan, 'L1', { point: { x: 5, y: 0 }, kind: 'edge', layer: 'L1', segment: 's1' }, { point: { x: 5, y: 4 }, kind: 'free' })!
    const l = split.plan.layers[0]
    for (const o of Object.values(l.openings)) {
      const p = placeOpening(l, o)!
      expect([2, 8]).toContain(+p.center.x.toFixed(9))
      expect(p.center.y).toBe(0)
    }
    expect(new Set(Object.values(l.openings).map((o) => o.segment)).size).toBe(2)
  })

  it('goes when its wall is deleted, and can be deleted alone', () => {
    const plan = withOpening(room(), door(3))
    expect(deleteItems(plan, [{ layer: 'L1', kind: 'segment', id: 's1' }]).layers[0].openings).toEqual({})
    const noDoor = deleteItems(plan, [{ layer: 'L1', kind: 'opening', id: 'o1' }])
    expect(noDoor.layers[0].openings).toEqual({})
    expect(Object.keys(noDoor.layers[0].segments)).toHaveLength(4)
  })

  it('moves to another layer with its wall', () => {
    const plan = withOpening(makePlan([{ points: [{ x: 0, y: 0 }, { x: 10, y: 0 }] }], 1), door(3))
    const result = moveSegments(plan, 'L1', ['s1'], 'X1')
    expect(result.plan.layers[0].openings).toEqual({})
    expect(Object.values(result.plan.layers[1].openings)).toEqual([{ ...door(3), segment: result.ids[0] }])
  })

  it('is mirrored onto a segment that runs the other way', () => {
    const plan = makePlan([{ points: [{ x: 0, y: 0 }, { x: 10, y: 0 }] }], 1)
    const target = drawSegment(plan, 'X1', { point: { x: 10, y: 0 }, kind: 'free' }, { point: { x: 0, y: 0 }, kind: 'free' })!.plan
    const result = moveSegments(withOpening(target, door(3)), 'L1', ['s1'], 'X1')
    const moved = Object.values(result.plan.layers[1].openings)[0] as Door
    expect(moved).toMatchObject({ offset: 7, hinge: 'b', swing: 'left' })
    const p = placeOpening(result.plan.layers[1], moved)!
    expect(p.center).toEqual({ x: 3, y: 0 })
  })
})

describe('editing openings', () => {
  it('changes width, position, hinge and swing; the same plan when nothing changes', () => {
    const plan = withOpening(room(), door(3))
    expect(updateOpening(plan, 'L1', 'o1', { width: 0.8 })).toBe(plan)
    const next = updateOpening(plan, 'L1', 'o1', { width: 0.9, hinge: 'b', swing: 'left' })
    expect(opening(next)).toMatchObject({ width: 0.9, hinge: 'b', swing: 'left' })
    expect(next.layers[0].segments).toBe(plan.layers[0].segments)
    const window = withOpening(room(), win('s1', 5, 1.2))
    expect(opening(updateOpening(window, 'L1', 'o1', { style: 'casement', swing: 'right' }))).toMatchObject({ style: 'casement', swing: 'right' })
    expect(updateOpening(window, 'L1', 'o1', { style: 'double' })).toBe(window) // a door style on a window
  })

  it('refuses a door on a segment that does not exist', () => {
    expect(addOpening(room(), 'L1', door(3, { segment: 's99' }))).toBeNull()
  })

  it('picks the opening under the cursor, by its wall or its leaf', () => {
    const plan = withOpening(room(), door(3))
    expect(openingAt(plan, { x: 3, y: 0.05 }, 0.1)).toEqual({ layer: 'L1', id: 'o1' })
    expect(openingAt(plan, { x: 2.65, y: 0.6 }, 0.1)).toEqual({ layer: 'L1', id: 'o1' })
    expect(openingAt(plan, { x: 5, y: 0.05 }, 0.1)).toBeNull()
  })
})

describe('openings in files', () => {
  it('round-trips, and rejects an opening on a missing segment', () => {
    const plan = withOpening(withOpening(room(), door(3)), win('s2', 2, 1.2, { style: 'awning' }))
    const parsed = parsePlan(JSON.parse(serializePlan(plan)))
    expect(parsed.ok && parsed.plan.layers[0].openings).toEqual(plan.layers[0].openings)
    const raw = JSON.parse(serializePlan(plan))
    raw.layers[0].openings.o1.segment = 's99'
    const broken = parsePlan(raw)
    expect(!broken.ok && broken.errors[0]).toBe('layers (L1).openings.o1: segment "s99" does not exist')
  })
})

describe('styles', () => {
  const partsOf = (o: Opening) => {
    const plan = withOpening(room(), o)
    return openingParts(placeOpening(plan.layers[0], opening(plan))!, opening(plan), 0.075)
  }
  const count = (o: Opening) => {
    const p = partsOf(o)
    return { leaves: p.leaves.length, glass: p.glass.length, panels: p.panels.length, dashed: p.dashed.length, frame: !!p.frame }
  }

  it('lists every style of the schema once, each with a usual width', () => {
    expect(STYLES.filter((s) => s.kind === 'door').map((s) => s.style)).toEqual([...DOOR_STYLES])
    expect(STYLES.filter((s) => s.kind === 'window').map((s) => s.style)).toEqual([...WINDOW_STYLES])
    expect(STYLES.filter((s) => s.kind === 'gate').map((s) => s.style)).toEqual([...GATE_STYLES])
    // doors and windows are under 2 m; driveway gates are wider
    expect(STYLES.every((s) => s.width > 0.5 && s.width < (s.kind === 'gate' ? 5 : 2))).toBe(true)
  })

  it('draws doors: one leaf, two leaves meeting in the middle, or two sliding panels', () => {
    expect(count(door(3))).toMatchObject({ leaves: 1, panels: 0 })
    const double = partsOf(door(3, { style: 'double', width: 1.4 }))
    expect(double.leaves).toHaveLength(2)
    expect(double.arcs.map((a) => a.to)).toEqual([
      { x: 3, y: 0 },
      { x: 3, y: 0 },
    ])
    expect(count(door(3, { style: 'sliding', width: 1.6 }))).toMatchObject({ leaves: 0, panels: 2 })
  })

  it('draws windows: one pane, staggered or parallel sashes, an awning sash, casement leaves', () => {
    expect(count(win('s1', 5, 1))).toEqual({ leaves: 0, glass: 1, panels: 0, dashed: 0, frame: true })
    expect(count(win('s1', 5, 1.5, { style: 'sliding' }))).toMatchObject({ glass: 2 })
    expect(count(win('s1', 5, 0.9, { style: 'double-hung' }))).toMatchObject({ glass: 2 })
    expect(count(win('s1', 5, 1, { style: 'awning' }))).toMatchObject({ glass: 1, dashed: 1 })
    expect(count(win('s1', 5, 1.2, { style: 'casement' }))).toMatchObject({ leaves: 2 })
    expect(count(win('s1', 5, 0.6, { style: 'casement' }))).toMatchObject({ leaves: 1 })
  })

  it('opens awnings and casements to their swing side', () => {
    // swing left of a→b along +x is -y: the sash and the leaves go to negative y
    const awning = partsOf(win('s1', 5, 1, { style: 'awning', swing: 'left' }))
    expect(Math.min(...awning.dashed[0].map((p) => p.y))).toBeLessThan(-0.2)
    const casement = partsOf(win('s1', 5, 0.6, { style: 'casement', swing: 'right' }))
    expect(casement.leaves[0][1].y).toBeGreaterThan(0.5)
  })

  it('offers the flips that make sense for each style', () => {
    expect([hasSide(door(3)), hasHinge(door(3))]).toEqual([true, true])
    expect([hasSide(door(3, { style: 'double' })), hasHinge(door(3, { style: 'double' }))]).toEqual([true, false])
    expect([hasSide(win('s1', 5, 1)), hasHinge(win('s1', 5, 1))]).toEqual([false, false])
    expect(hasHinge(win('s1', 5, 0.6, { style: 'casement' }))).toBe(true)
    expect(hasHinge(win('s1', 5, 1.2, { style: 'casement' }))).toBe(false)
  })

  it('reads openings saved before styles as single doors and fixed windows', () => {
    const plan = withOpening(withOpening(room(), door(3)), win('s2', 2, 1.2))
    const raw = JSON.parse(serializePlan(plan))
    for (const o of Object.values(raw.layers[0].openings) as Record<string, unknown>[]) delete o.style
    delete raw.layers[0].openings.o2.hinge
    delete raw.layers[0].openings.o2.swing
    const parsed = parsePlan(raw)
    expect(parsed.ok && parsed.plan.layers[0].openings.o1.style).toBe('single')
    expect(parsed.ok && parsed.plan.layers[0].openings.o2).toMatchObject({ style: 'fixed', hinge: 'a', swing: 'left' })
  })
})

describe('gates', () => {
  type Gate = Extract<Opening, { kind: 'gate' }>
  const gate = (offset: number, extra: Partial<Gate> = {}): Gate => ({
    kind: 'gate',
    style: 'single',
    segment: 's1',
    offset,
    width: 1,
    hinge: 'a',
    swing: 'right',
    ...extra,
  })
  const partsOf = (o: Opening) => {
    const plan = withOpening(room(), o)
    return openingParts(placeOpening(plan.layers[0], opening(plan))!, opening(plan), 0.075)
  }

  it('draws posts and one leaf, a pair, or a sliding panel with where it parks', () => {
    const single = partsOf(gate(3))
    expect([single.posts.length, single.leaves.length]).toEqual([2, 1])
    expect(partsOf(gate(5, { style: 'double', width: 3 })).leaves).toHaveLength(2)
    const sliding = partsOf(gate(3, { style: 'sliding', width: 4, hinge: 'b' }))
    expect([sliding.panels.length, sliding.dashed.length, sliding.leaves.length]).toEqual([1, 1, 0])
    // closed over 1..5 m, it parks past the b end: over 5..9 m
    const parkedX = sliding.dashed[0].map((p) => p.x)
    expect(Math.min(...parkedX)).toBeCloseTo(5, 9)
    expect(Math.max(...parkedX)).toBeCloseTo(9, 9)
  })

  it('slides towards the side with more wall to park along, and swaps with X', () => {
    const t = openingTarget(room(), { x: 3, y: 0.2 }, { reach: 0.3, width: 4, activeLayer: 'L1', snap: false })!
    expect(t.hinge).toBe('a') // the nearer corner is the a end…
    expect(openingFor('gate', 'sliding', t, 4).hinge).toBe('b') // …so it parks towards b
    expect(openingFor('gate', 'sliding', t, 4, true).hinge).toBe('a')
    expect(openingFor('gate', 'single', t, 1).hinge).toBe('a') // a leaf still hangs near the corner
  })

  it('offers the flips that make sense', () => {
    expect([hasSide(gate(3)), hasHinge(gate(3))]).toEqual([true, true])
    expect(hasHinge(gate(5, { style: 'double' }))).toBe(false)
    expect([hasHinge(gate(3, { style: 'sliding' })), slides(gate(3, { style: 'sliding' }))]).toEqual([true, true])
    expect(hasHinge(door(3, { style: 'sliding' }))).toBe(false)
  })

  it('round-trips in files, defaulting to a single gate', () => {
    const plan = withOpening(room(), gate(3, { style: 'double', width: 3 }))
    const raw = JSON.parse(serializePlan(plan))
    expect(parsePlan(raw).ok).toBe(true)
    delete raw.layers[0].openings.o1.style
    const parsed = parsePlan(raw)
    expect(parsed.ok && parsed.plan.layers[0].openings.o1.style).toBe('single')
  })
})

describe('sliding gate parking', () => {
  const sliding = (offset: number, hinge: 'a' | 'b'): Opening => ({ kind: 'gate', style: 'sliding', segment: 's1', offset, width: 4, hinge, swing: 'left' })

  it('measures the free wall on the side it slides to, up to the wall end or the next opening', () => {
    const plan = withOpening(room(), sliding(3, 'b'))
    expect(parkingRoom(plan.layers[0], 'o1')).toBeCloseTo(5, 9) // closed over 1..5, wall to 10
    const flipped = withOpening(room(), sliding(3, 'a'))
    expect(parkingRoom(flipped.layers[0], 'o1')).toBeCloseTo(1, 9) // only 1 m to the left end: too little
    const blocked = withOpening(plan, door(7))
    expect(parkingRoom(blocked.layers[0], 'o1')).toBeCloseTo(1.6, 9) // the door starts at 6.6
    expect(parkingRoom(blocked.layers[0], 'o2')).toBe(Infinity)
  })
})
