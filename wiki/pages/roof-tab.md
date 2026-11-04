---
title: Roof tab (roof plan)
type: component
summary: "The Roof tab: src/ui/RoofTab.tsx (Select V / Roof R / Pan H, the New roofs type = EditorState.roofType, Roof the house, Snap) over the shared Canvas in roof mode (floor plan faded, Roofs.tsx draws slopes shaded by aspect, eaves, dashed outline under an overhang, downhill arrows, labels), the roof and roofSelect tools, RoofPanel (Box roofs), and the actions openTab, addRoofOutline and roofTheHouse."
tags: [ui, roof, canvas, tools, tabs]
sources: []
updated: 2026-11-02
---

# Roof tab (roof plan)

Added in the eighth session (2026-11-02). It edits the roofs of [Roofs: model and geometry](roofs.md), drawn as a
roof plan over the floor plan ([Roofs are drawn outlines](roofs-drawn-outlines.md)).

## Files

- `src/ui/RoofTab.tsx`: row 2 has the tools Select (`V`), Roof (`R`) and Pan (`H`), *New roofs* (a segmented
  control setting `EditorState.roofType`, default gable, not saved), *Roof the house* and Snap. Below:
  `<Canvas mode="roof" />`, the `NoticeBar`, and a sidebar with `RoofPanel` and `LayersPanel`.
- `Canvas` in roof mode ([Canvas and tools](canvas-and-tools.md)): its own `ROOF_SHORTCUTS` (`v r m h`; `S` does
  nothing), class `.canvas.roof-mode` fades the floor plan's lines and openings, and there are no area fills or
  labels, sun, calibration or selection marks, or welcome card. `RoofLayer` is drawn per visible layer.
- `src/ui/canvas/Roofs.tsx`: slopes filled with an opacity by aspect (light from the top left), eaves solid, the
  outline dashed when there is an overhang, a downhill arrow per slope, a label (type and pitch; `top +x.xx` or
  "not convex"), corner handles when selected.
- `src/ui/canvas/tools/roof.ts`: click corners (snap, Shift 45°, the first corner is an extra snap point); click
  the first corner or press Enter to close (a right click also closes), Backspace drops a corner, Esc cancels.
- `src/ui/canvas/tools/roofSelect.ts`: a click inside the eaves or outline picks the smallest roof on an editable
  layer, top layer first, so a small roof over a big one can be picked; Shift toggles; dragging moves through
  `store.preview` + `moveRoofs`; dragging a selected roof's corner reshapes it with snapping; Delete removes.
- `src/ui/panels/RoofPanel.tsx` (Box id `roofs`): the roofs of visible layers (a click selects and activates the
  layer), then the selected roof's type, pitch (with % slope), *Height at the walls*, overhang, parapet (flat),
  *Turn the slope / ridge* (`nextEdge`), areas and heights, the convexity warning and Delete.

## Actions (`src/state/actions.ts`)

- `openTab(tab)`, called by `TopBar` (`store.setTab` was removed): entering Roof turns a floor tool into
  `roof-select`, entering Floor turns a `ROOF_TOOLS` tool into `select`, and the selection keeps only roof refs on
  Roof and only non-roof refs on Floor ([Tabs over one plan](tabs-over-one-plan.md)).
- `addRoofOutline`: refuses an outline under 0.05 m², adds a `newRoof` of `roofType` to the active layer, selects it.
- `roofTheHouse`: the active layer's covered named areas (`isCovered`, [House solids](house-solids.md)) put together
  by `unionOutlines`, one roof per group that touches, offset by `EXTERIOR_WALL / 2` (the outside face of an
  automatic 0.30 m wall: regions run on centrelines), as high as the tallest of their walls. One undo step.

## Limits

Roofs do not follow walls that move. *Roof the house* ignores unnamed rooms, drops courtyards and does not follow
walls of a set thickness. Hip roofs are exact only on convex outlines.
