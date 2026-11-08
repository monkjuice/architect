---
title: Materials list (quantity takeoff)
type: component
summary: "The Materials tab: a quantity takeoff of what the house needs to be built, down to bricks, concrete, insulation, mortar, cement and lime bags, in English or Spanish and priced in ARS; src/model/takeoff.ts (materialsList → language-free TakeoffRow {chapter id, key, params, quantity, unit, where} in Argentine cómputo métrico chapters; assumptions as exported constants), takeoffText.ts (texts per key and language, number formats, takeoffCsv), prices.ts (see Local prices), getTakeoff in derived.ts, and src/ui/MaterialsTab.tsx (Language select, Layers checkboxes, Save CSV, a table by chapter with subtotals and a total in ARS and ≈ US$)."
tags: [model, ui, materials, takeoff, tabs, csv, walls, i18n, spanish, prices]
sources: []
updated: 2026-11-08
---

# Materials list (quantity takeoff)

Added on 2026-11-08 (`5f4f641`); Spanish, a language choice and price columns the same day (`b0134d3`, asked for as
"a translation dropdown and spanish version of the materials, and then gather the local prices"). The user wants
construction depth (bricks, concrete, insulation, mortar from the build-ups), not only finishes. A separate
**Catalogue** tab for the catalogue itself ([Materials and finishes](materials-and-finishes.md)) may come later.

## Model (`src/model/takeoff.ts`, pure)

- `materialsList(plan, solids = houseSolids(plan), source)` returns `TakeoffRow[]` with **no English text**:
  `chapter` (an id, `foundations` … `basic`), `key` (what it is: `wall`, `cement`, `door`…), `params` (`RowParams`:
  material, `waste` fraction, side, wall `build`, thickness, style, kind, w, h, outdoor, mix), `quantity`, `unit`
  (m²/m³/m/u/kg/bags), `where`. Rows sum by chapter|key|unit|JSON(params), ordered by `CHAPTERS`.
- Every assumption is an exported constant (`MIXES`, `BAG`, `REBAR`, `BRICKS`, `FOOTING`, `RING_BEAM`, `JOIST_SLAB`,
  `FLAT_ROOF`, `POOL_*`, `WASTE`, `HYDROFUGE`…); the texts quote them, so change figures there only.
- `wallBuildUp(kind, thickness)` → `{build, leaves, insulated}`: an envelope ≥ 0.25 m is the insulated `double` wall
  advised on 2026-11-02 (12 cm solid brick, cavity, 5 cm EPS, vapour barrier, 8 cm hollow brick); thinner envelopes
  and partitions are hollow brick; boundary walls solid 24 or 12 cm.
- From the [house solids](house-solids.md): each wall side's area from the faces whose normal points that way (net
  of openings, gable infills included); masonry = the mean of both sides; glass, columns, beams, railings, flues,
  pools, slabs. From the plan: floors (`dirt` skipped), skirting, ceilings, roofs, gutters, openings by kind, style
  and size, fixtures, plants. Free-standing furniture is left out. Paint is one row per side.

## Texts (`src/model/takeoffText.ts`)

`TEXT` maps each key to `[item, basis]` in `en` and `es`, each a string or a function of (params, number
formatter); `rowText` falls back to the bare key, so **a new key needs both texts**. Spanish chapter titles are the
usual rubros, plus Spanish titles for the catalogue materials, styles, build-ups and mixes. `formatNumber`: English
groups with a thin space and a point; Spanish with points and a decimal comma. `takeoffCsv(rows, lang)` (moved here)
adds unit price and cost; in Spanish it uses `;` and decimal commas, as Argentine spreadsheets expect.

**Why language-free rows:** a row shows in any language and is priced by what it is, not by its wording. It also
ended the old gotcha that a summed row kept its first contributor's basis: the basis is one text per key.

## Prices

`src/model/prices.ts` prices bought rows only (filled in `e6f545c`); its data, key scheme, sources, known
inconsistencies and how to refresh them are on [Local prices](local-prices.md).

## Gotchas

- **Wall kind is not `wallSide().outdoor` alone.** A side is indoors only on a walled-off room that is not a lot and
  is named or built over; both sides outdoor = boundary, one = envelope, none = partition. With `outdoor` alone the
  user's boundary walls came out insulated: the land they enclose is an unnamed region, which
  [regions](regions.md) count as indoor.
- The wall item names the drawn thickness apart ("24 cm brick wall (drawn 30 cm)"), or it read as two build-ups.

## UI and state

- `getTakeoff(plan)` in `src/state/derived.ts`, cached per plan on `getSolids`, follows layer visibility
  ([Editor store and state](editor-store.md)).
- `src/ui/MaterialsTab.tsx`: action row with *Language* (`prefs.language`), *Layers* checkboxes (as on the
  [Elevations tab](elevations.md)) and *Save CSV* (`-materials.csv` / `-materiales.csv`); columns Item, Quantity,
  Unit, Unit price, Cost, Where, How; chapter subtotals and a total; estimated prices marked ≈, with how sold and
  source in the tooltip; the total row also shows ≈ US$ at `USD_MEP`.

On the user's plan: 143 rows at `5f4f641` (~1,240 cement bags, ~6.7 t rebar); 126 at `b0134d3`, every key with
both texts (a probe checked).
