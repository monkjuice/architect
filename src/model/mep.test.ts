import { describe, expect, it } from 'vitest'
import { addArea, addFurniture, addService } from './edit'
import { gasPlan } from './gas'
import { hvacPlan } from './hvac'
import { clashesOf, MEP, mepPlan, segmentGap, type MepLine } from './mep'
import type { Plan } from './plan'
import { storeyOf } from './plan'
import { plumbingPlan } from './plumbing'
import { layerFaces } from './regions'
import { router } from './routing'
import { serviceInfo } from './services'
import { makePlan } from './testPlan'
import { layerWalls } from './walls'
import { wallGraph, wiringPlan } from './wiring'

const ROOM = [
  { x: 0, y: 0 },
  { x: 6, y: 0 },
  { x: 6, y: 4 },
  { x: 0, y: 4 },
]
const source = { faces: layerFaces, walls: (layer: Parameters<typeof layerFaces>[0]) => layerWalls(layer, layerFaces(layer).thickness) }

function coordinated(plan: Plan, levelAt?: () => number) {
  return mepPlan(plan, {
    wiring: wiringPlan(plan, { regions: (layer) => layerFaces(layer).regions, graph: (storey) => wallGraph(plan.layers.filter((layer) => layer.visible && storeyOf(layer) === storey)) }),
    plumbing: plumbingPlan(plan, source),
    hvac: hvacPlan(plan, source),
    gas: gasPlan(plan, source),
    router: router(plan, source),
    ...(levelAt ? { levelAt } : {}),
  })
}

function put(plan: Plan, kind: Parameters<typeof serviceInfo>[0], at: { x: number; y: number }, angle = 0): Plan {
  const info = serviceInfo(kind)
  return addService(plan, 'L1', { kind, at, angle, width: info.width, depth: info.depth })!.plan
}

const line = (kind: MepLine['kind'], system: MepLine['system'], points: [number, number, number][], radius = 0.01): MepLine => ({
  kind,
  system,
  radius,
  title: kind,
  pts: points.map(([x, y, z]) => ({ x, y, z })),
})

describe('MEP geometry', () => {
  it('measures parallel and crossing 3-D segments', () => {
    const origin = { x: 0, y: 0, z: 0 }
    expect(segmentGap(origin, { x: 2, y: 0, z: 0 }, { x: 0, y: 0.1, z: 0 }, { x: 2, y: 0.1, z: 0 }).d).toBeCloseTo(0.1)
    expect(segmentGap(origin, { x: 2, y: 0, z: 0 }, { x: 1, y: -1, z: 0.3 }, { x: 1, y: 1, z: 0.3 }).d).toBeCloseTo(0.3)
  })

  it('flags close gas/electric crossings but ignores adequately separated ones', () => {
    const gas = line('gas', 'gas', [[0, 0, 0.03], [3, 0, 0.03]])
    const close = line('cable', 'electricity', [[1, -1, 0.08], [1, 1, 0.08]])
    const clear = line('cable', 'electricity', [[1, -1, 0.2], [1, 1, 0.2]])
    expect(clashesOf([gas, close])).toEqual([expect.objectContaining({ how: 'crossing' })])
    expect(clashesOf([gas, clear])).toEqual([])
  })
})

describe('MEP derivation', () => {
  it('renders drains as continuously sloped 3-D stretches', () => {
    let plan = addArea(makePlan([{ points: ROOM, closed: true }]), 'L1', { x: 3, y: 2 }, 'Bathroom').plan
    plan = addFurniture(plan, 'L1', { kind: 'toilet', at: { x: 5, y: 0.5 }, angle: 0, width: 0.4, depth: 0.7 })!.plan
    plan = put(plan, 'sewer', { x: 9, y: 2 })
    const result = coordinated(plan)
    const drains = result.lines.filter((item) => item.kind === 'drain')
    expect(drains.length).toBeGreaterThan(0)
    const diagonal = drains.flatMap((drain) =>
      drain.pts.slice(1).filter((point, index) => {
        const previous = drain.pts[index]
        return Math.hypot(point.x - previous.x, point.y - previous.y) > 1e-6 && Math.abs(point.z - previous.z) > 1e-6
      }),
    )
    expect(diagonal.length).toBeGreaterThan(0)
    expect(result.trenches.filter((trench) => trench.system === 'drains').every((trench) => trench.depth >= MEP.screed)).toBe(true)
  })

  it('uses the actual building floor level for a gas-entry sleeve on a plinth', () => {
    let plan = addArea(makePlan([{ points: ROOM, closed: true }]), 'L1', { x: 3, y: 2 }, 'Kitchen').plan
    plan = { ...plan, layers: plan.layers.map((layer) => ({ ...layer, level: 0.3 })) }
    plan = addFurniture(plan, 'L1', { kind: 'appliance', style: 'oven', at: { x: 2, y: 0.4 }, angle: 0, width: 0.6, depth: 0.6 })!.plan
    plan = put(plan, 'gas-meter', { x: 3, y: 8 })
    const result = coordinated(plan, () => 0.3)
    const sleeve = result.crossings.find((crossing) => crossing.system === 'gas' && crossing.way === 'wall')
    expect(sleeve?.at.z).toBeCloseTo(0.3 + MEP.gasEntry)
    expect(result.spots.find((spot) => spot.detail === 'gas-entry')?.at.z).toBeCloseTo(0.3 + MEP.gasEntry)
  })
})
