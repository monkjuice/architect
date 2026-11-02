---
title: "Exterior kept basic; roof and elevations first"
type: decision
summary: "At the user's direction the Exterior tab stays basic (fixed palette, automatic flat roof with an on/off toggle, no materials UI, plan format unchanged); a drafted materials catalogue with a surfaces × indoor/outdoor compatibility table and exterior/facade/floor schema fields was removed; the Roof tab and Elevations come next."
tags: [decision, exterior, materials, roof, roadmap]
sources: []
updated: 2026-11-02
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
- No materials or finishes UI and no schema change. The drafted catalogue and schema fields were deleted before the
  session ended, so the plan format is unchanged ([Plan model and file format](plan-model.md)).
- The roof is an automatic flat slab over rooms and galleries ([House solids](house-solids.md)), with a *Roof*
  toggle (`prefs.roofs`) to look inside.

## Alternative rejected

Shipping the drafted catalogue and schema fields now: set aside for the user's priorities, not for technical
reasons.

## Consequences

- Next, per the user: the Roof tab (roof design, which should replace the automatic flat roof) and Elevations
  ([Tabs over one plan](tabs-over-one-plan.md)).
- Materials stay open and belong to the Materials tab; the open points are in the [Overview](../overview.md).
