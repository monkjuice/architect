---
title: Editor store and state
type: component
summary: "src/state/: the EditorStore (immutable plan, undo via edit/preview/endGesture, editor-only state such as the open tab, active layer, tool, line kind, door/window/gate/fireplace style to place, column style, furniture pick, roof type to draw, view and prompt), user-level actions (openTab, roofTheHouse, applyColonnade, placeFurnitureAt among them), derived data cached per object (derived.ts: regions, wall thicknesses and shapes, covered area, 3-D solids), files (File System Access API, IndexedDB draft, image import) and per-browser prefs (per-style opening widths, folded panel sections, sun view settings, the View section's toggles, the Exterior's roof toggle)."
tags: [state, undo, files, autosave, derived, prefs, tabs, roof, colonnades, fireplace, furniture]
sources: []
updated: 2026-11-04
---

# Editor store and state

## EditorStore (`src/state/store.ts`)

- There is one instance. `initStore` sets it in `src/main.tsx`. Code calls `getStore()`, and components use
  `useEditor(selector)` (`useSyncExternalStore`), whose selector must return existing references.
- State: `plan`, `past`/`future` (undo history, capped at 200), `tab`, `selection`, `activeLayer`, `tool`,
  `lineKind`, `openingStyle`, `columnStyle`, `furniturePick`, `roofType`, `view`, `file` (`name`, an optional handle and the `saved` plan), `notice`
  and `prompt`.
- These live in the store, not in the plan:
  - `tab` (`Tab`, default `'floor'`, set by the `openTab` action; `setTab` was removed): the open tab; every tab
    shares the plan and the undo history ([Tabs over one plan](tabs-over-one-plan.md));
  - `activeLayer`;
  - `tool` (`ToolId`, including `door`, `window`, `gate`, `fireplace`, `colonnade`, `furniture`, `north`, and the Roof tab's
    `roof` and `roof-select`);
  - `roofType` (`RoofType`, default gable): what the Roof tool and *Roof the house* make ([Roof tab](roof-tab.md));
  - `lineKind` (`SegmentKind`): what the line tool draws (wall, open edge or outline), set by `O` or the Library
    panel ([Open edges and outlines are segment kinds](segment-kind-not-layer.md));
  - `openingStyle` (`{door, window, gate, fireplace}`): the style the Door, Window, Gate and Fireplace tools place,
    set by picking it in the library, so `D` and `W` arm the last style picked
    ([Door, window and gate styles](opening-styles.md));
  - `columnStyle` (`ColumnStyle`, default roman): what the Colonnade tool puts on an open edge
    ([Colonnades](colonnades.md));
  - `furniturePick` (`{kind, style?}`, default counter): the piece the Furniture tool puts down, set by the library
    ([Furniture and fixtures](furniture.md));
  - `view` and `prompt`.

  Switching layers or zooming is therefore not an undo step and is not saved in the file. The draft keeps
  `activeLayer` and `view` but not `tab`, `lineKind`, `openingStyle`, `columnStyle`, `furniturePick` or `roofType`.
  Those start as wall, single door, sliding window, single gate, masonry fireplace, Roman columns and a counter (the
  editor's default window is sliding, while a file's missing window style reads as fixed).
- `edit(change)` makes one undo step. If `change` returns the same plan, no step is recorded.
- `preview(change)` is for drags. `change` always receives the plan from before the gesture (`gestureBase`).
  `endGesture()` records the whole drag as one step, and `cancelGesture()` restores the plan.
- `update(patch)` sets state that is not undoable (selection, tool, view, notices).
- After an edit, undo or redo, `settle` prunes the selection (`refExists` from `plan.ts`, for segments, vertices,
  areas, openings, roofs and furniture) and keeps the active layer valid.
- The plan is dirty while `plan !== file.saved` (identity, not deep equality).
- `prompt` is a `Prompt` union, `length` or `text`. `askLength(title, text)` and `askText(title, text, initial)`
  return Promises (null when cancelled) that `src/ui/PromptDialog.tsx` resolves; lengths accept `28,00` and `28.00`.
  `PromptDialog` replaced `LengthDialog` (its CSS class is `.prompt-dialog`).

## Actions (`src/state/actions.ts`)

User-level operations: new, open and save; `loadBaseImage`; `dropFile`; `chooseTool` (the image tools need an
unlocked image); `deleteSelection`; `selectAll` (the active layer's lines, areas and furniture); `planBounds`; `fitView`,
which clears `view` ([View fitted once and stored](view-fitted-once.md)); `editImageInPlace`
([Base image placement and calibration](base-image-calibration.md)); and `placeOpeningAt` / `dropOpening(kind, style,
…)` with `OPENING_DRAG_TYPE` (data `"kind:style"`), used by the Door, Window, Gate and Fireplace tools and the
Library panel's drag; `dropOpening` passes the kind, so a fireplace targets walls only
([Doors, windows and gates](doors-and-windows.md)). Since the roofs: `openTab` (switches the tool between the
floor set and `ROOF_TOOLS` and filters the selection), `addRoofOutline` and `roofTheHouse` ([Roof tab](roof-tab.md)).
Since 2026-11-04: `applyColonnade`, `colonnadeTarget` and `dropColonnade` with `COLONNADE_DRAG_TYPE`, shared by the
Colonnade tool and the library ([Colonnades](colonnades.md)); `placeFurnitureAt` (refuses a target with a
problem by a notice, adds and selects the piece) and `dropFurniture` with `FURNITURE_DRAG_TYPE` (data
`"kind:style"` or a bare kind), shared by the Furniture tool and the library ([Furniture and fixtures](furniture.md)).
They live here, not in `src/ui`, because state never imports from ui ([Code conventions](code-conventions.md)).

## Derived data (`src/state/derived.ts`)

Data computed from the plan is cached in WeakMaps keyed on the plan's objects. Edits replace only what they change,
so an unchanged object means an unchanged result. One faces cache, keyed on a layer's `vertices` and `segments`
maps, backs `getRegions`, `getThickness`, `facesOutside` and `hostThickness`; `getPlacedAreas` and `visibleAreas`
build on it ([Areas](areas.md), [Regions](regions.md)). `getWalls` (wall shapes) is cached per layer object
because openings cut walls; `coveredArea` sums indoor rooms and their walls; `drawnHalfWidth` reads
`prefs.thickWalls` and is passed to model hit tests as a callback ([Walls](walls.md)). `getSolids(plan)` (the 3-D
solids of the Exterior and the [Elevations](elevations.md)) is cached per plan object and built from the faces and
walls caches ([House solids](house-solids.md)).

## Files (`src/state/files.ts`)

- Open and save use the File System Access API where the browser has it: in Chromium, Save writes back to the
  opened file. Elsewhere they fall back to a file input and a download. The API types are in `src/fs-access.d.ts`.
- Images are read as data URLs. An image whose long side is over 4096 px is redrawn on a canvas and re-encoded as
  JPEG (quality 0.92), and a notice says it was scaled down.
- The draft is autosaved in IndexedDB (database `architect`, store `drafts`, key `current`), not localStorage,
  because plans embed the photo and localStorage is too small for that.
  - `App.tsx` writes it 400 ms after the plan, active layer, view or file changes.
  - `main.tsx` restores it on start. A draft with unsaved changes stays dirty. An invalid draft gives a new plan and
    an error notice.

## Prefs (`src/state/prefs.ts`)

Prefs are per browser, kept in localStorage under `architect:prefs`: `grid`, `lengths`, `snap`, `calibration`
(show known lengths), and `widths` (`styleKey` → the last width typed for that style). They are not part of the plan.
`openingWidth(prefs, kind, style)` gives the next width: the stored one, or else the style's usual width from
`STYLES`. `widths` replaced `doorWidth` / `windowWidth` in the fourth session. A stored `doorWidth` migrates to
`'door:single'`, and an old `windowWidth` is dropped.

Since the sixth session prefs also hold:

- `collapsed`: the ids of folded panel sections (`Box` `id`, see [Code conventions](code-conventions.md));
- `sun`: `visible`, `season`, `time`, `cloudiness`, `shadows`, changed through `setSun(patch)`
  ([Sun and shadows](sun.md)). Its `wallHeight` was dropped when walls got their own heights; a stored one is
  ignored.

`thickWalls` (default on) draws walls at their thickness; off, as thin lines for tracing ([Walls](walls.md)).

Since the eighth session the Floor tab's View section (`src/ui/panels/ViewPanel.tsx`) toggles `grid`, `lengths`,
`calibration`, `thickWalls`, the new `areaNames` and `areaSizes` (which lines area labels show,
[Canvas and tools](canvas-and-tools.md)) and `sun.visible`; the top bar no longer has these. Its *Base plan* box is
`plan.image.visible`, plan data and undoable. `roofs` is the Exterior's *Roof* toggle (hides the drawn roofs and parapets,
[Exterior tab](exterior-tab.md)). All default on except `calibration`.

`load` validates every field (types, ranges, known seasons) and falls back to its default, so a bad stored value
never breaks the app. The sun's north and location are in the plan, not here.

Related: [Plan model and file format](plan-model.md), [Canvas and tools](canvas-and-tools.md).
