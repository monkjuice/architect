---
title: Local prices (prices.ts)
type: component
summary: "src/model/prices.ts prices the Materials list: PRICES (156 AMBA retail entries in ARS with VAT, materials only, {ars, sold, source, estimate?}, 31 estimates; 46 of them installation and heating prices waiting for the services tabs) dated PRICES_SEEN 2026-11-08, USD_MEP 1587.9 for the dollar total, priceKey/rowCost (only rows bought as they are get a price); gathered by web research, with known inconsistencies and how to refresh them."
tags: [model, materials, takeoff, prices, ars, research, services]
sources: []
updated: 2026-11-08
---

# Local prices (`src/model/prices.ts`)

The prices behind the [Materials list](materials-list.md)'s Unit price, Cost and totals. Gathered on 2026-11-08
(`e6f545c`) when the user asked to "gather the local prices". **They go stale fast with Argentine inflation**:
every figure here is as of `PRICES_SEEN`.

## Data

- `PRICES`: price key → `{ars, sold, source, estimate?}`, 156 entries, AMBA retail, ARS with VAT, materials only
  (no labour). `sold` says how the source sold it (cut to 170 characters); 31 entries are `estimate` (shown with ≈,
  `sold` and `source` in the Unit price tooltip).
- Installations and heating (`e94bb35`, 46 entries after the comment "installations, for the Plumbing, Gas and
  Electricity tabs, and heating to compare"): `elec.*` (conduit, cables, boxes, outlets, switch, breakers, RCD,
  board, earth, meter box), `water.*` (PPR pipes, fittings, valve, tank, pump, gas and electric water heaters),
  `drain.*` (PVC pipes, trap, chamber, `septic` = the biodigestor), `rain.box`, `gas.*` (pipe, fittings, valve,
  meter box, bottled, vent, flue, cap), `heat.*` (split, boiler, radiator, underfloor, heater, `pump` = an air-water
  heat pump) and `cooker`. Two are estimates (`gas.bottled`, `heat.pump`). **No takeoff row uses them yet**: they
  wait for the services tabs ([Services: decisions](services-decisions.md)).
- `PRICES_SEEN = '2026-11-08'`; `USD_MEP = 1587.9` pesos per dollar (MEP selling that day; oficial 1570, blue 1555,
  from dolarapi.com). The tab's total row adds ≈ US$ at MEP.
- `priceKey(row)`: catalogue materials → `material:<id>` (per m²); doors/windows/gates → `<kind>:<style>` per m² of
  opening × w × h; paint → `paint.<side>`; fixtures and plants → `<kind>:<style>`; `SAME` aliases one product used
  twice (`eps.wall` → `eps`); else the row key. `bought` rounds counts and bags up.

**Decision:** only rows bought as they are (bricks, cement, a door) get a price. Work rows (a wall's m², footings,
plaster, slabs) have none: their materials are already in the bought rows, so pricing them would count twice. Glass
in windows and doors is in the opening's price. White and grey plaster are not priced for the same reason.

## How they were gathered

Two research sub-agents searched the web in parallel (structure and basics; finishes, openings, fixtures, garden)
and wrote JSON in the session scratchpad (a third gathered the installation prices the same way for `e94bb35`); a Python script generated the `PRICES` literal (single-quoted, as the
code style). Sources: Easy, Blaisten, Prima Porta, Corralón Contino, perfiles.com.ar, Pall Metal, Miceli, Milemor,
Rolón, Bruno Revestimientos, Piscinas Agui, Punto Cerámico, Fravega, viveros, servidos.ar (a November 2026 AMBA cost
survey) and Mercado Libre (search snippets only: its pages block direct fetching).

## Known inconsistencies (left for the user)

- Window lines differ: sliding window and door from Easy's cheap Nexo line (~$128–168k/m²), fixed from Módena
  (~$127k/m²), casement and double-hung estimated at Módena DVH (~$300–320k/m²); servidos.ar puts Módena at
  ~$230k/m² single glass, ~$310k/m² DVH.
- Easy's pine rafters, battens and glass wool run above a corralón's.
- Polyethylene film may be $1,199/m² if the roll is 2 m wide, not 4 m.
- Lapacho post/beam/rafter are forced to `estimate`: the yard's price unit (board foot?) is not stated and read
  literally gives ~$193,500 per m of 14 × 14 post.

On a copy of the user's plan (with the greenhouse): ARS 298,524,461, about US$188,000 at MEP.

## Refreshing them

Rerun the research for the existing keys (list them from `PRICES`; a new takeoff key needs its own entry or it
stays unpriced), regenerate the `PRICES` literal, then update `PRICES_SEEN` and `USD_MEP` to the same day.
