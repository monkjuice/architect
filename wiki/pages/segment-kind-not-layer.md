---
title: Open edges and outlines are segment kinds, not layers
type: decision
summary: "A segment is a wall, an open edge (porch front, colonnade) or an outline (ground-level edge with no height: pool, paving, deck, planter): one attribute (kind: 'open' | 'outline', absent = wall), not separate layers, because topology and regions exist only within a layer; drawn by drafting convention (walls heavy, open edges dashed, outlines thin), all three bound areas, only walls cast shadows."
tags: [decision, model, segments, areas, sun, colonnades]
sources: []
updated: 2026-11-04
---

# Open edges and outlines are segment kinds, not layers

## Context

A porch, gallery or terrace is bounded partly by house walls and partly by open sides. It has to be an
[area](areas.md) like a room, but it must look different and be counted differently. In the seventh session the
user drew their pool with walls on its own layer, so it cast 2.7 m wall shadows, and asked how to say "it's just an
area". That needed a third kind for things at ground level.

## Decision

- `SegmentSchema` has an optional `kind: z.enum(['open', 'outline'])`. When it is absent the segment is a wall, and
  walls are saved without the key. In `src/model/plan.ts`, `SegmentKind` is `'wall' | 'open' | 'outline'`,
  `SEGMENT_KINDS` lists them in that order, and `segmentKind(s)` reads the kind.
- What each kind means:
  - **wall**: stands up. It is the only kind that casts shadows ([Sun and shadows](sun.md)).
  - **open edge**: the limit of a covered space that has no wall (porch front, colonnade). Since 2026-11-04 it can
    carry a `colonnade` (columns under a beam, [Colonnades](colonnades.md)).
  - **outline** (seventh session): an edge at ground level with no height (pool, paving, deck, planter).
- The drawing follows drafting convention: cut walls are heavy (filled at their thickness, or 2 px lines with
  *Thick walls* off, see [Walls](walls.md)), things overhead are dashed (open edges, 1.75 px), and things below
  the plan's cut plane are thin and solid (outlines, `.layer-lines.outline` 1.1 px in `src/App.css`).
- All three kinds bound regions in the same way. Each region splits its boundary length by kind into `walls`,
  `open` and `outline` ([Regions](regions.md)).
- Edits keep the kind:
  - `addSegment` and `setSegmentKind` write `kind` for every kind except wall.
  - `splitSegment` gives both pieces the kind, and `moveSegments` keeps it (both copy the whole segment through
    `addSegment`'s `like`, thickness and height included).
  - `setSegmentKind` keeps a wall's `thickness` and `height` while it is another kind, so turning it back into a
    wall restores them; an open edge's `colonnade` is kept the same way.
  - When `mergeVertices` makes a wall and any other kind the same segment, the wall stays. Between an open edge
    and an outline, the segment already kept stays. The overlap rule in regions works the same way.
- `setSegmentKind(plan, refs, kind)` backs the Selection panel's Type control (Wall, Open edge, Outline).
  `drawSegment` takes a kind.
- The line tool draws the store's `lineKind` ([Editor store and state](editor-store.md)). `O` cycles wall → open
  edge → outline, in `SEGMENT_KINDS` order. The Library panel (`src/ui/panels/LibraryPanel.tsx`) lists Wall,
  Open edge and Outline with the length of each on visible layers. Clicking one arms the line tool with that kind.
- `measureSegments` (`src/model/pick.ts`) returns a second figure that is still named `open`. It now holds the
  length that is not wall (open edges plus outlines), and the Selection panel labels it "m not wall".

## Alternatives rejected

- A separate layer for open edges or outlines. Connections and regions exist only within one layer
  ([Snapping and connections](snapping-and-connections.md)), so a porch whose open edge lived on another layer
  could never close. A layer also says nothing about height: the user's pool on its own layer still cast wall
  shadows.

## Consequences

- Dashes mean open edges, so locked layers only fade (`.layer.locked`).
- `LayerShapes` in `src/ui/canvas/Scene.tsx` draws each layer as three paths, one per kind (walls as fill and
  edges paths when drawn thick).
- Open edges and outlines decide which rooms are indoor: the outside reaches across them, not across walls
  ([Indoor means unreachable from outside](indoor-reachability-rule.md)).
- Only an open edge gets a dashed preview in the line tool. An outline previews solid, like a wall.
- Doors, windows and gates can sit on a segment of any kind; `openings.ts` checks the kind only for fireplaces,
  which need a wall ([Fireplaces](fireplaces.md)).
- The format change is additive, so `schemaVersion` stayed 1 ([Plan model and file format](plan-model.md)).
- Area kinds (covered, semi-covered, pool) were not added. The covered total comes from the indoor rule instead
  ([Areas](areas.md)); a semi-covered total is still open ([Overview](../overview.md)).
