import { describe, expect, it } from 'vitest'
import { addArea, addFurniture, addService, setApplianceFuel, setGasMaterial } from './edit'
import { BURNS, CYLINDER, STORAGE_HEATER_LOADS, burnsOf, equivalentLength, gasPlan, renouardFlow } from './gas'
import type { Plan, Service, ServiceKind } from './plan'
import { parsePlanText, serializePlan } from './planFile'
import { serviceInfo } from './services'
import { gasRows } from './takeoff'
import { makePlan } from './testPlan'

const ROOM = [
  { x: 0, y: 0 },
  { x: 6, y: 0 },
  { x: 6, y: 4 },
  { x: 0, y: 4 },
]

function house(name = 'Kitchen'): Plan {
  return addArea(makePlan([{ points: ROOM, closed: true }]), 'L1', { x: 3, y: 2 }, name).plan
}

function put(plan: Plan, kind: ServiceKind, at: { x: number; y: number }, patch: Partial<Service> = {}): Plan {
  const info = serviceInfo(kind)
  return addService(plan, 'L1', { kind, at, angle: 0, width: info.width, depth: info.depth, ...patch })!.plan
}

function cooker(plan: Plan): { plan: Plan; id: string } {
  return addFurniture(plan, 'L1', { kind: 'appliance', style: 'oven', at: { x: 2, y: 0.4 }, angle: 0, width: 0.6, depth: 0.6 })!
}

describe('gas planning assumptions', () => {
  it('uses Renouard linear with a 20% equivalent-length allowance', () => {
    expect(equivalentLength(10)).toBe(12)
    expect(renouardFlow(12.42, 10, 0.65)).toBeCloseTo(1.02, 2)
    expect(renouardFlow(12.42, 20, 0.65)).toBeLessThan(renouardFlow(12.42, 10, 0.65))
  })

  it('uses the published stepped storage-heater loads', () => {
    expect(STORAGE_HEATER_LOADS.map(({ litres }) => [litres, burnsOf('heater-gas', litres)])).toEqual(
      STORAGE_HEATER_LOADS.map(({ litres, kcal }) => [litres, kcal]),
    )
    expect(burnsOf('heater-gas', 200)).toBeGreaterThanOrEqual(8000)
  })

  it('treats a two-cylinder LPG cabinet as one active and one reserve in cold weather', () => {
    let plan = put(cooker(house()).plan, 'gas-cylinders', { x: 3, y: 7 })
    const gas = gasPlan(plan)
    expect(gas.capacity * 22400).toBeCloseTo(CYLINDER.coldKcalPerHour)
    expect(gas.problems.join(' ')).toMatch(/cylinders give a conservative/)
    plan = put(plan, 'gas-outlet', { x: 5.7, y: 2 })
    expect(gasPlan(plan).capacity).toBe(gas.capacity)
  })
})

describe('gas safety and coordination', () => {
  it('derives ventilation and exhaust before a supply is placed', () => {
    let plan = cooker(house()).plan
    plan = put(plan, 'boiler', { x: 5.7, y: 2 }, { angle: 270 })
    const gas = gasPlan(plan)
    expect(gas.runs).toHaveLength(0)
    expect(gas.vents).toEqual([expect.objectContaining({ room: 'Kitchen', count: 2 })])
    expect(gas.flues).toEqual([expect.objectContaining({ kind: 'balanced-wall' })])
    expect(gas.problems.join(' ')).toMatch(/nothing supplies it/)
  })

  it('does not combine multiple meters into one capacity', () => {
    let plan = put(cooker(house()).plan, 'gas-meter', { x: 2, y: 7 })
    plan = put(plan, 'gas-meter', { x: 4, y: 7 })
    const gas = gasPlan(plan)
    expect(gas.supply).toHaveLength(1)
    expect(gas.capacity).toBe(6)
    expect(gas.problems.join(' ')).toMatch(/cannot be combined automatically/)
  })

  it('warns when an open appliance has no identified room', () => {
    const gas = gasPlan(cooker(makePlan([{ points: ROOM, closed: true }])).plan)
    expect(gas.appliances[0]).toMatchObject({ open: true, room: '' })
    expect(gas.problems.join(' ')).toMatch(/takes combustion air from the room/)
  })

  it('keeps balanced terminals distinct from vertical flues in the takeoff', () => {
    let plan = put(house(), 'boiler', { x: 5.7, y: 2 }, { angle: 270 })
    plan = put(plan, 'heater-gas', { x: 0.3, y: 2 }, { angle: 90 })
    const rows = gasRows(gasPlan(plan))
    expect(rows.find((row) => row.key === 'gas.terminal')?.quantity).toBe(1)
    expect(rows.find((row) => row.key === 'gas.flue')?.quantity).toBeGreaterThan(0)
    expect(rows.find((row) => row.key === 'gas.cap')?.quantity).toBe(1)
  })

  it('persists material and cooker-fuel choices', () => {
    const added = cooker(house())
    const ref = { layer: 'L1', kind: 'furniture' as const, id: added.id }
    let plan = setGasMaterial(added.plan, 'inside', 'steel')
    plan = setApplianceFuel(plan, ref, 'electric')
    const loaded = parsePlanText(serializePlan(plan))
    expect(loaded.ok).toBe(true)
    if (loaded.ok) expect(loaded.plan.gas).toEqual(plan.gas)
    expect(gasPlan(plan).load).toBe(0)
    expect(BURNS.cooker).toBeGreaterThan(0)
  })
})
