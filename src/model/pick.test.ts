import { describe, expect, it } from 'vitest'
import { updateLayer } from './edit'
import { hitTest, measureSegments, orderedLoop, segmentsInBox, selectedVertices } from './pick'
import { LOT, makePlan } from './testPlan'

describe('hitTest', () => {
  const plan = makePlan([{ points: [{ x: 0, y: 0 }, { x: 10, y: 0 }] }])

  it('finds vertices before segments', () => {
    expect(hitTest(plan, { x: 9.9, y: 0.05 }, 'L1', 0.3, 0.2)).toEqual({ layer: 'L1', kind: 'vertex', id: 'v2' })
    expect(hitTest(plan, { x: 5, y: 0.1 }, 'L1', 0.3, 0.2)).toEqual({ layer: 'L1', kind: 'segment', id: 's1' })
    expect(hitTest(plan, { x: 5, y: 1 }, 'L1', 0.3, 0.2)).toBeNull()
  })

  it('skips locked and hidden layers', () => {
    expect(hitTest(updateLayer(plan, 'L1', { locked: true }), { x: 5, y: 0 }, 'L1', 0.3, 0.2)).toBeNull()
  })
})

describe('selection helpers', () => {
  const plan = makePlan([{ points: [{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 5, y: 5 }] }])

  it('box-selects segments wholly inside', () => {
    expect(segmentsInBox(plan, { x0: -1, y0: -1, x1: 6, y1: 1 })).toEqual([{ layer: 'L1', kind: 'segment', id: 's1' }])
  })

  it('collects the vertices a selection moves', () => {
    const verts = selectedVertices(plan, [
      { layer: 'L1', kind: 'segment', id: 's1' },
      { layer: 'L1', kind: 'vertex', id: 'v3' },
    ])
    expect([...verts.get('L1')!].sort()).toEqual(['v1', 'v2', 'v3'])
  })
})

describe('loops', () => {
  it('orders a closed loop and measures its area: the sample lot is 855.38 m²', () => {
    const plan = makePlan([{ points: LOT, closed: true }])
    const ids = Object.keys(plan.layers[0].segments)
    expect(orderedLoop(plan.layers[0], ids)).toHaveLength(5)
    const m = measureSegments(plan.layers[0], ids)
    expect(m.area).toBeCloseTo(855.38, 2)
    expect(m.length).toBeCloseTo(115.66, 2)
  })

  it('has no area for an open chain or two separate loops', () => {
    const open = makePlan([{ points: LOT }])
    expect(measureSegments(open.layers[0], Object.keys(open.layers[0].segments)).area).toBeUndefined()
    const square = (o: number) => [
      { x: o, y: 0 },
      { x: o + 1, y: 0 },
      { x: o + 1, y: 1 },
      { x: o, y: 1 },
    ]
    const two = makePlan([
      { points: square(0), closed: true },
      { points: square(5), closed: true },
    ])
    expect(orderedLoop(two.layers[0], Object.keys(two.layers[0].segments))).toBeNull()
  })
})
