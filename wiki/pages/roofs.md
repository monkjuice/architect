---
title: "Roofs: model and geometry"
type: component
summary: "Drawn roofs in layer.roofs (RoofSchema: outline, type flat/shed/gable/hip, pitch, height at the eaves sides, overhang, reference edge, parapet, covering and soffit materials; ids r<n>) and src/model/roofs.ts: each slope a plane f(p) = distance in from an eaves line, underside = height + tan(pitch)·min f, faces by clipping the eaves polygon with half-planes, the underside along a wall, new-roof defaults, the hip convexity warning, unionOutlines for Roof the house, and galleryRoof (a 2° shed overhanging only its open sides, via offsetEdges)."
tags: [model, roof, geometry, schema, finishes, gallery]
sources: []
updated: 2026-11-05
---

# Roofs: model and geometry

Added in the eighth session (2026-11-02) for the [Roof tab](roof-tab.md). Why roofs are drawn outlines and slopes
are planes: [Roofs are drawn outlines](roofs-drawn-outlines.md). They are built into 3-D by
[House solids](house-solids.md).

## Data (`src/model/plan.ts`)

`LayerSchema.roofs` (id → `RoofSchema`, `.default({})`, additive at schemaVersion 1;
[Plan model and file format](plan-model.md)). Ref kind `'roof'`, ids `r1`, `r2`… per layer.

- `outline` (≥ 3 points): what the roof covers, usually the walls' outside faces. It does not follow the walls.
- `type`: one of `ROOF_TYPES` (`flat`, `shed`, `gable`, `hip`); `pitch` in degrees (0–70, unused when flat).
- `height`: the underside where it crosses the outline at an eaves side (usually the wall tops).
- `overhang` (0–3 m): the eaves stand that far beyond the outline.
- `edge`: an outline side index: a shed's low side, a gable's ridge direction.
- `parapet` (0–2 m): flat roofs only.
- `finish`, `soffit` (optional, since `20dcb35`): material ids of the covering and the underside
  ([Materials and finishes](materials-and-finishes.md)); where they go in 3-D: [House solids](house-solids.md).

Edits in `src/model/edit.ts`: `addRoof`, `updateRoof` (wraps `edge` modulo the outline's length; patching `finish`
or `soffit` to undefined deletes the key), `moveRoofs`
(from the plan before the drag), `deleteItems`. They replace only the layer's `roofs` map, so regions are not
recomputed. `planFile.ts` rounds outline points to 0.1 mm on save.

## Geometry (`src/model/roofs.ts`, 10 tests in `roofs.test.ts`)

- A slope is a `Plane` f(p) = a·x + b·y + c, the distance into the roof from its eaves line. The underside is
  `height` + tan(pitch) · min f, so slopes meet where they cross (ridges, hips) and continue lower over the overhang.
  A flat roof is one level plane.
- `roofPlanes`: shed and gable come from the reference edge's normal and the outline's extremes along it, so they
  work on any outline. Hip has one plane per side, exact only on convex outlines; `roofProblem` warns, and the
  advice for an L is two overlapping roofs.
- Thickness, measured vertically: `SLAB` 0.20 m (flat), `COVERING` 0.15 m (pitched); `PARAPET_WALL` 0.15 m.
- `eavesOf` = `offsetPolygon(outline, overhang)`, mitred corners.
- `offsetEdges(pts, d(edge))` (`96a2afa`): moves each edge of the normalized ring out by its own distance (in when
  negative). Corners go where the moved lines meet. Two edges in line with different distances leave a step.
- `roofFaces`: each plane's face is the eaves polygon clipped (Sutherland–Hodgman) by the half-planes where another
  plane is lower; planes that coincide (sides in line) keep the first. Every face goes through `normalized`
  (drops repeated and collinear points, runs clockwise on screen): clipping leaves a corner twice where it lies on a
  clipping line, which a test caught.
- `undersideAlong(roof, a, b)`: heights at the ends and wherever the lowest plane changes (ridge, hip).
- `nextEdge`: *Turn the slope / ridge*; a gable skips sides parallel to its ridge.
- `newRoof`: `edge` = longest side; pitch 25° (shed 10°); overhang 0.5 m; flat gets overhang 0 and a 0.30 m parapet.
- `roofSummary`: plan area, sloped surface, lowest eaves, top.
- `unionOutlines`: puts rooms together by cancelling edges that a neighbour runs the other way (each ring first made
  clockwise). It needs shared corners, as a layer's regions have, and drops holes (courtyards).
- `galleryRoof(ring, rooms, top)` (`b5b8220`, reworked in `96a2afa`; for *Roof the house*): a shed at
  `GALLERY_PITCH` (2°) over the gallery's centreline ring (`actions.ts` passes the raw region ring). An edge is
  "along the rooms" when its midpoint is within `EXTERIOR_WALL` of a room ring. Through `offsetEdges`, those edges
  move in by `EXTERIOR_WALL`/2, to the house wall's face. Free edges move out by `EXTERIOR_WALL`/2 +
  `GALLERY_OVERHANG` (0.5 m). The overhang is drawn into the outline, so the roof's `overhang` is 0. Why: with a
  uniform overhang, the gallery roof ran into the house's 3.5 m walls, which keep their height
  ([House solids](house-solids.md)), so they poked up through it. The `edge` (low side) is the longest side not
  along the rooms, which is the open front. `height` = `top` − 0.1 − `COVERING` − depth·tan(pitch), where depth is
  the farthest outline point from that edge. That puts the high side's top 0.1 m under the wall tops, tucked under
  the rooms' eaves.
- Caveat: setting such a roof's Overhang field above 0 later applies an overhang all round again, house side
  included. Gallery roofs made before `96a2afa` keep their old outline until rebuilt; the user's plan's `r2` was
  rebuilt (pitch, covering and soffit kept).

`ROOF_TITLES` (a record) is exported from here, not from a component file: oxlint's `react/only-export-components`
allows only literal constants ([Code conventions](code-conventions.md)).
