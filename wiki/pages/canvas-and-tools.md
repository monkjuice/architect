---
title: Canvas and tools
type: component
summary: "The Floor tab's SVG canvas in src/ui/canvas/: Canvas.tsx routes pointer and key events to plain tool controllers in tools/ that return OverlayData; Scene.tsx draws the plan (walls filled at their thickness unless Thick walls is off, area labels with the lines the View section shows), Sun.tsx the sun dial and wall shadows, and Overlay.tsx the tool feedback, at constant screen size."
tags: [ui, canvas, svg, tools, sun, walls, tabs]
sources: []
updated: 2026-11-02
---

# Canvas and tools

## Files (`src/ui/canvas/`)

- `Canvas.tsx`: the `<svg>`, whose `viewBox` is the stored view in world meters. It handles the resize observer and
  the wheel zoom (registered natively because React's wheel listener is passive). It also handles panning (Space,
  the middle button or the `pan` tool), the tool shortcuts, file drops and doors, windows or gates dragged from the
  Library panel (`OPENING_DRAG_TYPE` data `"kind:style"`, checked with `isStyleOf` → `dropOpening`), the scale bar
  and the status line. It fits the view only
  once ([View fitted once and stored](view-fitted-once.md)). On an empty plan it shows the `.empty-state` welcome
  card, only while Select or Pan is active, and the card lets clicks through
  ([Welcome card swallowed canvas clicks](welcome-card-swallowed-clicks.md)). It is mounted by `src/ui/FloorTab.tsx`
  and unmounts on other tabs, so its single-key shortcuts are inert there
  ([Tabs over one plan](tabs-over-one-plan.md)).
- `Scene.tsx`: the static drawing.
  - `BaseImageView`: the image under `imageTransform`, cropped by a clipPath, and shaded outside the crop while the
    crop tool is active.
  - `Grid` and `SelectionMarks`.
  - `AreaFills` (memoized, per layer): tints the named regions under the lines ([Areas](areas.md)).
  - `LayerShapes` (memoized): one path per segment kind, `.layer-lines` for walls, `.open` (dashed) and `.outline`
    (thin) ([Open edges and outlines are segment kinds](segment-kind-not-layer.md)). With `prefs.thickWalls` (View
    section *Thick walls*, default on) walls are instead `.walls .wall-fill` and `.wall-edges` from `getWalls`, filled
    at their thickness ([Walls](walls.md)). Each segment is drawn in pieces
    around its doors and windows (`openingSpans`). Vertices are drawn only on the active layer, and open ends are hollow. Locked layers
    fade (opacity 0.6) and are not dashed, because dashes mean open edges.
  - `OpeningLayer` (`Openings.tsx`, memoized, per layer): door, window and gate symbols
    ([Doors, windows and gates](doors-and-windows.md)); a sliding gate short of parking room gets class `cramped`.
    The selected ids are passed as one space-separated string, so `memo` compares by value. `OpeningShape` renders
    `openingParts`, both here and in the library's `OpeningIcon` ([Door, window and gate styles](opening-styles.md)).
  - `AreaLabels`: name and m² pills, dashed warning style when not enclosed. Each line shows only when the View
    section's *Area names* / *Area sizes* is on (`prefs.areaNames`, `areaSizes`, passed as `LabelLines`).
  - `CalibrationMarks` and `SegmentLabel`.
- `Sun.tsx` ([Sun and shadows](sun.md)): `SunShadows`, drawn between the area fills and `LayerShapes`, and
  `SunDial`, drawn after `AreaLabels` with `pointer-events: none`. Both render nothing unless `prefs.sun.visible`;
  `S` toggles it.
- `Overlay.tsx`: draws a tool's `OverlayData`: preview lines (dashed `preview-open` for open edges; outlines preview solid), area, a
  hovered region, a door or window being placed (red when it has a `problem`), points, labels, tag, snap marker
  and marquee.
- `areas.ts`: area label text, screen-size label boxes (`areaLabelSize(placed, lines)`: one line gives a shorter
  box, none no label) and their hit test (`areaLabelAt(..., lines)`), and `regionPath`. The select tool passes the
  current prefs, so a hidden label cannot be grabbed.
- `tools/`: `select.ts`, `line.ts`, `area.ts`, `opening.ts` (Door, Window and Gate), `measure.ts`, `image.ts`
  (move, level, crop, calibrate) and `north.ts` (North: two clicks along the survey's north arrow set
  `plan.site.north`; no key, not an image tool, so it works with a locked or missing image).
  - `index.ts` builds the tools (`createTools`) and holds `TOOL_INFO` (titles, keys, hints).
  - `types.ts` holds the interfaces and the screen-pixel tolerances (`SNAP_PX` 10, vertex hit 8, segment hit 6,
    drag 3, `WALL_REACH_PX` 14 for picking a wall for an opening).
- `view.ts`: `frame`, the zoom limits, the grid steps and `formatMeters`.

The line tool draws the store's `lineKind` (`O` cycles wall → open edge → outline, or pick the line type in the
Library panel). The Area
tool (`A`) and how the select tool picks and drags areas are described in [Areas](areas.md), the Door (`D`),
Window (`W`) and Gate (no key: `G` is the grid) tools and opening drags in [Doors, windows and gates](doors-and-windows.md). The select tool hits, in order:
area labels, vertices, openings, segments. Segment hits and wall picking for openings measure from a thick wall's
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
- Radii, offsets and text are multiplied by `px`; the font size is `11 * px`.
- Length labels sit on dark pills (`SegmentLabel`, `--label-bg`), so they read both on the white paper of a scan and
  on the dark canvas. A label is skipped when its segment is too short on screen.
- `LAYER_COLORS` in `src/model/plan.ts` were chosen to read on both backgrounds as well.
