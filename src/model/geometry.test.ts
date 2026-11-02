import { describe, expect, it } from 'vitest'
import {
  closestOnSegment,
  constrainAngle,
  lineSegmentIntersection,
  normalizeAngle,
  parseLength,
  polygonArea,
  polylineLength,
  screenAngleDeg,
} from './geometry'
import { LOT } from './testPlan'

describe('constrainAngle', () => {
  it('projects onto the nearest 45° ray and keeps axis-aligned results exact', () => {
    const origin = { x: 1.1, y: 2.3 }
    expect(constrainAngle(origin, { x: 1.15, y: 7 }).point.x).toBe(1.1)
    expect(constrainAngle(origin, { x: 9, y: 2.25 }).point.y).toBe(2.3)
    const diagonal = constrainAngle({ x: 0, y: 0 }, { x: 3, y: 2.6 }).point
    expect(diagonal.x).toBeCloseTo(diagonal.y, 12)
  })
})

describe('segments', () => {
  it('finds the closest point, clamped to the ends', () => {
    expect(closestOnSegment({ x: 5, y: 3 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toMatchObject({ point: { x: 5, y: 0 }, t: 0.5, dist: 3 })
    expect(closestOnSegment({ x: -4, y: 0 }, { x: 0, y: 0 }, { x: 10, y: 0 }).t).toBe(0)
  })

  it('intersects a line with a segment', () => {
    const hit = lineSegmentIntersection({ x: 0, y: 5 }, { x: 1, y: 0 }, { x: 7, y: 0 }, { x: 7, y: 10 })
    expect(hit).toMatchObject({ point: { x: 7, y: 5 }, t: 7, u: 0.5 })
    expect(lineSegmentIntersection({ x: 0, y: 20 }, { x: 1, y: 0 }, { x: 7, y: 0 }, { x: 7, y: 10 })).toBeNull()
    expect(lineSegmentIntersection({ x: 0, y: 5 }, { x: 0, y: 1 }, { x: 7, y: 0 }, { x: 7, y: 10 })).toBeNull()
  })
})

describe('measuring', () => {
  it('computes the area and perimeter of the sample lot', () => {
    expect(polygonArea(LOT)).toBeCloseTo(855.38, 2)
    expect(polylineLength(LOT, true)).toBeCloseTo(28 + 30.71 + 25 + Math.hypot(3, 3) + 27.71, 6)
  })

  it('reports screen angles counter-clockwise from +x', () => {
    expect(screenAngleDeg({ x: 0, y: 0 }, { x: 1, y: 0 })).toBe(0)
    expect(screenAngleDeg({ x: 0, y: 0 }, { x: 0, y: -1 })).toBe(90)
    expect(screenAngleDeg({ x: 0, y: 0 }, { x: 0, y: 1 })).toBe(270)
  })

  it('wraps angles into (-π, π]', () => {
    expect(normalizeAngle(3 * Math.PI)).toBeCloseTo(Math.PI, 12)
    expect(normalizeAngle(-Math.PI)).toBeCloseTo(Math.PI, 12)
    expect(normalizeAngle(0.25)).toBe(0.25)
  })
})

describe('parseLength', () => {
  it('accepts dots, commas and a trailing unit', () => {
    expect(parseLength('28,00')).toBe(28)
    expect(parseLength(' 4.5 m')).toBe(4.5)
    expect(parseLength('.75')).toBe(0.75)
  })

  it('rejects empty and non-numeric text', () => {
    expect(parseLength('')).toBeNaN()
    expect(parseLength('abc')).toBeNaN()
    expect(parseLength('1,2,3')).toBeNaN()
  })
})
