---
title: Overview
type: overview
summary: "architect at a glance: a local browser app for sketching a house (walls at their thickness and height, open edges with optional Roman, metal or timber colonnades or glazed greenhouse sides, ground-level outlines, named areas (rooms, or lots of land with the share covered) with floor and covered totals, doors, windows, gates and fireplaces with chimneys, and furniture: counters, sinks, bathtubs, showers, toilets, bidets, beds, sofas, tables, chairs; wall-side and floor finishes from a materials catalogue) over a calibrated photo of a land survey, with the sun and wall shadows by season and time, in tabs over one plan (a Foundation plan worked out from the walls, the Floor plan, a Roof plan of drawn flat, shed, gable, hip, pergola and glass roofs, four auto-drawn Elevations, a basic 3-D Exterior and a Materials list of what it takes to build); architecture, stack, build/run/test, where to start and open items."
tags: [overview]
sources: []
updated: 2026-11-08
---

# Architect

## What it does

A local browser app with no backend. You load a photo or scan of a land survey (file picker, drop or Ctrl+V), level
it with two points, crop it, and calibrate it to meters with one or more known lengths. Then you draw connected lines
on layers over it, each a wall, an open edge (porch front, colonnade) or an outline at ground level (pool, paving,
deck), name the areas they enclose (rooms, the porch, the pool) and mark the lots of land, which stay outdoors and
total apart with the share the house covers ([Lots](pages/lots.md)), put doors and windows of several styles in the
walls, gates in the fences and fireplaces against walls (their chimneys go up through the roof,
[Fireplaces](pages/fireplaces.md)), stand Roman, metal or timber columns or a greenhouse's glazed sides along open edges
([Colonnades](pages/colonnades.md)), furnish the rooms (counters and kitchen islands with kitchen sinks, bathroom and outdoor sinks,
bathtubs (corner ones too) and showers with a movable shower head, toilets, bidets, beds, sofas, tables, chairs; [Furniture and fixtures](pages/furniture.md)),
finish each side of a wall and each named floor with a material that suits it indoors or outdoors
([Materials and finishes](pages/materials-and-finishes.md)), and measure lengths and areas. Walls are drawn at their thickness (automatic by
whether they face outside, or set by hand) and have heights; areas show floor area inside the walls, with a
covered total ([Walls](pages/walls.md)).
The sun can be shown over the plan for a season and time of day, with the walls' shadows
([Sun and shadows](pages/sun.md)). Layers can go on floors above the ground (upper storeys or a loft, on a slab,
with railings and stairs), the canvas showing one floor over the faded floor below ([Floors](pages/storeys.md)).
A plan is one JSON file with the photo embedded, and the latest state is
autosaved in IndexedDB. `README.md` lists the workflow, tools and keys.

The bar's top row holds tabs over the same plan ([Tabs over one plan](pages/tabs-over-one-plan.md)): Floor is the
drawing; Roof is a roof plan where roof outlines are drawn over the faded floor plan, each flat, shed, gable, hip,
pergola or glass (with optional grow lights) ([Roof tab](pages/roof-tab.md)); Elevations draws the four facades from the 3-D model, view only
([Elevations tab](pages/elevations.md)); Exterior shows the house in 3-D under the plan's sun
([Exterior tab](pages/exterior-tab.md)); Materials lists the quantities the house needs to be built, down to bricks,
concrete and cement bags, in English or Spanish, priced in ARS, with a CSV ([Materials list](pages/materials-list.md)); Foundation
shows the footings, piles or raft the ground floor stands on, worked out from its walls and columns, each wall's
footing settable by hand ([Foundation tab](pages/foundation-tab.md)). The other tabs (Interior, Plumbing,
Electricity, Gas) show but are not built; the services come next
([Services: decisions](pages/services-decisions.md)) and a Catalogue tab is planned.

The user owns two lots of the survey, 8a and 10a; the tests use lot 8a
([Development and testing](pages/development-and-testing.md)).

## Architecture

Dependencies point one way, `src/ui` → `src/state` → `src/model`, and `src/ui` → `src/render` → `src/model`:

- `src/model/`: pure TypeScript, no React or DOM. It holds the plan schema and file format
  ([Plan model and file format](pages/plan-model.md)), immutable edits and snapping
  ([Snapping and connections](pages/snapping-and-connections.md)), the regions lines enclose (`regions.ts`,
  [Regions](pages/regions.md)), wall thickness, joins and footprints (`walls.ts`, [Walls](pages/walls.md)), doors, windows, gates and fireplaces on their walls (`openings.ts`,
  [Doors, windows and gates](pages/doors-and-windows.md)), columns along open edges (`colonnades.ts`,
  [Colonnades](pages/colonnades.md)), furniture, its snapping and plan symbols (`furniture.ts`, with
  `furniture3d.ts` for 3-D, [Furniture and fixtures](pages/furniture.md)), the materials catalogue and wall/floor
  finishes (`materials.ts`, `finishes.ts`, [Materials and finishes](pages/materials-and-finishes.md)), hit tests and loop areas (`pick.ts`), the base image math
  ([Base image placement and calibration](pages/base-image-calibration.md)), the solar math (`sun.ts`, kept
  independent of the plan's geometry for reuse, [Sun and shadows](pages/sun.md)), roof geometry (`roofs.ts`,
  [Roofs: model and geometry](pages/roofs.md)), the house as 3-D solids made of faces with explicit normals
  (`solids.ts`, with the face builders in `faces.ts`, [House solids](pages/house-solids.md)), the elevations projected from them (`elevations.ts`,
  [Elevations tab](pages/elevations.md)), what each wall separates (`wallUse.ts`), the foundation plan
  (`foundations.ts`, [Foundation tab](pages/foundation-tab.md)) and the quantity takeoff measured from them and the plan (`takeoff.ts`, with its texts in `takeoffText.ts` and
  prices in `prices.ts`, [Materials list](pages/materials-list.md), [Local prices](pages/local-prices.md)).
- `src/state/`: the `EditorStore` with undo and gestures, user-level actions, derived data cached per object
  (`derived.ts`, [Areas](pages/areas.md)), files and the autosaved draft, and prefs
  ([Editor store and state](pages/editor-store.md)).
- `src/render/`: the three.js meshes and engine of the 3-D view; the only code that imports `three`
  ([Exterior tab](pages/exterior-tab.md)).
- `src/ui/`: the shell (`TopBar`, the tabs row; `NoticeBar`, `PromptDialog`, `fields.tsx`), `FloorTab.tsx` (the
  tools row, then in `panels/` the Library panel in the left column and the View, Base plan, Layers, Selection,
  Areas and Sun panels on the right, around the SVG canvas and its tool controllers,
  [Canvas and tools](pages/canvas-and-tools.md)), `RoofTab.tsx` (the same canvas in roof mode, roof tools and the
  Roofs panel), `FoundationTab.tsx` (the same canvas in foundation mode and the Foundation panel),
  `ElevationsTab.tsx`, `exterior/ExteriorTab.tsx` and `MaterialsTab.tsx`. Every panel section folds from its title
  and stays folded per browser ([Code conventions](pages/code-conventions.md)). The Library has three groups, in the user's order:
  Drawing (Wall, Outline, Open edge); Materials (Walls and Floors boxes, by family); Objects, with boxes for Doors
  (single, double, sliding), Windows (fixed, sliding, double hung, awning, casement), Gates (single, double, sliding)
  ([Door, window and gate styles](pages/opening-styles.md)), Fireplaces (masonry), Colonnades (Roman, metal, timber, glazed), then
  Counters (counter, kitchen island), Sinks, Bathtubs, Showers, Toilets (toilet, bidet), Beds, Sofas, Tables and
  Chairs. Click an item to arm its tool, or drag it onto a wall, fence or open edge (furniture: anywhere on the plan;
  a material: a wall's side or a named area).
- `src/main.tsx` restores the draft before the first render. `src/App.tsx` switches tabs (lazy-loading the
  Exterior, so three.js is its own chunk) and runs the autosave, the Ctrl shortcuts and image paste (Floor only).

The stack and much of the code were adapted from the Forge H1 planner
([Stack adapted from the Forge H1 planner](pages/forge-h1-stack.md)), and the repo follows its rules
([Code conventions](pages/code-conventions.md)). The canvas view is fitted once and then stored
([View fitted once and stored](pages/view-fitted-once.md)). Open edges and outlines are a segment attribute, not
a layer ([Open edges and outlines are segment kinds](pages/segment-kind-not-layer.md)), doors and windows are hosted by a segment
([Doors and windows are hosted by a segment](pages/openings-hosted-by-segment.md)), and a room is indoor unless the
outside reaches it across open edges or outlines ([Indoor means unreachable from outside](pages/indoor-reachability-rule.md)).
The Exterior was kept basic while roof design and elevations came first; wall and floor finishes later replaced
part of that decision ([Exterior kept basic; roof and elevations first](pages/exterior-kept-basic.md)). Roofs are drawn outlines
whose slopes are planes, not one roof per area
([Roofs are drawn outlines; slopes are planes](pages/roofs-drawn-outlines.md)). A colonnade is a setting on an
open edge and a fireplace an opening kind that cuts no gap, not new objects
([Colonnades are an open-edge setting; fireplaces are an opening kind](pages/colonnade-setting-fireplace-opening.md)).
Furniture stands free and snaps only when put down, while a kitchen sink is kept relative to its counter
([Furniture stands free; a kitchen sink is hosted by its counter](pages/furniture-free-standing.md)).

## Tech stack

React 19, TypeScript 6 (with `erasableSyntaxOnly`), Vite 8, zod 4 for the file schema, Vitest 4 (`node` environment)
and oxlint. It needs Node 20.19+ or 22.12+. The runtime dependencies are `react`, `react-dom`, `zod` and, since the
eighth session, `three` (^0.186.1, with `@types/three`, the Forge H1 planner's versions).

## Build, run and test

Run `npm install`, then `npm run dev` (http://localhost:5173). The checks are `npm test`, `npm run typecheck`,
`npm run lint` and `npm run build`. The code is on GitHub (`monkjuice/architect`, branch `main`, since
2026-11-02). Details, the sample lot used by the tests and the browser flow checks are in
[Development and testing](pages/development-and-testing.md). For pitfalls, see
[Playwright flow-check pitfalls](pages/playwright-flow-checks.md),
[Bash hook blocks `*.key` patterns and path colons](pages/bash-hook-key-paths.md),
[Notices float over the canvas](pages/notices-float-over-canvas.md) and
[Welcome card swallowed canvas clicks](pages/welcome-card-swallowed-clicks.md).

## Where to start reading

1. `README.md`, then `src/model/plan.ts` (the data).
2. `src/state/store.ts` (how edits and undo work).
3. `src/ui/canvas/Canvas.tsx` and `src/ui/canvas/tools/types.ts` (how tools plug in).
4. `src/model/baseImage.ts`, `src/model/snap.ts`, `src/model/regions.ts` and `src/model/openings.ts`.
5. For roofs and 3-D: `src/model/roofs.ts`, `src/model/solids.ts`, `src/model/elevations.ts`, then
   `src/render/engine.ts`.

## Open items (as of 2026-11-04, after lots)

Roofs and elevations ([Roof tab](pages/roof-tab.md), [Elevations tab](pages/elevations.md)):

- Roofs do not follow walls that move; *Roof the house* ignores unnamed rooms, drops courtyards and offsets by the
  automatic 0.30 m exterior wall, not a set thickness.
- Hip roofs are exact only on convex outlines (a straight skeleton was deferred,
  [Roofs are drawn outlines](pages/roofs-drawn-outlines.md)).
- Elevations are view only: no heights edited there, no dimensions besides levels and the overall width. Heights are
  not marked in plan, and sections do not exist.

Other candidates:

- Perspective (4-point) correction of photos shot at an angle. Until then, skew shows only as a spread in the
  calibration errors.
- Scaling drawings with the image on recalibration (today lines stay in meters and the photo moves under them).
- A semi-covered total (galleries, porches). The covered total exists ([Areas](pages/areas.md)); area kinds
  (covered, semi-covered, pool) were not added
  ([Open edges and outlines are segment kinds](pages/segment-kind-not-layer.md)).
- Materials: walls and floors take finishes since 2026-11-04 (the catalogue has a compatibility table and shows in
  groups); ceilings, roofs, doors and frames are in the table but not finishable yet, patterns show only in library
  swatches (the checkered tile excepted, drawn as squares in plan and 3-D)
  ([Materials and finishes](pages/materials-and-finishes.md)). The Materials tab (2026-11-08) is a takeoff whose
  dosages are constants and whose wall build-ups follow only a wall's kind and thickness; its prices (gathered
  2026-11-08, 31 of 156 estimated, some sources inconsistent) go stale with inflation and need refreshing
  ([Local prices](pages/local-prices.md)); a Catalogue tab is still to come
  ([Materials list](pages/materials-list.md)).
- Foundation (2026-11-08): usual sizes, not a structural design; no footings in the 3-D Exterior
  ([Foundation tab](pages/foundation-tab.md)).
- Next: the Electricity, Plumbing and Gas tabs, whose machine room, supply, heating comparison and suggested points
  the user has decided, and whose 46 prices are already in `PRICES`
  ([Services: decisions](pages/services-decisions.md)). Interior exists only as a disabled button.
- Plan shadows: each wall casts by its own height, but from its centreline, with no roofs and door gaps ignored
  ([Sun and shadows](pages/sun.md)); the Exterior's 3-D shadows include roofs and openings.

Colonnades and fireplaces (2026-11-04): one fireplace style (masonry); fireplaces only against walls and columns only
along open edges (nothing freestanding); the chimney does not avoid ridges.

Furniture (2026-11-04): pieces do not follow walls that move, cannot be moved to another layer, and come only from
the catalogue (straight counters, no other pieces) ([Furniture and fixtures](pages/furniture.md)).

Also open: re-anchoring areas when walls move past their point ([Areas](pages/areas.md)), other objects and
complex shapes, plan exports (SVG, DXF, PNG; only the Exterior saves a PNG of its view and the Elevations an SVG
per facade) and grid snapping.
