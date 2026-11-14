import { describe, expect, it } from 'vitest'
import { addElectrical } from './edit'
import { boardKey } from './electrical'
import { houseSolids } from './solids'
import { materialsList } from './takeoff'
import { layerRegions } from './regions'
import { storeyOf, type Board, type Electrical, type Plan } from './plan'
import { makePlan } from './testPlan'
import { pointKey, wallGraph, wiringPlan } from './wiring'

const rectangle = [
  { x: 0, y: 0 },
  { x: 10, y: 0 },
  { x: 10, y: 4 },
  { x: 0, y: 4 },
]

function room(): Plan {
  const plan = makePlan([{ points: rectangle, closed: true }])
  return { ...plan, layers: plan.layers.map((layer) => ({ ...layer, areas: { a1: { name: 'Living', at: { x: 5, y: 2 } } } })) }
}

const board = (patch: Partial<Board> = {}): Board => ({
  kind: 'board',
  name: 'Main board',
  supply: 'triphasic',
  layers: ['L1'],
  areas: [],
  circuits: {},
  mount: 'wall',
  at: { x: 0.15, y: 1 },
  angle: 270,
  ...patch,
})

const add = (plan: Plan, item: Electrical) => addElectrical(plan, 'L1', item)!

function wired(plan: Plan) {
  return wiringPlan(plan, {
    regions: layerRegions,
    graph: (storey) => wallGraph(plan.layers.filter((layer) => layer.visible && storeyOf(layer) === storey)),
  })
}

describe('wallGraph', () => {
  it('splits crossing walls into a connected routing graph', () => {
    const plan = makePlan([
      { points: [{ x: 0, y: 0 }, { x: 10, y: 0 }] },
      { points: [{ x: 5, y: -5 }, { x: 5, y: 5 }] },
    ])
    const graph = wallGraph(plan.layers)
    const crossing = graph.nodes.findIndex((point) => point.x === 5 && point.y === 0)
    expect(crossing).toBeGreaterThanOrEqual(0)
    expect(graph.edges.filter((edge) => edge.u === crossing || edge.v === crossing)).toHaveLength(4)
  })
})

describe('wiringPlan', () => {
  it('keeps manual circuits first, groups the rest, and sizes each circuit', () => {
    let plan = add(room(), board({ circuits: { c1: { type: 'lighting', name: 'Living lights', layer: 'L1' } } })).plan
    const points: Electrical[] = [
      { kind: 'switch', mount: 'wall', at: { x: 1, y: 0.15 }, angle: 0, circuit: 'c1' },
      { kind: 'light', mount: 'ceiling', at: { x: 5, y: 2 }, angle: 0, circuit: 'c1' },
      { kind: 'socket', mount: 'wall', use: 'general', at: { x: 2, y: 3.85 }, angle: 180 },
      { kind: 'socket', mount: 'wall', use: 'special', power: 2200, at: { x: 8, y: 3.85 }, angle: 180 },
    ]
    const ids: string[] = []
    for (const point of points) {
      const placed = add(plan, point)
      plan = placed.plan
      ids.push(placed.id)
    }

    const wiring = wired(plan)
    const result = wiring.boards[0]
    expect(result.circuits.map((circuit) => circuit.type)).toEqual(['lighting', 'sockets', 'special'])
    const [lighting, sockets, special] = result.circuits
    expect(lighting).toMatchObject({ manualId: 'c1', label: 'Living lights', load: 100, breaker: 10, section: 1.5, earth: 2.5, plane: 'ceiling' })
    expect(sockets).toMatchObject({ load: 200, breaker: 16, section: 2.5, plane: 'floor' })
    expect(special).toMatchObject({ load: 2200, breaker: 16, section: 2.5, plane: 'floor' })
    for (const circuit of result.circuits) {
      expect(circuit.length).toBeGreaterThan(0)
      expect(circuit.drop).toBeLessThanOrEqual(3)
      expect(circuit.parts.walls + circuit.parts.vertical + circuit.parts.buried + circuit.parts.riser).toBeCloseTo(circuit.length)
    }
    expect(result.phaseLoads).toHaveLength(3)
    expect(wiring.feedOf.get(pointKey({ layer: 'L1', id: ids[0] }))).toBe('L1:e1')
    expect(wiring.circuitOf.get(pointKey({ layer: 'L1', id: ids[0] }))).toBe(lighting)
    expect(wiring.warnings).toEqual([])
  })

  it('routes outdoor floor points underground and exposes their materials', () => {
    let plan = add(room(), board()).plan
    const light = add(plan, { kind: 'light', mount: 'floor', post: 0.8, power: 30, at: { x: 12, y: 2 }, angle: 0 })
    plan = light.plan
    const circuit = wired(plan).boards[0].circuits[0]
    expect(circuit.type).toBe('lighting')
    expect(circuit.buriedLength).toBeGreaterThan(0)
    expect(circuit.buriedPipe).toBeDefined()
    expect(circuit.parts.buried).toBe(circuit.buriedLength)

    const rows = materialsList(plan, houseSolids(plan)).filter((row) => row.chapter === 'electricity')
    expect(rows.some((row) => row.key === 'elec.cable' && row.params.elecRole === 'buried')).toBe(true)
    expect(rows.some((row) => row.key === 'elec.conduit' && row.params.elecWay === 'buried')).toBe(true)
    expect(rows.some((row) => row.key === 'elec.earth')).toBe(true)
  })

  it('feeds an area from an integrated sub-board without a cable run or separate enclosure', () => {
    let plan = add(room(), board()).plan
    plan = add(
      plan,
      board({
        name: 'Living board',
        layers: [],
        areas: [{ layer: 'L1', area: 'a1' }],
        parent: { layer: 'L1', board: 'e1' },
        integrated: true,
        at: { x: 0.15, y: 1.6 },
      }),
    ).plan
    const light = add(plan, { kind: 'light', mount: 'ceiling', at: { x: 5, y: 2 }, angle: 0 })
    plan = light.plan

    const wiring = wired(plan)
    const parent = wiring.boards.find((entry) => entry.ref.id === 'e1')!
    const child = wiring.boards.find((entry) => entry.ref.id === 'e2')!
    const feeder = parent.circuits.find((circuit) => circuit.type === 'subfeeder')!
    expect(wiring.feedOf.get(pointKey({ layer: 'L1', id: light.id }))).toBe(boardKey(child.ref))
    expect(child.integrated).toBe(true)
    expect(child.place).toEqual(parent.place)
    expect(child.enclosure).toBe(0)
    expect(feeder).toMatchObject({ integrated: true, length: 0, conduit: '' })
    expect(parent.modules).toBeGreaterThan(child.modules)
  })
})
