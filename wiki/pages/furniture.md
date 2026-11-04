---
title: Furniture and fixtures
type: component
summary: "Free-standing pieces in layer.furniture (ids f<n>): counters and kitchen islands (a counter style), sinks (outdoor, kitchen, bathroom), bathtubs (alcove, clawfoot, drop in, corner) and showers with a movable shower head, toilets, bidets, beds (single to king), sofas (armchair to an L-shaped sectional that flips), square and round tables, chairs; src/model/furniture.ts (FURNITURE catalogue, placements, furnitureTarget snapping to wall faces, counters and tables, the kitchen sink laid out from its counter, shower rim positions incl. a corner tub's curve, sofa outlines, plan symbols), furniture3d.ts (blocks in 3-D), the Furniture tool, select-tool drags, R to turn, the library boxes and FurnitureDetails."
tags: [model, furniture, ui, canvas, 3d]
sources: []
updated: 2026-11-04
---

# Furniture and fixtures

Added on 2026-11-04 for the user's request: counters, sinks (the kitchen one "can only be placed over a counter"),
bathtubs ("allow me to move the shower head"), beds, tables and chairs. Why pieces stand free and only the kitchen
sink is hosted: [Furniture stands free; a kitchen sink is hosted by its counter](furniture-free-standing.md).
The same day (`3014137`) the user asked for a toilet and a bidet, then a simple shower and a corner bathtub, and
then (`0acdce9`) a kitchen island and (`3657510`) sofas.

## Model

- `layer.furniture` (id → `FurnitureSchema`, a union on `kind` with sinks a nested union on `style`) in
  `src/model/plan.ts` ([Plan model and file format](plan-model.md)). Standing pieces have `at` (centre), `angle`
  (degrees clockwise; at 0 the back is up the sheet), `width` (across the front; a round table's diameter) and
  `depth`; a bathtub and a shower add `shower` (`ShowerSchema`; `ToiletSchema` and `BidetSchema` have no styles or
  extra fields). A kitchen sink has `counter` and `offset` (counter's left end → sink centre)
  instead of `at`/`angle`. Code tells the two apart with `'at' in f` (type `StandingFurniture`).
- `src/model/furniture.ts`:
  - `FURNITURE`: the catalogue in library order (title, new size, height, `snap`: `wall`, `counter`, `table`,
    `none`); `furnitureInfo`/`infoOf`; `furnitureKey` (`"bed:queen"`, `"counter"`).
  - `placement(at, angle, width, depth)` is a piece's frame (`u` across the front, `v` back to front), with
    `local`/`toLocal`/`corners`. **Always get a piece's position from `placeFurniture(layer, f)`**: it lays a kitchen
    sink out from its counter (offset clamped inside it, 3 cm forward) and returns null when the counter is gone.
  - **Kitchen island**: a counter with `style: 'island'` (`isIsland`; a counter without a style, as in every older
    file, stands against a wall). Catalogue 2.00 × 1.00 m, 0.90 m high, snap `none`, so it stays where it is put.
    Its worktop overhangs the front by `ISLAND_OVERHANG` (0.25 m) for stools, so `sinkAcross` centres a kitchen sink
    over the cabinets (−overhang/2 from the middle, plus the 3 cm) in both `placeFurniture` and `furnitureTarget`;
    the plan symbol adds a `soft` line where the cabinets end.
  - **Sofas** (`SofaSchema`, `SOFA_STYLES`): armchair, loveseat, three-seater, sectional, all 0.85 m high, snap
    `wall`. `SOFA` holds the back, arm, seat and chaise (return) sizes shared by the plan symbol and 3-D;
    `sofaCushions` gives 1, 2 or 3 seats. `sofaOutline` is a rectangle, or for a sectional an L whose return reaches
    the full depth at its right end. The optional `mirror` (sofa-only) puts the return at the left end by flipping x
    in the local frame: a quarter turn cannot move an L's return to the other end, and a general mirror on all
    furniture was not wanted. A sectional's return has a soft line instead of an arm.
  - `furnitureTarget`: `wall` pieces back up to the nearest wall face (not open edges or outlines) within
    `depth + FURNITURE_REACH_M` (0.4 m),
    facing into the room and kept from hanging past the wall's ends; a chair faces a nearby table (round: radially;
    square: the side the cursor is most past), tucked 10 cm under it; tables are free. A kitchen sink goes in a
    counter within reach or gets a `problem` (no counter; counter shorter than the sink), with or without snap/Alt.
    Wall thickness comes in as a callback (`hostThickness`).
  - `furnitureAt`: the smallest piece under the point (a sink beats its counter), top layer first.
  - Shower head, on any `hasShower` piece (bathtub or shower): `shower` is 0–4 round the rim (0–1 back from the
    left, 1–2 right, 2–3 front, 3–4 left), 4 cm inside the edge; `showerPoint(pl, s, corner)` /
    `showerAt(pl, p, corner)`, with `corner = isCorner(f)`. A corner tub is a quarter disc round its back-left
    corner (meant for the room's corner; radius `min(width, depth)`, `quarterDisc`), and its s 1–3 runs round the
    curved front. `showerAt` walks the rim in 24 short steps per side so it follows that curve. New heads: tub 3.5
    (left end), corner tub 3.85 (left wall near the corner), shower 0.5 (back middle).
  - `furnitureSymbol`: the plan symbol as parts with roles `outline`, `detail`, `soft`, `heavy` (CSS
    `.furniture-<role>`), shared by the plan, the placing ghost and the library icons. A shower is a tray with
    diagonals, a drain, a screen line on two thirds of its front and the head; a toilet a cistern and bowl ellipses.
- Edits (`src/model/edit.ts`) touch only the `furniture` map: `addFurniture`, `updateFurniture` (whole item; same plan
  when JSON-equal), `moveFurniture` and `turnFurniture` (standing pieces only), and `pruneFurniture`, which
  `deleteItems` runs to drop kitchen sinks whose counter went.

## Editor

- **Furniture tool** (`tools/furniture.ts`, ToolId `furniture`, no key) places `EditorState.furniturePick`, set by the
  library: a ghost through `OverlayData.furniture` (red with the problem as tag), `R` a quarter turn, Alt no snap; a
  click calls `placeFurnitureAt`, which refuses a target with a problem by a notice.
- **Library**: `FURNITURE_GROUPS` in `LibraryPanel.tsx` lists the `kinds` of each box, whose id comes from the
  first kind: `library-counter`, `library-sink`, `library-bathtub`, `library-shower`, `library-toilet` (Toilet and
  Bidet), `library-bed`, `library-sofa`, `library-table`, `library-chair`, with counts and sizes; `FurnitureIcon` scales the symbol into the 32×24 icon. Dragging carries
  `FURNITURE_DRAG_TYPE` (`"kind:style"`) to `dropFurniture`.
- **Select tool**: a selected tub's or shower's shower mark is grabbed before any other hit; a lone piece is re-targeted by
  `furnitureTarget` on every move (it snaps as when put down; a kitchen sink slides along or onto counters; a refused
  spot keeps it put and shows the problem); in a multi-selection pieces move by the drag's delta; box select and
  Ctrl+A include furniture; `R` turns the selected pieces ([Canvas and tools](canvas-and-tools.md)).
- **Selection panel** (`FurnitureDetails`): Style among the kind's styles with the same `snap` (a new style takes
  its catalogue size; a kitchen sink has none), width and depth (or diameter), *Turned*, *Flip* for a sectional
  (toggles `mirror`), hints, *Turn*. The field
  shows only when the piece has a style (a counter's is optional); a counter and an island differ in `snap`, so it
  never switches one into the other.

## In 3-D

`furnitureParts` (`src/model/furniture3d.ts`) gives `furniture` solids ([House solids](house-solids.md)): counter
(toe kick, wood cabinets, stone worktop at `WORKTOP` 0.90 m, where the kitchen sink's steel rim sits; an island's
toe kick is recessed all round and its cabinets stop at the overhang, under a worktop over the whole footprint), basins and
tubs with real holes (a corner tub: quarter-disc rim and basin, smooth), a shower riser (shared `riser` helper) from
the rim or tray to 1.95 m, a shower's 0.05 m tray and 2.0 m glass screen with a metal edge post, a toilet (pedestal,
bowl ring at 0.30–0.40 m, cistern to 0.78 m), a bidet with its tap, beds, sofas (wood plinth to 0.10 m, then fabric:
seat over the outline to 0.45, back to 0.85, arms to 0.62, none on a sectional's return; `mirror` via a min/max box
helper), tables and chairs, in the new `ceramic`, `wood` and `fabric` materials.

## Limits (2026-11-04)

Pieces do not follow walls that move; *Move to layer* in the Selection panel moves lines and areas, not furniture; a
kitchen sink needs a counter on its own layer; counters are straight; nothing snaps a corner tub into a corner (it
backs up to one wall face like other wall pieces).
