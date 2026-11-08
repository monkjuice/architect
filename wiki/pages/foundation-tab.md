---
title: Foundation tab (foundation plan)
type: component
summary: "The Foundation tab: a foundation plan worked out from the ground floor's walls, columns and rooms for one of three systems (strip footings, piles and ground beams, raft slab; plan.foundation, absent = strip), each wall's footing settable by hand (segment.footing); src/model/foundations.ts (sizes as constants, foundationPlan, autoFooting, tieColumns), wallUse.ts (envelope/partition/boundary), getFoundation, the foundation-select tool, Foundation.tsx over the faded ground floor, FoundationPanel and the takeoff's foundation rows."
tags: [ui, model, foundation, canvas, tools, tabs, takeoff, walls]
sources: []
updated: 2026-11-08
---

# Foundation tab (foundation plan)

Added on 2026-11-08 (`aaa70c1`). The user asked to start the plumbing, gas, electricity and foundation tabs and
chose "Foundation, then services"; what was decided for the services is on
[Services: decisions for the coming tabs](services-decisions.md).

## Model

- `src/model/wallUse.ts` (moved out of `takeoff.ts`): `wallUses(plan, source)` gives each visible wall its `use`:
  `envelope`, `partition` or `boundary`, plus `outdoor` per side. A side is indoors only on a walled-off room that
  is not a lot and is named or built over (a roof on its floor or above, or a floor above). See the gotcha on
  [Materials list](materials-list.md).
- `src/model/foundations.ts`: every size is an exported constant (`FOOTING`, `RING_BEAM`, `GROUND_BEAM`, `PILE`,
  `RAFT`, `PAD`, `TIE_COLUMN`). These are usual sizes for a house on ordinary soil, **not a structural design**.
  `foundationPlan(plan, solids, source, walls?)` covers the ground floor (storey 0) only:
  - `strip` (the default): a lean strip footing under every wall, with a ring beam on it under the envelope and
    boundary walls;
  - `piles`: a ground beam under every house wall, with piles (Ø0.25 m, 3 m deep, at most 2.5 m apart) under the
    envelope walls;
  - `raft`: a slab over the union of the covered named areas (lots and pools left out), offset to the outside faces
    of automatic exterior walls (`EXTERIOR_WALL / 2`), with a beam under every wall.
  - Boundary and garden walls always get strip footings, whatever the system.
  - Pad footings go under the ground floor's column solids. They are deduped by position, so a timber post's shoe
    and braces get one pad. Glazed sides are skipped because they stand on the greenhouse's concrete base.
  - Tie columns (`tieColumns`) go on load-bearing walls on every floor for the takeoff; the plan shows only the
    ground floor's.
- Edits in `src/model/edit.ts`: `setFooting(plan, refs, {width?, depth?})` (`null` means back to automatic) and
  `setFoundationSystem`. `foundationPlan` uses a hand-set size in place of `autoFooting`'s and marks it `custom`.
- The [Materials list](materials-list.md)'s foundations chapter comes from `foundationPlan`, so the tab and the
  list always agree.

## UI and state

- `src/ui/FoundationTab.tsx`: Select (`V`), Measure (`M`), Pan (`H`) and the *System* segmented control in the
  action row, then `<Canvas mode="foundation" />`, `FoundationPanel` and `LayersPanel`.
- The canvas ([Canvas and tools](canvas-and-tools.md)) fades the first ground-floor layer's view (no floor below)
  under `FoundationLayer` (`src/ui/canvas/Foundation.tsx`). Rafts are dashed, strip footings tan, beams grey, and
  ring beams are dashed lines at the wall's faces. A hand-set footing has a heavier edge. Pads are squares, piles
  circles, and tie columns are drawn too. Furniture is hidden.
- `tools/foundationSelect.ts` picks a footing on its band (or within `HIT_SEGMENT_PX` of its line); Shift adds and
  Esc clears. The selection is segment refs, so walls selected on Floor stay selected here
  ([Editor store and state](editor-store.md)).
- `src/ui/panels/FoundationPanel.tsx` shows what the system builds, the takeoff's foundation rows (always English),
  their priced total, and the selected walls' *Width* and *Depth* with *Back to automatic*.
- `getFoundation(plan)` in `derived.ts` is cached per plan.

## Checked and limits

On a copy of the user's plan the strip system gave the same footings as the takeoff's earlier assumption
(92.41 m³) plus 15 pads under gallery and colonnade columns. In the browser it showed 66 footings, 52 piles in the
piles system, and 4 rafts (house, carport, quincho, studio) in the raft system. There are no footings in the 3-D
Exterior yet.
