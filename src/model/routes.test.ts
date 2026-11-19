import { describe, expect, it } from 'vitest'
import { addArea, addFurniture, addService, deleteItems, resetRoutes, setRoutes } from './edit'
import type { Plan } from './plan'
import { parsePlanText, serializePlan } from './planFile'
import { plumbingPlan } from './plumbing'
import { movedRoutes, routeKey, TREE_KINDS } from './routing'
import { serviceInfo } from './services'
import { makePlan } from './testPlan'

/** A 10 × 6 house with the mains on its west side and three basins along its north wall. */
function house(): Plan {
  let plan = makePlan([{ points: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 6 }, { x: 0, y: 6 }], closed: true }])
  plan = addArea(plan, 'L1', { x: 5, y: 3 }, 'Hall').plan
  const info = serviceInfo('mains-water')
  plan = addService(plan, 'L1', { kind: 'mains-water', at: { x: -2, y: 3 }, angle: 0, width: info.width, depth: info.depth })!.plan
  for (const x of [3, 6, 9]) plan = addFurniture(plan, 'L1', { kind: 'sink', style: 'bathroom', at: { x, y: 0.4 }, angle: 0, width: 0.5, depth: 0.4 })!.plan
  return plan
}
const cold = (plan: Plan) => plumbingPlan(plan).runs.filter((r) => r.kind === 'cold')
const total = (plan: Plan) => cold(plan).reduce((s, r) => s + r.length, 0)

describe('routes set by hand', () => {
  it('moves a branch: it goes through the bends it was moved to, and keeps them', () => {
    const plan = house()
    const runs = plumbingPlan(plan).runs
    // a branch to one basin alone (the run to the first basin also feeds the next ones, so moving it moves them all)
    const i = runs.findIndex((r) => r.kind === 'cold' && r.to && (r.ends?.length ?? 1) === 1)
    const run = runs[i]
    // its first stretch, moved half a metre across it
    const [a, b] = [run.path[0], run.path[1]]
    const along = Math.abs(a.x - b.x) > Math.abs(a.y - b.y)
    const delta = along ? { x: 0, y: 0.5 } : { x: 0.5, y: 0 }
    const moves = movedRoutes(runs, i, 0, delta, TREE_KINDS.includes('cold'))
    expect(moves.size).toBe(1)
    const moved = setRoutes(plan, 'plumbing', moves)
    expect(Object.keys(moved.plumbing!.routes!)).toEqual([routeKey('cold', run.to!)])
    const after = plumbingPlan(moved).runs.filter((r) => r.kind === 'cold' && r.to && r.to.id === run.to!.id)
    const pts = after.flatMap((r) => r.path)
    const shifted = { x: a.x + delta.x, y: a.y + delta.y }
    expect(pts.some((p) => Math.hypot(p.x - shifted.x, p.y - shifted.y) < 1e-3) || cold(moved).some((r) => r.path.some((p) => Math.hypot(p.x - shifted.x, p.y - shifted.y) < 1e-3))).toBe(true)
    // it still ends at the basin's cold point
    expect(after.length).toBeGreaterThan(0)
    // kept through another edit, and through saving and loading
    const again = addFurniture(moved, 'L1', { kind: 'toilet', at: { x: 8, y: 5.6 }, angle: 180, width: 0.4, depth: 0.7 })!.plan
    expect(again.plumbing?.routes).toEqual(moved.plumbing?.routes)
    const loaded = parsePlanText(serializePlan(again))
    expect(loaded.ok && loaded.plan.plumbing?.routes).toEqual(moved.plumbing?.routes)
    // reset: back to the automatic route
    expect(cold(resetRoutes(moved, 'plumbing'))).toEqual(cold(plan))
  })

  it('moves a main: every basin downstream follows it, and the main is laid once', () => {
    const plan = house()
    const runs = plumbingPlan(plan).runs
    const i = runs.findIndex((r) => r.kind === 'cold' && (r.ends?.length ?? 0) >= 2)
    expect(i).toBeGreaterThanOrEqual(0)
    const run = runs[i]
    const s = run.path.findIndex((p, k) => k + 1 < run.path.length && Math.hypot(run.path[k + 1].x - p.x, run.path[k + 1].y - p.y) > 1)
    const [a, b] = [run.path[s], run.path[s + 1]]
    const delta = Math.abs(a.x - b.x) > Math.abs(a.y - b.y) ? { x: 0, y: 1 } : { x: 1, y: 0 }
    const moves = movedRoutes(runs, i, s, delta, true)
    expect(moves.size).toBe(run.ends!.length)
    const moved = setRoutes(plan, 'plumbing', moves)
    const shifted = [{ x: a.x + delta.x, y: a.y + delta.y }, { x: b.x + delta.x, y: b.y + delta.y }]
    const pts = cold(moved).flatMap((r) => r.path)
    for (const q of shifted) expect(pts.some((p) => Math.hypot(p.x - q.x, p.y - q.y) < 1e-3)).toBe(true)
    // the main is laid once, not once per basin: about as much pipe as before, plus the moves
    expect(total(moved)).toBeLessThan(total(plan) + 2 * (Math.abs(delta.x) + Math.abs(delta.y)) * run.ends!.length + 0.5)
    expect(total(moved)).toBeLessThan(total(plan) * 1.6)
  })

  it('leaves a drain main alone, and forgets the route of what is deleted', () => {
    const plan = house()
    const runs = plumbingPlan(plan).runs
    const i = runs.findIndex((r) => r.kind === 'cold' && r.to?.kind === 'furniture' && (r.ends?.length ?? 1) === 1)
    const moved = setRoutes(plan, 'plumbing', movedRoutes(runs, i, 0, { x: 0, y: 0.3 }, true))
    expect(Object.keys(moved.plumbing?.routes ?? {}).length).toBe(1)
    const gone = deleteItems(moved, [runs[i].to!])
    expect(gone.plumbing?.routes).toBeUndefined()
  })
})

