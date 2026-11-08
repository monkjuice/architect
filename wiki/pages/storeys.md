---
title: "Floors: upper storeys, lofts and stairs"
type: component
summary: "Every layer is on a floor (LayerSchema.storey 1–3, absent = ground; src/model/storeys.ts): an upper floor stands on a 0.30 m slab under its named areas (unnamed spaces such as a stairwell stay open), open edges with a floor on one side only get a glass railing, outlines stay plain; storeyView in derived.ts limits the canvas and every pick to the active layer's floor, with the floor below drawn faded and snapped to; + Floor and the Floor switcher in the toolbar; a straight stair (furniture kind stair) climbs to the floor above; Areas by floor with FOS (ground) and FOT (all floors)."
tags: [model, 3d, canvas, levels, storeys, stairs, railing, loft, areas]
sources: []
updated: 2026-11-07
---

# Floors: upper storeys, lofts and stairs

Added on 2026-11-07 at the user's request ("support for building 2nd floor or a loft").

## Model

- `LayerSchema.storey` (int 1–3, optional; absent = ground floor) and `level` (now up to 20 m). `storeyOf(layer)`
  in `src/model/plan.ts`. Floors are layers, not a new collection: a floor can hold several layers, and
  everything per layer (regions, walls, roofs, picking, undo) works unchanged. Still `schemaVersion` 1
  ([Plan model](plan-model.md)).
- `src/model/storeys.ts`: `UPPER_SLAB` 0.30 m, `MAX_STOREY` 3, `RAILING` 1 m, `storeyName` (Ground, 1st, 2nd,
  3rd floor: the Argentine/European count), `storeyLevel` (a floor's lowest layer's level, or for a new floor the top
  of the walls below + slab: 3.00 m over 2.70 m walls), `stairRise` (to the next floor's level, else tallest wall +
  slab) and `addStorey`.
- The stair is a furniture kind (`StairSchema`, no style; `snap: 'none'`; 0.9 × 4.5 m), climbing from its front
  (local +y, the dot) to its back (the arrow). `stairTreads(depth)` = round(depth / 0.28); risers = treads + 1, the
  last one being the upper slab's edge. Plan symbol and 3-D (`furnitureParts(f, pl, rise)`, one `profileFaces`
  concrete flight with a sloping underside) both use it ([Furniture](furniture.md)).

## 3-D

`houseSolids` raises an upper layer by its level like a plinth layer, then calls `upperworks` instead of
`groundworks` ([House solids](house-solids.md)): a `slab` prism from level − 0.30 to level under the union of the
named areas (not lots or pools), offset `EXTERIOR_WALL/2`, with holes for the holes of those regions that hold no
named area (a stairwell inside a room); and kind `railing` (steel posts ≤ 1.5 m apart, a glass pane, a steel
handrail) along each open edge with a named region on exactly one side. On an upper floor an open edge gets a beam
and columns under a roof only when one side is the outside (no region), so a stairwell's edges get none. The
elevations mark slab tops as levels.

Double-height rooms (`9f30985`): draw the roof over one on the floor above. A lower layer's walls (exterior, or
interior at a step between roofs) and chimneys rise to a higher floor's roof where the layer has no roof of its own
and no named area of that floor is over the wall's sides ([House solids](house-solids.md), `infill`).

The rule "open edge = railing, outline = plain" was chosen so the user controls it by line kind: an outline is
where a stair arrives, or a loft's edge against a wall or roof of the floor below.

The [Exterior tab](exterior-tab.md)'s *Up to* hides the floors above a chosen one (`prefs.topStorey`), matching
solids to floors by `ref.layer`.

## Canvas and tools

`storeyView(plan, activeLayer, below?)` in `src/state/derived.ts` returns the plan with only the active layer's
floor (and with `below`, the next floor down), cached per plan. Canvas.tsx draws the floor below in a
`.underlay` group (opacity 0.3, no pointer events) and only the active floor's layers on top; floors above do not
show. Every hit test and target uses the view (select, area, opening, measure, roof, roof-select tools;
`dropOpening`, `finishTarget`, `colonnadeTarget`, `fitRoofToWalls`); snapping uses the view with `below`, to trace
the floor below. **Never build an edit from the view**: it lacks the other floors' layers. Edits keep using the
store's plan.

`EditorStore.setActiveLayer` drops selected items of other floors. `StoreyPicker.tsx` (Floor and Roof tabs) shows
the Floor switcher (`showStorey`) and + Floor (`addFloor`); the Layers section sets a layer's floor
(`moveLayerToStorey`, which takes that floor's level) and level (≤ 3 m on the ground floor), and + Add puts the new
layer on the active floor. Wall shadows on the plan add the layer's level ([Sun](sun.md)). The Areas panel groups
by floor; `coveredArea(plan, storey?)` gives the ground floor's share for FOS and every floor's for FOT
([Areas](areas.md)).

## Open

No L or U stairs, no handrail on a stair's open side, no automatic stairwell; ground roofs under an upper floor
are the user's to trim (Roof the house works per layer); a chimney goes through no floor above (only through a
roof drawn on the floor above, over a double-height room);
Roof the house on an upper floor uses its own walls.
