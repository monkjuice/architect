---
title: Fireplaces
type: component
summary: "A fireplace is a fourth opening kind (FireplaceSchema, style masonry, 1.20 m) hosted by a wall on its swing side that cuts no gap (cutsWall false); fireplaceShape/besideWall (box, firebox, hearth, flue) feed the plan symbol, the roof plan's chimney and the solids; wall-only targets; picked anywhere on its surround; brick and stone in 3-D with a chimney 1 m over the roof at its flue."
tags: [model, openings, fireplace, roof, 3d, ui]
sources: []
updated: 2026-11-04
---

# Fireplaces

Added on 2026-11-04, when the user asked for a "fireplace (needs chimney on the roof)". Why an opening kind:
[Colonnades are an open-edge setting; fireplaces are an opening kind](colonnade-setting-fireplace-opening.md). Shared
opening behaviour (placing, dragging, following walls) is in [Doors, windows and gates](doors-and-windows.md).

## Model

- `FireplaceSchema` in `src/model/plan.ts`: `kind: 'fireplace'`, `style` from `FIREPLACE_STYLES` (`masonry` only,
  the default) and the common opening fields. `swing` is the side of the wall it stands on; `hinge` is unused
  (`hasHinge` false, `hasSide` true, so the Selection panel offers only *Flip side*).
- `cutsWall(o)` (`src/model/openings.ts`) is false only for fireplaces: `openingSpans` skips them, so the wall stays
  whole in plan and in 3-D. `overlappingOpening` still checks them along the segment whatever the side, so a
  fireplace also blocks a door or window on the other face of that stretch of wall.
- Geometry: `FIREPLACE_DEPTH` 0.5 m out from the wall's face, `HEARTH` 0.4 m in front, `FLUE_WIDTH` 0.7 m (at most
  the width). `besideWall(placed, o, half)` makes rectangles on the opening's side measured from the face `half` off
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
  `src/ui/canvas/symbols.ts`). The library icon is drawn by hand: at icon scale the real depths vanish.
- Roof plan: `Roofs.tsx` draws each flue as a crossed `.roof-chimney` ([Roof tab](roof-tab.md)).

## In 3-D

Built after the roofs ([House solids](house-solids.md)): a stone hearth; a brick base, cheeks, back and head around a
`soot` firebox; a stone mantel shelf at `MANTEL` 1.10 m. The chimney rises on the flue's footprint from the mantel to
`CHIMNEY_ABOVE` (1 m) over the roof over the flue's centre: the highest underside at the flue's corners plus the
roof's thickness, plus the parapet on a flat roof. With no roof it ends 1 m over its wall. A 0.06 m stone cap tops it.

## Limits (2026-11-04)

One style (masonry). Always against a wall: no freestanding stoves, none on open edges. The chimney does not avoid
ridges or valleys.
