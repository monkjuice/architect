---
title: "House solids: the plan in 3-D"
type: component
summary: "src/model/solids.ts: houseSolids(plan) turns the visible layers into prisms (outline, holes, bottom, top, palette material, ref): walls at their thickness rising to the roof they carry, lintels, sills, frames, glass and leaves of openings, floors of named areas, flat roofs over rooms and galleries, beams and columns along open edges; cached per plan by getSolids."
tags: [model, 3d, exterior, walls, roof]
sources: []
updated: 2026-11-02
---

# House solids: the plan in 3-D

Added in the eighth session (2026-11-02) for the [Exterior tab](exterior-tab.md). Pure model code, tested in
`src/model/solids.test.ts` (9 tests).

## Output

`houseSolids(plan, source)` returns `Solid[]`: a plan outline (m, +y down) with `holes`, extruded from `bottom` to
`top` (m above the ground). Each has a `kind` (`wall`, `lintel`, `sill`, `beam`, `column`, `frame`, `glass`,
`leaf`, `floor`, `roof`), a `SolidMaterial` palette key (`facade` for exterior walls and structure, `interior` for
walls between rooms, `floor` covered and `paving` open, …) and the `ref` of its plan item. The palette is a
placeholder: nothing is picked per surface yet ([Exterior kept basic](exterior-kept-basic.md)).

## Rules

- Only visible layers are built, as for the plan's shadows and totals.
- Floors only for named areas ([Areas](areas.md)); unnamed regions get nothing.
- A named area's region gets a roof when `isRoofed`: indoor, or no outline in its boundary (a gallery bounded by
  walls and open edges). An area an outline bounds (pool, terrace) is open to the sky. The roof is a flat slab
  (`ROOF_SLAB` 0.20 m) at the height of the region's tallest wall: an automatic placeholder until the Roof tab exists.
- Walls: one prism per `layerWalls` fill, each with its own wall's height through `LayerWalls.owners`
  ([Walls](walls.md)). A wall carrying a roof rises to the roof's top minus `ROOF_LIP` (1 cm).
- Openings ([Doors, windows and gates](doors-and-windows.md)): wall over doors and windows from `DOOR_HEAD` 2.10 m
  (capped at the wall's height); windows on a sill wall up to `WINDOW_SILL` 0.90 m (awnings `HIGH_SILL` 1.50 m);
  frames, glass and closed leaves by style. Gates have no lintel: as tall as their wall, or `GATE_HEIGHT` 1.8 m in
  an open edge.
- An open edge next to a roofed region (sampled 5 cm either side of its midpoint) becomes a beam under the roof. A
  column stands at each end that no wall holds, judged by position (within a wall's half thickness of its
  centreline), not by a shared vertex id: a test caught chains that touch a wall without sharing a vertex.

## Gotcha: coplanar tops flicker

Two faces at the same height z-fight in WebGL. Hence the 1 cm roof lip on walls and `LAYER_LIFT`: each layer's
floors sit 4 mm × layer index higher.

## Caching

`SolidsSource` (`faces`, `walls`) lets `src/state/derived.ts` pass its caches; without one, `houseSolids` works them
out itself (tests). `getSolids(plan)` is cached per plan object, because the result depends on every visible layer
([Editor store and state](editor-store.md)).
