import { describe, expect, it } from 'vitest'
import { addCalibration, createBaseImage } from './baseImage'
import { createPlan } from './plan'
import { parsePlan, parsePlanText, serializePlan } from './planFile'
import { LOT, makePlan } from './testPlan'

describe('plan files', () => {
  it('round-trips a plan with an image and drawn lines', () => {
    const img = createBaseImage('data:image/png;base64,AAAA', 800, 500)
    const plan = { ...makePlan([{ points: LOT, closed: true }]), image: addCalibration(img, { x: 0, y: 0 }, { x: 10, y: 0 }, 28) }
    const text = serializePlan(plan)
    const parsed = parsePlanText(text)
    expect(parsed.ok).toBe(true)
    if (parsed.ok) expect(serializePlan(parsed.plan)).toBe(text)
  })

  it('opens files from before areas and open edges', () => {
    const plan = makePlan([{ points: LOT, closed: true }])
    const old = JSON.parse(serializePlan(plan))
    delete old.layers[0].areas
    const parsed = parsePlan(old)
    expect(parsed.ok && parsed.plan.layers[0].areas).toEqual({})
    expect(parsed.ok && Object.values(parsed.plan.layers[0].segments).every((s) => s.kind === undefined)).toBe(true)
  })

  it('rejects an unknown segment kind', () => {
    const plan = makePlan([{ points: [{ x: 0, y: 0 }, { x: 1, y: 0 }] }])
    const raw = JSON.parse(serializePlan(plan))
    raw.layers[0].segments.s1.kind = 'window'
    expect(parsePlan(raw).ok).toBe(false)
  })

  it('keeps a wall’s own thickness and height, and rejects a thickness of zero', () => {
    const plan = makePlan([{ points: [{ x: 0, y: 0 }, { x: 1, y: 0 }] }])
    const raw = JSON.parse(serializePlan(plan))
    raw.layers[0].segments.s1 = { ...raw.layers[0].segments.s1, thickness: 0.2, height: 3.1 }
    const parsed = parsePlan(raw)
    expect(parsed.ok && parsed.plan.layers[0].segments.s1).toEqual({ a: 'v1', b: 'v2', thickness: 0.2, height: 3.1 })
    raw.layers[0].segments.s1.thickness = 0
    expect(parsePlan(raw).ok).toBe(false)
  })

  it('rounds coordinates to 0.1 mm', () => {
    const plan = makePlan([{ points: [{ x: 1.23456789, y: 0 }, { x: 2, y: 0 }] }])
    const parsed = parsePlanText(serializePlan(plan))
    expect(parsed.ok && parsed.plan.layers[0].vertices.v1.x).toBe(1.2346)
  })

  it('rejects other files, newer versions and broken references with a readable message', () => {
    expect(parsePlanText('{').ok).toBe(false)
    expect(parsePlan({ format: 'something-else' })).toEqual({ ok: false, errors: ['Not an Architect plan: expected "format": "architect/plan".'] })
    const newer = parsePlan({ ...createPlan(), schemaVersion: 99 })
    expect(!newer.ok && newer.errors[0]).toMatch(/schema version 99/)
    const broken = createPlan()
    broken.layers[0].segments = { s1: { a: 'v1', b: 'v2' } }
    const result = parsePlan(broken)
    expect(!result.ok && result.errors[0]).toBe('layers (L1).segments.s1: vertex "v1" does not exist')
    const badColour = parsePlan({ ...createPlan(), layers: [{ ...createPlan().layers[0], color: 'blue' }] })
    expect(!badColour.ok && badColour.errors[0]).toBe('layers[0] (L1).color: colours are "#rrggbb"')
  })
})
