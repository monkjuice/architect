---
title: "Roofs are drawn outlines; slopes are planes"
type: decision
summary: "Roofs are outlines drawn on a roof plan (flat, shed, gable, hip), not one roof per area, so a roof can span rooms and overhang walls; each slope is a plane given as the distance in from an eaves line and the underside is the lowest of them; the automatic flat roof was removed; a straight skeleton for hips on any outline was rejected for now."
tags: [decision, roof, model, geometry]
sources: []
updated: 2026-11-02
---

# Roofs are drawn outlines; slopes are planes

## Context

Eighth session (2026-11-02). The Exterior had an automatic flat slab over every roofed region, as high as its
tallest wall ([Exterior kept basic](exterior-kept-basic.md)), and the user wanted roof design next. Asked with a
multiple-choice question, the user chose drawn roof outlines, all four types, and view-only elevations
([Elevations tab](elevations.md)).

## Decision

- A roof is an outline drawn over a layer's plan (`layer.roofs`), independent of areas: it can span rooms and
  overhang walls ([Roofs: model and geometry](roofs.md), [Roof tab](roof-tab.md)).
- Types: flat, shed, gable, hip.
- Each slope is a plane f(p), the distance into the roof from its eaves line; the underside is
  height + tan(pitch) · min f. Ridges and hips fall out where planes cross, and the overhang continues each slope.
- The automatic flat roof is gone: roofs come only from `layer.roofs`, and walls stop at their own height
  ([House solids](house-solids.md)).

## Alternatives rejected

- **One roof per area**: the user's choice; it cannot span rooms or follow a roof shape of its own.
- **A straight skeleton for hips on any outline**: too much work for now. The min-of-planes hip is exact only on
  convex outlines; `roofProblem` warns, and an L-shaped house takes two overlapping roofs.

## Consequences

- Roofs do not follow walls when they move; *Roof the house* gives a starting outline from the covered areas.
- Plans from before roofs open unroofed in 3-D until roofs are drawn.
- Shed and gable work on any outline, from its extremes across the reference edge.
- Exterior walls under a pitched roof are filled up to its underside (gable ends), and beams follow the underside.
