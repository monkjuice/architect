---
title: Fireplaces
type: component
summary: "A fireplace is a fourth opening kind (FireplaceSchema, style masonry 1.20 m or parrilla, an Argentine built-in grill, 1.80 m; optional finish material for its masonry) hosted by a wall on its swing side that cuts no gap (cutsWall false); fireplaceShape/besideWall (box, firebox, hearth, flue; depth by fireplaceDepth) feed the plan symbol, the roof plan's chimney and the solids; wall-only targets; picked anywhere on its surround; brick (or its finish), stone, soot and metal in 3-D with a chimney 1 m over the roof at its flue."
tags: [model, openings, fireplace, parrilla, roof, 3d, ui, finishes]
sources: []
updated: 2026-11-08
---

# Fireplaces

Added on 2026-11-04, when the user asked for a "fireplace (needs chimney on the roof)". Why an opening kind:
[Colonnades are an open-edge setting; fireplaces are an opening kind](colonnade-setting-fireplace-opening.md). Shared
opening behaviour (placing, dragging, following walls) is in [Doors, windows and gates](doors-and-windows.md).

## Model

- `FireplaceSchema` in `src/model/plan.ts`: `kind: 'fireplace'`, `style` from `FIREPLACE_STYLES` (`masonry`, the
  default, or `parrilla` since `4097821`), an optional `finish` (material id for its masonry, see below) and the
  common opening fields. `swing` is the side of the wall it stands on; `hinge` is unused
  (`hasHinge` false, `hasSide` true, so the Selection panel offers only *Flip side*).
- `cutsWall(o)` (`src/model/openings.ts`) is false only for fireplaces: `openingSpans` skips them, so the wall stays
  whole in plan and in 3-D. `overlappingOpening` still checks them along the segment whatever the side, so a
  fireplace also blocks a door or window on the other face of that stretch of wall.
- Geometry: `FIREPLACE_DEPTH` 0.5 m out from the wall's face (`PARRILLA_DEPTH` 0.8 for a parrilla; read it through
  `fireplaceDepth(o)`), `HEARTH` 0.4 m in front, `FLUE_WIDTH` 0.7 m (at most the width). A parrilla's firebox spans
  the width less its `PARRILLA_CHEEK` (0.15 m) cheeks, from 0.12 m in. `besideWall(placed, o, half)` makes rectangles on the opening's side measured from the face `half` off
  the line; `fireplaceShape` returns `box`, `firebox`, `hearth` and `flue`, the one source for the plan symbol, the
  roof plan's chimney and the solids. `openingParts` carries it as `parts.fireplace`.
- Targets: `openingTarget` with `kind: 'fireplace'` considers wall segments only, so open edges and fences refuse
  it; `dropOpening` passes the kind.
- Picking: `openingAt(plan, p, reach, half?)` hits anywhere inside the box. **Pass the wall's half thickness**: the
  select tool passes `hostThickness / 2`. With 0 the box is laid out from the centreline instead of the face, and a
  test's point on the surround fell on its edge.
- The point-in-polygon test is local to `openings.ts`: importing `regions.ts` would make a cycle
  (openings ← walls ← regions; [Code conventions](code-conventions.md)).

## Editor

- Fireplace tool: `createOpeningTool(ctx, 'fireplace')`, no key; it places `openingStyle.fireplace`, and the width
  typed is kept per style in prefs (`fireplace:masonry`, [Editor store and state](editor-store.md)).
- Library: a *Fireplaces* group through `GROUPS` (Box id `library-fireplace`); the selection summary counts them.
- Plan symbol (`src/ui/canvas/Openings.tsx`): dashed hearth, brick box, dark firebox, crossed flue (`flueMark`, in
  `src/ui/canvas/symbols.ts`). The library icon is drawn by hand: at icon scale the real depths vanish (a
  parrilla's is a wide box with grill lines).
- Selection panel: a `MaterialField` (wall materials, indoors or out) sets `finish`; `updateOpening` deletes the key
  when patched to undefined.
- Roof plan: `Roofs.tsx` draws each flue as a crossed `.roof-chimney` ([Roof tab](roof-tab.md)).

## In 3-D

Built after the roofs ([House solids](house-solids.md)): a stone hearth; a brick base, cheeks, back and head around a
`soot` firebox; a stone mantel shelf at `MANTEL` 1.10 m. The chimney rises on the flue's footprint from the mantel to
`CHIMNEY_ABOVE` (1 m) over the roof over the flue's centre (its layer's own, else the highest drawn on any floor
above, through floors built in between; `170e1cb`): the highest underside at the flue's corners plus the
roof's thickness, plus the parapet on a flat roof. With no roof it ends 1 m over its wall. A 0.06 m stone cap tops it.

**Parrilla** (`4097821`, from the user's photos of Argentine gallery grills; `PARRILLA` heights in `solids.ts`): a
plinth, a firewood niche with a dark back up to 0.75 m, a 4 cm stone counter at 0.9 m overhanging 5 cm, a fire
opening to 1.7 m with a soot back and floor, a metal grill (two rails, bars every 7 cm front to back, ~1.13 m) and a
brasero box in a back corner, then a hood block to 2.3 m. Its chimney starts at the hood top (`base`). Since
`506fd9e` the niche holds firewood: 8-sided `bark` logs (r 0.055 m) running front to back, in offset rows up to
0.62 m. Its stone hearth stands at `FLOOR + 0.02`: at 0.03 m it was level with the area floors and flickered
([House solids](house-solids.md)).

**Finish**: `fireplaceSolids`' `put` sets `Solid.finish` only on `brick` parts, so the masonry and chimney take the
material while stone, soot and metal parts keep theirs. An id not in the catalogue is ignored.

## Limits (2026-11-05)

Two styles (masonry, parrilla). Always against a wall: no freestanding stoves, none on open edges. The chimney does
not avoid ridges or valleys. Nothing stops a parrilla being placed where furniture stands (the user's 3.5 m counter
stands in front of the one checked on their gallery wall).
