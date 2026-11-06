---
title: Materials and finishes
type: component
summary: "A materials catalogue (src/model/materials.ts: 32 MATERIALS by family, each with the surfaces it suits and whether it works indoors and/or outdoors, a checkered tile drawn as squares, tile sizes, a stone pool lining under water; brick, wood, lawn, standing seam metal, square tiles and stacked stone textured in 3-D with relief by src/render/textures.ts; suits, materialGroups, findMaterial) and finishes on wall sides, area floors, roofs and fireplaces (src/model/finishes.ts: sides named left/right looking a→b, a side outdoor unless the region past its face is an indoor room, lots counting as outdoor; finishProblem; segment.finish, area.floor and roof.finish/soffit in the plan), set by the Material tool, library drags, the Selection panel or the Roofs section, drawn in plan (Finishes.tsx, AreaFills; off with View > Materials), in 3-D and in the elevations."
tags: [model, materials, finishes, walls, areas, roof, ui, 3d, library, lots, textures, pool, fireplace]
sources: []
updated: 2026-11-05
---

# Materials and finishes

Added on 2026-11-04 (`839dce5`). It replaces the "no materials in the plan" part of
[Exterior kept basic](exterior-kept-basic.md) and answers the user's fourth-session points: a table of what each
material can go on, and materials shown in groups.

## Catalogue (`src/model/materials.ts`)

- `MATERIALS`: 32 entries in picker order, a family (`group`) at a time: plaster and paint, brick and stone,
  concrete, wood, ceramic, metal, glass, roofing, ground and garden. Each has `surfaces` (`wall`, `floor`,
  `ceiling`, `roof`, `door`, `frame`), `indoor`/`outdoor` flags, and `color`, `roughness`, `metalness`, `clear` for
  the renderers. `wall`, `floor`, `roof` (a roof's covering) and `ceiling` (its soffit) are used so far.
  `metal-standing-seam` (Metal; roof and wall; outdoor; dark grey, metalness 0.55) came in `20dcb35`, after the user
  showed photos of a dark standing seam roof over a wood soffit.
- `pattern` draws the library swatch (`MaterialIcon`) and, since `69111af`, picks the 3-D texture for `brick`,
  `planks`, `grass` and (since `20dcb35`) `seams` (src/render/textures.ts): real-size canvases (brick 512 px/m, a
  1 × 0.516 m repeat; boards 256 px/m, 2.5 × 0.9375 m; lawn 128 px/m, 8 m, as 4 m showed as a grid from above;
  standing seam 256 px/m, four 0.45 m panels × 1 m, 2.5 cm ribs lit on one flank) with a normal map from a painted
  height field. Normal maps, not bump maps: three's bump strength follows screen pixels (it normalises the surface
  derivatives), so relief would come and go with zoom; brick arrises are rounded over 3 px because a 1 px edge only
  shows up close. Painted once per material and cached for the session (`finishTextures`, never disposed with the
  house); seeded by the material id so it looks the same each time. The engine's ground uses clones of the lawn's
  textures, and palette `brick` (fireplaces, chimneys) uses `brick-red`'s. Other patterns and the elevations are
  still flat colours.
- Since `4097821` (from the user's stone pool and parrilla photos): `tiles` and `stone` textures too.
  - `tile` (m) sizes a `tiles` pattern's squares: marble, granite, porcelain and `stone-slab` ("Large stone slabs",
    floor and wall, both settings) 0.6, pavers 0.4, terracotta 0.3. Recipe ~256 px/m, 4×4 tiles (8×8 under 0.4 m);
    `paintTiles` varies the tone per tile, widely for stone (with `mottle()` blots), barely for porcelain.
  - `water: true` marks a pool lining seen through water: `pool-stone` (0.2 m green-grey tiles, #2c6b67; the first
    #3f8a86 looked washed out next to the photo) gets a green/blue shift and light ripple strokes.
  - Relief depth 0.006 for natural stone (family Brick and stone, or `water`), else 0.003.
  - `stone` (`paintStone`, used by `stone-cladding`): stacked stone in courses 0.08–0.20 m high filling a 2 × 1 m
    repeat, stones 0.18–0.6 m long wrapping round the edge, dark recessed joints, bulging faces, depth 0.015.
- **No sunken pool**: the 3-D ground plane is opaque at height 0, so a pool is a floor slab with its lining painted
  into the "water" texture. A deliberate approximation, not a bug.
- `checker: {colors: [dark, light], tile}` (since `64f59b7`, only `tile-checkered`: Ceramic, floors, indoors and
  out, 0.3 m squares) is drawn as real squares in the swatch, the plan and 3-D (see below). Its `color` holds the
  mix of the two colours, for places where the squares don't show (the elevations).
- `suits(material, surface, outdoor)`; `materialGroups(surface, outdoor?)` lists what suits, by family, and treats
  an omitted `outdoor` as "either" (the library lists everything for the surface; the Selection panel passes
  the side's or floor's actual outdoor flag); `findMaterial(id)`.

## Sides and outdoor (`src/model/finishes.ts`)

- A wall's sides are `left`/`right` looking from segment `a` to `b`, as door swings are. `sideNormal`: the left of
  a→b is (d.y, −d.x), because +y is down. `sideOf(a, b, p)` picks the side a point is on.
- `wallSide(layer, regions, half, segment, side)` samples the region 5 cm past the face at the wall's midpoint. A
  side is **outdoor unless that region is indoor**, so the outside, a gallery and a pool all count as outdoor
  ([Indoor means unreachable from outside](indoor-reachability-rule.md)). A side facing a lot is outdoor too, even
  though the lot's boundary walls make its region indoor. A floor is outdoor when its region is not indoor or its
  area is a lot ([Lots](lots.md)).
- `finishProblem(material, surface, outdoor)` gives the refusal text.

## In the plan

`segment.finish` `{left?, right?}`, `area.floor` and (since `20dcb35`) `roof.finish` (the covering) and
`roof.soffit` (the underside), and (since `4097821`) a fireplace's `finish` for its masonry
([Fireplaces](fireplaces.md)), all material ids. They are additive at schemaVersion 1
([Plan model and file format](plan-model.md)). Ids are not checked against the catalogue: an unknown id is kept in
the file but drawn plain. Edits in `edit.ts`: `setWallFinish` (walls only; `null` clears a side),
`setAreaFloor(refs)` and `updateRoof` (patching `finish` or `soffit` to undefined deletes the key). A split keeps a→b, so finishes survive splits and wall → open edge → wall switches.

Suitability is checked only when a finish is applied. If the plan changes later (for example, a room becomes a
gallery), the finish stays, and the Selection panel lists it as "(does not suit it)".

## Editor

- **Material tool** (`canvas/tools/material.ts`, ToolId `material`, no key) applies `EditorState.materialPick`
  `{id, surface}` (default white plaster, wall), set by the library. Hovering highlights the face line or the floor
  region and tags any problem.
- `actions.ts`: `finishTarget(surface, p, reach)` is either the wall within reach (through `hitTest`) and the side
  `p` is on, or the smallest named area around `p` on an editable layer. `applyFinish` refuses with a notice, then
  edits and selects. `dropMaterial` handles `MATERIAL_DRAG_TYPE` data `"wall:<id>"` / `"floor:<id>"`.
- Plan: `FinishLayer` (`canvas/Finishes.tsx`) draws a line in the material's colour just inside each finished face,
  broken at openings. `AreaFills` tints floors in their material (class `finished`). A checkered floor is filled
  with `url(#finish-<id>)`: `FinishPatterns` renders one `<pattern>` per checkered material in plan units (m,
  `patternUnits="userSpaceOnUse"`), once in Canvas's svg.
- **View > Materials** (`prefs.materials`, default on, per browser): when it is off, `FinishLayer` is not drawn and
  `AreaFills` gets `materials={false}` (layer tint only). This affects the plan only. The Exterior and the elevations
  still show materials.
- Selection panel: one `MaterialField` per wall side, labelled by screen side and what it faces ("Top side, facing
  Cocina"), plus a floor field on areas. `MaterialField` lives in `src/ui/fields.tsx` (since `20dcb35`) and takes
  any `Surface`.
- Roofs section (`RoofPanel`): *Covering* (roof materials that work outdoors) and *Soffit (its underside)* (ceiling
  materials outdoors). The roof plan tints a covered roof's slopes in the material's colour ([Roof tab](roof-tab.md)).
- Library: the Materials group, with Walls and Floors boxes (family subheadings and a count of wall sides or floors
  per material) ([Code conventions](code-conventions.md)). `.library-name` ellipsizes long names. The catalogue title
  "Checkered tile" was shortened for that reason: the full name overflowed.

3-D and elevations: [House solids](house-solids.md) (face tagging and the reveal split, roof covering, soffit and
fascia, lot covers), [Exterior tab](exterior-tab.md) (textures, face UVs along a slope, the upside-down wall UVs),
[Elevations tab](elevations.md).
