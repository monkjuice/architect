---
title: "Colonnades are an open-edge setting; fireplaces are an opening kind"
type: decision
summary: "A colonnade is an optional attribute of an open-edge segment (colonnade: {style, spacing}) and a fireplace a fourth opening kind (after door, window and gate) that cuts no gap, so both reuse what segments and openings already do (splits, moves, following walls, selection, library); a new hosted collection with its own ids was rejected for each, because it would need the split/prune/follow/move upkeep openings have."
tags: [decision, model, colonnades, fireplace, openings, segments]
sources: []
updated: 2026-11-04
---

# Colonnades are an open-edge setting; fireplaces are an opening kind

## Context

On 2026-11-04 the user asked for "more objects: colonnade (roman, metal), fireplace (needs chimney on the roof)".
Both must follow the lines they belong to when those are split, moved or stretched. The agent chose in auto mode,
without asking.

## Decision

- **Colonnade = a setting on an open edge** ([Colonnades](colonnades.md)). An open edge already means "porch front,
  colonnade" ([Open edges and outlines are segment kinds](segment-kind-not-layer.md)). As a segment attribute it
  survives splits, moves to other layers and kind switches (kept but unused while the segment is not an open edge,
  like a wall's thickness) with no upkeep code.
- **Fireplace = an opening kind** ([Fireplaces](fireplaces.md)): hosted by a wall like a door (offset, width,
  `swing` = its side), but with `cutsWall` false. It reuses placement targets, dragging along walls, following moved
  and split walls, the Selection panel, per-style widths and the library group
  ([Doors and windows are hosted by a segment](openings-hosted-by-segment.md)).

## Alternative rejected

For both, a separate hosted collection with its own ids. It would duplicate the split, prune, follow and move upkeep
that openings already have in `src/model/edit.ts`.

## Consequences

- "Openings" now include something that is not an opening; `src/model/plan.ts`'s doc comment says so. Code that
  walks `layer.openings` must ask `cutsWall` or the kind (`openingSpans`, the solids' cuts, the roof plan's chimneys).
- Fireplaces go only on walls (`openingTarget`'s `kind`), and columns only along open edges (`applyColonnade`,
  `setColonnade`); there are no freestanding columns or stoves.
- Both changes are additive at `schemaVersion` 1 ([Plan model and file format](plan-model.md)).
