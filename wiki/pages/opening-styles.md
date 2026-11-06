---
title: Door, window and gate styles
type: component
summary: "Door styles (single, double, sliding), window styles (fixed, sliding, double-hung, awning, casement), gate styles (single, double, sliding) and fireplace styles (masonry, parrilla): the style field and its defaults, the STYLES table with usual widths, hasSide/hasHinge/slides/cutsWall, sliding-gate direction and parkingRoom, and openingParts, the one source of symbol geometry for both the plan and the library icons (the fireplace's icon excepted)."
tags: [model, openings, doors, windows, gates, fireplace, ui]
sources: []
updated: 2026-11-05
---

# Door, window and gate styles

Door and window styles came in the fourth session of 2026-11-02, gates in the fifth ("we also need an outdoor gate").
Placement, edits and the tools are in [Doors, windows and gates](doors-and-windows.md).

## In the file (`src/model/plan.ts`)

- Every opening has a `style`: `DOOR_STYLES` (`single`, `double`, `sliding`), `WINDOW_STYLES` (`fixed`, `sliding`,
  `double-hung`, `awning`, `casement`) or `GATE_STYLES` (`single`, `double`, `sliding`). Types: `DoorStyle`,
  `WindowStyle`, `GateStyle`, `OpeningStyle`.
- `style` defaults to `'single'` for doors and gates and `'fixed'` for windows, which is how openings looked before
  styles existed, so older files read unchanged. `hinge` (default `'a'`) and `swing` (default `'left'`) are fields of
  every kind. Both changes are additive, so `schemaVersion` stays 1 ([Plan model](plan-model.md)).
- `swing` means into the room for a door, outside for a casement or an awning, and the side a gate swings or its
  panel runs on. It is relative to a→b, so its screen side depends on the direction the wall was drawn.
- For a **sliding gate**, `hinge` is the end it slides towards, not a hinge. Reusing the field means `X`,
  *Flip direction* and `reverseOpening` (mirroring onto a reversed segment) handle it with no extra code.

## Styles (`src/model/openings.ts`)

`STYLES` lists them in library order, with titles and the usual width a new one gets:

| Kind | Style | Width | Symbol (`openingParts`) |
|---|---|---|---|
| door | `single` | 0.80 | jambs, one leaf and its arc |
| door | `double` | 1.40 | two leaves meeting in the middle |
| door | `sliding` | 1.60 | two staggered panels |
| window | `fixed` | 1.00 | frame, one pane |
| window | `sliding` | 1.50 | two staggered sashes |
| window | `double-hung` | 0.90 | two parallel sashes |
| window | `awning` | 1.00 | dashed sash outline projecting 0.3·w outside from the wall's outer face |
| window | `casement` | 1.20 | leaves swinging outside from the outer face: one below 1.0 m, two from 1.0 m |
| gate | `single` | 1.00 | posts, one heavy leaf, dashed arc (pedestrian) |
| gate | `double` | 3.00 | posts, a pair of leaves meeting in the middle (driveway) |
| gate | `sliding` | 4.00 | posts, a panel across the opening, and a dashed outline of the panel parked beyond the end it slides towards |
| fireplace | `masonry` | 1.20 | `parts.fireplace` (`fireplaceShape`): box, firebox, dashed hearth, crossed flue; no gap ([Fireplaces](fireplaces.md)) |
| fireplace | `parrilla` | 1.80 | the same parts, 0.8 m deep with a wider firebox (`4097821`) |

- `styleKey` gives `"door:double"`. It keys the width prefs, the library counts and the drag data. `styleInfo` looks
  up a style, and `isStyleOf` checks that a style belongs to a kind.
- `hasSide` is false only for fixed and double-hung windows. `hasHinge` is explicit per kind: single doors,
  casements narrower than 1.0 m (`CASEMENT_PAIR`), and single or sliding gates; never a fireplace. Sliding *doors*
  have none (an intermediate version of the gate change offered one by mistake). `slides(o)` is true for sliding
  gates only, and `cutsWall(o)` false for fireplaces only. *Flip side*, *Flip hinge* (or
  *Flip direction*) and the tool's `X` hint appear only when these apply. Resizing a casement across 1.0 m switches
  between one and two leaves.
- `updateOpening` accepts `style` and keeps the width. A style of the other kind returns the same plan, so no undo
  step. `reverseOpening` flips `hinge` and `swing` for every kind.

## Sliding gates

- **Default direction** (`openingFor`): a leaf hangs near the closer corner, but a sliding gate takes the opposite
  end, sliding towards the side with **more** wall; `X` swaps it. This uses the segment's free lengths only, not
  other openings on it.
- **`parkingRoom(layer, id)`**: the clear wall on the side it slides to, up to the segment's end or the next opening
  (`Infinity` for other openings). Only the host segment counts, so a fence continuing straight past a vertex is not
  counted. When it is less than the width, the symbol gets class `cramped` (amber dashed outline) and the Selection
  panel warns "Not enough wall to slide open: it needs X m, Y m is free…"; otherwise it notes the free run. Parking
  space is the classic sliding-gate design mistake.

## Decision: one source of symbol geometry

`openingParts(placed, opening, half)` returns pure geometry for every style: jambs, frame, glass, panels, leaves,
arcs, `dashed` outlines (an awning sash or a parked sliding gate; called `sashes` before gates) and `posts` (filled
squares at a gate's ends; gates have no jambs), for a wall `half` thick on each side of its line. `OpeningShape` in
`src/ui/canvas/Openings.tsx` renders these parts both for the plan (`OpeningSymbol`, half = max(0.075 m, 3 px)) and for
the library (`OpeningIcon`: a 32×24 box, a fake `PlacedOpening`, half 3.5; a sliding gate parks to the right). This way
the icons always match the plan. The exception is the fireplace, whose icon is drawn by hand because its real depths
vanish at icon scale. `openingAt` also hit-tests every leaf from these parts. Arc sweep flag 1 means
clockwise on screen, which in y-down coordinates is a positive cross product (tip − hinge) × (jamb − hinge).

CSS (`src/App.css`): casement leaves draw lighter than door leaves (1.25 px against 2 px) and casement arcs dashed
(`4 3`), through `.opening.window .opening-leaf` / `.opening-arc`. Gates draw heavier: leaves 3 px, panels 2 px, arcs
dashed (`.opening.gate …`), posts filled. `.opening-dashed` outlines are dashed, panels outlined. Kind rules need the
compound selector to beat the generic `.opening .opening-leaf`
([Code conventions](code-conventions.md#css-specificity)). `polyline` (dashed outlines) is in the non-scaling-stroke
selector. Library icons set `--layer`, so they reuse the plan's `.opening` rules (a test pitfall:
[Playwright flow-check pitfalls](playwright-flow-checks.md)).

Related: [Editor store and state](editor-store.md) (`openingStyle`, per-style widths).
