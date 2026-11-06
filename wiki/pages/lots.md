---
title: Lots
type: concept
summary: "An area marked as a lot (AreaSchema.lot: true, set by setAreaLot or the Selection panel's Lot checkbox) is land, not a room: it counts as outdoor even when its boundary walls close it in, is sized to its boundary centrelines (areaSize), is left out of the floor and covered totals, is summed in the Areas panel's Lots and Lot covered % (FOS) rows, gets no 3-D slab unless finished (then a 1 cm ground cover), and has its label placed clear of the other layers' areas (planAreas)."
tags: [model, areas, regions, finishes, 3d, state, ui, pool]
sources: []
updated: 2026-11-05
---

# Lots

Added on 2026-11-04 (`64f59b7`).

## Why

The user drew their lots (Lote A, Lote B) on the "Pared exterior" layer. The lots' boundary walls close their
regions, so `region.indoor` was true ([Indoor means unreachable from outside](indoor-reachability-rule.md)) and the
lots counted as rooms. *Total floor* read 2232 m² instead of 542, and *Covered* 2118 instead of 374. Lawn was
refused as an indoor floor, and the whole site got a 3 cm `floor` slab that hid the pool's water. The fix is a flag
on the area. The region and the indoor rule stay as they were.

## Model and editor

- `AreaSchema.lot: z.literal(true).optional()` (absent means a room). It is additive at schemaVersion 1
  ([Plan model and file format](plan-model.md)). Edit: `setAreaLot(plan, refs, lot)` in `src/model/edit.ts`.
- Selection panel: a "Lot: the land, not a room" checkbox on areas. A lot's size reads "Lot, to its boundary lines",
  and its floor field is labelled "Ground cover".

## What the flag changes

- **Outdoor.** `wallSide` (`src/model/finishes.ts`) treats a side as outdoor when the region past its face belongs
  to a lot (found with `regionAt(regions, area.at)`). `finishTarget` (actions) and the Selection panel treat a floor
  as outdoor when `!indoor || lot`, so lawn suits a lot ([Materials and finishes](materials-and-finishes.md)).
- **Size.** `areaSize(a)` in `src/state/derived.ts` returns `region.area` for a lot (to the boundary centrelines,
  i.e. the lot lines) and `region.floor` for a room. Labels (`areaText`), the Areas panel and the selection readout
  all use it ([Areas](areas.md)).
- **Totals.** *Total floor* and `coveredArea` leave lots out. When there are lots, the Areas panel adds *Lots* (their
  sum) and *Lot covered* (covered ÷ lots, in %: the FOS).
- **3-D.** A lot gets no slab unless it has a floor finish. A finished lot gets a `GROUND` (0.01 m) cover, which sits
  under the 0.03 m floors of the house ([House solids](house-solids.md)). Since `506fd9e` the cover is open over
  every visible pool (an area with `depth`, on any layer) lying wholly inside the lot's outline.

## Label placement (`planAreas`)

Area labels take clicks before anything else in the select tool ([Canvas and tools](canvas-and-tools.md)). A lot's
geometric middle usually falls inside the house, so its label covered rooms and took their clicks.
`planAreas(plan)` (derived.ts, cached per plan) gives every layer's placed areas. It moves a lot's label to
`labelPoint(lot.outer, [...holes, box])`, with one box per other visible layer around that layer's non-lot areas
([Regions](regions.md)). `visibleAreas` and the select tool's `editableAreas` go through it.

The obstacles are boxes rather than each room's ring for speed. On the user's plan, rings cost about 17 ms per plan
change, too slow for drags. Boxes cost about 3 ms.

Tests: `src/state/derived.test.ts` (the label kept off the room's box, `areaSize`, `coveredArea` without lots) and
`src/model/finishes.test.ts` (lots outdoor, lot solids) ([Development and testing](development-and-testing.md)).
