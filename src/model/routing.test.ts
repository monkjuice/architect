import { describe, expect, it } from 'vitest'
import { downstream, findRun, fromRoot, pathLength, routeTree, runAt } from './routing'

describe('service routing', () => {
  it('builds a rectilinear tree and splits a laid main for a nearer branch', () => {
    const tree = routeTree(
      [{ x: 0, y: 0 }],
      [
        { x: 4, y: 0 },
        { x: 2, y: 2 },
      ],
    )

    expect(tree.nodes.filter((node) => node.target >= 0).map((node) => node.target).sort()).toEqual([0, 1])
    expect(tree.edges).toHaveLength(3)
    expect(tree.edges.every((edge) => edge.path.slice(1).every((point, i) => point.x === edge.path[i].x || point.y === edge.path[i].y))).toBe(true)
    expect(tree.edges.reduce((sum, edge) => sum + pathLength(edge.path), 0)).toBeCloseTo(6)

    const depth = fromRoot(tree)
    expect(tree.nodes.filter((node) => node.target >= 0).map((node) => depth[tree.nodes.indexOf(node)])).toEqual([4, 4])
    expect(downstream(tree).some((targets) => targets.length === 2)).toBe(true)
  })

  it('keeps a picked derived run attached to its destination after routes change', () => {
    const runs = [
      { kind: 'cold', storey: 0, path: [{ x: 0, y: 0 }, { x: 3, y: 0 }], to: { layer: 'L1', kind: 'service' as const, id: 'q1' } },
      { kind: 'cold', storey: 0, path: [{ x: 0, y: 1 }, { x: 3, y: 1 }] },
    ]

    expect(findRun([...runs].reverse(), { kind: 'cold', index: 0, to: runs[0].to })).toBe(1)
    expect(runAt(runs, 0, { x: 2, y: 0.1 }, 0.2)).toBe(0)
    expect(runAt(runs, 1, { x: 2, y: 0.1 }, 0.2)).toBe(-1)
  })
})
