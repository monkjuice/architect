import { describe, expect, it } from 'vitest'
import { hvacPlan, RADIANT } from './hvac'
import { plumbingPlan } from './plumbing'
import { serviceInfo } from './services'
import { houseSolids } from './solids'
import { materialsList } from './takeoff'
import { makePlan } from './testPlan'
import type { Plan, Service, ServiceKind } from './plan'
import type { Vec } from './geometry'

const rectangle = [
  { x: 0, y: 0 },
  { x: 10, y: 0 },
  { x: 10, y: 4 },
  { x: 0, y: 4 },
]

function service(kind: ServiceKind, at: Vec): Service {
  const info = serviceInfo(kind)
  return { kind, at, angle: 0, width: info.width, depth: info.depth }
}

function conditionedRoom(): Plan {
  const plan = makePlan([{ points: rectangle, closed: true }])
  return {
    ...plan,
    hvac: { materials: { heating: 'copper' } },
    layers: [
      {
        ...plan.layers[0],
        areas: { living: { name: 'Living', at: { x: 5, y: 2 }, radiant: true } },
        services: {
          boiler: service('boiler', { x: 1, y: 1 }),
          radiator: service('radiator', { x: 3, y: 0.2 }),
          manifold: service('underfloor-manifold', { x: 2, y: 0.2 }),
          indoor: service('split-indoor', { x: 7, y: 0.2 }),
          outdoor: service('split-outdoor', { x: 12, y: 2 }),
        },
      },
    ],
  }
}

describe('hvacPlan', () => {
  it('works out room loads, radiant loops and equipment runs with the chosen material', () => {
    const plan = conditionedRoom()
    const result = hvacPlan(plan)

    expect(result.rooms).toHaveLength(1)
    expect(result.rooms[0]).toMatchObject({ name: 'Living', radiant: true, loops: 3 })
    expect(result.rooms[0].heatNeed).toBeGreaterThan(0)
    expect(result.radiant.floor).toBeCloseTo(result.rooms[0].floor)
    expect(result.radiant.pipe).toBeGreaterThan(result.radiant.floor / RADIANT.spacing)
    expect(result.runs.map((run) => run.kind)).toEqual(expect.arrayContaining(['heating', 'radiant', 'refrigerant']))
    expect(result.runs.filter((run) => run.kind === 'heating' || run.kind === 'radiant').every((run) => run.material === 'copper')).toBe(true)
    expect(result.summary.power).toBe(3)
    expect(result.problems.join(' ')).toMatch(/Short of cooling/)
    expect(result.problems.join(' ')).not.toMatch(/nothing to feed|no underfloor manifold|no outdoor unit/i)
    expect(result.notes).toEqual(expect.arrayContaining([expect.stringMatching(/Electricity tab/)]))
  })

  it('links boiler fill, hot water and split condensate back into plumbing and takeoff', () => {
    const plan = conditionedRoom()
    const plumbing = plumbingPlan(plan)
    expect(plumbing.summary.linked.dhw).toHaveLength(1)
    expect(plumbing.summary.linked.condensate).toHaveLength(1)

    const keys = materialsList(plan, houseSolids(plan)).map((row) => row.key)
    expect(keys).toEqual(expect.arrayContaining(['heat.pipe', 'heat.underfloor', 'radiant.pipe', 'refrigerant.line', 'drain.condensate', 'service.boiler', 'service.split-indoor']))
  })
})
