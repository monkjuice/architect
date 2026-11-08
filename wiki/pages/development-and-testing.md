---
title: Development and testing
type: guide
summary: "npm scripts, the GitHub repository, the 194 Vitest tests (model files plus src/state/derived.test.ts and src/render/textures.test.ts; and their spurious \"no tests\" run beside the dev server), iteration mode (no new tests until the user asks, cheap visual checks), agent edits to the user's plan file lost unless they reopen it before saving, and the sample lot 8a in testPlan.ts, and the browser flow checks (Python Playwright scripts kept outside the repo: a 20-check base flow, a 23-check areas flow, a 23-check doors/windows flow, a 15-check door/window styles flow, a 12-check gates flow, and a 17-check sun flow, a 7-check outline flow, a 21-check walls flow, a 28-check exterior (tabs) flow, a 26-check roof and elevations flow, a 19-check colonnade and fireplace flow and a 29-check furniture flow, the exterior, roof and colonnade ones with software WebGL; flows on the user's plan now need a pinned copy of it with the photo hidden and the lots marked, the furniture flow included), plus reading live derived values from the dev server and running model code on a plan file through a rolldown-bundled node probe."
tags: [guide, testing, vitest, playwright, webgl, git, user-plan, probe]
sources: []
updated: 2026-11-07
---

# Development and testing

## Setup and scripts

You need Node 20.19+ or 22.12+. Run `npm install` first.

| Script | Does |
|---|---|
| `npm run dev` | Vite dev server, http://localhost:5173 |
| `npm test` / `npm run test:watch` | `vitest run` / `vitest` |
| `npm run typecheck` | `tsc -b` |
| `npm run lint` | oxlint (prints nothing when clean) |
| `npm run build` | `tsc -b && vite build` into `dist/` |
| `npm run preview` | Serves the build |

The code is in git, pushed to https://github.com/monkjuice/architect (branch `main`) on 2026-11-02 with one initial
commit. The roof plan and elevations work was committed as `5e2f614`, and the colonnades, fireplaces and furniture
together as `8b0cc2d` (2026-11-04), the toilet, bidet, shower and corner tub as `3014137`, the kitchen island as `0acdce9`, sofas as `3657510`, the coffee table as `4cf872f`, wall and floor materials as `839dce5`, the checkered tile, lots and the Materials view toggle as `64f59b7`, brick, wood and lawn textures as `69111af`, all on `main`; the user wants each finished batch committed there, and pushes
only on request.

## Model tests

**Iteration mode (since 2026-11-05):** the user asked for no new tests until they ask for them, and to keep visual
checks cheap. Still run the existing suite, typecheck, lint and build.

**Edits to the user's plan file do not stick by themselves.** The app saves its open plan (or draft) over the file,
so an agent's edit to the file lasts only if the user reopens the file before saving again. On 2026-11-06 a save
from a draft that never had the garden overwrote the agent's *Jardín* layer (80 plants; [Furniture](furniture.md)).
Tell the user to reopen the file after such an edit; do visual checks on a copy. To put such an edit back, rebuild it
on the user's latest file rather than copying the old layer in: layer ids may have been taken meanwhile.

After `69111af` there are 194: the 190 below plus `src/render/textures.test.ts` (4: recipes and real sizes, seeded
determinism, running bond, board rows filling the repeat), which tests only the pure helpers (`textureRecipe`,
`seeded`, `brickLayout`, `plankLayout`); the canvas painting is not unit-tested.

On 2026-11-04, after `64f59b7`, there were 190 Vitest tests: in `src/model/*.test.ts`, `openings` 30,
`edit` 27, `finishes` 16, `solids` 15, `regions` 13, `walls` 13, `furniture` 13, `roofs` 10, `baseImage` 9, `sun` 9, `geometry` 8,
`pick` 6, `planFile` 6, `snap` 5, `colonnades` 4 and `elevations` 4; and `src/state/derived.test.ts` 2, the first
test outside the model (a lot's label kept off the room's box, `areaSize`, `coveredArea` without lots;
[Lots](lots.md)) (counted from the `it(` calls). `furniture.test.ts`
covers placement and angle, backing up to a wall face, the kitchen sink only in a counter (and kept there as the
counter moves or goes), a chair facing a table, the shower head round the rim, picking the smaller piece first,
3-D parts plus the file round trip, toilet and bidet snap and heights, a shower's tray, screen and head (rim round
trip), a corner tub's head on its arc and quarter-disc outline, and a kitchen island (free by a wall, a sink centred
over its cabinets, cabinets 0.25 m short of the front, a style-less counter loading as a wall counter), and sofas (a
three-seater backed to a wall with five open symbol lines and a 0.85 m fabric top, a sectional's return at the right
end and at the left when mirrored, `mirror` kept in the file), and a coffee table (centred and squared in front of a
three-seater and of a sectional's main seat, free away from sofas, no chair snapping to it, a 0.42 m top)
([Furniture and fixtures](furniture.md)). `finishes.test.ts` covers the catalogue (unique ids, groups, refusal
texts), side naming and what each side faces, the edits (walls only; kept through a split and a wall → open edge →
wall switch; the file round trip) and finished faces in 3-D and the elevations, unknown ids ignored, plus the
checkered tile, lots counting as outdoor and lot solids ([Materials and finishes](materials-and-finishes.md)). The colonnade and fireplace tests cover
column spots, ends a wall holds and a colonnade surviving a split, a kind switch and the file
([Colonnades](colonnades.md)); fireplaces (no wall gap, a side but no hinge, walls only, picked on the surround,
the file; [Fireplaces](fireplaces.md)); colonnade beams with and without a roof and a fireplace's chimney; and
smooth, shaded column facets in the elevations. `solids.test.ts` covers the rules in
[House solids](house-solids.md): no roof until one is drawn, closed faces facing out, a flat roof's parapet, gable
infills, door and window cuts, gates, a gallery's beam and columns, a beam sloping under a shed, an open pool,
facade vs interior walls and hidden layers. `roofs.test.ts` covers `normalized`, offsets, the union of rooms, each
roof type, the overhang, `undersideAlong`, `nextEdge` and `newRoof` ([Roofs](roofs.md)); `elevations.test.ts` the
views' directions and names, face order and an empty plan ([Elevations tab](elevations.md)). Before finishing a
change, run `npm test`, `npm run typecheck`, `npm run lint` and `npm run build`. `walls.test.ts` covers automatic
thickness (gallery, open-plan kitchen, own thickness), floor areas (own thicknesses, stubs, open edges, islands) and
`layerWalls` joins (mitre, T, step, bevel, cut by openings) ([Walls](walls.md)). `sun.test.ts` is described in
[Sun and shadows](sun.md). They run in the `node` environment (`vite.config.ts`). Only the model,
`src/state/derived.ts` and the pure helpers of `src/render/textures.ts` are unit-tested; the repo has no UI or browser tests ([Code conventions](code-conventions.md)).

**Spurious "no tests" (recurring):** the first `npm test` after edits, while the Vite dev server is running, sometimes
reports "no tests" for every file; a rerun passes. It looks like vitest and the dev server clashing over Vite's
cache (not confirmed); it has never happened with the dev server stopped. Rerun before looking for a real cause.

`regions.test.ts` covers the lot's area, shared walls, crossings without vertices, overlaps, stubs, holes, open
edges, outlines (a pool region whose walls/open/outline lengths are 0/0/35) and label points, including a skewed
long room ([Regions](regions.md)). The `edit` and `planFile` tests cover segment kinds, areas and loading files from
before them; `edit` checks that an outline survives a split and a kind switch, and that a wall wins a merge with an
outline. `openings.test.ts` uses a 10 × 4 room. It covers layout,
the door leaf, targets and snapping, following stretched, split, deleted and moved walls (including the mirrored
move), edits, hits and the file round trip ([Doors and windows](doors-and-windows.md)). It also covers every style's
symbol parts, the flips each style offers, the side awnings and casements open to, refusing a style of the other
kind, and reading pre-style files as single doors and fixed windows ([Door, window and gate styles](opening-styles.md)).
For gates: the parts of each style, the sliding direction and its swap, the flips, the file default (single), and
`parkingRoom` including a door blocking the parking stretch. The usual-width bound allows gates up to 5 m (other
styles stay under 2 m).

`src/model/testPlan.ts` holds the fixtures:

- `LOT` is lot 8a of the sample survey, in meters with y down: 28.00 at the back, 30.71 on the right, 25.00 along the
  street, a 3 × 3 m chamfer (4.24) and 27.71 on the left. Its area is 28 × 30.71 − 4.5 = 855.38 m². The survey states
  855.24 m², from its measured angles.
- `makePlan(chains, extraLayers)` builds a plan from polylines.

## Browser flow checks

These are not in the repo. Python Playwright scripts were kept in the agent's session scratchpad, so expect to write
them again. They ran against `npx vite --port 5180 --strictPort`.

The base flow (20 checks, passing on 2026-11-02 in all eight sessions):

- load the photo, level it, and calibrate with 28,00 and 30.71 (giving +0.28% and −0.23%);
- trace the lot, then Ctrl+A to get its area;
- type 4.5 m with Shift held: the line is exactly horizontal;
- split a segment at a T junction;
- drag a corner, then undo;
- measure an area, crop, and add a new layer;
- reload: the draft is restored;
- no console errors.

Its selectors depend on UI names: they had to follow the rename to `.prompt-dialog` and the new Select tool hint.
Its measure step once failed because a notice shifted the canvas
([Notices float over the canvas](notices-float-over-canvas.md)).

The areas flow (23 checks, passing in the second session): draw a house with a porch closed by open edges, name the
areas, check the hover sizes, select an area by clicking inside it, drag a label so it snaps to another room and is
refused in an already-named one, move a wall and see the rooms resize, switch a segment's kind and undo, delete an
open edge (the area shows "not enclosed"), Ctrl+A and move with the areas kept, reload, and name the largest room of
the user's real draft (86.68 m²). [Areas](areas.md) describes the behaviour under test.

The doors and windows flow (23 checks, third session): the preview and its gap labels, a door's swing side and
hinge, the 5 cm snap, the gap drawn in the wall, a typed window width remembered for the next one, dragging from the
library onto a wall, editing the width in the panel, flip and undo, sliding along the wall, a window staying put when
the far end of its wall moves, a split keeping a door in place, deleting the wall removing the door (and undo), and
reload ([Doors and windows](doors-and-windows.md)).

Since the third session the page has two sidebars, so the older flows scope their `.sidebar .box` selectors to
`.sidebar:not(.sidebar-left)`, and they check the active line type in the Library panel instead of the removed
top-bar switch. All three flows passed after that.

The styles flow (15 checks, fourth session) covers:

- the library's Doors and Windows groups and their icons;
- one opening of each style placed at its usual width;
- casements and awnings drawn outside;
- the symbol parts of each style;
- a style change in the Selection panel, with the right flip buttons.

The other three flows still passed. Library icons share the plan's `.opening` class, and library buttons carry their
count in their accessible name, so selectors need care ([Playwright flow-check pitfalls](playwright-flow-checks.md)).

The gates flow (12 checks, fifth session) covers the library's Gates group, gates in a fence drawn as open edges,
a sliding gate's parking outline on the longer side, the posts, *Flip direction*, the `cramped` warning (a double
gate dropped into the parking stretch) and its undo, and dragging a double gate from the library. In the same
session the styles flow followed the icon count (now 11) and the sash outline class's rename to `.opening-dashed`;
it and the other three flows passed. The session also found that the welcome card had been swallowing clicks
([Welcome card swallowed canvas clicks](welcome-card-swallowed-clicks.md)).

The sun flow (17 checks, sixth session) runs on the user's real draft, injected into IndexedDB
([Sun and shadows](sun.md)):

- season names follow the hemisphere;
- the North tool on the photo's compass arrow sets north (38.6°);
- winter sunrise and sunset read 08:00 and 17:50;
- at winter solar noon the sun sits at the north angle, 32° up;
- shadows exist, clouds fade them, and at night the sun is below the horizon with no shadows;
- `S` toggles the sun;
- a folded panel section stays folded after a reload, and the sun prefs survive it.

All earlier flows passed in the same session.

The outline flow (7 checks, seventh session) also runs on the user's draft
([Open edges and outlines are segment kinds](segment-kind-not-layer.md)): with the Pileta (pool) layer active, Ctrl+A
and Type → Outline turn its four segments into outlines, the wall shadows drop from 59 to 55, Pileta stays an
enclosed 67.52 m² area, the library counts 35.6 m of outline, and `O` cycles the three types. All six earlier flows
passed. In that draft the Quincho area is "not enclosed" (one side of its outline does not close), so do not expect
every named area to be closed.

The walls flow (`e2e_walls.py`, 21 checks) runs on the user's draft ([Walls](walls.md)). With walls came three
changes to older flows: `e2e_areas` expects floor areas (a 10 × 6 m house with 0.30 m outer walls and a 0.15 m
middle wall: rooms 32.92 and 21.52 m², porch 17.10 m², covered 64.89 = 10.30 × 6.30 m²); `e2e_openings` counts
wall pieces in `.wall-fill`; `e2e_outline` strips the pool's `kind` in its injected copy
([Playwright flow-check pitfalls](playwright-flow-checks.md)). On the draft at that time, Casa Principal had 19
exterior and 25 interior walls, and the covered area was 257.02 m² (220.03 indoor floor + 36.98 walls).

The exterior flow (28 checks, eighth session) runs on the user's saved plan: the tabs (disabled ones included), the
View toggles, the Exterior's camera presets, the Roof toggle, night darker than noon, *Save image*, and round trips
between tabs ([Exterior tab](exterior-tab.md)). Headless Chromium needs
`--use-angle=swiftshader --enable-unsafe-swiftshader` for WebGL. With the automatic roof of that time the solids
were floor 17, roof 15, wall 84, lintel 27, frame 99, leaf 18, glass 16, sill 14, beam 4, column 2. Since roofs are
drawn, the flow presses *Roof the house* first. All eight earlier flows passed again once their positional
`.sidebar:not(.sidebar-left) .box` `.nth(2)`/`.nth(3)` selectors became `[data-box="selection"]` /
`[data-box="areas"]`: the new View section had shifted the indices.

The roof flow (26 checks, eighth session) runs on the user's plan ([Roof tab](roof-tab.md),
[Elevations tab](elevations.md)): the Roof tab's tools; *Roof the house* gives one 18-corner gable over Casa
Principal; a pitch edit; *Turn the ridge*; hip warns on that non-convex outline; flat shows a parapet; undo; a shed
drawn on the Quincho layer; a corner drag and its undo; switching tabs resets tools and selection; the Exterior has
roof and infill solids; four elevations with their compass names; the layer toggle; *Save SVG* standalone. All
eight older flows passed with it (138 checks).

The colonnade and fireplace flow (19 checks, 2026-11-04) runs on the user's plan: the library groups; a fireplace on
Estudio's 7.34 m wall `s31`, and refused on an open edge; a Roman colonnade on the 17.35 m Galeria front `s6` (9
columns), spacing 1.2 (16 columns), a swap to metal, refused on a wall; undo steps; the chimney mark on the roof plan
after *Roof the house* (flat); in the Exterior 9 stone columns and the chimney 1 m above the roof + 0.30 m parapet +
0.06 m cap; elevation screenshots; no console errors. The tabs, roof and eight older flows passed after two checks
followed the UI: the areas flow now finds two active segmented buttons for an open edge (Type, and Columns: None),
and the styles flow counts 12 opening icons.

The furniture flow (19 checks, 2026-11-04, user's plan): the library groups; a counter snapped to a
wall in Cocina; a kitchen sink refused off a counter, then put in it; an alcove tub in Baño and its shower head
dragged from 3.5 to 0.5; a queen bed and `R`; a round table and a chair facing it; dragging the counter carries its
sink; deleting it takes the sink, and undo; a square table dropped from the library with Playwright's `drag_to`
(HTML5 library drags work that way); 31 `furniture` solids in 3-D; no console errors. With the bathroom fixtures
it grew to 24 checks: library counts per box, a corner tub in Baño Suite with its head dragged to the middle of its
curve, a toilet and a bidet in Toilette, a shower in Lavadero with its head dragged; it, the tabs flow and the older
flows (on the cleaned fixture where needed) passed. With the kitchen island it has 26 checks (the Counters box lists
Counter and Kitchen island; an island stands free in the kitchen; a kitchen sink goes in it), and with sofas 28
(the Sofas box lists 4 items; a three-seater backs up to a living-room wall; *Flip* sets `mirror`), passing. With
the coffee table it has 29 (the Tables box lists 3 items; a coffee table put in front of the living-room sofa takes
its angle), passing; an earlier check that picked "the" table had to look up the round one by `style`, since a
coffee table is a `table` too. With the materials (`839dce5`) the user had furnished their plan and resized the
pool, so the furniture flow now also runs on the cleaned fixture; Library selectors must use `data-box` now that the boxes
nest in groups ([Playwright flow-check pitfalls](playwright-flow-checks.md)).

On the same day four older flows that inject the user's saved plan failed on stale expectations, because the user
had kept editing it (a shed roof, their own fireplace and a 4 m colonnade, Estudio on its own layer, the Pileta area
removed, every Casa Principal wall and the roof at 3.5 m): roof ("no roofs yet"), objects (the colonnade and fireplace
flow: their counts), walls (layers with walls, the 2.70 m default) and outline (the old pool's 67.52 m² and 35.8 m perimeter).
The roof, objects and walls flows passed (26, 19, 21) on a cleaned copy built by a scratchpad script
(`make_fixture.py`: no roofs, furniture, fireplaces, colonnades or wall heights, Estudio dropped, a Pileta area
re-added). The outline flow still fails two checks that hard-code the old pool (now 4.59 × 10.03 m, 46.03 m², 29.3 m
perimeter). Pin a fixture for such flows ([Playwright flow-check pitfalls](playwright-flow-checks.md)).

With `64f59b7` the user's live plan has the base-plan photo visible and its lots drawn. `make_fixture.py` now also
hides the image and marks the Pared exterior layer's areas as lots ([Lots](lots.md)). `e2e_outline`'s "empty
canvas" click is now computed just outside all vertices.

**Inspecting live derived values:** in a Playwright `page.evaluate` on the Vite dev server,
`await import('/src/state/derived.ts')` and `await import('/src/state/store.ts')` return the app's own module
instances, so thicknesses, floors or `coveredArea` can be read on the real plan, as long as the dev server was
restarted after the last edits (stale HMR copies: [Playwright flow-check pitfalls](playwright-flow-checks.md)).

**Running model code on a plan file without the dev server:** write a probe script in the scratchpad that reads the
plan JSON and calls model functions (`houseSolids`, say), bundle it with
`npx rolldown probe.ts --platform node --format esm -o probe.mjs` (rolldown comes with Vite 8) and run
`node probe.mjs`. Import the model by absolute path (`'C:/projects/architect/src/model/solids.ts'`); relative imports
from the scratchpad did not resolve. Used for the double-height infills (`9f30985`, and their per-stretch rework
`b3a61f0` on synthetic plans, [House solids](house-solids.md)).

Pitfalls when writing such a script: [Playwright flow-check pitfalls](playwright-flow-checks.md) and
[Bash hook blocks `*.key` patterns and path colons](bash-hook-key-paths.md).
