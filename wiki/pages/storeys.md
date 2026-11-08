---
title: "Floors: upper storeys, lofts and stairs"
type: component
summary: "Every layer is on a floor (LayerSchema.storey 1–3, absent = ground; src/model/storeys.ts): an upper floor stands on a 0.30 m slab under its named areas (unnamed spaces such as a stairwell stay open), open edges with a floor on one side only get a glass railing, outlines stay plain; storeyView in derived.ts limits the canvas and every pick to the active layer's floor, with the floor below drawn faded and snapped to; + Floor and the Floor switcher in the toolbar; a straight stair (furniture kind stair) climbs to the floor above; Areas by floor with FOS (ground) and FOT (all floors)."
tags: [model, 3d, canvas, levels, storeys, stairs, railing, loft, areas]
sources: []
updated: 2026-11-08
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
named area (a stairwell inside a room) and for the holes of the union itself (`ringed`: an unnamed space that several
named areas ring, such as a double-height room enclosed by a balcony and bedrooms; `d39aaa9`, before which the slab
closed over it), each hole shrunk by `EXTERIOR_WALL/2` so the slab reaches the walls' faces (a 0.15 m nosing past
an open edge); and kind `railing` (steel posts ≤ 1.5 m apart, a glass pane, a steel
handrail) along each open edge with a named region on exactly one side. On an upper floor an open edge gets a beam
and columns under a roof only when one side is the outside (no region), so a stairwell's edges get none. The
elevations mark slab tops as levels.

Double-height rooms (`9f30985`): draw the roof over one on the floor above. A lower layer's walls (exterior, or
interior at a step between roofs) rise to a higher floor's roof where the layer has no roof of its own and no named
area of that floor is over the wall's sides; since `b3a61f0` walls decide this per 10 cm stretch, so a wall partly
under the floor above rises only along its clear part ([House solids](house-solids.md), `infill`). A chimney with no
roof of its own layer over its flue rises through any floors above to the highest roof drawn over it (`170e1cb`).

## How-to: a balcony, and a flat band under a double-height space

From the user's loft plan (2026-11-08; built in a copy, `house-plan-loft-roofs.json`, by a node script, no code):

- A balcony is a named area on the upper floor's layer drawn over the floor below's roof area, bounded by the
  bedroom's wall and open edges (railings) placed on the centrelines of the walls below. It gets the upper floor's
  slab, so the floor below needs no roof there (one left there is hidden inside the slab).
- Deleting the lines between two balconies merges them into one region still named by both areas; see
  [Areas](areas.md), Known limits.
- A flat roof on the floor below beside it must not overlap the balcony's slab (which reaches 0.15 m past the
  balcony's edges): tops coplanar at the upper level flicker. Keep the flat roof's outline clear of the slab, or
  0.1 m lower.
- A flat roof whose slab tops out at the upper floor's level needs height = upper level − ground level − `SLAB`
  (0.2, a flat roof's thickness in `src/model/roofs.ts`), e.g. 3.6 for levels 4.1 and 0.3.
- Closing a double-height space behind a lower flat band takes 1st-floor walls along the band's back edge (they
  stand on the flat roof's top). That made the 1st-floor living room indoor (its open edge no longer reached the
  outside), so automatic walls between it and the bedrooms became interior, 0.15 m
  ([Indoor means unreachable from outside](indoor-reachability-rule.md)).

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
are the user's to trim (Roof the house works per layer); a chimney passes through upper floors' slabs and rooms
without cutting them; Roof the house on an upper floor uses its own walls.
