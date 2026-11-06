---
title: Furniture and fixtures
type: component
summary: "Free-standing pieces in layer.furniture (ids f<n>): counters and kitchen islands (a counter style), sinks (outdoor, kitchen, bathroom), bathtubs (alcove, clawfoot, drop in, corner) and showers with a movable shower head, toilets, bidets, beds (single to king), sofas (armchair to an L-shaped sectional that flips), square, round, coffee and oak trestle tables, chairs, trees (shade, slender); src/model/furniture.ts (FURNITURE catalogue, placements, furnitureTarget snapping to wall faces, counters, tables and sofas, the kitchen sink laid out from its counter, shower rim positions incl. a corner tub's curve, sofa outlines, plan symbols), furniture3d.ts (blocks in 3-D), the Furniture tool, select-tool drags, R to turn, the library boxes and FurnitureDetails."
tags: [model, furniture, ui, canvas, 3d, trees, oak]
sources: []
updated: 2026-11-06
---

# Furniture and fixtures

Added on 2026-11-04 for the user's request: counters, sinks (the kitchen one "can only be placed over a counter"),
bathtubs ("allow me to move the shower head"), beds, tables and chairs. Why pieces stand free and only the kitchen
sink is hosted: [Furniture stands free; a kitchen sink is hosted by its counter](furniture-free-standing.md).
The same day (`3014137`) the user asked for a toilet and a bidet, then a simple shower and a corner bathtub, and
then (`0acdce9`) a kitchen island, (`3657510`) sofas and (`4cf872f`) a coffee table (asked for as a "mouse table",
the Argentine *mesa ratona*).

## Model

- `layer.furniture` (id → `FurnitureSchema`, a union on `kind` with sinks a nested union on `style`) in
  `src/model/plan.ts` ([Plan model and file format](plan-model.md)). Standing pieces have `at` (centre), `angle`
  (degrees clockwise; at 0 the back is up the sheet), `width` (across the front; a round table's diameter) and
  `depth`; a bathtub and a shower add `shower` (`ShowerSchema`; `ToiletSchema` and `BidetSchema` have no styles or
  extra fields). A kitchen sink has `counter` and `offset` (counter's left end → sink centre)
  instead of `at`/`angle`. Code tells the two apart with `'at' in f` (type `StandingFurniture`).
- `src/model/furniture.ts`:
  - `FURNITURE`: the catalogue in library order (title, new size, height, `snap`: `wall`, `counter`, `table`,
    `sofa`, `none`); `furnitureInfo`/`infoOf`; `furnitureKey` (`"bed:queen"`, `"counter"`).
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
    square: the side the cursor is most past), tucked 10 cm under it, but never to a coffee table; square and round
    tables are free. A **coffee table** (`table` style `coffee`, 1.20 × 0.60 m, 0.42 m high, snap `sofa`) put
    within reach of the space in front of a sofa's main seat (the first such sofa on the layer) is centred in front
    of that seat `COFFEE_GAP` (0.40 m) out, squared to the sofa; a sectional's main seat stops short of its return
    (`SOFA.chaise`) and is only `SOFA.seat` deep, mirrored with `mirror`; elsewhere it stands free. A **trestle**
    table (`81ba2bd`, from the user's photo of a reclaimed-oak farmhouse table, to replace their 7 m gallery table):
    "Oak trestle", 3.2 × 1.1 m, 0.78 m high, snap `none`, so the Style field switches it with square and round ones
    and chairs gather round it. `trestleBoards(depth)` (boards ~0.35 m wide) and `trestleFrames(width)` (in from each
    end by min(0.4 m, 9 %), plus a middle frame over 4 m) are shared by the plan symbol (soft board joints and frame
    boxes) and 3-D. A kitchen sink goes in a
    counter within reach or gets a `problem` (no counter; counter shorter than the sink), with or without snap/Alt.
    Wall thickness comes in as a callback (`hostThickness`).
  - `furnitureAt`: the smallest piece under the point (a sink beats its counter), top layer first.
  - Shower head, on any `hasShower` piece (bathtub or shower): `shower` is 0–4 round the rim (0–1 back from the
    left, 1–2 right, 2–3 front, 3–4 left), 4 cm inside the edge; `showerPoint(pl, s, corner)` /
    `showerAt(pl, p, corner)`, with `corner = isCorner(f)`. A corner tub is a quarter disc round its back-left
    corner (meant for the room's corner; radius `min(width, depth)`, `quarterDisc`), and its s 1–3 runs round the
    curved front. `showerAt` walks the rim in 24 short steps per side so it follows that curve. New heads: tub 3.5
    (left end), corner tub 3.85 (left wall near the corner), shower 0.5 (back middle).
  - **Trees** (`TreeSchema`, kind `tree`, `506fd9e`, for the street verges round the user's lot): styles `shade`
    (6 × 6 m, 7 m high) and `slender` (3.5 m, 11 m high), snap `none`, in a library box *Trees*. Picked as a disc;
    symbol: crown ellipse (`soft`), inner ring (`detail`), trunk circle (`heavy`).
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
- **Library**: `FURNITURE_GROUPS` in `LibraryPanel.tsx` lists the `kinds` of each box. The boxes are nested in the
  Objects group (after Drawing and Materials) with the opening and colonnade boxes, and each box's id comes from the
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
  never switches one into the other, and likewise a coffee table and a square or round one. The title adds the kind
  for beds, bathtubs and tables ("Coffee table").

## In 3-D

`furnitureParts` (`src/model/furniture3d.ts`) gives `furniture` solids ([House solids](house-solids.md)): counter
(toe kick, wood cabinets, stone worktop at `WORKTOP` 0.90 m, where the kitchen sink's steel rim sits; an island's
toe kick is recessed all round and its cabinets stop at the overhang, under a worktop over the whole footprint), basins and
tubs with real holes (a corner tub: quarter-disc rim and basin, smooth), a shower riser (shared `riser` helper) from
the rim or tray to 1.95 m, a shower's 0.05 m tray and 2.0 m glass screen with a metal edge post, a toilet (pedestal,
bowl ring at 0.30–0.40 m, cistern to 0.78 m), a bidet with its tap, beds, sofas (wood plinth to 0.10 m, then fabric:
seat over the outline to 0.45, back to 0.85, arms to 0.62, none on a sectional's return; `mirror` via a min/max box
helper), tables (a coffee table: rounded top at 0.38–0.42 m, a shelf at 0.10–0.12, four legs) and chairs, in the new `ceramic`, `wood` and `fabric` materials.
A trestle is 0.09 m top boards with 6 mm gaps; per frame two 0.14 m square legs, a foot rail at 0.05–0.17 m and a
bearer under the top; a stretcher at 0.20–0.32 m; and two slanted braces (`profileFaces`). Every part is palette
`wood` with `FurniturePart.finish` `oak-solid` and a per-part `Face.grain` (along, up, across or along the slant), so
the oak's grain follows each piece ([Materials and finishes](materials-and-finishes.md)). A tree's height scales with its width at
the catalogue's ratio: a `bark` trunk frustum under a `foliage` crown of smooth ellipsoid lobes (one for slender,
three for shade trees).

## Limits (2026-11-04)

Pieces do not follow walls that move, nor a coffee table its sofa; *Move to layer* in the Selection panel moves lines and areas, not furniture; a
kitchen sink needs a counter on its own layer; counters are straight; nothing snaps a corner tub into a corner (it
backs up to one wall face like other wall pieces).
