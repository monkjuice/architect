import { describe, expect, it } from 'vitest'
import { addRoof, addSegment, addVertex, draftLayer, replaceLayer } from './edit'
import { elevation, elevationViews, mainDirection } from './elevations'
import type { Vec } from './geometry'
import { createPlan, type Plan } from './plan'
import { COVERING, newRoof } from './roofs'
import { houseSolids } from './solids'
import { WALL_HEIGHT } from './walls'

const rect = (x: number, y: number, w: number, h: number): Vec[] => [
  { x, y },
  { x: x + w, y },
  { x: x + w, y: y + h },
  { x, y: y + h },
]

/** A closed outline of walls, optionally turned by `angle` (radians) about the origin. */
function house(outline: Vec[], angle = 0): Plan {
  const plan = createPlan()
  const d = draftLayer(plan.layers[0])
  const turn = (p: Vec) => ({ x: p.x * Math.cos(angle) - p.y * Math.sin(angle), y: p.x * Math.sin(angle) + p.y * Math.cos(angle) })
  const ids = outline.map((p) => addVertex(d, turn(p)))
  ids.forEach((id, i) => addSegment(d, id, ids[(i + 1) % ids.length]))
  return replaceLayer(plan, d)
}

describe('elevations', () => {
  it('squares the views to the main walls and names them by the way they face', () => {
    const turned = house(rect(0, 0, 10, 4), 0.3)
    expect(mainDirection(turned)).toBeCloseTo(0.3)
    expect(elevationViews(house(rect(0, 0, 10, 4))).map((v) => v.name)).toEqual(['North', 'East', 'South', 'West'])
    // the survey's north points 38.6° clockwise from up, so the plan's top side faces north-west
    const plan = { ...house(rect(0, 0, 10, 4)), site: { ...createPlan().site, north: 38.6 } }
    const views = elevationViews(plan)
    expect(views.map((v) => v.name)).toEqual(['North-west', 'North-east', 'South-east', 'South-west'])
    expect(views[0].bearing).toBeCloseTo(321.4)
    expect(views[0].dir.x).toBeCloseTo(0)
    expect(views[0].dir.y).toBeCloseTo(1)
  })

  it('draws the faces facing the viewer, farthest first, with the house’s width and height', () => {
    let plan = house(rect(0, 0, 10, 4))
    // a 45° gable with its ridge along the 10 m sides and 0.5 m eaves
    plan = addRoof(plan, 'L1', { ...newRoof(rect(0, 0, 10, 4), 'gable'), pitch: 45 })!.plan
    const solids = houseSolids(plan)
    const [front, side] = elevationViews(plan).map((v) => elevation(solids, v))
    expect(front.bounds!.u1 - front.bounds!.u0).toBeCloseTo(11)
    expect(front.bounds!.z1).toBeCloseTo(WALL_HEIGHT + 2 + COVERING)
    // from the gable end the roof is 5 m across, eaves to eaves
    expect(side.bounds!.u1 - side.bounds!.u0).toBeCloseTo(5)
    // the far side's outer faces look away: none of the back wall's outside is drawn
    expect(front.polygons.some((p) => p.kind === 'wall' && p.pts.every((q) => Math.abs(q.y) < 1e-9 || Math.abs(q.y - WALL_HEIGHT) < 1e-9))).toBe(true)
    expect(front.polygons.at(-1)!.kind).not.toBe('floor')
    expect(front.levels[0]).toBe(0)
    expect(front.levels).toContain(WALL_HEIGHT)
    expect(front.levels.at(-1)).toBeCloseTo(WALL_HEIGHT + 2 + COVERING, 2)
  })

  it('has nothing to draw for an empty plan', () => {
    const e = elevation([], elevationViews(createPlan())[0])
    expect(e.bounds).toBeNull()
    expect(e.levels).toEqual([0])
  })
})
