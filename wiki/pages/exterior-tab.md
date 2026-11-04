---
title: Exterior tab (3-D view)
type: component
summary: "The Exterior tab: src/ui/exterior/ExteriorTab.tsx (camera presets, Roof toggle for the drawn roofs and parapets, sun season and time, Save image) over a three.js view in src/render/ (house.ts triangulates each solid face in its own plane and winds it to the face's explicit normal, plan y as three z; engine.ts, adapted from the Forge H1 planner, lights it with the plan's sun and real shadows, draws on demand and keeps the camera pose across tab switches); three.js is a separate chunk loaded only when the tab opens."
tags: [ui, 3d, three, render, sun, exterior, roof, finishes]
sources: []
updated: 2026-11-04
---

# Exterior tab (3-D view)

Added in the eighth session (2026-11-02). It shows the [House solids](house-solids.md), rebuilt on every plan
change, and edits nothing ([Tabs over one plan](tabs-over-one-plan.md)); the [Elevations tab](elevations.md) draws
the same solids in 2-D. It is kept basic on purpose ([Exterior kept basic](exterior-kept-basic.md)), apart from
the wall and floor finishes it draws.

## Files

- `src/ui/exterior/ExteriorTab.tsx`: row 2 of the bar (camera presets; *Roof* = `prefs.roofs`, off filters the
  `roof` and `parapet` solids out so you look into the rooms; roofs exist only once drawn on the
  [Roof tab](roof-tab.md), as the hint says; Sun season and time, the same `prefs.sun` as the Floor tab's Sun
  section; *Save image* → `<file>-exterior.png` at 2× through `snapshot`), the full-width 3-D host, messages for an
  empty plan and for no WebGL, and its own `NoticeBar`.
- `src/render/house.ts`: `buildHouse` makes one `BufferGeometry` per solid from its faces: each face is
  triangulated in its own plane (`ShapeUtils.triangulateShape` on two in-plane axes) and each triangle wound to
  agree with the face's explicit normal, flat-shaded. Plan x → three x, plan y → three z, heights → y, so the Top
  view matches the plan. Since plan (x, y down) with z up is left-handed and three's (x, height, plan y) is not,
  nothing may depend on winding; `ExtrudeGeometry` was dropped with the switch to faces. A fixed `PALETTE` per
  `SolidMaterial` (`roof` terracotta, `slab` grey). Since 2026-11-04 a solid's faces are grouped by material key, one
  mesh each: the palette name, or `"finish:<id>"` for a finished face or floor, built by `finishMaterial` from the
  catalogue's colour, roughness, metalness and `clear` (transparency) ([Materials and finishes](materials-and-finishes.md)). Glass casts no shadow. Roofs receive none: the old per-room slabs
  drew dark seams where they met.
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
