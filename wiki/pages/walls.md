---
title: "Walls: thickness, height and joins"
type: component
summary: "src/model/walls.ts: lines stay centrelines; a wall's optional thickness (absent = automatic: 0.30 m facing outside, 0.15 m between rooms) and height (absent = 2.70 m) live on the segment; layerWalls draws walls filled at their thickness with mitred or bevelled joins, cut by openings, with per-wall footprints; Thick walls toggle, face hit tests, updateWalls and the Selection panel's wall fields."
tags: [model, walls, canvas, ui, derived]
sources: []
updated: 2026-11-02
---

# Walls: thickness, height and joins

Added on 2026-11-02 with defaults the user approved. Before, walls were single lines and door symbols assumed 0.15 m.

## Model

- Lines stay centrelines: drawing, snapping, hit tests and regions work on them. A wall stands `thickness` centred
  on its line and `height` tall, both optional keys of `SegmentSchema` ([Plan model](plan-model.md)).
- No `thickness` = automatic: `EXTERIOR_WALL` 0.30 m if the wall faces outside, `INTERIOR_WALL` 0.15 m between
  indoor rooms. `layerFaces` in `regions.ts` decides which
  ([Indoor means unreachable from outside](indoor-reachability-rule.md)). A segment with any piece facing outside is
  exterior along its whole length. No `height` = `WALL_HEIGHT` 2.70 m (`wallHeight(s)`).
- Thickness exists for walls only. An opening in an open-edge fence is drawn for 0.15 m (`hostThickness`).

## Edits (`src/model/edit.ts`)

- `updateWalls(plan, refs, {thickness?, height?})`: a number sets, `null` clears; non-walls are skipped.
- `setSegmentKind` keeps `thickness`/`height` (unused while not a wall), so wall → open → wall restores them.
- `addSegment(d, a, b, like)` takes a `SegmentKind` or a `Segment` to copy; `splitSegment` and `moveSegments` pass
  the segment, so pieces keep thickness and height.

## Drawing (`layerWalls`)

`layerWalls(layer, thickness)` → `{fills, owners, edges, footprint}`, per layer (walls on different layers never
join). `owners[i]` is the wall id of `fills[i]` (a bevel belongs to the wall before it round the joint), so the 3-D
walls each get their own height ([House solids](house-solids.md)).

- At each vertex the walls are sorted by angle. Between one wall's plus face and the next one's minus face the
  corner is the faces' intersection when the sector is under 180°; a reflex sector gets a mitre up to `MITRE_LIMIT`
  (4 half-thicknesses, SVG's default), else a bevel (triangle fill plus a line). Walls in line with different
  thicknesses get a step line.
- Each wall piece's fill passes through the joint vertex, so walls meeting there tile it with no seam. Only faces,
  caps (openings, free ends), steps and bevels are stroked.
- Fills are normalised to one orientation because they are painted as one nonzero path: opposite windings would
  cancel where pieces overlap.
- `footprint` (m² per wall) ignores openings: a doorway is built-up area. It feeds the covered area ([Areas](areas.md)).

## In the editor

- `prefs.thickWalls` (View section *Thick walls*, default on): `LayerShapes` draws `.walls .wall-fill` and `.wall-edges`
  instead of the wall centreline path; off gives thin lines for tracing ([Canvas and tools](canvas-and-tools.md)).
- `hitTest` (`pick.ts`) and `openingTarget` take an optional `halfWidth(layer, segment)` callback. Tools pass
  `drawnHalfWidth` from `derived.ts` (half the thickness when thick walls are on, else 0), so a click on a face picks
  the wall and the model never reads prefs ([Code conventions](code-conventions.md)).
- Openings are drawn at the real thickness ([Doors, windows and gates](doors-and-windows.md)); shadows use each
  wall's height ([Sun and shadows](sun.md)).
- Selection panel `WallFields`, shown only when every selected line is a wall: Thickness and Height (`NumberField`
  `value: null` = mixed: empty, placeholder "mixed", a typed number sets all), a hint ("Automatic: 0.30 m, it faces
  outside" / "between two rooms" / "Set by hand; automatic would be …") and *Automatic thickness*.

## Caching (`src/state/derived.ts`)

`getThickness`, `facesOutside` and `hostThickness` share the faces cache with `getRegions` (keyed by the
`vertices` and `segments` maps), so `updateWalls` recomputes them. `getWalls` is cached per layer object, because
openings cut walls. Tests: `src/model/walls.test.ts` (13).
