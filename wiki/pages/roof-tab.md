---
title: Roof tab (roof plan)
type: component
summary: "The Roof tab: src/ui/RoofTab.tsx (Select V / Roof R / Pan H, the New roofs type = EditorState.roofType, Roof the house, Snap) over the shared Canvas in roof mode (floor plan faded, Roofs.tsx draws slopes shaded by aspect, eaves, dashed outline under an overhang, downhill arrows, labels, fireplaces' chimneys), the roof and roofSelect tools, RoofPanel (Box roofs), and the actions openTab, addRoofOutline and roofTheHouse."
tags: [ui, roof, canvas, tools, tabs, fireplace, finishes, gallery, skylights]
sources: []
updated: 2026-11-06
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
  "not convex"), corner handles when selected; a roof with a covering (`20dcb35`) has its slopes tinted in the
  material's colour. Since 2026-11-04 it also marks each fireplace's chimney: the flue
  from `fireplaceShape`, crossed (`flueMark`, class `.roof-chimney`; [Fireplaces](fireplaces.md)). Since `8d33d0b`
  each skylight (`skylights(roof)`, [Roofs](roofs.md)) is a `.roof-skylight` path, filled translucent blue.
- `src/ui/canvas/tools/roof.ts`: click corners (snap, Shift 45°, the first corner is an extra snap point); click
  the first corner or press Enter to close (a right click also closes), Backspace drops a corner, Esc cancels.
- `src/ui/canvas/tools/roofSelect.ts`: a click inside the eaves or outline picks the smallest roof on an editable
  layer, top layer first, so a small roof over a big one can be picked; Shift toggles; dragging moves through
  `store.preview` + `moveRoofs`; dragging a selected roof's corner reshapes it with snapping; Delete removes.
- `src/ui/panels/RoofPanel.tsx` (Box id `roofs`): the roofs of visible layers (a click selects and activates the
  layer), then the selected roof's type, pitch (with % slope), *Height at the walls*, overhang, parapet (flat),
  *Turn the slope / ridge* (`nextEdge`), *Covering* and *Soffit (its underside)* material fields (`20dcb35`;
  [Materials and finishes](materials-and-finishes.md)), *Skylights (0: none)* (a whole number; 0 removes the key)
  and *Skylight width* (default 1 m, shown only with skylights; `8d33d0b`), areas and heights, the convexity warning
  and Delete.

## Actions (`src/state/actions.ts`)

- `openTab(tab)`, called by `TopBar` (`store.setTab` was removed): entering Roof turns a floor tool into
  `roof-select`, entering Floor turns a `ROOF_TOOLS` tool into `select`, and the selection keeps only roof refs on
  Roof and only non-roof refs on Floor ([Tabs over one plan](tabs-over-one-plan.md)).
- `addRoofOutline`: refuses an outline under 0.05 m², adds a `newRoof` of `roofType` to the active layer, selects it.
- `roofTheHouse`: takes the active layer's covered named areas (`isCovered`, [House solids](house-solids.md)). Since
  `b5b8220`, indoor rooms and galleries (covered, not indoor) are put together separately by `unionOutlines`. Each
  room group gets a `newRoof` of `roofType`. Each gallery group gets its own `galleryRoof`: a 2° shed sloping away
  from the house, tucked under its eaves ([Roofs](roofs.md)). The reason is that the user wants the gallery nearly
  flat (1–2°) and the house at 5–6°, which one roof cannot do. Outlines are offset by `EXTERIOR_WALL / 2` (the
  outside face of an automatic 0.30 m wall: regions run on centrelines), and heights come from the tallest of the
  covered areas' walls. The notice mentions the galleries. One undo step.

## Limits

Roofs do not follow walls that move. *Roof the house* ignores unnamed rooms, drops courtyards and does not follow
walls of a set thickness. Hip roofs are exact only on convex outlines: *Roof the house* with hip on the user's
non-convex house (checked 2026-11-05) gives one hip over it, the bedroom wing's walls poke through and parts stay
uncovered. The advice is to draw convex pieces per wing with the Roof tool.
