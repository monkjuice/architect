import { describe, expect, it } from 'vitest'
import { columnSpots, layerColonnades, newColonnade } from './colonnades'
import { addSegment, addVertex, draftLayer, drawSegment, replaceLayer, setColonnade, setSegmentKind } from './edit'
import type { Vec } from './geometry'
import { createPlan, type Plan, type SegmentKind } from './plan'
import { parsePlan, serializePlan } from './planFile'
import { layerFaces } from './regions'

function planOf(chains: { points: Vec[]; kind?: SegmentKind }[]): Plan {
  const plan = createPlan()
  const d = draftLayer(plan.layers[0])
  for (const c of chains) {
    const ids = c.points.map((p) => addVertex(d, p))
    for (let i = 1; i < ids.length; i++) addSegment(d, ids[i - 1], ids[i], c.kind ?? 'wall')
  }
  return replaceLayer(plan, d)
}

/** A wall from (0,0) to (0,4) and a 10 m open edge from its foot, s2, along y = 4. */
const gallery = () =>
  planOf([
    { points: [{ x: 0, y: 0 }, { x: 0, y: 4 }] },
    { points: [{ x: 0, y: 4 }, { x: 10, y: 4 }], kind: 'open' },
  ])
const edge = { layer: 'L1', kind: 'segment' as const, id: 's2' }

describe('colonnades', () => {
  it('shares columns out evenly, no farther apart than the spacing', () => {
    expect(columnSpots(10, 2.4)).toEqual([0, 0.2, 0.4, 0.6, 0.8, 1])
    expect(columnSpots(4.8, 2.4)).toEqual([0, 0.5, 1])
    expect(columnSpots(1, 3)).toEqual([0, 1])
  })

  it('goes on open edges only, and comes off with null', () => {
    const plan = setColonnade(gallery(), [edge, { ...edge, id: 's1' }], newColonnade('roman'))
    expect(plan.layers[0].segments.s2.colonnade).toEqual({ style: 'roman', spacing: 2.4 })
    expect(plan.layers[0].segments.s1.colonnade).toBeUndefined()
    expect(setColonnade(plan, [edge], newColonnade('roman'))).toBe(plan)
    expect(setColonnade(plan, [edge], null).layers[0].segments.s2).toEqual({ a: 'v3', b: 'v4', kind: 'open' })
  })

  it('leaves out the column at an end a wall already holds', () => {
    const plan = setColonnade(gallery(), [edge], newColonnade('roman'))
    const layer = plan.layers[0]
    const [c] = layerColonnades(layer, layerFaces(layer).thickness)
    // 10 m at 2.4 m at most: five bays, six spots, less the one on the wall at x = 0
    expect(c.columns.map((col) => col.p.x)).toEqual([2, 4, 6, 8, 10])
  })

  it('keeps its colonnade through a split, a switch to a wall and back, and the file', () => {
    let plan = setColonnade(gallery(), [edge], newColonnade('metal'))
    plan = drawSegment(plan, 'L1', { point: { x: 5, y: 4 }, kind: 'edge', layer: 'L1', segment: 's2' }, { point: { x: 5, y: 8 }, kind: 'free' })!.plan
    const pieces = Object.values(plan.layers[0].segments).filter((s) => s.kind === 'open')
    expect(pieces.map((s) => s.colonnade?.style)).toEqual(['metal', 'metal'])
    const back = setSegmentKind(setSegmentKind(gallery(), [edge], 'wall'), [edge], 'open')
    expect(back.layers[0].segments.s2.colonnade).toBeUndefined()
    const kept = setSegmentKind(setSegmentKind(setColonnade(gallery(), [edge], newColonnade('metal')), [edge], 'wall'), [edge], 'open')
    expect(kept.layers[0].segments.s2.colonnade).toEqual({ style: 'metal', spacing: 3 })
    const parsed = parsePlan(JSON.parse(serializePlan(kept)))
    expect(parsed.ok && parsed.plan.layers[0].segments.s2.colonnade).toEqual({ style: 'metal', spacing: 3 })
  })
})
