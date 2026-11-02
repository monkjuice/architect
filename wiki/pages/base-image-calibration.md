---
title: Base image placement and calibration
type: concept
summary: "How the survey photo sits in the world (centre + R·scale·(uv − size/2)), leveling by two points, the least-squares scale fit over all known lengths with a per-length error %, crop, and editImageInPlace keeping the image still on screen."
tags: [model, base-image, calibration]
sources: []
updated: 2026-11-02
---

# Base image placement and calibration

All in `src/model/baseImage.ts` unless noted. Edits return new image objects.

## Transform

An image pixel (u, v) maps to the world as `(cx, cy) + R(rotation) · scale · ((u, v) − (width, height) / 2)`. Here
`scale` is in meters per pixel and `rotation` is in radians, clockwise on screen. `imageToWorld` and `worldToImage`
convert points, and `imageTransform` gives the same mapping as an SVG transform. A newly loaded image is about 30 m
across, with its top-left corner at the origin and opacity 0.8. `withScale` and `withRotation` keep one pixel fixed,
by default the crop centre.

## Leveling and crop

- `levelImage(img, a, b)` rotates the image so that the world line a→b becomes horizontal or vertical, whichever is
  nearer, about the line's midpoint. The Level tool calls it after two clicks. The Base plan panel also has a rotation
  slider and field and 90° turns.
- `crop` is in image pixels. `resizeCrop` keeps the edges inside the image and the rectangle at least 8 px.

## Calibration

- Known lengths are stored in `image.calibration` with their ends in image pixels, so they stay valid after later
  moves, rotations and rescales.
- `fitScale` is a least-squares fit over all known lengths. It minimizes Σ(s·Lᵢ − dᵢ)², which gives
  `s = Σ dᵢLᵢ / Σ Lᵢ²` (Lᵢ in pixels, dᵢ in meters). Longer lengths weigh more.
- `calibrationError` is each length's relative error at the current scale. The canvas and the panel show it as a
  percentage once there are two or more lengths.
  - A spread of more than a few tenths of a percent means a skewed photo or a misclick (README). Perspective
    correction is an open item ([Overview](../overview.md)).
  - In the 2026-11-02 browser check, 28,00 and 30.71 on the sample survey read +0.28% and −0.23%.
- `addCalibration` refits the scale and pivots on the new length's first point. `removeCalibration` refits on the
  remaining lengths, or keeps the scale when none are left.
- The Calibrate tool (`src/ui/canvas/tools/image.ts`) takes two clicks (Shift gives 45°), then `store.askLength`,
  then `editImageInPlace(… addCalibration …)`.
- Calibration changes only the image. Drawn lines are in meters and are not rescaled, so recalibrating after
  drawing moves the photo under the lines: calibrate before drawing. Scaling drawings with the image on
  recalibration is an open item ([Overview](../overview.md)).
- On the user's real draft (2026-11-02), one of six known lengths (22.80, the side of lot 10a) read −14% and pulled
  the fitted scale by about 1.9%. Because the fit is least squares, a single misread or misclicked length can
  shift the scale noticeably; check the per-length errors.

## Keeping the image still on screen

Calibrating changes the image's size in the world, not what the user is looking at. `editImageInPlace` in
`src/state/actions.ts` applies the edit, then multiplies the stored view's zoom by `before.scale / after.scale` and
shifts the view so the image centre stays at the same screen position. Without this, the photo would jump in size
after each calibration, because the view no longer refits by itself
([View fitted once and stored](view-fitted-once.md)).

Related: [Plan model and file format](plan-model.md), [Canvas and tools](canvas-and-tools.md).
