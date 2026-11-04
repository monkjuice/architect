import { describe, expect, it } from 'vitest'
import { addArea, addSegment, addVertex, draftLayer, drawSegment, replaceLayer, setAreaFloor, setSegmentKind, setWallFinish } from './edit'
import { elevation, elevationViews } from './elevations'
import { faceLine, finishProblem, sideNormal, sideOf, wallSide } from './finishes'
import type { Vec } from './geometry'
import { findMaterial, materialGroups, MATERIALS, suits } from './materials'
import { createPlan, type Plan } from './plan'
import { parsePlan, serializePlan } from './planFile'
import { layerFaces } from './regions'
import { houseSolids } from './solids'

/** A closed 10 × 4 room named "Living": s1 is its top wall, from (0,0) to (10,0), its left side the outside. */
function room(): Plan {
  const plan = createPlan()
  const d = draftLayer(plan.layers[0])
  const ids = [
    { x: 0, y: 0 },
    { x: 10, y: 0 },
    { x: 10, y: 4 },
    { x: 0, y: 4 },
  ].map((p: Vec) => addVertex(d, p))
  ids.forEach((id, i) => addSegment(d, id, ids[(i + 1) % ids.length]))
  return addArea(replaceLayer(plan, d), 'L1', { x: 5, y: 2 }, 'Living').plan
}

const areaId = (plan: Plan) => Object.keys(plan.layers[0].areas)[0]
const material = (id: string) => findMaterial(id)!

describe('materials', () => {
  it('has unique ids, and each one fits somewhere', () => {
    expect(new Set(MATERIALS.map((m) => m.id)).size).toBe(MATERIALS.length)
    for (const m of MATERIALS) expect(m.surfaces.length > 0 && (m.indoor || m.outdoor)).toBe(true)
  })

  it('lists what suits a surface by family, outdoors or in', () => {
    const indoorFloors = materialGroups('floor', false).flatMap((g) => g.materials.map((m) => m.id))
    expect(indoorFloors).toContain('wood-oak')
    expect(indoorFloors).not.toContain('grass')
    expect(materialGroups('floor', true).flatMap((g) => g.materials.map((m) => m.id))).toContain('grass')
    // either, when it is not known
    const floors = materialGroups('floor').flatMap((g) => g.materials)
    expect(floors.map((m) => m.id)).toEqual(expect.arrayContaining(['grass', 'wood-oak']))
    expect(floors.every((m) => m.surfaces.includes('floor'))).toBe(true)
    // one heading per family, in catalogue order
    const families = materialGroups('wall').map((g) => g.group)
    expect(new Set(families).size).toBe(families.length)
    expect(families[0]).toBe('Plaster and paint')
    expect(suits(material('stone-cladding'), 'wall', false)).toBe(false)
  })

  it('says why a material does not suit a wall side or a floor', () => {
    expect(finishProblem(material('tile-light'), 'floor', false)).toBeNull()
    expect(finishProblem(material('plaster-white'), 'floor', false)).toMatch(/not for floors/)
    expect(finishProblem(material('grass'), 'floor', false)).toMatch(/for outdoors/)
    expect(finishProblem(material('stone-cladding'), 'wall', false)).toMatch(/faces a room/)
  })
})

describe('wall sides', () => {
  const a = { x: 0, y: 0 }
  const b = { x: 10, y: 0 }

  it('names a side looking from a to b, +y down', () => {
    expect(sideNormal(a, b, 'left')).toEqual({ x: 0, y: -1 })
    expect(sideNormal(a, b, 'right')).toEqual({ x: -0, y: 1 })
    expect(sideOf(a, b, { x: 3, y: -1 })).toBe('left')
    expect(sideOf(a, b, { x: 3, y: 1 })).toBe('right')
  })

  it('tells what each side faces, and where its face is', () => {
    const layer = room().layers[0]
    const { regions } = layerFaces(layer)
    expect(wallSide(layer, regions, 0.15, 's1', 'left')).toEqual({ region: null, outdoor: true })
    const inside = wallSide(layer, regions, 0.15, 's1', 'right')
    expect(inside.outdoor).toBe(false)
    expect(inside.region?.indoor).toBe(true)
    expect(faceLine(layer, 's1', 'right', 0.15)).toEqual([
      { x: 0, y: 0.15 },
      { x: 10, y: 0.15 },
    ])
  })
})

describe('setWallFinish and setAreaFloor', () => {
  it('puts a material on one side of a wall, and takes it off with null', () => {
    let plan = setWallFinish(room(), 'L1', 's1', 'right', 'tile-light')
    plan = setWallFinish(plan, 'L1', 's1', 'left', 'brick-red')
    expect(plan.layers[0].segments.s1.finish).toEqual({ left: 'brick-red', right: 'tile-light' })
    expect(setWallFinish(plan, 'L1', 's1', 'left', 'brick-red')).toBe(plan)
    plan = setWallFinish(setWallFinish(plan, 'L1', 's1', 'left', null), 'L1', 's1', 'right', null)
    expect(plan.layers[0].segments.s1).toEqual({ a: 'v1', b: 'v2' })
  })

  it('finishes walls only, and keeps a finish through a split and a switch to an open edge and back', () => {
    const edge = { layer: 'L1', kind: 'segment' as const, id: 's1' }
    const open = setSegmentKind(room(), [edge], 'open')
    expect(setWallFinish(open, 'L1', 's1', 'left', 'brick-red')).toBe(open)
    let plan = setWallFinish(room(), 'L1', 's1', 'left', 'brick-red')
    plan = setSegmentKind(setSegmentKind(plan, [edge], 'open'), [edge], 'wall')
    expect(plan.layers[0].segments.s1.finish).toEqual({ left: 'brick-red' })
    plan = drawSegment(plan, 'L1', { point: { x: 5, y: 0 }, kind: 'edge', layer: 'L1', segment: 's1' }, { point: { x: 5, y: 4 }, kind: 'free' })!.plan
    const top = Object.values(plan.layers[0].segments).filter((s) => plan.layers[0].vertices[s.a].y === 0 && plan.layers[0].vertices[s.b].y === 0)
    expect(top.map((s) => s.finish)).toEqual([{ left: 'brick-red' }, { left: 'brick-red' }])
  })

  it('puts a material on the floor of areas', () => {
    const plan = room()
    const ref = { layer: 'L1', kind: 'area' as const, id: areaId(plan) }
    const floored = setAreaFloor(plan, [ref], 'wood-oak')
    expect(floored.layers[0].areas[ref.id].floor).toBe('wood-oak')
    expect(setAreaFloor(floored, [ref], 'wood-oak')).toBe(floored)
    expect(setAreaFloor(floored, [ref], null).layers[0].areas[ref.id]).not.toHaveProperty('floor')
  })

  it('keeps finishes through the file', () => {
    let plan = setWallFinish(room(), 'L1', 's1', 'right', 'plaster-sand')
    plan = setAreaFloor(plan, [{ layer: 'L1', kind: 'area', id: areaId(plan) }], 'tile-terracotta')
    const parsed = parsePlan(JSON.parse(serializePlan(plan)))
    expect(parsed.ok && parsed.plan.layers[0].segments.s1.finish).toEqual({ right: 'plaster-sand' })
    expect(parsed.ok && Object.values(parsed.plan.layers[0].areas)[0].floor).toBe('tile-terracotta')
  })
})

describe('finishes in 3D and in elevation', () => {
  const finished = () => {
    let plan = setWallFinish(room(), 'L1', 's1', 'left', 'brick-red')
    plan = setWallFinish(plan, 'L1', 's1', 'right', 'tile-light')
    return setAreaFloor(plan, [{ layer: 'L1', kind: 'area', id: areaId(plan) }], 'wood-oak')
  }

  it('finishes the faces of each side of a wall, and a floor all over', () => {
    const solids = houseSolids(finished())
    const wall = solids.find((s) => s.kind === 'wall' && s.ref.id === 's1')!
    const outside = wall.faces.filter((f) => f.normal.y < -0.99)
    const inside = wall.faces.filter((f) => f.normal.y > 0.99)
    expect(outside.length).toBeGreaterThan(0)
    expect(inside.length).toBeGreaterThan(0)
    expect(outside.every((f) => f.finish === 'brick-red')).toBe(true)
    expect(inside.every((f) => f.finish === 'tile-light')).toBe(true)
    // the top stays in the wall's own material
    expect(wall.faces.filter((f) => Math.abs(f.normal.z) > 0.99).every((f) => !f.finish)).toBe(true)
    // its ends are split at the centreline, each half in its side's finish (the outside is y < 0)
    const ends = wall.faces.filter((f) => Math.abs(f.normal.z) < 0.01 && Math.abs(f.normal.y) < 0.99)
    expect(ends.length).toBeGreaterThan(0)
    for (const f of ends) expect(f.finish).toBe(f.pts.every((p) => p.y <= 1e-9) ? 'brick-red' : 'tile-light')
    expect(ends.filter((f) => f.finish === 'brick-red').length).toBe(ends.filter((f) => f.finish === 'tile-light').length)
    const other = solids.find((s) => s.kind === 'wall' && s.ref.id === 's2')!
    expect(other.faces.every((f) => !f.finish)).toBe(true)
    expect(solids.find((s) => s.kind === 'floor')!.finish).toBe('wood-oak')
  })

  it('ignores a material that is not in the catalogue', () => {
    const plan = setWallFinish(room(), 'L1', 's1', 'left', 'unobtainium')
    const wall = houseSolids(plan).find((s) => s.kind === 'wall' && s.ref.id === 's1')!
    expect(wall.faces.every((f) => !f.finish)).toBe(true)
  })

  it('draws a finished facade in its material', () => {
    const plan = finished()
    const solids = houseSolids(plan)
    // the outside of s1, the top wall, faces one of the four views squarely (its ends show in the views either side)
    const seen = elevationViews(plan).map((v) => elevation(solids, v).polygons.some((p) => p.kind === 'wall' && p.finish === 'brick-red' && p.facing > 0.99))
    expect(seen.filter(Boolean)).toHaveLength(1)
  })
})
