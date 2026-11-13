---
title: Canvas and tools
type: component
summary: "The SVG canvas of the Floor, Roof and Foundation tabs in src/ui/canvas/ (mode floor, roof or foundation): Canvas.tsx routes pointer and key events to plain tool controllers in tools/ that return OverlayData and takes library drops (openings, colonnades, furniture and materials); Scene.tsx draws the plan (walls filled at their thickness unless Thick walls is off, area fills in their floor finish (checkered ones as SVG patterns) unless View > Materials is off, area labels with the lines the View section shows), Columns.tsx the colonnades, Finishes.tsx the wall finishes, Furniture.tsx the furniture symbols, Sun.tsx the sun dial and wall shadows, Roofs.tsx the roof plan, Foundation.tsx the foundation plan, and Overlay.tsx the tool feedback, at constant screen size; the select tool's hit order."
tags: [ui, canvas, svg, tools, sun, walls, tabs, roof, colonnades, furniture, finishes, storeys, foundation]
sources: []
updated: 2026-11-08
---

# Canvas and tools

## Mosaic floor patterns

`FinishPatterns` in `Finishes.tsx` emits grout-backed SVG mosaic patterns at the material's real tile size, and
`Scene` uses those definitions for mosaic floor fills. It calls the model's shared `mosaicColor()` motif, keeping
the plan aligned with the library swatch and the 3-D texture instead of maintaining a second colour layout.

Since 2026-11-07 the canvas shows only the active layer's floor, over the floor below (faded, not pickable), and
tools find things through `storeyView` ([Floors](storeys.md)); their edits still start from the store's plan, as
the view lacks the other floors' layers.

## Files (`src/ui/canvas/`)

- `Canvas.tsx`: the `<svg>`, whose `viewBox` is the stored view in world meters. It handles the resize observer and
  the wheel zoom (registered natively because React's wheel listener is passive). It also handles panning (Space,
  the middle button or the `pan` tool), the tool shortcuts, file drops and the four kinds of Library drag: doors,
  windows, gates and fireplaces (`OPENING_DRAG_TYPE` data `"kind:style"`, checked with `isStyleOf` → `dropOpening`),
  colonnades (`COLONNADE_DRAG_TYPE` data: the column style → `dropColonnade`), furniture (`FURNITURE_DRAG_TYPE`,
  checked against `FURNITURE` → `dropFurniture`) and materials (`MATERIAL_DRAG_TYPE` data `"wall:<id>"` /
  `"floor:<id>"` → `dropMaterial`, [Materials and finishes](materials-and-finishes.md)), the scale bar and the status line. It also draws `FurnitureLayer`
  per visible layer ([Furniture and fixtures](furniture.md)). It fits the view only
  once ([View fitted once and stored](view-fitted-once.md)). On an empty plan it shows the `.empty-state` welcome
  card, only while Select or Pan is active, and the card lets clicks through
  ([Welcome card swallowed canvas clicks](welcome-card-swallowed-clicks.md)). It is mounted by `src/ui/FloorTab.tsx`
  and, with `mode="roof"`, by `RoofTab.tsx`: there it has its own shortcuts (`ROOF_SHORTCUTS`: `v r m h`), fades the
  floor plan (`.canvas.roof-mode`, furniture included), leaves out area fills and labels, sun, calibration and selection marks, and
  draws `RoofLayer` from `Roofs.tsx` ([Roof tab](roof-tab.md)). With `mode="foundation"` (`aaa70c1`, mounted by
  `FoundationTab.tsx`; shortcuts `FOUNDATION_SHORTCUTS` `v m h`, class `.canvas.foundation-mode`) it shows the
  first ground-floor layer's view with no floor below, faded, without furniture, under `FoundationLayer` from
  `Foundation.tsx` ([Foundation tab](foundation-tab.md)). Floor-only drawing (area fills, sun, finishes, labels,
  selection marks, calibration, welcome card) tests `floorMode`, so a new mode gets none of it by default. It
  unmounts on other tabs, so its single-key shortcuts are inert there ([Tabs over one plan](tabs-over-one-plan.md)).
- `Scene.tsx`: the static drawing.
  - `BaseImageView`: the image under `imageTransform`, cropped by a clipPath, and shaded outside the crop while the
    crop tool is active.
  - `Grid` and `SelectionMarks`.
  - `AreaFills` (memoized, per layer): tints the named regions under the lines ([Areas](areas.md)); a floor with a
    finish is tinted in its material's colour (class `finished`), or filled with `url(#finish-<id>)` when the material
    is checkered. With `materials={false}` (View > *Materials* off) it uses only the layer tint.
  - `LayerShapes` (memoized): one path per segment kind, `.layer-lines` for walls, `.open` (dashed) and `.outline`
    (thin) ([Open edges and outlines are segment kinds](segment-kind-not-layer.md)). With `prefs.thickWalls` (View
    section *Thick walls*, default on) walls are instead `.walls .wall-fill` and `.wall-edges` from `getWalls`, filled
    at their thickness ([Walls](walls.md)). Each segment is drawn in pieces
    around its doors and windows (`openingSpans`). Vertices are drawn only on the active layer, and open ends are hollow. Locked layers
    fade (opacity 0.6) and are not dashed, because dashes mean open edges.
  - `OpeningLayer` (`Openings.tsx`, memoized, per layer): door, window, gate and fireplace symbols
    ([Doors, windows and gates](doors-and-windows.md), [Fireplaces](fireplaces.md)); a sliding gate short of parking
    room gets class `cramped`.
  - `ColonnadeLayer` (`Columns.tsx`, memoized, per visible layer): columns at real size ([Colonnades](colonnades.md)).
    The selected ids are passed as one space-separated string, so `memo` compares by value. `OpeningShape` renders
    `openingParts`, both here and in the library's `OpeningIcon` ([Door, window and gate styles](opening-styles.md)).
  - `AreaLabels`: name and m² pills, dashed warning style when not enclosed. Each line shows only when the View
    section's *Area names* / *Area sizes* is on (`prefs.areaNames`, `areaSizes`, passed as `LabelLines`).
  - `CalibrationMarks` and `SegmentLabel`.
- `Finishes.tsx`: `FinishLayer` (memoized, per layer, drawn only while `prefs.materials` is on), a line in each
  finished wall side's material colour, inset inside the face (thin walls: just off the line) and broken at openings;
  `FinishPatterns`, the `<pattern>` defs of checkered materials in metres, rendered once in Canvas's svg
  ([Materials and finishes](materials-and-finishes.md)).
- `Furniture.tsx`: `FurnitureSymbol` (renders `furnitureSymbol` parts as `.furniture-<role>`), `FurnitureLayer`
  (memoized, selected ids as one string like `ColonnadeLayer`) and the library's `FurnitureIcon`
  ([Furniture and fixtures](furniture.md)).
- `Sun.tsx` ([Sun and shadows](sun.md)): `SunShadows`, drawn between the area fills and `LayerShapes`, and
  `SunDial`, drawn after `AreaLabels` with `pointer-events: none`. Both render nothing unless `prefs.sun.visible`;
  `S` toggles it.
- `Overlay.tsx`: draws a tool's `OverlayData`: preview lines (dashed `preview-open` for open edges; outlines preview solid), area, a
  hovered region, a door or window being placed (red when it has a `problem`), a piece of furniture being placed
  (`OverlayData.furniture`, the same symbol as a ghost), points, labels, tag, snap marker and marquee.
- `areas.ts`: area label text, screen-size label boxes (`areaLabelSize(placed, lines)`: one line gives a shorter
  box, none no label) and their hit test (`areaLabelAt(..., lines)`), and `regionPath`. The select tool passes the
  current prefs, so a hidden label cannot be grabbed.
- `symbols.ts`: drawing helpers shared by component files (`flueMark`, used by `Openings.tsx` and `Roofs.tsx`);
  helpers live here because component files may export only components ([Code conventions](code-conventions.md)).
- `tools/`: `select.ts`, `line.ts`, `area.ts`, `opening.ts` (Door, Window, Gate and Fireplace), `colonnade.ts`
  (Colonnade: click an open edge), `furniture.ts` (put the library's piece down; `R` turns it), `material.ts` (Material: finish the wall side or
  floor under the cursor with `materialPick`), `measure.ts`, `image.ts`
  (move, level, crop, calibrate) and `north.ts` (North: two clicks along the survey's north arrow set
  `plan.site.north`; no key, not an image tool, so it works with a locked or missing image), and the Roof tab's
  `roof.ts` (draw an outline) and `roofSelect.ts` (pick, move, reshape) ([Roof tab](roof-tab.md)), and the
  Foundation tab's `foundationSelect.ts` (pick footings) ([Foundation tab](foundation-tab.md)).
  - `index.ts` builds the tools (`createTools`) and holds `TOOL_INFO` (titles, keys, hints).
  - `types.ts` holds the interfaces and the screen-pixel tolerances (`SNAP_PX` 10, vertex hit 8, segment hit 6,
    drag 3, `WALL_REACH_PX` 14 for picking a wall for an opening).
- `view.ts`: `frame`, the zoom limits, the grid steps and `formatMeters`.

The line tool draws the store's `lineKind` (`O` cycles wall → open edge → outline, or pick the line type in the
Library panel). The Area
tool (`A`) and how the select tool picks and drags areas are described in [Areas](areas.md), the Door (`D`),
Window (`W`) and Gate (no key: `G` is the grid) tools and opening drags in [Doors, windows and gates](doors-and-windows.md); the Fireplace, Colonnade, Furniture and Material tools have no key either. The select tool hits, in order:
a selected bathtub's or shower's shower mark, area labels (from `planAreas`, so a lot's label stays off the house, [Lots](lots.md)), vertices, openings, furniture (smallest piece first), segments; on the
Floor tab `R` turns selected furniture (on the Roof tab `R` is the Roof tool). Segment hits and wall picking for openings measure from a thick wall's
faces, through the `drawnHalfWidth` callback ([Walls](walls.md)). `Overlay` and `OpeningLayer` take `thick` too.

## Tool controllers

A tool is a plain object, not a React component. The canvas creates all of them once (`useMemo`). A tool has:

- `cursor`, `overlay()`;
- `reset`, which runs when the tool is picked and when it is left;
- `down`, `move`, `up`;
- `key`, which returns true when it handled the key;
- `cancel`, called on a right click.

Tools keep their own state in closures. They write the plan through the store: `edit`, or `preview`/`endGesture` for
drags ([Editor store and state](editor-store.md)), or through an action shared with other UI (the opening tool and
the library drop both use `placeOpeningAt` in `src/state/actions.ts`, because state never imports from ui). They call `ctx.redraw()` when only their own state changed. When
Shift or Alt changes, the canvas re-runs `move` with the last pointer, so constraints and snapping follow at once.

`PointerInfo` carries the world point `p`, `px` (world units per screen pixel, `1 / zoom`), `shift` and `alt`. Tools
turn screen tolerances into world units with `px` and never read the canvas's React refs, which oxlint's `react/refs`
rule would flag. Snapping is in [Snapping and connections](snapping-and-connections.md), and the image tools are in
[Base image placement and calibration](base-image-calibration.md).

Nothing that appears on its own may shift the canvas in the layout: notices float over it
([Notices float over the canvas](notices-float-over-canvas.md)). Anything drawn over the canvas must let pointer
events through (`pointer-events: none`) except its own controls
([Welcome card swallowed canvas clicks](welcome-card-swallowed-clicks.md)).

## Constant screen size

Everything is drawn in world coordinates, but marks keep a constant size on screen:

- Strokes do not scale, through CSS in `src/App.css`:
  `.canvas :is(rect, circle, line, path, polygon, polyline) { vector-effect: non-scaling-stroke }`. A new SVG
  element type must be added there; `polyline` was added for dashed outlines (awning sashes, parked sliding gates).
  Library icons sit outside `.canvas` and `FurnitureIcon` scales real-size symbols by a `transform` (up to 40×), so
  furniture icons have their own non-scaling rule (`.library-icon .furniture :is(polygon, polyline, circle)`).
- Radii, offsets and text are multiplied by `px`; the font size is `11 * px`.
- Length labels sit on dark pills (`SegmentLabel`, `--label-bg`), so they read both on the white paper of a scan and
  on the dark canvas. A label is skipped when its segment is too short on screen.
- `LAYER_COLORS` in `src/model/plan.ts` were chosen to read on both backgrounds as well.
