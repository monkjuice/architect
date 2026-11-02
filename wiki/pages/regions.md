---
title: Regions
type: concept
summary: "src/model/regions.ts: the outlines a layer's lines enclose, as faces of a planar arrangement (split at crossings and touches, a wall wins over other kinds, edges keep their segment ids) traced with half-edges; layerFaces adds which regions are indoor, which walls face outside and each wall's thickness; a Region has holes, area to centrelines, floor inside the wall faces, wallIds, boundary lengths by kind, regionAt and a lazy cached label point."
tags: [model, regions, areas, geometry]
sources: []
updated: 2026-11-02
---

# Regions

`src/model/regions.ts` (pure, no caching) works out the regions a layer's lines enclose. [Areas](areas.md) name them,
and the Area tool's hover shows them directly. Caching is in `src/state/derived.ts`.

## The arrangement (`layerFaces`; `layerRegions` wraps it)

1. Every segment is split at its crossings with other segments and wherever a vertex lies on it (T junctions,
   overlaps). A region therefore closes when it looks closed, whether or not the lines share a vertex. This is
   geometric only: the connection topology does not change ([Snapping and connections](snapping-and-connections.md)).
2. Points within `TOL` (1e-6 m) merge; overlapping pieces are deduplicated, and where a wall overlaps an open edge
   or an outline the piece is a wall (the same rule as `mergeVertices`, see
   [Open edges and outlines are segment kinds](segment-kind-not-layer.md)). Each piece keeps the ids of the
   segments it comes from, which ties faces back to walls.
3. Faces are traced with half-edges: each node's outgoing half-edges are sorted by angle, and `next(h)` is the
   half-edge just before `twin(h)` in that order. In these coordinates (+y down), bounded faces have a positive
   signed area and the outside of each connected group of lines a negative one.
4. Connected groups come from union-find. A group's outer cycle (negative) becomes a hole of the smallest face of
   another group that contains it: a chimney or stair core inside a room is subtracted.

`layerFaces(layer)` returns `{regions, thickness, exterior}`: which walls face outside and each wall's thickness
(its own or automatic), decided by the indoor rule
([Indoor means unreachable from outside](indoor-reachability-rule.md), [Walls](walls.md)).

A `Region` has `outer`, `holes`, `area` (m² to the centrelines, holes subtracted), `floor`, `indoor`, `wallIds` (the
walls around and in it) and its boundary length by kind: `walls`, `open` and `outline` (a pool drawn with outlines
is a region with 0 m of wall). The Selection panel shows the open and outline shares of an area's boundary. A stub
(a half-edge whose twin is in the same face, such as a wall poking into a room) appears in `outer` there and back
and is not counted in the lengths. `regionAt(regions, p)` returns the smallest region containing `p`, or null.

## Floor area (`insetRing`)

`floor` is the area inside the wall faces, the usual room size. Every boundary half-edge of the face, and of its
holes, moves left (into the region) by half its wall's thickness (0 for open edges and outlines; the thickest where
segments overlap). Convex corners take the moved pieces' intersection; reflex corners bevel past `MITRE_LIMIT`,
as walls do. Parallel neighbours (a stub's tip, a thickness step) emit both points, so a stub's wall is taken off
too. The result is clamped to `[0, area]`.

## Label point (`regionLabel`)

Computed lazily and cached per region object (WeakMap). `labelPoint` takes the centroid when it is inside and has
at least 70% of the best clearance found; otherwise it takes that best point, from a grid search that zooms in on
the point farthest from the edges (close to the pole of inaccessibility).

- **Why the centroid rule:** the farthest point drifts along a long room, whose middle line is equally far from the
  walls everywhere. The user's hand-drawn, slightly skewed 17.35 × 5.02 m room got its label at one end.
- **Why lazy:** on the user's draft (41 segments, 12 regions), one full computation took 4.5 ms warm, 3.5 ms of
  it for labels. Regions are recomputed on every frame of a drag that moves lines.

## Cost

Crossing detection is O(n²) in the layer's segments, and node lookup is linear. That was fine at tens of segments
(the 2026-11-02 measurement above). Tests: `src/model/regions.test.ts`, and for floors and automatic thickness
`src/model/walls.test.ts` ([Development and testing](development-and-testing.md)).
