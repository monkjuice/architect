import { describe, expect, it } from 'vitest'
import { updateLayer } from './edit'
import { findSnap } from './snap'
import { makePlan } from './testPlan'

const plan = makePlan([{ points: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 6 }] }])

describe('findSnap', () => {
  it('prefers a vertex within reach, then a midpoint, then the nearest point of a segment', () => {
    expect(findSnap(plan, { x: 10.2, y: 0.1 }, { reach: 0.5 })).toMatchObject({ kind: 'vertex', layer: 'L1', vertex: 'v2', point: { x: 10, y: 0 } })
    expect(findSnap(plan, { x: 5.3, y: 0.2 }, { reach: 0.5 })).toMatchObject({ kind: 'midpoint', segment: 's1', point: { x: 5, y: 0 } })
    expect(findSnap(plan, { x: 2, y: 0.3 }, { reach: 0.5 })).toMatchObject({ kind: 'edge', segment: 's1', point: { x: 2, y: 0 } })
    expect(findSnap(plan, { x: 3, y: 3 }, { reach: 0.5 })).toEqual({ kind: 'free', point: { x: 3, y: 3 } })
  })

  it('ignores hidden layers, skipped items, and everything when disabled', () => {
    const hidden = updateLayer(plan, 'L1', { visible: false })
    expect(findSnap(hidden, { x: 10, y: 0.1 }, { reach: 0.5 }).kind).toBe('free')
    expect(findSnap(plan, { x: 10, y: 0.1 }, { reach: 0.5, skipVertices: new Set(['L1:v2']), skipSegments: new Set(['L1:s1', 'L1:s2']) }).kind).toBe('free')
    expect(findSnap(plan, { x: 10, y: 0.1 }, { reach: 0.5, enabled: false }).kind).toBe('free')
  })

  it('keeps a constrained point on its ray, lining it up with a nearby vertex', () => {
    const snap = findSnap(plan, { x: 10.2, y: 5.9 }, { reach: 0.5, from: { x: 3, y: 5.8 }, constrain: true })
    expect(snap).toMatchObject({ kind: 'align', point: { x: 10, y: 5.8 }, guide: { x: 10, y: 6 } })
    expect(snap.point.y).toBe(5.8)
  })

  it('cuts a segment where the constrained ray crosses it', () => {
    const snap = findSnap(plan, { x: 10.3, y: 2.2 }, { reach: 0.5, from: { x: 3, y: 2 }, constrain: true })
    expect(snap).toMatchObject({ kind: 'edge', segment: 's2', point: { x: 10, y: 2 } })
  })

  it('snaps to extra points, e.g. to close a measurement', () => {
    expect(findSnap(plan, { x: 20.1, y: 20 }, { reach: 0.5, extraPoints: [{ x: 20, y: 20 }] })).toMatchObject({ kind: 'vertex', extra: true })
  })
})
