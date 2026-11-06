---
title: Elevations tab
type: component
summary: "Four facades drawn automatically from the house solids, view only: src/model/elevations.ts (main direction from the walls, four views square to it named by compass bearing through site.north, back-face culling on explicit normals, painter's sort by each face's nearest point, facing and smooth per polygon, level marks) and src/ui/ElevationsTab.tsx (fills shaded by facing, in a finish's colour where there is one, smooth facets without outlines, All four or one, layer visibility checkboxes, Save SVG as a standalone drawing)."
tags: [ui, model, elevations, svg, 3d, pool]
sources: []
updated: 2026-11-05
---

# Elevations tab

Added in the eighth session (2026-11-02). The user chose **auto-drawn facades, view only**: heights stay edited on
the Floor tab (walls, [Walls](walls.md)) and the [Roof tab](roof-tab.md). The drawings come from the same
`getSolids(plan)` as the [Exterior tab](exterior-tab.md) ([House solids](house-solids.md)), so they follow every
edit. No three.js: the tab is not lazy-loaded.

## Model (`src/model/elevations.ts`, 4 tests)

- `mainDirection`: the length-weighted circular mean of 4θ over the visible walls, divided by 4: the walls'
  direction modulo a quarter turn.
- `elevationViews`: four views square to it, starting with the side facing the plan's top, then clockwise. Each is
  named by the compass bearing its facade faces, through `site.north` ([Sun and shadows](sun.md)); on the user's
  plan: North-west, North-east, South-east, South-west.
- `elevation(solids, view)`: parallel projection to (u to the viewer's right, z). Faces whose explicit normal does
  not face the viewer are culled. The rest are painted farthest first, ordered by each face's **nearest** point:
  ordering by centroid let a wall's top overdraw the eave that overhangs it. This assumes faces do not
  interpenetrate. Levels: the ground, wall tops, roof bottoms and tops, parapet tops, merged within 15 cm.
- Solids whose top is at most 0.01 m are skipped (`506fd9e`), so sunk pool basins and water stay out of the
  facades (a lot's 1 cm cover on the first layer too). Not 0 because each layer is lifted by `LAYER_LIFT` (4 mm);
  a pool on the fourth layer or higher (lift > 0.01) would still be drawn.
- Each drawn polygon carries `facing` (how squarely its normal faces the viewer, 0.01 to 1) and `smooth` (from
  `Face.smooth`, the side facets of round columns, [House solids](house-solids.md)).

## UI (`src/ui/ElevationsTab.tsx`)

- Row 2: *All four* (a 2×2 grid; click one to open it) or one facade; *Layers* checkboxes set `layer.visible`
  through `updateLayer`, an undoable plan edit that hides the layer on every tab, so the boundary wall can be left
  out; *Save SVG* (one facade only) downloads `<file>-<facade>-elevation.svg`.
- Paper colours (`FILL` per material, `INK`, `PAPER`) are SVG attributes, not CSS, so the saved SVG is standalone.
  `FILL` and `house.ts`'s palette must list the same materials (`foliage` and `bark` were added to both).
  A polygon with a `finish` (from its face or solid) is filled in that catalogue colour instead of `FILL`
  ([Materials and finishes](materials-and-finishes.md)).
  `shade` darkens a fill as its face turns away (0.72 + 0.28 × facing), so a round column reads round.
- Smooth facets are stroked in their own fill colour instead of `INK`. When every facet was outlined, Roman columns
  (20 facets each) drew as black bars.
- Level marks sit on the right; a label closer than about 1.3 text heights to the one below is dropped. The overall
  width is dimensioned underneath.

Not there yet: other dimensions, sections, editing heights from the drawing.
