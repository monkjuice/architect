---
title: "House solids: the plan in 3-D"
type: component
summary: "src/model/solids.ts: houseSolids(plan) turns the visible layers into solids made of flat faces with explicit outward normals (kind, faces, bottom, top, palette material, ref; round facets marked smooth; face types and builders in faces.ts): walls at their own height, lintels, sills, frames, glass and leaves of openings, floors of named areas, pools sunk to their depth with water under the rim, the roofs drawn on the Roof tab with parapets, exterior walls filled up to a roof's underside (gable ends), beams under roofs along open edges on columns, colonnades (Roman or metal columns under a beam), masonry fireplaces and parrillas with chimneys through the roof, and furniture (furniture3d.ts); wall faces tagged per side with their finishes (reveals split at the centreline) and floors with theirs; cached per plan by getSolids."
tags: [model, 3d, exterior, elevations, walls, roof, colonnades, fireplace, furniture, finishes, lots, gallery, pool, levels, steps, skylights, grain]
sources: []
updated: 2026-11-06
---

# House solids: the plan in 3-D

Added in the eighth session (2026-11-02) for the [Exterior tab](exterior-tab.md), and rewritten the same day as
faces for the roofs and the [Elevations tab](elevations.md). Colonnades, fireplaces, furniture and finishes came on 2026-11-04.
Pure model code, tested in `src/model/solids.test.ts` (15 tests; furniture solids in `furniture.test.ts`, finished
faces in `finishes.test.ts`).

## Output

`houseSolids(plan, source)` returns `Solid[]`: `{kind, faces, bottom, top, material, ref}`. A `Face` has `pts`
(`Vec3`: plan x, y with +y down, z up), `holes` and an explicit unit `normal` pointing out of the solid (optional:
`smooth`, `finish`, and since `81ba2bd` `grain`, the way a texture runs, [Exterior tab](exterior-tab.md)). Consumers
use the normals, never the winding: the three.js renderer winds triangles to them and the elevations cull by them.
The types `Face`/`Vec3` and the generic builders live in `src/model/faces.ts` (moved out of `solids.ts`, which
re-exports the types, so `furniture3d.ts` can use them while `solids.ts` imports `furniture3d.ts`, with no import
cycle): `prismFaces` (an outline with holes between two heights), `profileFaces` (a shape in a vertical plane along a
line, given a thickness), `ring`, `frustumFaces` and `band`. `smoothSides` sets `Face.smooth` on a round solid's
side facets, so the elevations draw them as one surface ([Elevations tab](elevations.md)). `roofSolidFaces` (each
roof face on top and underneath, plus its eaves edge) and `columnFaces` stay in `solids.ts`.

Kinds: `wall`, `lintel`, `sill`, `infill`, `beam`, `column`, `frame`, `glass`, `leaf`, `floor`, `roof`, `parapet`,
`fireplace`, `chimney`, `furniture`. Materials are a fixed palette ([Exterior kept basic](exterior-kept-basic.md)): `facade`
(exterior walls and structure), `interior`, `roof` (pitched, terracotta), `slab` (flat, grey), `frame`, `glass`,
`door`, `gate`, `floor` (covered), `paving` (open), since 2026-11-04 `stone`, `metal`, `brick` and `soot`, and for
furniture `ceramic`, `wood` and `fabric` (since `506fd9e` also `foliage` and `bark`, trees and firewood). Their
colours are set twice, in `src/render/house.ts` and `src/ui/ElevationsTab.tsx`.

Finishes override the palette ([Materials and finishes](materials-and-finishes.md)): `Face.finish` (wall pieces, roof faces) and
`Solid.finish` (floors; a fireplace's `brick` parts, since `4097821`; a furniture part's `finish`, since `81ba2bd`) hold a catalogue id, and only ids `findMaterial` knows are set. `house.ts` makes one mesh
per material key (palette name or `"finish:<id>"`), so a wall finished on one side is two meshes.
`ElevationPolygon.finish` (face's, else solid's) gives the elevation fill.

## Rules

- Only visible layers are built, as for the plan's shadows and totals.
- Floors only for named areas ([Areas](areas.md)). `isCovered` (formerly `isRoofed`): indoor, or no outline in the
  boundary (a gallery) → `floor`; otherwise (pool, terrace) `paving`. It no longer creates roofs; *Roof the house*
  uses it to pick areas ([Roof tab](roof-tab.md)).
- A lot ([Lots](lots.md)) is the ground itself and gets no slab. When finished (lawn, say), it gets a `GROUND`
  (0.01 m) `paving` prism carrying its finish, under the 0.03 m floors. Before lots, a walled-in site got a 3 cm
  `floor` slab that hid the pool's water.
- Pools (`506fd9e`, steps since `f565552`): an area with `depth` ([Areas](areas.md)) is not a slab but a basin
  (kind `floor`, palette `ceramic`, `Solid.finish` = its floor unless that is the clear `water`), plus a 1 cm
  `glass` slab finished `water` `POOL_WATER` (0.1 m) under the rim. The lining is the bottom face turned to face up
  plus one side per ring edge, from −depth up to −(depth of the pool region across that edge, `poolDepths`, else 0),
  left out when that neighbour is as deep or deeper. So pool parts split by an outline meet at a riser, never a wall
  through the water, under one water level. `Solid.hole` tells the renderer to cut the ground
  ([Exterior tab](exterior-tab.md)): `houseSolids` first takes `unionOutlines` of each visible layer's pool regions,
  and a basin's hole is the union ring containing its `at`, so a pool and its steps open one hole. A lot's lawn cover
  on any layer is cut by the rings wholly inside its outline.
- Floor level (`f565552`): on a layer with `level` > 0 ([Plan model](plan-model.md); Layers panel, active layer
  only) every solid `layerSolids` made with bottom ≥ 0 is lifted by `raise`; pool basins stay in the ground. Then
  `groundworks` adds a `slab` plinth from 0 to `level` under the union of the covered named areas (no lots or pools),
  offset `EXTERIOR_WALL/2` to the walls' outside faces, and `stone` steps (`STEP`: rise ≤ 0.18 m, tread 0.30 m;
  ceil(level/0.18) − 1 treads, lower further out): outside each door whose side (`wallSide`) faces no covered
  region, door width + 0.3 m wide from the wall face, and along each open edge with a covered region on one side
  only, from `EXTERIOR_WALL/2` out. Limit: two such open edges meeting at a corner leave a notch there.
- No automatic roof: roofs come only from `layer.roofs` ([Roofs are drawn outlines](roofs-drawn-outlines.md)).
  Each gives one `roof` solid ([Roofs: model and geometry](roofs.md)); a flat one with a parapet adds a `parapet`
  ring on its eaves, `PARAPET_WALL` thick, from `height + SLAB`. Since `20dcb35` the roof's `finish` (covering)
  goes on faces with `normal.z > 0.01` and its `soffit` on faces with `normal.z < -0.01`, which covers both the
  underside of the eaves and a gallery's ceiling. The eaves edge (fascia) takes the covering on pitched roofs and
  stays plain on flat ones, where gravel or a membrane on the fascia would look wrong.
- Skylights (`8d33d0b`): `roofSolidFaces` cuts each face's `skylights(roof, face.pts)` ([Roofs](roofs.md)) as holes
  in its top and bottom faces, and adds vertical sides facing into each hole; with `normal.z` 0 they are tagged like
  the fascia (covering on pitched roofs). A separate `glass` solid (ref the roof) holds a pane per hole at
  mid-thickness, as two faces (up and down) so it shows from above and below. `house.ts` gives glass no shadow, so
  the sun falls through onto the floor.
- Walls: one prism per `layerWalls` fill at its own wall's height (`LayerWalls.owners`, [Walls](walls.md)).
- Under overlapping roofs, the one with the highest underside at a point counts.
- Walls stop at roofs (`b5b8220`, per wall since `96a2afa`). After the roofs are listed, each segment's `wall` and
  `lintel` solids get one roof, `roofOver(midpoint)`: the highest underside among the roofs whose outline contains
  the midpoint, else the lowest among those whose eaves cover it, else none (no trim). That roof's underside caps
  every top point of those solids (only lowers them); top faces get a new normal from `upward` (Newell's method).
  Added because a gallery's 3.5 m end walls poked through its tucked-under roof. Rejected: the highest roof
  everywhere (a corner piece poked through); the lowest everywhere (cut the house wall under the gallery's overhang,
  opening a gap below the house roof); and the first version's per-point choice. Per point, the gallery end wall's
  mitre reached into the house wall corner, inside the house roof's outline, so its top sloped up from 3.2 to 3.5 m
  through the gallery roof. A wall under its own roof keeps its height, because the underside at the walls' outside
  faces equals the wall height. The wall the gallery leans on is inside the house roof, so it keeps its height too,
  which is why `galleryRoof` stops at its face ([Roofs](roofs.md)).
- Debugging lesson: a white patch where a gallery roof meets the house was twice misjudged from screenshots, once
  as a gable infill seen between the roofs; it was the end wall poking through, as above. A node probe over `houseSolids` listing
  non-roof top faces above the gallery roof's underside found it quickly. Probe before trusting a screenshot.
- `infill`: an exterior wall whose midpoint is under a roof that rises above the wall's top is filled up to the
  underside profile (`undersideAlong`): gable ends, a shed's high side. Walls between rooms are not filled.
- Openings ([Doors, windows and gates](doors-and-windows.md)): wall over doors and windows from `DOOR_HEAD` 2.10 m,
  or a door's own `height`, capped at the wall's height; the lintel is built only with more than 1 mm of wall above
  the head, so a door as tall as its wall gets none (no zero-height lintel). A door in a 2.70 m wall set to 3.5 m
  comes out 2.70 m. Windows on a sill up to `WINDOW_SILL` 0.90 m (awnings `HIGH_SILL` 1.50 m); frames,
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
- Wall finishes, a pass after walls, openings, infills and beams: each `wall`/`lintel`/`sill`/`infill` face of a
  finished wall whose normal is within 0.99 (dot product) of the left normal (`sideNormal`) takes the left finish,
  and likewise for the right. Vertical faces across the wall (ends, door and window reveals, mitres) are split at the
  centreline with `clipFace(face, d)` (`faces.ts`), and each half takes its own side's finish. Without the split,
  reveals drew as pale stripes beside every window on a brick facade. Tops, bottoms and faces with holes keep the
  base material. A floor carries `area.floor` as `Solid.finish`.
- Fireplaces ([Fireplaces](fireplaces.md)) are built after the roofs, because the chimney's height needs the roof
  over its flue: brick and stone up to the `MANTEL` (1.10 m), or a parrilla's counter, grill and hood up to 2.3 m,
  then the chimney to `CHIMNEY_ABOVE` (1 m) over that roof (thickness and a flat roof's parapet included), or 1 m
  over its wall, under a stone cap. Their walls are not cut.
- Furniture last: `furnitureParts(f, placeFurniture(layer, f))` from `src/model/furniture3d.ts`, one `furniture`
  solid per part, ref to the piece; a kitchen sink without its counter is skipped
  ([Furniture and fixtures](furniture.md)).

## Gotcha: coplanar faces flicker

Two faces at the same height z-fight in WebGL, hence `LAYER_LIFT`: each layer's floors sit 4 mm × layer index
higher. (The 1 cm roof lip went with the automatic roof.) The parrilla's hearth topped out at 0.03 m, level with
the area floors (`FLOOR`), and flickered; it now stands at `FLOOR + 0.02` ([Fireplaces](fireplaces.md)). Keep new
ground-level parts off 0, `GROUND` and `FLOOR`.

## Caching

`SolidsSource` (`faces`, `walls`) lets `src/state/derived.ts` pass its caches; without one, `houseSolids` works them
out itself (tests). `getSolids(plan)` is cached per plan object, because the result depends on every visible layer
([Editor store and state](editor-store.md)).
