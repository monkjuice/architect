---
title: Tabs over one plan
type: decision
summary: "A two-row bar: row 1 has the tabs (Foundation, Floor, Roof, Elevations, Exterior, Interior, Plumbing, Electricity, Gas, Materials; Floor, Roof, Elevations and Exterior built, the rest disabled), row 2 the open tab's actions; every tab works on the same plan with one undo history, the open tab is editor state (not saved), and openTab switches tools and selection between the floor and roof plans."
tags: [decision, ui, tabs, state]
sources: []
updated: 2026-11-02
---

# Tabs over one plan

## Context

Eighth session (2026-11-02): the user asked for an exterior design tab "connected to the main plan", then set the
navigation: a top row of tabs in the order Foundation | Floor | Roof | Elevations | Exterior | Interior | Plumbing |
Electricity | Gas | Materials, and a second row with the open tab's own actions. "For now we only support floor and
exterior." Roof and Elevations followed later the same day ([Exterior kept basic](exterior-kept-basic.md)).

## Decision

- Every tab works on the same `Plan` with one undo history. The Exterior and the Elevations are derived from it, not
  separate models ([House solids](house-solids.md)); the Roof tab edits the plan's `layer.roofs`
  ([Roof tab](roof-tab.md)).
- `EditorState.tab` (`Tab`, default `'floor'`) is editor state: not saved and not in the draft, so a reload opens
  Floor ([Editor store and state](editor-store.md)). It is set by `openTab` in `src/state/actions.ts` (`store.setTab`
  was removed), which also moves the tool between the floor and roof tool sets (`ROOF_TOOLS`) and keeps only roof
  refs selected on Roof and only non-roof refs on Floor.
- `src/ui/TopBar.tsx` is row 1 only: brand, file name, `TABS`, Undo/Redo, Open/Save/More. A tab without
  `ready: true` renders disabled with a "not built yet" title; Floor, Roof, Elevations and Exterior are ready.
- Each tab draws its own row 2 (`.tab-actions`) and main area, switched on `tab` in `src/App.tsx`: `FloorTab`
  (drawing tools, Snap, library, canvas, panels), `RoofTab`, `ElevationsTab` ([Elevations tab](elevations.md)) and
  the lazily loaded `ExteriorTab` ([Exterior tab](exterior-tab.md)).

## Consequences

- The Canvas is mounted by Floor and by Roof (`mode="roof"`), with each tab's own single-key shortcuts; it unmounts
  on the other tabs, where those keys do nothing. Ctrl shortcuts (save, open, undo, redo) stay global in `App.tsx`;
  image paste works only on Floor ([Canvas and tools](canvas-and-tools.md)).
- Grid, Lengths and Thick walls left the top bar for the Floor tab's View section; Snap stayed with the tools.
- Layer visibility is plan data: the Elevations tab's *Layers* checkboxes hide a layer on every tab.
