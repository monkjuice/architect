import { describe, expect, it } from 'vitest'
import {
  addCircuit,
  addElectrical,
  addOpening,
  deleteItems,
  moveCircuit,
  removeCircuit,
  setBoardAreas,
  setBoardParent,
  setPointCircuit,
} from './edit'
import { boardCovers, boardFor, boardKey, boardOfPoint, electricTarget, loadOf } from './electrical'
import { layerFaces, layerRegions } from './regions'
import { parsePlan, serializePlan } from './planFile'
import { makePlan } from './testPlan'
import type { Board, Electrical, Layer, Plan } from './plan'

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

const mainBoard = (circuits: Board['circuits'] = {}): Board => ({
  kind: 'board',
  name: 'Main board',
  supply: 'triphasic',
  layers: ['L1'],
  areas: [],
  circuits,
  mount: 'wall',
  at: { x: 0.15, y: 1 },
  angle: 270,
})

const add = (plan: Plan, item: Electrical) => addElectrical(plan, 'L1', item)!
const thickness = (layer: Layer, segment: string) => layerFaces(layer).thickness.get(segment) ?? 0.15

describe('electrical placement', () => {
  it('snaps wall boxes clear of openings and ceiling points to a room centre', () => {
    const plan = room()
    const wall = electricTarget(plan, { x: 5, y: 0.2 }, { kind: 'switch', mount: 'wall', layer: 'L1', reach: 0.6, thickness, regions: layerRegions })!
    expect(wall.problem).toBeUndefined()
    expect(wall.at).toEqual({ x: 5, y: 0.15 })

    const withDoor = addOpening(plan, 'L1', { kind: 'door', style: 'single', segment: 's1', offset: 5, width: 0.8, hinge: 'a', swing: 'left' })!.plan
    expect(electricTarget(withDoor, { x: 5, y: 0.2 }, { kind: 'switch', mount: 'wall', layer: 'L1', reach: 0.6, thickness, regions: layerRegions })?.problem).toMatch(/doorway/)

    const ceiling = electricTarget(plan, { x: 5.1, y: 2.1 }, { kind: 'light', mount: 'ceiling', layer: 'L1', reach: 0.6, thickness, regions: layerRegions, snapReach: 0.15 })!
    expect(ceiling.at.x).toBeCloseTo(5)
    expect(ceiling.at.y).toBeCloseTo(2)
    expect(ceiling.guides).toHaveLength(2)

    const outdoors = electricTarget(plan, { x: 12, y: 2 }, { kind: 'light', mount: 'floor', layer: 'L1', reach: 0.6, thickness, regions: layerRegions })!
    expect(outdoors.problem).toBeUndefined()
    expect(outdoors.at).toEqual({ x: 12, y: 2 })
  })

  it('uses explicit power or the design load for each point kind', () => {
    expect(loadOf({ kind: 'switch', mount: 'wall', at: { x: 0, y: 0 }, angle: 0 })).toBe(0)
    expect(loadOf({ kind: 'light', mount: 'ceiling', at: { x: 0, y: 0 }, angle: 0 })).toBe(100)
    expect(loadOf({ kind: 'socket', mount: 'wall', use: 'general', at: { x: 0, y: 0 }, angle: 0 })).toBe(200)
    expect(loadOf({ kind: 'socket', mount: 'wall', use: 'special', power: 3600, at: { x: 0, y: 0 }, angle: 0 })).toBe(3600)
  })
})

describe('boards and circuits', () => {
  it('defaults an area to its sub-board but lets a covering main-board circuit override it', () => {
    let plan = add(room(), mainBoard({ c1: { type: 'lighting', name: 'Whole-house lighting', layer: 'L1' } })).plan
    const sub: Board = {
      ...mainBoard(),
      name: 'Living board',
      layers: [],
      areas: [{ layer: 'L1', area: 'a1' }],
      parent: { layer: 'L1', board: 'e1' },
      integrated: true,
      at: { x: 0.15, y: 1.6 },
    }
    plan = add(plan, sub).plan
    const point = { kind: 'light', mount: 'ceiling', at: { x: 5, y: 2 }, angle: 0 } as const
    const byArea = boardFor(plan, 'L1', point, layerRegions)!
    expect(boardKey({ layer: byArea.layer.id, id: byArea.id })).toBe('L1:e2')

    const main = boardFor(plan, 'L1', { ...point, at: { x: 12, y: 2 } }, layerRegions)!
    expect(main.id).toBe('e1')
    expect(boardCovers(plan, main, 'L1', point, layerRegions)).toBe(true)
    expect(boardOfPoint(plan, 'L1', { ...point, circuit: 'c1' }, layerRegions)?.id).toBe('e1')
  })

  it('keeps circuit ids unique, moves their points, and clears points when removed', () => {
    let plan = add(room(), mainBoard()).plan
    plan = add(plan, { ...mainBoard(), name: 'Second board', layers: [] }).plan
    const first = addCircuit(plan, 'L1', 'e1', 'lighting', 'L1', 'Living lighting')!
    plan = first.plan
    const second = addCircuit(plan, 'L1', 'e2', 'sockets', 'L1', 'Living sockets')!
    plan = second.plan
    expect([first.id, second.id]).toEqual(['c1', 'c2'])

    const placed = add(plan, { kind: 'light', mount: 'ceiling', at: { x: 5, y: 2 }, angle: 0, circuit: first.id })
    plan = placed.plan
    const moved = moveCircuit(plan, { layer: 'L1', id: 'e1' }, first.id, { layer: 'L1', id: 'e2' }, [{ layer: 'L1', id: placed.id }])!
    expect((moved.plan.layers[0].electrical.e2 as Board).circuits[first.id].name).toBe('Living lighting')
    expect((moved.plan.layers[0].electrical.e1 as Board).circuits[first.id]).toBeUndefined()

    const cleared = removeCircuit(moved.plan, 'L1', 'e2', first.id)
    const clearedPoint = cleared.layers[0].electrical[placed.id]
    expect(clearedPoint.kind).toBe('light')
    if (clearedPoint.kind === 'board') throw new Error('Expected a point')
    expect(clearedPoint.circuit).toBeUndefined()
    expect(setPointCircuit(cleared, 'L1', placed.id, null)).toBe(cleared)
  })

  it('gives each area to one sub-board and refuses a parent loop', () => {
    let plan = add(room(), mainBoard()).plan
    const child = (name: string, parent: string): Board => ({ ...mainBoard(), name, layers: [], parent: { layer: 'L1', board: parent }, at: { x: 0.15, y: 2 }, areas: [] })
    plan = add(plan, child('First sub-board', 'e1')).plan
    plan = add(plan, child('Second sub-board', 'e1')).plan
    plan = setBoardAreas(plan, 'L1', 'e2', [{ layer: 'L1', area: 'a1' }])
    plan = setBoardAreas(plan, 'L1', 'e3', [{ layer: 'L1', area: 'a1' }])
    expect((plan.layers[0].electrical.e2 as Board).areas).toEqual([])
    expect((plan.layers[0].electrical.e3 as Board).areas).toEqual([{ layer: 'L1', area: 'a1' }])
    expect(setBoardParent(plan, 'L1', 'e1', { layer: 'L1', board: 'e3' })).toBe(plan)

    const deleted = deleteItems(plan, [{ layer: 'L1', kind: 'electrical', id: 'e1' }])
    expect((deleted.layers[0].electrical.e2 as Board).parent).toBeUndefined()
    expect((deleted.layers[0].electrical.e3 as Board).parent).toBeUndefined()
  })
})

describe('electrical plan files', () => {
  it('round-trips boards and points while old files default to no electrical items', () => {
    let plan = add(room(), mainBoard({ c1: { type: 'lighting', name: 'Living', layer: 'L1' } })).plan
    plan = add(plan, { kind: 'light', mount: 'floor', post: 0.8, power: 30, at: { x: 12, y: 2 }, angle: 0, circuit: 'c1' }).plan
    const parsed = parsePlan(JSON.parse(serializePlan(plan)))
    expect(parsed.ok && parsed.plan.layers[0].electrical).toEqual(plan.layers[0].electrical)

    const old = JSON.parse(serializePlan(plan))
    delete old.layers[0].electrical
    const oldParsed = parsePlan(old)
    expect(oldParsed.ok && oldParsed.plan.layers[0].electrical).toEqual({})
  })
})
