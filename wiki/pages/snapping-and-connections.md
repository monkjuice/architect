---
title: Snapping and connections
type: concept
summary: "findSnap's priorities (vertex > midpoint > edge), the Shift 45° constraint with align and ray/segment intersection, and how snaps become topology only within a layer (vertexForSnap splits segments; dropping a dragged vertex connects it)."
tags: [model, snapping, topology, edit]
sources: []
updated: 2026-11-02
---

# Snapping and connections

## Finding the snap (`src/model/snap.ts`)

`findSnap(plan, p, opts)` returns a `Snap`: a point, a `kind`, and the `layer`/`vertex`/`segment` it landed on.

- Reach: `SNAP_PX * px` (10 screen pixels, see [Canvas and tools](canvas-and-tools.md)).
- Only visible layers count.
- Priority: a vertex, including the caller's `extraPoints` (the measure tool's first point, so the outline can be
  closed); then a segment midpoint; then the nearest point on a segment (`edge`); otherwise `free`.
- Alt, or the *Snap* pref turned off, gives `enabled: false`: no geometry snapping, but the constraint still applies.

**Shift** (`constrain` with a `from` point) puts the point on the nearest 45° ray from `from` (`constrainAngle` in
`geometry.ts`):

- A vertex within reach is projected onto the ray. This is an `align` snap, and its `guide` is that vertex (drawn as a
  guide line).
- Segments give the point where the ray crosses them (`edge`) instead of their midpoint or nearest point.

The line, measure and select tools use `findSnap`. Calibrate uses only `constrainAngle`.

## Topology only within a layer (`src/model/edit.ts`)

`vertexForSnap(draft, snap)` turns a snap into a vertex of the layer being edited:

- A snap to a vertex of this layer gives that vertex.
- A snap to a segment of this layer splits it there (`splitSegment`), making a T junction. If an earlier split in the
  same edit already replaced the snapped segment, it finds the piece that passes through the point.
- Anything else (a snap to another layer, or a free point) gives an existing vertex at that exact point, or a new
  one. Snaps to other layers lend only their position: layers never connect.

`drawSegment` uses it for both ends and takes the segment kind (wall, open edge or outline). `addSegment` refuses
zero-length segments and returns the existing segment when two vertices are already joined.

Connections are not needed to close an outline: [Regions](regions.md) split lines at every crossing and touch on
their own, without changing the topology.

## Connecting by dragging

The select tool drags a single vertex with snapping, skipping the vertex itself and its own segments. On drop,
`connectVertex` merges it into the snapped vertex, or into a new vertex that splits the snapped segment.
`mergeVertices` re-points the segments and drops loops and duplicates. Only targets on the same layer connect. The
drag and the merge make one undo step (`preview`, then `endGesture`; see [Editor store and state](editor-store.md)).

## Other edits that depend on topology

- `setSegmentLength` moves the end with fewer other segments on it.
- `moveSegments` copies shared vertices to the target layer, so lines left behind keep theirs.
- Segment kinds survive `splitSegment`, `mergeVertices` and `moveSegments`. When a merge makes a wall and another
  kind the same segment, the wall stays ([Open edges and outlines are segment kinds](segment-kind-not-layer.md)).
- Doors and windows follow their segment through these edits: a split hands each to the piece its centre is on, a
  merge or delete that removes the segment removes them, a length change keeps their distance to the nearer end
  ([Doors and windows](doors-and-windows.md)).

Related: [Plan model and file format](plan-model.md).
