import { describe, expect, it } from 'vitest'
import {
  addArea,
  addLayer,
  connectVertex,
  deleteItems,
  drawSegment,
  findVertexAt,
  moveAreas,
  moveLayer,
  moveSegments,
  removeLayer,
  segmentsAt,
  setAreaAnchors,
  setSegmentKind,
  setSegmentLength,
  setVertices,
  updateArea,
  updateLayer,
  updateWalls,
} from './edit'
import { dist } from './geometry'
import type { Layer, Plan } from './plan'
import type { Snap } from './snap'
import { makePlan } from './testPlan'

const free = (x: number, y: number): Snap => ({ point: { x, y }, kind: 'free' })
const layer = (plan: Plan, i = 0): Layer => plan.layers[i]
const count = (l: Layer) => ({ vertices: Object.keys(l.vertices).length, segments: Object.keys(l.segments).length })

describe('drawSegment', () => {
  it('adds two vertices and a segment, leaving the original plan untouched', () => {
    const plan = makePlan()
    const result = drawSegment(plan, 'L1', free(0, 0), free(4, 0))!
    expect(count(layer(result.plan))).toEqual({ vertices: 2, segments: 1 })
    expect(count(layer(plan))).toEqual({ vertices: 0, segments: 0 })
  })

  it('continues a chain from an existing vertex and reuses vertices it lands on', () => {
    const first = drawSegment(makePlan(), 'L1', free(0, 0), free(4, 0))!
    const second = drawSegment(first.plan, 'L1', first.b, free(4, 3))!
    expect(second.a).toBe(first.b)
    const closing = drawSegment(second.plan, 'L1', second.b, { point: { x: 0, y: 0 }, kind: 'vertex', layer: 'L1', vertex: first.a })!
    expect(closing.b).toBe(first.a)
    expect(count(layer(closing.plan))).toEqual({ vertices: 3, segments: 3 })
  })

  it('splits a segment it snaps to, so the new line is connected there', () => {
    const plan = makePlan([{ points: [{ x: 0, y: 0 }, { x: 10, y: 0 }] }])
    const onEdge: Snap = { point: { x: 4, y: 0 }, kind: 'edge', layer: 'L1', segment: 's1' }
    const result = drawSegment(plan, 'L1', onEdge, free(4, 5))!
    expect(count(layer(result.plan))).toEqual({ vertices: 4, segments: 3 })
    expect(segmentsAt(layer(result.plan), result.a)).toHaveLength(3)
  })

  it('splits the right piece when both ends snap to the same segment', () => {
    const plan = makePlan([{ points: [{ x: 0, y: 0 }, { x: 10, y: 0 }] }])
    const at = (x: number): Snap => ({ point: { x, y: 0 }, kind: 'edge', layer: 'L1', segment: 's1' })
    const l = layer(drawSegment(plan, 'L1', at(2), at(7))!.plan)
    expect(count(l)).toEqual({ vertices: 4, segments: 3 })
    const xs = Object.values(l.vertices).map((v) => v.x).sort((a, b) => a - b)
    expect(xs).toEqual([0, 2, 7, 10])
  })

  it('does not connect across layers: a snap on another layer only lends its position', () => {
    const plan = makePlan([{ points: [{ x: 0, y: 0 }, { x: 10, y: 0 }] }], 1)
    const other: Snap = { point: { x: 0, y: 0 }, kind: 'vertex', layer: 'L1', vertex: 'v1' }
    const result = drawSegment(plan, 'X1', other, free(0, 5))!
    expect(count(layer(result.plan, 0))).toEqual({ vertices: 2, segments: 1 })
    expect(count(layer(result.plan, 1))).toEqual({ vertices: 2, segments: 1 })
  })

  it('draws nothing for a zero-length or duplicate segment', () => {
    const plan = makePlan([{ points: [{ x: 0, y: 0 }, { x: 10, y: 0 }] }])
    expect(drawSegment(plan, 'L1', free(1, 1), free(1, 1))).toBeNull()
    expect(drawSegment(plan, 'L1', 'v1', { point: { x: 10, y: 0 }, kind: 'vertex', layer: 'L1', vertex: 'v2' })).toBeNull()
  })
})

describe('moving and connecting', () => {
  it('moves vertices so every connected segment follows', () => {
    const plan = makePlan([{ points: [{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 5, y: 5 }] }])
    const moved = setVertices(plan, new Map([['L1', new Map([['v2', { x: 6, y: 1 }]])]]))
    expect(layer(moved).vertices.v2).toEqual({ x: 6, y: 1 })
    expect(layer(plan).vertices.v2).toEqual({ x: 5, y: 0 })
  })

  it('merges a dropped vertex into the vertex it lands on', () => {
    const plan = makePlan([{ points: [{ x: 0, y: 0 }, { x: 5, y: 0 }] }, { points: [{ x: 5, y: 0 }, { x: 5, y: 5 }] }])
    const result = connectVertex(plan, 'L1', 'v3', { point: { x: 5, y: 0 }, kind: 'vertex', layer: 'L1', vertex: 'v2' })
    expect(result.vertex).toBe('v2')
    expect(count(layer(result.plan))).toEqual({ vertices: 3, segments: 2 })
    expect(segmentsAt(layer(result.plan), 'v2')).toHaveLength(2)
  })

  it('drops a segment that collapses when its ends merge', () => {
    const plan = makePlan([{ points: [{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 5, y: 5 }] }])
    const result = connectVertex(plan, 'L1', 'v2', { point: { x: 5, y: 5 }, kind: 'vertex', layer: 'L1', vertex: 'v3' })
    expect(count(layer(result.plan))).toEqual({ vertices: 2, segments: 1 })
  })

  it('connects a vertex dropped on a segment by splitting it', () => {
    const plan = makePlan([{ points: [{ x: 0, y: 0 }, { x: 10, y: 0 }] }, { points: [{ x: 4, y: 0 }, { x: 4, y: 5 }] }])
    const result = connectVertex(plan, 'L1', 'v3', { point: { x: 4, y: 0 }, kind: 'edge', layer: 'L1', segment: 's1' })
    const l = layer(result.plan)
    expect(count(l)).toEqual({ vertices: 4, segments: 3 })
    expect(segmentsAt(l, result.vertex)).toHaveLength(3)
  })
})

describe('deleteItems', () => {
  it('removes segments and the vertices left unused', () => {
    const plan = makePlan([{ points: [{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 5, y: 5 }] }])
    expect(count(layer(deleteItems(plan, [{ layer: 'L1', kind: 'segment', id: 's2' }])))).toEqual({ vertices: 2, segments: 1 })
  })

  it('removes a vertex with every segment on it', () => {
    const plan = makePlan([{ points: [{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 5, y: 5 }] }])
    expect(count(layer(deleteItems(plan, [{ layer: 'L1', kind: 'vertex', id: 'v2' }])))).toEqual({ vertices: 0, segments: 0 })
  })

  it('leaves locked layers alone', () => {
    const plan = updateLayer(makePlan([{ points: [{ x: 0, y: 0 }, { x: 5, y: 0 }] }]), 'L1', { locked: true })
    expect(deleteItems(plan, [{ layer: 'L1', kind: 'segment', id: 's1' }])).toBe(plan)
  })
})

describe('setSegmentLength', () => {
  it('moves the free end of a segment hanging off a corner', () => {
    const plan = makePlan([{ points: [{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 5, y: 5 }] }])
    const l = layer(setSegmentLength(plan, 'L1', 's1', 3))
    expect(l.vertices.v1).toEqual({ x: 2, y: 0 })
    expect(l.vertices.v2).toEqual({ x: 5, y: 0 })
  })

  it('returns the same plan for an invalid or unchanged length', () => {
    const plan = makePlan([{ points: [{ x: 0, y: 0 }, { x: 5, y: 0 }] }])
    expect(setSegmentLength(plan, 'L1', 's1', 0)).toBe(plan)
    expect(setSegmentLength(plan, 'L1', 's1', 5)).toBe(plan)
  })
})

describe('layers', () => {
  it('moves segments to another layer, copying shared vertices', () => {
    const plan = makePlan([{ points: [{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 5, y: 5 }] }], 1)
    const result = moveSegments(plan, 'L1', ['s2'], 'X1')
    expect(count(layer(result.plan, 0))).toEqual({ vertices: 2, segments: 1 })
    expect(count(layer(result.plan, 1))).toEqual({ vertices: 2, segments: 1 })
    expect(result.ids).toHaveLength(1)
    const target = layer(result.plan, 1)
    const seg = target.segments[result.ids[0]]
    expect(dist(target.vertices[seg.a], target.vertices[seg.b])).toBe(5)
    expect(findVertexAt(target, { x: 5, y: 0 })).toBeDefined()
  })

  it('adds, edits, reorders and removes layers', () => {
    const added = addLayer(makePlan())
    expect(added.id).toBe('L2')
    expect(updateLayer(added.plan, 'L2', { name: 'Layer 2' })).toBe(added.plan)
    const renamed = updateLayer(added.plan, 'L2', { name: 'Furniture' })
    expect(layer(renamed, 1).name).toBe('Furniture')
    expect(moveLayer(renamed, 'L2', -1).layers.map((l) => l.id)).toEqual(['L2', 'L1'])
    expect(moveLayer(renamed, 'L2', 1)).toBe(renamed)
    const removed = removeLayer(renamed, 'L1')
    expect(typeof removed !== 'string' && removed.layers.map((l) => l.id)).toEqual(['L2'])
    expect(removeLayer(makePlan(), 'L1')).toBe('A plan keeps at least one layer.')
  })
})

describe('walls and open edges', () => {
  const open = (x: number, y: number): Snap => ({ point: { x, y }, kind: 'free' })

  it('draws open edges and keeps the kind when a segment is split', () => {
    const drawn = drawSegment(makePlan(), 'L1', open(0, 0), open(10, 0), 'open')!
    expect(Object.values(layer(drawn.plan).segments)).toEqual([{ a: 'v1', b: 'v2', kind: 'open' }])
    const split = drawSegment(drawn.plan, 'L1', { point: { x: 4, y: 0 }, kind: 'edge', layer: 'L1', segment: 's1' }, open(4, 5))!
    const kinds = Object.values(layer(split.plan).segments).map((s) => s.kind ?? 'wall').sort()
    expect(kinds).toEqual(['open', 'open', 'wall'])
  })

  it('switches kinds, returning the same plan when nothing changes', () => {
    const plan = makePlan([{ points: [{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 5, y: 5 }] }])
    const refs = [{ layer: 'L1', kind: 'segment' as const, id: 's2' }]
    const opened = setSegmentKind(plan, refs, 'open')
    expect(layer(opened).segments.s2).toEqual({ a: 'v2', b: 'v3', kind: 'open' })
    expect(setSegmentKind(opened, refs, 'open')).toBe(opened)
    expect(layer(setSegmentKind(opened, refs, 'wall')).segments.s2).toEqual({ a: 'v2', b: 'v3' })
  })

  it('keeps the wall when a wall and an open edge merge into one segment', () => {
    const plan = setSegmentKind(
      makePlan([{ points: [{ x: 0, y: 0 }, { x: 5, y: 0 }] }, { points: [{ x: 0, y: 0 }, { x: 5, y: 0.1 }] }]),
      [{ layer: 'L1', kind: 'segment', id: 's1' }],
      'open',
    )
    const merged = connectVertex(plan, 'L1', 'v4', { point: { x: 5, y: 0 }, kind: 'vertex', layer: 'L1', vertex: 'v2' })
    const merged2 = connectVertex(merged.plan, 'L1', 'v3', { point: { x: 0, y: 0 }, kind: 'vertex', layer: 'L1', vertex: 'v1' })
    expect(Object.values(layer(merged2.plan).segments)).toEqual([{ a: 'v1', b: 'v2' }])
  })

  it('keeps the kind when segments move to another layer', () => {
    const plan = setSegmentKind(makePlan([{ points: [{ x: 0, y: 0 }, { x: 5, y: 0 }] }], 1), [{ layer: 'L1', kind: 'segment', id: 's1' }], 'open')
    const result = moveSegments(plan, 'L1', ['s1'], 'X1')
    expect(layer(result.plan, 1).segments[result.ids[0]].kind).toBe('open')
  })
})

describe('areas', () => {
  it('adds, renames and re-anchors an area without touching the lines', () => {
    const plan = makePlan([{ points: [{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 5, y: 5 }], closed: true }])
    const added = addArea(plan, 'L1', { x: 3, y: 1 }, 'Kitchen')
    expect(added.id).toBe('a1')
    expect(layer(added.plan).areas.a1).toEqual({ name: 'Kitchen', at: { x: 3, y: 1 } })
    expect(layer(added.plan).segments).toBe(layer(plan).segments)
    expect(updateArea(added.plan, 'L1', 'a1', { name: 'Kitchen' })).toBe(added.plan)
    const renamed = updateArea(added.plan, 'L1', 'a1', { name: 'Living' })
    expect(layer(renamed).areas.a1.name).toBe('Living')
    const moved = setAreaAnchors(renamed, new Map([['L1', new Map([['a1', { x: 4, y: 2 }]])]]))
    expect(layer(moved).areas.a1.at).toEqual({ x: 4, y: 2 })
  })

  it('deletes an area but leaves its walls, and deleting walls leaves the area', () => {
    const plan = addArea(makePlan([{ points: [{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 5, y: 5 }], closed: true }]), 'L1', { x: 3, y: 1 }, 'Kitchen').plan
    const noArea = deleteItems(plan, [{ layer: 'L1', kind: 'area', id: 'a1' }])
    expect(layer(noArea).areas).toEqual({})
    expect(count(layer(noArea)).segments).toBe(3)
    const noWalls = deleteItems(plan, [{ layer: 'L1', kind: 'segment', id: 's1' }])
    expect(layer(noWalls).areas.a1.name).toBe('Kitchen')
  })

  it('moves areas to another layer', () => {
    const plan = addArea(makePlan([], 1), 'L1', { x: 3, y: 1 }, 'Kitchen').plan
    const result = moveAreas(plan, 'L1', ['a1'], 'X1')
    expect(layer(result.plan, 0).areas).toEqual({})
    expect(layer(result.plan, 1).areas[result.ids[0]].name).toBe('Kitchen')
  })
})

describe('outlines', () => {
  it('are kept through splits and switches, and a wall wins when one merges with an outline', () => {
    const drawn = drawSegment(makePlan(), 'L1', { point: { x: 0, y: 0 }, kind: 'free' }, { point: { x: 10, y: 0 }, kind: 'free' }, 'outline')!
    expect(Object.values(layer(drawn.plan).segments)).toEqual([{ a: 'v1', b: 'v2', kind: 'outline' }])
    const split = drawSegment(drawn.plan, 'L1', { point: { x: 4, y: 0 }, kind: 'edge', layer: 'L1', segment: 's1' }, { point: { x: 4, y: 5 }, kind: 'free' })!
    expect(Object.values(layer(split.plan).segments).filter((s) => s.kind === 'outline')).toHaveLength(2)
    const refs = [{ layer: 'L1', kind: 'segment' as const, id: 's1' }]
    expect(layer(setSegmentKind(drawn.plan, refs, 'wall')).segments.s1).toEqual({ a: 'v1', b: 'v2' })
    const both = setSegmentKind(makePlan([{ points: [{ x: 0, y: 0 }, { x: 5, y: 0 }] }, { points: [{ x: 0, y: 0 }, { x: 5, y: 0.1 }] }]), refs, 'outline')
    const merged = connectVertex(both, 'L1', 'v4', { point: { x: 5, y: 0 }, kind: 'vertex', layer: 'L1', vertex: 'v2' })
    const merged2 = connectVertex(merged.plan, 'L1', 'v3', { point: { x: 0, y: 0 }, kind: 'vertex', layer: 'L1', vertex: 'v1' })
    expect(Object.values(layer(merged2.plan).segments)).toEqual([{ a: 'v1', b: 'v2' }])
  })
})

describe('wall thickness and height', () => {
  const plan = () => makePlan([{ points: [{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 5, y: 5 }] }], 1)
  const refs = [
    { layer: 'L1', kind: 'segment' as const, id: 's1' },
    { layer: 'L1', kind: 'segment' as const, id: 's2' },
  ]

  it('sets and clears them on walls, returning the same plan when nothing changes', () => {
    const set = updateWalls(plan(), refs, { thickness: 0.2, height: 3 })
    expect(layer(set).segments.s1).toEqual({ a: 'v1', b: 'v2', thickness: 0.2, height: 3 })
    expect(updateWalls(set, refs, { thickness: 0.2 })).toBe(set)
    const cleared = updateWalls(set, refs.slice(0, 1), { thickness: null })
    expect(layer(cleared).segments.s1).toEqual({ a: 'v1', b: 'v2', height: 3 })
    expect(layer(cleared).segments.s2.thickness).toBe(0.2)
    // open edges and outlines have neither
    const opened = setSegmentKind(plan(), refs.slice(0, 1), 'open')
    expect(updateWalls(opened, refs.slice(0, 1), { height: 2 })).toBe(opened)
  })

  it('keeps them when a wall is split, switched to another kind and back, or moved to another layer', () => {
    const set = updateWalls(plan(), refs.slice(0, 1), { thickness: 0.2, height: 3 })
    const split = drawSegment(set, 'L1', { point: { x: 2, y: 0 }, kind: 'edge', layer: 'L1', segment: 's1' }, free(2, -3))!
    const pieces = Object.values(layer(split.plan).segments).filter((s) => s.thickness)
    expect(pieces.map((s) => [s.thickness, s.height])).toEqual([
      [0.2, 3],
      [0.2, 3],
    ])
    const back = setSegmentKind(setSegmentKind(set, refs.slice(0, 1), 'outline'), refs.slice(0, 1), 'wall')
    expect(layer(back).segments.s1).toEqual({ a: 'v1', b: 'v2', thickness: 0.2, height: 3 })
    const moved = moveSegments(set, 'L1', ['s1'], 'X1')
    expect(layer(moved.plan, 1).segments[moved.ids[0]]).toMatchObject({ thickness: 0.2, height: 3 })
  })
})
