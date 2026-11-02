import { addSegment, addVertex, draftLayer, replaceLayer } from './edit'
import type { Vec } from './geometry'
import { createLayer, createPlan, type Plan } from './plan'

/**
 * Lot 8a of the sample survey plan, in meters with y down: 28.00 wide at the back, 30.71 deep on the right,
 * 25.00 along the street and a 3 × 3 m chamfer (4.24) at the corner, so 27.71 on the left. Its area is
 * 28 × 30.71 − 4.5 = 855.38 m² (the survey states 855.24 m² from its measured angles).
 */
export const LOT: Vec[] = [
  { x: 0, y: 0 },
  { x: 28, y: 0 },
  { x: 28, y: 30.71 },
  { x: 3, y: 30.71 },
  { x: 0, y: 27.71 },
]

/** A plan whose first layer holds `chains`, each a polyline (closed when `closed` is set). */
export function makePlan(chains: { points: Vec[]; closed?: boolean }[] = [], extraLayers = 0): Plan {
  const plan = createPlan()
  const d = draftLayer(plan.layers[0])
  for (const chain of chains) {
    const ids = chain.points.map((p) => addVertex(d, p))
    for (let i = 1; i < ids.length; i++) addSegment(d, ids[i - 1], ids[i])
    if (chain.closed) addSegment(d, ids[ids.length - 1], ids[0])
  }
  let next = replaceLayer(plan, d)
  for (let i = 0; i < extraLayers; i++) next = { ...next, layers: [...next.layers, createLayer(`X${i + 1}`, `Extra ${i + 1}`)] }
  return next
}
