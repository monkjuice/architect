import { describe, expect, it } from 'vitest'
import { houseSolids } from './solids'
import { materialsList } from './takeoff'
import { plumbingPlan } from './plumbing'
import { serviceInfo } from './services'
import { makePlan } from './testPlan'
import type { Furniture, Plan, Service, ServiceKind } from './plan'
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

function bathroom(): Plan {
  const plan = makePlan([{ points: rectangle, closed: true }])
  const furniture: Record<string, Furniture> = {
    sink: { kind: 'sink', style: 'bathroom', at: { x: 4, y: 1 }, angle: 0, width: 0.6, depth: 0.45 },
    toilet: { kind: 'toilet', at: { x: 6, y: 1 }, angle: 0, width: 0.4, depth: 0.7 },
  }
  return {
    ...plan,
    layers: [
      {
        ...plan.layers[0],
        areas: { bath: { name: 'Bathroom', at: { x: 5, y: 2 } } },
        furniture,
        services: {
          source: service('mains-water', { x: -2, y: 2 }),
          heater: service('heater-electric', { x: 2, y: 1 }),
          waste: service('sewer', { x: 12, y: 2 }),
        },
      },
    ],
  }
}

describe('plumbingPlan', () => {
  it('routes cold, hot and waste water through placed equipment and inferred fixtures', () => {
    const result = plumbingPlan(bathroom())

    expect(result.points.map((point) => point.title)).toEqual(expect.arrayContaining(['Bathroom sink', 'Toilet']))
    expect(result.runs.map((run) => run.kind)).toEqual(expect.arrayContaining(['cold', 'hot', 'drain']))
    expect(result.summary.heaters).toHaveLength(1)
    expect(result.summary.sewer).toBe(true)
    expect(result.traps).toHaveLength(1)
    expect(result.chambers.length).toBeGreaterThan(0)
    expect(result.problems).not.toEqual(expect.arrayContaining([expect.stringMatching(/Nothing supplies|drains end nowhere/)]))
    expect(result.notes).toEqual(expect.arrayContaining([expect.stringMatching(/Electricity tab/)]))
  })

  it('adds its derived pipes, fittings, fixtures and equipment to the material list', () => {
    const plan = bathroom()
    const keys = materialsList(plan, houseSolids(plan)).map((row) => row.key)

    expect(keys).toEqual(expect.arrayContaining(['water.pipe20', 'water.fittings', 'fixture.connection', 'drain.pipe110', 'service.mains-water', 'service.heater-electric', 'service.sewer']))
  })
})
