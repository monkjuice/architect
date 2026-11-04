---
title: "Furniture stands free; a kitchen sink is hosted by its counter"
type: decision
summary: "Furniture is a per-layer collection of free-standing pieces (at, angle, width, depth) that snap to a wall face, a counter or a table only when put down or dragged, not records hosted by a wall segment like openings (right for doors, wrong for beds and tables that stand anywhere); only the kitchen sink is hosted, by its counter (counter id + offset, no position of its own), rather than an absolute position plus a counter id, which would be two sources of truth; a kitchen island is a counter style, not a new kind, so sinks go in it unchanged."
tags: [decision, model, furniture]
sources: []
updated: 2026-11-04
---

# Furniture stands free; a kitchen sink is hosted by its counter

## Context

On 2026-11-04 the user asked for counters, sinks, bathtubs, beds, tables and chairs, with a kitchen sink that "can
only be placed over a counter". The agent chose in auto mode, without asking ([Furniture and fixtures](furniture.md)).

## Decision

- **Pieces stand free** in `layer.furniture` (ids `f<n>`, `Ref` kind `'furniture'`), each with `at`, `angle`, `width`
  and `depth`. Pieces that belong against a wall snap with their back to the nearest wall face when put down or
  dragged, and chairs to a table; nothing is attached afterwards.
- **The kitchen sink is hosted by a counter**: `KitchenSinkSchema` stores `counter` and `offset` and no `at`/`angle`;
  `placeFurniture` derives where it stands. So it moves and turns with its counter, is refused without one, slides
  along it when dragged and is pruned with it.
- **A kitchen island is a counter style** (`style: 'island'`, added in `0acdce9`), so kitchen sinks go in islands
  with no new hosting code.

## Alternatives rejected

- Hosting furniture by a wall segment, with the opening machinery
  ([Doors and windows are hosted by a segment](openings-hosted-by-segment.md)): it suits doors, not beds and tables
  that can stand anywhere.
- A kitchen sink with an absolute `at`/`angle` plus a counter id: two sources of truth to keep in sync on every
  counter move, turn and resize.
- A new `island` kind: every `kind === 'counter'` check (hosting, pruning, integrity, targets) would have had to
  widen.

## Consequences

- Furniture does not follow a moved wall, unlike openings and fireplaces
  ([Colonnades are an open-edge setting; fireplaces are an opening kind](colonnade-setting-fireplace-opening.md)).
- Code that needs a piece's position must call `placeFurniture`; moves and turns skip kitchen sinks, `deleteItems`
  prunes orphans (`pruneFurniture`) and `checkIntegrity` rejects a file whose kitchen sink names a missing counter.
- Zod 4 accepts the sink union (by `style`) nested inside the furniture union (by `kind`); this was checked with a
  script before relying on it.
- Additive at `schemaVersion` 1: `LayerSchema.furniture` defaults to `{}` ([Plan model and file format](plan-model.md)).
