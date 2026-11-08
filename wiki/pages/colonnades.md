---
title: Colonnades
type: component
summary: "Columns along an open edge (SegmentSchema.colonnade: roman, metal, timber or glazed, a maximum spacing): src/model/colonnades.ts (COLUMNS sizes, columnSpots shared out evenly, layerColonnades leaving out ends a wall holds, heldByWall), setColonnade, the Colonnade tool and the library's Colonnades box, ColonnadeLayer on the plan, ColonnadeFields in the Selection panel, and stone, steel or teak beams and columns in 3-D; glazed edges are a greenhouse's glass sides."
tags: [model, colonnades, segments, 3d, ui, carport, greenhouse]
sources: []
updated: 2026-11-08
---

# Colonnades

Added on 2026-11-04, when the user asked for "colonnade (roman, metal)". Why it is a setting on an open edge and not
an object: [Colonnades are an open-edge setting; fireplaces are an opening kind](colonnade-setting-fireplace-opening.md).

## Model

- `SegmentSchema.colonnade?: {style, spacing}` in `src/model/plan.ts` (`COLUMN_STYLES = ['roman', 'metal', 'timber', 'glazed']`, types
  `ColumnStyle`, `Colonnade`). It counts only while the segment is an open edge; under another kind it is kept but
  unused, like a wall's thickness ([Open edges and outlines are segment kinds](segment-kind-not-layer.md)). Splits,
  moves to other layers and kind switches carry it with the segment, with no upkeep code.
- `src/model/colonnades.ts`:
  - `COLUMNS`: Roman 0.32 m shaft, 2.40 m spacing, 0.35 m beam; metal 0.10 m, 3.00 m, 0.20 m; timber (`acdb212`,
    from the user's photo of a timber carport) a 0.14 m square post, 3.00 m, 0.22 m.
    `newColonnade(style)` takes the style's spacing. Glazed (`8b511e3`, a greenhouse's sides): 0.05 m square posts,
    1.00 m, a 0.08 m rail; `GLAZED_BASE` {height 0.4, width 0.15} is its concrete base. In 3-D (`solids.ts`) posts,
    rail and base are galvanized steel and concrete (`slab`, kind `sill` so no level mark or roof trim applies), with
    glass (`GLASS`) from the base up to the rail; `glazedCuts` leaves out posts, base and glass across its doors, gates
    and windows (glass goes on over them from their heads; under a window, base and glass up to its sill). Doors
    already go on open edges, so a sliding door there is the greenhouse's glass door. In plan: a `.column-glass` line broken at
    `openingSpans`, posts as filled squares. Why a colonnade style and not a new wall kind: the same reasons as the colonnade itself (splits,
    kind switches, tool, library, Selection panel for free), and an open edge's beam already follows the roof, which a
    greenhouse's sloping side needs; plan shadows (walls only) correctly skip glass.
  - `columnSpots(length, spacing)`: `ceil(length / spacing)` equal bays, so columns stand evenly, at most `spacing`
    apart, one at each end (the 17.35 m Galeria front at 2.40 m gets 9).
  - `layerColonnades(layer, thickness)`: each colonnade's columns, leaving out an end that `heldByWall` (within a
    wall's half thickness of its centreline, judged by position, not by a shared vertex). `heldByWall` moved here from
    `solids.ts` so the plan drawing and the 3-D share it.
- `setColonnade(plan, refs, colonnade | null)` in `src/model/edit.ts`: open edges only; the same plan when nothing
  changes.

## Editor

- **Colonnade tool** (`src/ui/canvas/tools/colonnade.ts`, no key): hover an open edge and click to give it
  `EditorState.columnStyle` (default roman); over a wall or outline its tag warns.
- **Library**: a *Colonnades* box (Box id `library-colonnade`) with one item per `COLUMN_STYLES` (`ColumnIcon`). A click arms the
  tool; a drag carries the style under `COLONNADE_DRAG_TYPE` to `dropColonnade`.
- `applyColonnade` (`src/state/actions.ts`), shared by the tool and the drop: refuses a line that is not an open edge
  with a notice, keeps the spacing when the same style is applied again, selects the edge and activates its layer.
- **Selection panel** (`ColonnadeFields`, open edges only): Columns None or one of `COLUMN_STYLES` (a new style resets the
  spacing to its default), *Spacing, at most* (min 0.5 m) and, for one edge, the column count.
- **Plan**: `ColonnadeLayer` (`src/ui/canvas/Columns.tsx`) draws the columns at real size, Roman ones on a square
  plinth, timber ones as squares ([Canvas and tools](canvas-and-tools.md)); the library's `ColumnIcon` likewise.

## In 3-D

See [House solids](house-solids.md). A colonnade always gets a beam (`COLUMNS[style].beam` deep; Roman stone, metal
steel, timber teak) following the underside of the roof over the edge's midpoint, or level at the layer's tallest wall when there
is no roof; plain open edges get a beam only under a roof. Columns rise to the beam's bottom (none under 0.6 m).

## Limits (2026-11-04)

Columns exist only along open edges: no freestanding columns. One style and spacing per edge.
