---
title: "House solids: the plan in 3-D"
type: component
summary: "src/model/solids.ts: houseSolids(plan) turns the visible layers into solids made of flat faces with explicit outward normals (kind, faces, bottom, top, palette material, ref; round facets marked smooth): walls at their own height, lintels, sills, frames, glass and leaves of openings, floors of named areas, the roofs drawn on the Roof tab with parapets, exterior walls filled up to a roof's underside (gable ends), beams under roofs along open edges on columns, colonnades (Roman or metal columns under a beam), and masonry fireplaces with chimneys through the roof; cached per plan by getSolids."
tags: [model, 3d, exterior, elevations, walls, roof, colonnades, fireplace]
sources: []
updated: 2026-11-04
---

# House solids: the plan in 3-D

Added in the eighth session (2026-11-02) for the [Exterior tab](exterior-tab.md), and rewritten the same day as
faces for the roofs and the [Elevations tab](elevations.md). Colonnades and fireplaces came on 2026-11-04. Pure model
code, tested in `src/model/solids.test.ts` (15 tests).

## Output

`houseSolids(plan, source)` returns `Solid[]`: `{kind, faces, bottom, top, material, ref}`. A `Face` has `pts`
(`Vec3`: plan x, y with +y down, z up), `holes` and an explicit unit `normal` pointing out of the solid. Consumers
use the normals, never the winding: the three.js renderer winds triangles to them and the elevations cull by them.
Builders: `prismFaces` (an outline with holes between two heights), `profileFaces` (a shape in a vertical plane
along a line, given a thickness), `roofSolidFaces` (each roof face on top and underneath, plus its eaves edge),
`ring` and `frustumFaces` (round solids as polygons) and `columnFaces`. `smoothSides` sets `Face.smooth` on a round
solid's side facets, so the elevations draw them as one surface ([Elevations tab](elevations.md)).

Kinds: `wall`, `lintel`, `sill`, `infill`, `beam`, `column`, `frame`, `glass`, `leaf`, `floor`, `roof`, `parapet`,
`fireplace`, `chimney`. Materials are a fixed palette ([Exterior kept basic](exterior-kept-basic.md)): `facade`
(exterior walls and structure), `interior`, `roof` (pitched, terracotta), `slab` (flat, grey), `frame`, `glass`,
`door`, `gate`, `floor` (covered), `paving` (open), and since 2026-11-04 `stone`, `metal`, `brick` and `soot`. Their
colours are set twice, in `src/render/house.ts` and `src/ui/ElevationsTab.tsx`.

## Rules

- Only visible layers are built, as for the plan's shadows and totals.
- Floors only for named areas ([Areas](areas.md)). `isCovered` (formerly `isRoofed`): indoor, or no outline in the
  boundary (a gallery) → `floor`; otherwise (pool, terrace) `paving`. It no longer creates roofs; *Roof the house*
  uses it to pick areas ([Roof tab](roof-tab.md)).
- No automatic roof: roofs come only from `layer.roofs` ([Roofs are drawn outlines](roofs-drawn-outlines.md)).
  Each gives one `roof` solid ([Roofs: model and geometry](roofs.md)); a flat one with a parapet adds a `parapet`
  ring on its eaves, `PARAPET_WALL` thick, from `height + SLAB`.
- Walls: one prism per `layerWalls` fill at its own wall's height (`LayerWalls.owners`, [Walls](walls.md)).
- Under overlapping roofs, the one with the highest underside at a point counts.
- `infill`: an exterior wall whose midpoint is under a roof that rises above the wall's top is filled up to the
  underside profile (`undersideAlong`): gable ends, a shed's high side. Walls between rooms are not filled.
- Openings ([Doors, windows and gates](doors-and-windows.md)): wall over doors and windows from `DOOR_HEAD` 2.10 m
  (capped at the wall's height); windows on a sill up to `WINDOW_SILL` 0.90 m (awnings `HIGH_SILL` 1.50 m); frames,
  glass and closed leaves by style. Gates have no lintel: as tall as their wall, or `GATE_HEIGHT` 1.8 m in an open
  edge.
- Colonnades ([Colonnades](colonnades.md)): a beam `COLUMNS[style].beam` deep (Roman: stone, 1.1 × the shaft wide;
  metal: steel, 0.12 m) following the underside of the roof over the edge's midpoint, or level at the layer's
  tallest wall when there is none (`heightAlong` reads the profile at each column). Columns from `layerColonnades`
  rise to the beam's bottom; none under 0.6 m. `columnFaces`: Roman = plinth, round base, shaft narrowing to
  0.86 r, flaring capital, abacus (20 sides); metal = thin plates and a 12-sided post.
- Any other open edge whose midpoint is under a roof becomes a beam (`BEAM_DEPTH` 0.30 m) following the underside.
  A point within 1 cm of the eaves counts: a gallery front drawn on the roof's edge got no beam before, which a test
  caught. A square column, up to the beam's bottom, stands at each end that no wall holds (`heldByWall`, judged by
  position within a wall's half thickness of its centreline, not by a shared vertex id) and no colonnade column
  already stands on.
- Fireplaces ([Fireplaces](fireplaces.md)) are built after the roofs, because the chimney's height needs the roof
  over its flue: brick and stone up to the `MANTEL` (1.10 m), then the chimney to `CHIMNEY_ABOVE` (1 m) over that
  roof (thickness and a flat roof's parapet included), or 1 m over its wall, under a stone cap. Their walls are not
  cut.

## Gotcha: coplanar faces flicker

Two faces at the same height z-fight in WebGL, hence `LAYER_LIFT`: each layer's floors sit 4 mm × layer index
higher. (The 1 cm roof lip went with the automatic roof.)

## Caching

`SolidsSource` (`faces`, `walls`) lets `src/state/derived.ts` pass its caches; without one, `houseSolids` works them
out itself (tests). `getSolids(plan)` is cached per plan object, because the result depends on every visible layer
([Editor store and state](editor-store.md)).
