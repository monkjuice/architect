---
title: Doors, windows and gates
type: component
summary: "Openings hosted by a segment (src/model/openings.ts): layout, wall gaps (fireplaces cut none), placement targets with middle and 5 cm snapping, edits that keep them on their walls, the Door/Window/Gate/Fireplace tools, the library's Doors, Windows, Gates and Fireplaces groups, dragging, drawing and the Selection panel. Styles and fireplaces have their own pages."
tags: [model, openings, doors, windows, gates, fireplace, ui]
sources: []
updated: 2026-11-04
---

# Doors, windows and gates

Why they are hosted by a segment: [Doors and windows are hosted by a segment](openings-hosted-by-segment.md). Styles
and their symbols: [Door, window and gate styles](opening-styles.md). Since 2026-11-04 a fourth kind, `fireplace`,
shares all of this but stands against a wall instead of opening it ([Fireplaces](fireplaces.md)).

## Model

- `layer.openings` maps `o1`, `o2`… to `{kind, style, segment, offset, width, hinge, swing}`, where `kind` is `'door'`,
  `'window'` or `'gate'` (fifth session). `offset` is the centre's distance from the segment's `a` end. `hinge`
  (`'a'`/`'b'`) is the end a single leaf hangs from, or the end a sliding gate slides towards. `swing`
  (`'left'`/`'right'`) is the side it opens or slides to, looking from `a` to `b`.
- Any segment can host a door, window or gate, whatever its own kind (wall, open edge or outline; not checked).
  Gates usually go in fences, which are drawn as open edges. Fireplaces go on walls only (`TargetOptions.kind`).
- Coordinates are y-down, so the left of a→b is `(dir.y, -dir.x)` (`PlacedOpening.left`).
- Type names avoid the DOM global `Window`: `Opening`, `OpeningKind`, `OpeningStyle`.

## Geometry (`src/model/openings.ts`)

- `placeOpening` lays an opening out on its segment. `fitOffset` clamps the centre so it stays on the wall, without
  changing the stored offset. `fits` is false when the wall is shorter than the opening (drawn as `.misfit`).
- `openingParts` gives the plan symbol, and `parkingRoom` a sliding gate's clear wall to slide along
  ([Door, window and gate styles](opening-styles.md)).
- `openingSpans` gives the stretches the wall is drawn around (only openings that `cutsWall`), and
  `overlappingOpening` checks for overlaps along the segment, on either side.
- `openingTarget` decides where a new or dragged opening goes:
  - the nearest segment within `reach` on editable layers (the active layer wins ties; `layer` restricts a drag to
    its own layer); an optional `halfWidth(layer, segment)` adds a thick wall's half thickness to the reach;
  - the centre snaps to the wall's middle within `snapReach`, or else to 5 cm gaps from the nearer end;
  - `side` comes from the cursor, and the default hinge is at the end nearer the closer corner (a sliding gate
    takes the other end: `openingFor`);
  - `problem` holds the text for a wall that is too short or an overlap (`ignore` skips the dragged opening).
- `openingFor(kind, style, target, width, otherHinge)` builds the opening. `openingAt(plan, p, reach, half?)` hits an
  opening by its stretch of wall, any of its leaves or a fireplace's surround; `half` gives the host's half
  thickness, which the fireplace's box needs ([Fireplaces](fireplaces.md)).

## Edits (`src/model/edit.ts`)

- `addOpening` and `updateOpening` replace only the layer's `openings` map, so cached regions stay valid, as with
  areas ([Code conventions](code-conventions.md)). `draftLayer` copies that map too. `updateOpening` refuses a style
  of the other kind.
- `splitSegment` hands each opening to the piece its centre is on.
- `followOpenings` (in `setVertices` and `setSegmentLength`) keeps the distance to the nearer end.
- `pruneOpenings` runs after `deleteItems` and `mergeVertices`: deleting a wall deletes its openings.
- `moveSegments` carries openings to the target layer with new ids. When the target already has that segment running
  the other way, `reverseOpening` mirrors them (offset, hinge and swing, for both kinds).

## In the editor

- **Door (`D`), Window (`W`) and Gate** share `createOpeningTool` (`src/ui/canvas/tools/opening.ts`) and place the
  store's `openingStyle[kind]`: the style last picked in the library, single door, sliding window and single gate at
  start ([Editor store and state](editor-store.md)). The Gate tool has no shortcut, because `G` toggles the grid; it
  is armed from the library, as is the Fireplace tool (`createOpeningTool(ctx, 'fireplace')`, no key).
  - A preview labels the free wall on each side.
  - Typed digits set the width, which is remembered per style in prefs `widths` after placing.
  - `X` swaps a single leaf's hinge or a sliding gate's direction, and Alt turns snapping off.
  - Walls are picked within `WALL_REACH_PX` (14).
- **Library panel** (`src/ui/panels/LibraryPanel.tsx`): after the Line types box come a Doors group (3 styles), a
  Windows group (5), headed `D` and `W`, a Gates group (3, no key) and a Fireplaces group (1; all through `GROUPS`),
  then the Colonnades box ([Colonnades](colonnades.md)).
  - Each item shows its icon, its count on the visible layers and the width the next one gets.
  - A click sets `openingStyle` and the tool.
  - A drag carries `"kind:style"` under `OPENING_DRAG_TYPE` (`LibraryItem.drag` is `{type, data}`). `Canvas`'s
    `onDrop` checks it with `isStyleOf`, then calls `dropOpening`, which passes the kind to `openingTarget`.
- Placing goes through `placeOpeningAt` and `dropOpening` in `src/state/actions.ts`. They refuse with a notice when
  the target has a `problem`, and select the new opening.
- **Select tool**: a lone selected opening drags along its wall or onto another wall of its layer. Where it cannot
  go, it stays at its last good place and the would-be position shows in red. Escape cancels the drag.
- **Drawing**: `LayerShapes` draws walls in pieces around the spans, and `layerWalls` caps them there
  ([Walls](walls.md)). `src/ui/canvas/Openings.tsx` draws the symbols from `openingParts` for the host's thickness
  (`hostThickness`: the wall's, or 0.15 m in an open-edge fence). `OpeningSymbol` takes `wall` and `thick`: with
  thick walls the jambs and frames span the real thickness with no minimum; in thin mode they are at least 3 px.
  The minimum was dropped for thick walls because jambs in 0.15 m walls stuck out past the faces at normal zoom.
  A selected opening gets a light stroke and a drop-shadow glow, because the selection blue is too close to the
  first layer colour.
- **Selection panel** (`OpeningDetails`) shows:
  - a Style select with the styles of the same kind;
  - the width, the wall length, and the free wall on each side, named left/right (wall running across) or top/bottom
    (wall running down);
  - *Flip side* and *Flip hinge*, only when `hasSide` / `hasHinge` apply (*Flip direction* for a sliding gate);
  - for a sliding gate, its parking room, as a warning when it is short.

  A change that would overlap another opening is refused with a notice. The selection summary counts doors, windows,
  gates and fireplaces.

## Known limits (2026-11-02)

A sliding gate's parking room counts only its host segment.
Materials (frames, finishes) do not exist yet; see the open items in
the [Overview](../overview.md).

Related: [Canvas and tools](canvas-and-tools.md), [Plan model and file format](plan-model.md).
