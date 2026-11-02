---
title: Exterior tab (3-D view)
type: component
summary: "The Exterior tab: src/ui/exterior/ExteriorTab.tsx (camera presets, Roof toggle, sun season and time, Save image) over a three.js view in src/render/ (house.ts extrudes the solids with plan y as three z; engine.ts, adapted from the Forge H1 planner, lights it with the plan's sun and real shadows, draws on demand and keeps the camera pose across tab switches); three.js is a separate chunk loaded only when the tab opens."
tags: [ui, 3d, three, render, sun, exterior]
sources: []
updated: 2026-11-02
---

# Exterior tab (3-D view)

Added in the eighth session (2026-11-02). It shows the [House solids](house-solids.md), rebuilt on every plan
change, and edits nothing ([Tabs over one plan](tabs-over-one-plan.md)). It is kept basic on purpose
([Exterior kept basic](exterior-kept-basic.md)).

## Files

- `src/ui/exterior/ExteriorTab.tsx`: row 2 of the bar (camera presets; *Roof* = `prefs.roofs`, off filters the roof
  solids out so you look into the rooms; Sun season and time, the same `prefs.sun` as the Floor tab's Sun section;
  *Save image* → `<file>-exterior.png` at 2× through `snapshot`), the full-width 3-D host, messages for an empty
  plan and for no WebGL, and its own `NoticeBar`.
- `src/render/house.ts`: `buildHouse` makes an `ExtrudeGeometry` per solid, then `rotateX(π/2)` and
  `translate(top)`: plan x → three x, plan y → three z, heights → y, so the Top view matches the plan. A fixed
  `PALETTE` per `SolidMaterial`. Glass casts no shadow. Roofs receive none: they drew dark seams where neighbouring
  rooms' slabs meet.
- `src/render/engine.ts`: `createExteriorEngine(host, pose)`, adapted from `../forge-h1/planner/src/render/engine.ts`
  ([Stack adapted from the Forge H1 planner](forge-h1-stack.md)): renderer with soft shadows, `RoomEnvironment`, a
  lawn, `OrbitControls` with frames drawn on demand, `fitDistance`, `snapshot`.

## Sun

A `DirectionalLight` placed from `sunPosition` and `planAngle` (the plan's site) and `prefs.sun` (season, time,
cloudiness), so it agrees with the plan's sun dial ([Sun and shadows](sun.md)). Intensity fades in over the first
10° of altitude and with clouds, which also lower `shadow.intensity`; the sky goes night → dusk → day with altitude.
The shadow camera spans ±(half the model's diagonal + 2 m) and its far plane adds 120 m, so long low-sun shadows are
not cut off.

## Camera

Presets: `aerial` (from the plan's lower left), `top` (plan orientation), and `north`/`east`/`south`/`west`, which
face that side of the house through `site.north`. Framing waits (`pending`) for both the model and a laid-out host,
since fitting needs the real aspect ratio. The pose is kept in a module variable (`lastPose`) when the tab unmounts.
`pose()` is undefined until a first view is framed: React StrictMode mounts the tab twice, and the first, unframed
engine must not overwrite the saved pose.

## Loading

`src/App.tsx` loads the tab with `React.lazy`, so three.js (~593 KB) is a separate chunk fetched only when the tab
opens. Only `src/render/` imports `three` ([Code conventions](code-conventions.md)).

Testing: the exterior flow in [Development and testing](development-and-testing.md); WebGL pitfalls in
[Playwright flow-check pitfalls](playwright-flow-checks.md).
