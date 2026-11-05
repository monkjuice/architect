import { describe, expect, it } from 'vitest'
import { addArea, addLayer, addSegment, addVertex, draftLayer, replaceLayer, setAreaLot } from '../model/edit'
import type { Vec } from '../model/geometry'
import { createPlan, type Plan } from '../model/plan'
import { areaSize, coveredArea, planAreas, visibleAreas } from './derived'

const rect = (x: number, y: number, w: number, h: number): Vec[] => [
  { x, y },
  { x: x + w, y },
  { x: x + w, y: y + h },
  { x, y: y + h },
]

/** Walls round a closed outline on a layer. */
function walled(plan: Plan, layerId: string, pts: Vec[]): Plan {
  const d = draftLayer(plan.layers.find((l) => l.id === layerId)!)
  const ids = pts.map((p) => addVertex(d, p))
  ids.forEach((id, i) => addSegment(d, id, ids[(i + 1) % ids.length]))
  return replaceLayer(plan, d)
}

/** A 10 × 4 room "Living" on L1, and on L2 a 40 × 40 walled lot around it, its middle in the room. */
function site(): Plan {
  let plan = addArea(walled(createPlan(), 'L1', rect(0, 0, 10, 4)), 'L1', { x: 5, y: 2 }, 'Living').plan
  plan = addLayer(plan, 'Lot').plan
  plan = walled(plan, 'L2', rect(-15, -18, 40, 40))
  return addArea(plan, 'L2', { x: 5, y: 2 }, 'Lote A').plan
}

const lotOf = (plan: Plan) => planAreas(plan).find((a) => a.area.name === 'Lote A')!
const markLot = (plan: Plan) => setAreaLot(plan, [{ layer: 'L2', kind: 'area', id: lotOf(plan).id }], true)

describe('lots', () => {
  it('put their label on open ground, off the areas of the other layers', () => {
    const plain = lotOf(site()).label
    // the lot's middle is in the room: an area that is not a lot keeps its label there
    expect(plain.x > 0 && plain.x < 10 && plain.y > 0 && plain.y < 4).toBe(true)
    const { label } = lotOf(markLot(site()))
    expect(label.x > 0 && label.x < 10 && label.y > 0 && label.y < 4).toBe(false)
    expect(label.x > -15 && label.x < 25 && label.y > -18 && label.y < 22).toBe(true)
  })

  it('are sized to their boundary lines and left out of the covered area', () => {
    const before = coveredArea(site())
    const plan = markLot(site())
    expect(areaSize(lotOf(plan))).toBeCloseTo(1600)
    const room = visibleAreas(plan).find((a) => a.area.name === 'Living')!
    expect(areaSize(room)).toBe(room.region!.floor)
    // the lot's 40 × 40 inside its walls counted as covered until it was a lot
    expect(before - coveredArea(plan)).toBeGreaterThan(1500)
  })
})
