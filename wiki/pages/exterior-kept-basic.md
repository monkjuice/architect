---
title: "Exterior kept basic; roof and elevations first"
type: decision
summary: "At the user's direction the Exterior tab stays basic (fixed palette, a roof on/off toggle, no materials UI or materials fields in the plan); a drafted materials catalogue with a surfaces × indoor/outdoor compatibility table and exterior/facade/floor schema fields was removed; the Roof tab and Elevations came next and were built the same day, replacing the automatic flat roof with drawn roofs; superseded in part on 2026-11-04 by wall and floor finishes from a materials catalogue, the palette staying as the base."
tags: [decision, exterior, materials, roof, roadmap]
sources: []
updated: 2026-11-04
---

# Exterior kept basic; roof and elevations first

## Context

While the [Exterior tab](exterior-tab.md) was being built (eighth session, 2026-11-02), a materials catalogue had
been drafted: materials with a compatibility table (surfaces × indoor/outdoor, the fourth session's question of what
each material can go on) and new plan fields `exterior`, `facade` and `floor` to store the choices. The user then
said: "Exterior should allow me to toggle roof on/off. Leave exterior pretty basic for now. I'm realizing we should
first focus on roof design and elevations."

## Decision

- The Exterior uses a fixed basic palette (`PALETTE` in `src/render/house.ts`, keyed by `SolidMaterial`); nothing is
  picked per surface.
- No materials or finishes UI and no materials fields in the plan. The drafted catalogue and schema fields were
  deleted before the session ended ([Plan model and file format](plan-model.md)).
- A *Roof* toggle (`prefs.roofs`) to look inside. At first the roof was an automatic flat slab over rooms and
  galleries; that was superseded the same day by drawn roofs
  ([Roofs are drawn outlines](roofs-drawn-outlines.md)), and the toggle now hides those and their parapets.

## Alternative rejected

Shipping the drafted catalogue and schema fields now: set aside for the user's priorities, not for technical
reasons.

## Consequences

- The Roof tab ([Roof tab](roof-tab.md)) and Elevations ([Elevations tab](elevations.md)) were built next, in the
  same session ([Tabs over one plan](tabs-over-one-plan.md)).
- Materials stayed open until 2026-11-04, when wall and floor finishes came (below).

## Superseded in part (2026-11-04)

Commit `839dce5` added a materials catalogue with a surfaces × indoor/outdoor table and finishes saved in the plan
(`segment.finish`, `area.floor`), picked from the Floor tab's library and Selection panel, not a Materials tab
([Materials and finishes](materials-and-finishes.md)). The fixed palette remains the base material for every
unfinished surface. The Roof toggle is unchanged.
