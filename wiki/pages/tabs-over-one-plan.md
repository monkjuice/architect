---
title: Tabs over one plan
type: decision
summary: "A two-row bar: row 1 has the tabs (Foundation, Floor, Roof, Elevations, Exterior, Interior, Plumbing, Electricity, Gas, Materials; only Floor and Exterior built, the rest disabled), row 2 the open tab's actions; every tab works on the same plan with one undo history, and the open tab is editor state, not saved."
tags: [decision, ui, tabs, state]
sources: []
updated: 2026-11-02
---

# Tabs over one plan

## Context

Eighth session (2026-11-02): the user asked for an exterior design tab "connected to the main plan", then set the
navigation: a top row of tabs in the order Foundation | Floor | Roof | Elevations | Exterior | Interior | Plumbing |
Electricity | Gas | Materials, and a second row with the open tab's own actions. "For now we only support floor and
exterior."

## Decision

- Every tab works on the same `Plan` with one undo history. The Exterior is derived from the floor plan, not a
  separate model ([House solids](house-solids.md)).
- `EditorState.tab` (`Tab`, default `'floor'`, `setTab`) is editor state: not saved and not in the draft, so a
  reload opens Floor ([Editor store and state](editor-store.md)).
- `src/ui/TopBar.tsx` is row 1 only: brand, file name, `TABS`, Undo/Redo, Open/Save/More. A tab without
  `ready: true` renders disabled with a "not built yet" title.
- Each tab draws its own row 2 (`.tab-actions`). `src/ui/FloorTab.tsx` holds the drawing tools and Snap, then the
  former `.app-main` layout (library, canvas, notice bar, panels); `ExteriorTab` has its own
  ([Exterior tab](exterior-tab.md)). `src/App.tsx` switches on `tab`.

## Consequences

- The Canvas unmounts on other tabs, so its single-key shortcuts do nothing there. Ctrl shortcuts (save, open,
  undo, redo) stay global in `App.tsx`; image paste works only on Floor ([Canvas and tools](canvas-and-tools.md)).
- Grid, Lengths and Thick walls left the top bar for the Floor tab's View section; Snap stayed with the tools.
- The next tabs to build are Roof and Elevations ([Exterior kept basic](exterior-kept-basic.md)).
