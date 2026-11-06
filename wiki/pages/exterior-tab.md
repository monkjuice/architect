---
title: Exterior tab (3-D view)
type: component
summary: "The Exterior tab: src/ui/exterior/ExteriorTab.tsx (camera presets, Roof toggle for the drawn roofs and parapets, sun season and time, Save image) over a three.js view in src/render/ (house.ts triangulates each solid face in its own plane and winds it to the face's explicit normal, plan y as three z; engine.ts, adapted from the Forge H1 planner, lights it with the plan's sun and real shadows, draws on demand and keeps the camera pose across tab switches; textures.ts paints brick, wood, lawn, dirt, standing seam, square tile, stacked stone and checker textures with normal maps, cached for the session; the ground is cut open over pools); three.js is a separate chunk loaded only when the tab opens."
tags: [ui, 3d, three, render, sun, exterior, roof, finishes, textures, pool]
sources: []
updated: 2026-11-05
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
  - Textures (`69111af`): `src/render/textures.ts` paints checker, brick, planks, lawn, (`20dcb35`) standing seam
    (`4097821`) square tile and stacked stone and (`506fd9e`) dirt finishes on real-size canvases, with normal maps for relief ([Materials and finishes](materials-and-finishes.md)); `textured(id, color)`
    sets colour white plus `map` and `normalMap`. `facesGeometry`/`addFace` emit a `uv` attribute in metres (each
    vertex's in-plane coordinates in the triangulation's u/v basis, so a floor's UVs follow the plan axes), and a
    texture's repeat is px per metre / canvas width. `finishTextures` caches per material id for the session and never
    disposes: the house's `dispose` frees materials but not their maps.
  - Face axes: `addFace` takes u = n × up unless |n.y| ≥ 0.999 (then the plan's X), so a sloped face is mapped
    along its eaves and up its slope at any pitch. The cut-off was 0.9 before `20dcb35`: faces under about 26° took
    the plan's X axis, and standing seams ran sideways on half the slopes. Level floors and walls are unaffected.
  - Pools (`506fd9e`): `buildHouse` returns `holes`, the `Solid.hole` rims of the pool basins
    ([House solids](house-solids.md)), and the engine cuts them out of the ground.
  - Gotcha: on walls v points world-down (u = n × up, v = n × u), so textures show upside down. This is harmless,
    and the relief stays right because three builds the tangent frame from the UVs. A normal map's green points up the
    texture (canvas y runs down; canvases are flipped on upload).
- `src/render/engine.ts`: `createExteriorEngine(host, pose)`, adapted from `../forge-h1/planner/src/render/engine.ts`
  ([Stack adapted from the Forge H1 planner](forge-h1-stack.md)): renderer with soft shadows, `RoomEnvironment`, a
  ground in its own clones of the lawn textures (disposed with the engine), `OrbitControls` with frames drawn on
  demand, `fitDistance`, `snapshot`. Since `506fd9e` the ground is rebuilt on every show as a `ShapeGeometry`: a
  square max(150 m, 5 × the house) wide around it, with the pool rims as holes, shaped in (x, −y) and turned by
  `rotateX(−π/2)` so plan y lands on three z, sitting at the origin; its UVs are metres, so the lawn repeat is
  px / width (no longer extent-scaled) and a lawned lot still runs on into it.

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
