---
title: Areas
type: concept
summary: "An area is a named point ({name, at} in layer.areas) whose outline is the region of its layer's lines enclosing the point, Revit-room style; a room shows its floor area inside the wall faces and a lot (lot: true) its area to the lot lines (areaSize); coveredArea totals indoor rooms with their walls, lots excluded; regions and placed areas are cached per object in src/state/derived.ts (planAreas per plan); one area per region, \"not enclosed\" when the lines open; Area tool and label dragging."
tags: [model, areas, regions, state, ui, lots, pool, storeys]
sources: []
updated: 2026-11-07
---

# Areas

## Model

- `layer.areas` maps an id (`a1`, `a2`…) to `{ name, at }`. The outline is not stored. As with a Revit room, the
  area is the region of its own layer's lines that encloses `at` ([Regions](regions.md)), so its size follows the
  walls when they move. Walls, open edges and outlines bound it alike
  ([Open edges and outlines are segment kinds](segment-kind-not-layer.md)), so a pool drawn with outlines is an
  area. Doors and windows do not open it: a room stays
  closed through its doors ([Doors and windows](doors-and-windows.md)).
- An area may also carry `floor`, a material id. Only named areas take floor finishes, as only they get floors in
  3-D ([Materials and finishes](materials-and-finishes.md)).
- An area may be marked `lot: true`: land, not a room. A lot is outdoor, sized to its boundary lines and kept out
  of the room totals ([Lots](lots.md)).
- An area may carry `depth` (m, positive, at most 5; `506fd9e`): it is a pool, built in 3-D as a sunk basin with
  water ([House solids](house-solids.md)). `setAreaDepth(plan, layer, id, depth)` (0 removes it); the Selection
  panel shows *Pool depth* for outdoor areas that are not lots. Pool steps (`f565552`): split the pool with an
  outline and give each part its own depth; the parts meet at a riser under one water level. Steps drawn as walls
  left thin walls standing in the water.
- Overlapping areas: on one layer, crossing outlines split into new, unnamed regions; on two layers, the floors
  overlap and flicker. So where the two streets round the user's lot cross ("Calle Labarden" and "Calle Enrique
  Larreta", `dirt` floors on layers of their own, user data), the crossing belongs to one road and the other stops
  at its edges.
- When nothing encloses `at` (walls deleted or opened), the area stays. Its label turns into a dashed "not
  enclosed" warning at `at`, and it counts 0 in the Areas panel total. Deleting walls never deletes areas; only
  selecting an area and deleting it does (`deleteItems`).
- The editor keeps `at` at the region's label point, deep inside, so moving walls rarely leaves it outside.
- Edits in `src/model/edit.ts`: `addArea`, `updateArea`, `setAreaAnchors`, and `moveAreas` (to another layer,
  used with `moveSegments` by the Selection panel). They replace only the layer's `areas` map and keep its
  `vertices` and `segments` maps, so cached regions stay valid.

## Derived data (`src/state/derived.ts`)

Adapted from the Forge H1 planner's `derived.ts` ([Stack adapted from the Forge H1 planner](forge-h1-stack.md)):

- `getRegions(layer)` is cached in a nested WeakMap keyed on the layer's `vertices` map, then its `segments` map.
  Renaming or moving an area replaces the layer object but not those maps, so the regions are not recomputed.
- `getPlacedAreas(layer)` gives each area with its region and label position (the region's label, or `at` when not
  enclosed), cached per layer object.
- `planAreas(plan)` (cached per plan) gives every layer's placed areas, with lot labels moved off the other layers'
  areas ([Lots](lots.md)). `visibleAreas(plan)` filters it to the visible layers, bottom layer first (labels, Areas
  panel), and the select tool's `editableAreas` filters it to the editable ones.
- `areaSize(a)`: a room's `region.floor`, a lot's `region.area`; null when not enclosed.
- `coveredArea(plan, storey?)` (superficie cubierta, to the walls' outside faces; with `storey`, that floor's layers
  only, [Floors](storeys.md)): for each visible layer, the `floor` of
  every named area whose region is `indoor` and that is not a lot, plus the `footprint` of the walls bounding those regions (`wallIds`),
  each wall once ([Walls](walls.md), [Indoor means unreachable from outside](indoor-reachability-rule.md)).
  Galleries, porches, pools and unnamed regions are left out. A 10 × 6 m house with 0.30 m outer walls comes to
  10.30 × 6.30 = 64.89 m².

## Sizes

Labels, the Area tool, the Areas panel and the Selection panel show the region's `floor`, the area inside the wall
faces (the standard room size, [Regions](regions.md)). A lot shows its size to the centrelines instead (`areaSize`). The
Selection panel's hint also gives the size to the centrelines. The Areas panel shows *Total floor* (rooms only) and
*Covered, with walls* (`coveredArea`, every floor). When there are lots, it also shows *Lots*, *Lot covered* % (ground
floor, FOS) and, when upper floors add to it, *Lot built* % (FOT) ([Lots](lots.md)). With more than one floor the list
is grouped under floor headings (`.area-list-floor`).

## In the editor

- **Area tool** (`src/ui/canvas/tools/area.ts`, `A`): hovering outlines the region with its size. A click asks for
  a name (`store.askText`) and adds the area at the region's label point, on the first editable layer whose lines
  enclose the click (the active layer first, then the rest from the top). Clicking a region that is already named
  selects its area.
- **Select tool**: area labels are hit first, using screen-size boxes (`src/ui/canvas/areas.ts`) sized to the lines
  the View section shows (*Area names*, *Area sizes*); with both off there is no label to grab. A click inside a
  named region without dragging selects the smallest such area. Box select (`areasInBox`, by `at`) and Ctrl+A include
  areas, so moving a whole house carries its labels.
- **Dragging a lone label** moves `at`. The label is always drawn at the middle of the region that contains `at`,
  so it jumps from room to room. On drop, `at` settles at that region's label point. A drop into a region that
  another area already names is refused (`cancelGesture` and an error notice): one area per region.
- **Drawing** (`src/ui/canvas/Scene.tsx`): `AreaFills` tints the named regions under the lines. A selected area
  gets a tint in the selection colour and no outline, because an outline hid the dashes of open edges. `AreaLabels` draws name and m² pills.
  `AreasPanel` lists the areas with their totals.

## Known limits (2026-11-02)

- An area is not re-anchored when walls move past its point.
- There is a covered total but no semi-covered one (galleries, porches); each region reports its open boundary
  length and `indoor` flag.

Related: [Plan model and file format](plan-model.md), [Canvas and tools](canvas-and-tools.md).
