---
title: View fitted once and stored
type: decision
summary: "The canvas fits the plan once and stores that view, instead of following planBounds on every render, which made cropping run away and shifted the view while drawing."
tags: [decision, canvas, view, bug]
sources: []
updated: 2026-11-02
---

# View fitted once and stored

## Context

The canvas view (`Viewport`: `x0`, `y0` and `zoom` in px/m) lives in the store
([Editor store and state](editor-store.md)). At first, while no view was stored, the canvas framed `planBounds(plan)`
on every render. `planBounds` covers the visible part of the cropped image and every visible vertex.

## The bug

While cropping, the bounds shrank with the crop. The view re-zoomed in the middle of the drag, the handle under the
cursor moved away, and the crop ran away. Drawing outside the bounds also shifted the view.

## Decision

`src/ui/canvas/Canvas.tsx` computes `view = storedView ?? frame(planBounds(plan), w, h)`, and a layout effect stores
that fit as soon as one exists (`frame` returns null until the canvas has a size). The plan is therefore fitted once,
then left alone until the user zooms or pans. A fit happens:

- on start, unless the draft has a view;
- on Fit (`F`), because `fitView` clears `view`;
- when a plan is created or opened (`store.load`);
- when a base image is loaded (`loadBaseImage`).

## Consequences

- The view no longer follows window resizes; Fit re-frames it (as the comment on `EditorState.view` in
  `src/state/store.ts` now says).
- A failing measure step in the browser flow check was first put down to this refit. Its real cause was the notice
  bar shifting the canvas ([Notices float over the canvas](notices-float-over-canvas.md)).
- The stored view goes into the IndexedDB draft, so a reload restores the zoom and pan.
- Edits that change the image's world size must adjust the view themselves: `editImageInPlace` does this for
  calibration ([Base image placement and calibration](base-image-calibration.md)).

Related: [Canvas and tools](canvas-and-tools.md).
