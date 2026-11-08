---
title: Materials list (quantity takeoff)
type: component
summary: "The Materials tab: a quantity takeoff of what the house needs to be built, down to bricks, concrete, insulation, mortar, cement and lime bags; src/model/takeoff.ts (materialsList → TakeoffRow {chapter, item, quantity, unit, basis, where} aggregated and ordered by Argentine cómputo métrico chapters, takeoffCsv; assumptions as constants: mixes, bags, rebar, bricks, wall build-ups, footings, slabs) measured from the house solids and the plan, getTakeoff in derived.ts, and src/ui/MaterialsTab.tsx (Layers checkboxes, Save CSV, a table by chapter)."
tags: [model, ui, materials, takeoff, tabs, csv, walls]
sources: []
updated: 2026-11-08
---

# Materials list (quantity takeoff)

Added on 2026-11-08 (`5f4f641`). Asked what the Materials tab is for, the user said it is "dedicated for the
materials the house needs to be built", with construction depth too (bricks, concrete, insulation, mortar from the
build-ups), not only finishes. A separate **Catalogue** tab for the materials catalogue itself
([Materials and finishes](materials-and-finishes.md)) may come later; it is not in `TABS` yet.

## Model (`src/model/takeoff.ts`, pure)

- `materialsList(plan, solids = houseSolids(plan), source)` returns `TakeoffRow[]` (`chapter`, `item`, `quantity`,
  `unit` m²/m³/m/u/kg/bags, `basis` = how it was measured or assumed, `where` = layer/area names), summed by
  chapter|item|unit and ordered by `CHAPTERS` (Argentine cómputo métrico order, from Earthworks and foundations to
  Basic materials). `takeoffCsv(rows)` writes the CSV.
- Every assumption is a constant at the top: `MIXES` (per-m³ dosages: H-21, lean concrete, mortars and plaster
  coats), `BAG` (cement 50 kg, lime 25 kg), `REBAR` 90 kg/m³, `BRICKS`, `wallBuildUp`, `FOOTING`, `RING_BEAM`,
  `TIE_COLUMN`, slabs, screeds, `JOIST_SLAB`, `FLAT_ROOF`, pool shell and dig, `WASTE`. Change figures there.
- `wallBuildUp(kind, thickness)`: an envelope wall ≥ 0.25 m is the insulated double wall advised to the user on
  2026-11-02 (12 cm solid brick, cavity, 5 cm EPS, vapour barrier, 8 cm hollow brick); thinner envelopes and
  partitions are hollow brick; boundary walls solid brick 24 or 12 cm (facing brick when brick-finished).
- From the [house solids](house-solids.md): each wall side's area is the faces of wall/lintel/sill/infill solids
  whose normal points to that side, so net of openings and including gable infills; masonry = the mean of both
  sides. Also glass, columns, beams, railings, chimney flues, pool linings, upper slabs.
- From the plan: floors (`region.floor` of named areas; `dirt` skipped as existing ground), skirting, ceilings
  (the soffit of a roof over the room), roofs via `roofSummary`, gutters and downpipes, openings grouped by kind,
  style and size, fixtures, garden plants. Free-standing furniture (beds, sofas, tables, chairs) is left out.

## Gotchas

- **Wall kind is not `wallSide().outdoor` alone.** A side is indoors only on a room that is walled off, not a lot,
  and named or built over (a roof on its floor or above, or a named upper area over it); both sides outdoor =
  boundary, one = envelope, none = partition. With `outdoor` alone, the user's "Pared exterior" boundary walls came
  out as insulated house walls: the land they enclose is an unnamed region (the lot is marked on another layer),
  which [regions](regions.md) count as indoor.
- **A summed row keeps its first contributor's `basis`**, so write bases generically ("the wall's thickness × 20 cm"),
  not with one wall's figures.

## UI and state

- `getTakeoff(plan)` in `src/state/derived.ts`, cached per plan, reuses `getSolids` and the faces/walls caches, so it
  follows layer visibility ([Editor store and state](editor-store.md)).
- `src/ui/MaterialsTab.tsx`: the tab-actions row has *Layers* checkboxes (as on the [Elevations tab](elevations.md);
  hiding a layer hides it on every tab) and *Save CSV* (`<file>-materials.csv`); a table by chapter (Item,
  Quantity, Unit, Where, How) under an intro listing the assumptions. Counts round up; thousands are grouped with a
  narrow no-break space, not a comma or point, which Argentine readers would take as a decimal.

On the user's plan (2026-11-08): 143 rows, e.g. ~1,240 cement bags, ~6.7 t rebar, 412 m² of insulated double wall.
