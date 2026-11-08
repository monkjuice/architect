---
title: "Roofs: model and geometry"
type: component
summary: "Drawn roofs in layer.roofs (RoofSchema: outline, type flat/shed/gable/hip/pergola/glass, pitch, height at the eaves sides, overhang, reference edge, parapet, covering and soffit materials; ids r<n>) and src/model/roofs.ts: each slope a plane f(p) = distance in from an eaves line, underside = height + tan(pitch)·min f, faces by clipping the eaves polygon with half-planes, the underside along a wall, new-roof defaults, the hip convexity warning, unionOutlines for Roof the house, galleryRoof (a 2° shed overhanging only its open sides, via offsetEdges), a pergola's rafters (pergolaRafters), and a glass roof (steel glazing bars under glass) with optional grow lights (growLights)."
tags: [model, roof, geometry, schema, finishes, gallery, skylights, pergola, carport, greenhouse]
sources: []
updated: 2026-11-08
---

# Roofs: model and geometry

Added in the eighth session (2026-11-02) for the [Roof tab](roof-tab.md). Why roofs are drawn outlines and slopes
are planes: [Roofs are drawn outlines](roofs-drawn-outlines.md). They are built into 3-D by
[House solids](house-solids.md).

## Data (`src/model/plan.ts`)

`LayerSchema.roofs` (id → `RoofSchema`, `.default({})`, additive at schemaVersion 1;
[Plan model and file format](plan-model.md)). Ref kind `'roof'`, ids `r1`, `r2`… per layer.

- `outline` (≥ 3 points): what the roof covers, usually the walls' outside faces. It does not follow the walls.
- `type`: one of `ROOF_TYPES` (`flat`, `shed`, `gable`, `hip`, since `59bcfa6` `pergola`, since `8b511e3` `glass`); `pitch` in degrees
  (0–70, unused when flat).
- `height`: the underside where it crosses the outline at an eaves side (usually the wall tops).
- `overhang` (0–3 m): the eaves stand that far beyond the outline.
- `edge`: an outline side index: a shed's low side, a gable's ridge direction.
- `parapet` (0–2 m): flat roofs only.
- `finish`, `soffit` (optional, since `20dcb35`): material ids of the covering and the underside
  ([Materials and finishes](materials-and-finishes.md)); where they go in 3-D: [House solids](house-solids.md).
- `skylights` (optional, since `8d33d0b`): `{count, width}`, glazed strips (count a whole number 1–40, width ≤ 10 m).
  Asked for as "window holes" in the gallery roof, like the strips over a quincho's dining table.

Edits in `src/model/edit.ts`: `addRoof`, `updateRoof` (wraps `edge` modulo the outline's length; patching `finish`,
`soffit` or `skylights` to undefined deletes the key), `moveRoofs`
(from the plan before the drag), `deleteItems`. They replace only the layer's `roofs` map, so regions are not
recomputed. `planFile.ts` rounds outline points to 0.1 mm on save.

## Geometry (`src/model/roofs.ts`, 10 tests in `roofs.test.ts`)

- A slope is a `Plane` f(p) = a·x + b·y + c, the distance into the roof from its eaves line. The underside is
  `height` + tan(pitch) · min f, so slopes meet where they cross (ridges, hips) and continue lower over the overhang.
  A flat roof is one level plane.
- `roofPlanes`: shed and gable come from the reference edge's normal and the outline's extremes along it, so they
  work on any outline. A pergola is one slope, like a shed. Hip has one plane per side, exact only on convex outlines; `roofProblem` warns, and the
  advice for an L is two overlapping roofs.
- Thickness, measured vertically (`roofThickness`): `SLAB` 0.20 m (flat), `COVERING` 0.15 m (pitched),
  `RAFTER.depth` + `PERGOLA_SHEET` = 0.212 m (pergola); `PARAPET_WALL` 0.15 m.
- `eavesOf` = `offsetPolygon(outline, overhang)`, mitred corners.
- `offsetEdges(pts, d(edge))` (`96a2afa`): moves each edge of the normalized ring out by its own distance (in when
  negative). Corners go where the moved lines meet. Two edges in line with different distances leave a step.
- `roofFaces`: each plane's face is the eaves polygon clipped (Sutherland–Hodgman) by the half-planes where another
  plane is lower; planes that coincide (sides in line) keep the first. Every face goes through `normalized`
  (drops repeated and collinear points, runs clockwise on screen): clipping leaves a corner twice where it lies on a
  clipping line, which a test caught.
- `undersideAlong(roof, a, b)`: heights at the ends and wherever the lowest plane changes (ridge, hip).
- `skylights(roof, slope?)` (`8d33d0b`): `count` strips spaced evenly along `edge`, each `width` wide (at most
  step − 0.3), running across the roof over its full depth, cut to the outline inset by `SKYLIGHT_MARGIN` (0.5 m).
  Given a face's points (`slope`), also cut to that face inset by 0.15 m, so a strip over a gable's ridge becomes one
  hole per side. Cutting uses a private Sutherland–Hodgman `clipConvex` when the area is convex; otherwise a strip is
  kept only if wholly inside (even-odd `pointIn`). Strips under 0.05 m² are dropped. Used by the plan (no `slope`)
  and the solids (per face).
- `nextEdge`: *Turn the slope / ridge*; a gable skips sides parallel to its ridge.
- `newRoof`: `edge` = longest side; pitch 25° (shed 10°, pergola 2°); overhang 0.5 m (pergola 0.3 m); flat gets
  overhang 0 and a 0.30 m parapet.
- `roofSummary`: plan area, sloped surface, lowest eaves, top.
- `unionOutlines`: puts rooms together by cancelling edges that a neighbour runs the other way (each ring first made
  clockwise). It needs shared corners, as a layer's regions have. Loops left running the other way (holes, e.g. a
  courtyard) are dropped unless the caller passes a `holes` array, which receives them normalized (`d39aaa9`; only
  `upperworks` does, for slab voids).
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
- `fitRoof(roof, walls)` (`acdb212`; walls as `{a, b, half}`): the same idea as `galleryRoof` for any drawn roof.
  Asked for when the user's carport roof ran over the brick boundary wall and into the house. A side fits a wall that
  runs within 10° of it and alongside it for at least min(1 m, half the side); the move is the wall line's offset
  along the side's inward normal + `half`, i.e. the wall's face toward the roof's inside. Moves beyond ±`FIT_REACH`
  (1.5 m) are ignored; the smallest wins. Fitted sides go to −move, the rest to +`overhang`, via `offsetEdges`, and
  `overhang` becomes 0. Returns the same roof when no side fits. Limit: on a house's own roof it pulls the edges in
  to the walls' inner faces; it is meant for roofs between walls (carports, pergolas).

## Pergola (`59bcfa6`)

Asked for as an outdoor pergola or carport (photos: steel posts and beams with timber rafters under polycarbonate;
timber posts under a metal shed roof). The user's recipe, built from what exists: enclose the area with open edges,
add columns (the automatic ones at ends no wall holds, or a colonnade; [Colonnades](colonnades.md)) and give it a
`pergola` roof. Its open edges' beams follow the roof's underside, and the rafters sit on them.

- `RAFTER` {depth 0.2, width 0.07, spacing 0.6} and `PERGOLA_SHEET` 0.012 m.
- `pergolaRafters(roof)`: plan segments spread evenly along `edge` (the eaves) over the eaves' extent,
  n = max(2, round((span − width) / spacing) + 1). Each runs across the roof and is cut to the eaves polygon at its
  first and last crossing.
- No slab, skylights or soffit; 3-D in [House solids](house-solids.md).
- Checked visually (on a copy of the user's plan): a 6 × 5.5 m test pergola with open edges, a metal colonnade, a
  named area and a 2.6 m polycarbonate pergola roof showed translucent cover, rafters, columns and striped shadows.
- The timber carport the user sent as a reference (`acdb212`) is a pergola in standing seam on a `timber`
  colonnade ([Colonnades](colonnades.md)), fitted with `fitRoof`. The user's carport lives only in their browser
  draft, so it was checked on a copy, not edited.

## Glass roof and grow lights (`8b511e3`)

Asked for as "an assisted light steel greenhouse" behind the house (a photo of a galvanized steel glasshouse), using
the brick boundary wall as its back wall, under a "glass shed with steel and its assisted lights, shed pointing to the
house" (read as: sloping down toward the house, where the user will add a floor drain).

- `ROOF_TYPES` gained `glass` (title *Glass*). It is built like a pergola: one slope, no slab, soffit or skylights.
  `raftersOf(type)` gives `RAFTER` (pergola), `GLAZING_BAR` {depth 0.06, width 0.04, spacing 0.75} (glass) or null,
  and is the test for "a frame under a sheet" in `roofPlanes`, the Roofs panel, the roof plan and the solids.
  `roofThickness` is bar depth + `GLASS_SHEET` (0.01). `newRoof`: pitch 10°, overhang 0.1 m.
- `pergolaRafters` serves both, sized by `raftersOf`. Its axes and crossings were factored into private helpers
  `slopeAxes(roof)` and `chord(ring, origin, dir)`, which `growLights` also uses.
- `RoofSchema.lights?: true` (glass only; `updateRoof` deletes it when patched to undefined). `growLights(roof)`: rows
  `GROW_LIGHT.spacing` (1.2 m) apart up the slope, each parallel to `edge`, so level on a shed, cut to the outline
  inset by `GROW_LIGHT.margin` (0.3 m).
- The greenhouse recipe: the free sides as open edges with *Glazed* columns ([Colonnades](colonnades.md)), a glass
  roof over the outline sloping down away from the wall, *Fit to the walls* to bring its high side to the wall's
  face, and height and pitch chosen so the high side meets the wall's top. On a copy of the user's plan (Invernadero,
  14.2 × 5.1 m against the 2.70 m brick wall; the fitted roof is 5.26 m deep, out to the brick face and over its 0.1 m
  front overhang), a 2.20 m low side gives only 5.4°: glass wants about 10° or more, so
  the user was told that stretch of wall would need to be about 3.10 m high.

`ROOF_TITLES` (a record) is exported from here, not from a component file: oxlint's `react/only-export-components`
allows only literal constants ([Code conventions](code-conventions.md)).
