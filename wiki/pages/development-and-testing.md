---
title: Development and testing
type: guide
summary: "npm scripts, the 131 Vitest model tests and the sample lot 8a in testPlan.ts, and the browser flow checks (Python Playwright scripts kept outside the repo: a 20-check base flow, a 23-check areas flow, a 23-check doors/windows flow, a 15-check door/window styles flow, a 12-check gates flow, and a 17-check sun flow, a 7-check outline flow, a 21-check walls flow and a 28-check exterior flow on the user's plan, the last with software WebGL), plus reading live derived values from the dev server."
tags: [guide, testing, vitest, playwright, webgl]
sources: []
updated: 2026-11-02
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

## Model tests

On 2026-11-02, after the Exterior tab, there were 131 Vitest tests in `src/model/*.test.ts`: `edit` 27,
`openings` 26, `regions` 13, `walls` 13, `baseImage` 9, `solids` 9, `sun` 9, `geometry` 8, `pick` 6, `planFile` 6
and `snap` 5 (counted from the `it(` calls). `solids.test.ts` covers the rules in [House solids](house-solids.md):
a roofed room, unnamed outlines, door and window cuts, gates, a gallery's beam and columns, an open pool, facade vs
interior walls and hidden layers. Before finishing a change, run `npm test`, `npm run typecheck`, `npm run lint`
and `npm run build`. `walls.test.ts` covers automatic thickness (gallery, open-plan kitchen, own
thickness), floor areas (own thicknesses, stubs, open edges, islands) and `layerWalls` joins (mitre, T, step,
bevel, cut by openings) ([Walls](walls.md)). `sun.test.ts` is described in [Sun and shadows](sun.md). They run in the `node` environment
(`vite.config.ts`). Only the model is unit-tested; the repo has no UI or browser tests
([Code conventions](code-conventions.md)).

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
`--use-angle=swiftshader --enable-unsafe-swiftshader` for WebGL. On that plan the solids were floor 17, roof 15,
wall 84, lintel 27, frame 99, leaf 18, glass 16, sill 14, beam 4, column 2 (Quincho still "not enclosed", so no roof).
All eight earlier flows passed again once their positional `.sidebar:not(.sidebar-left) .box` `.nth(2)`/`.nth(3)`
selectors became `[data-box="selection"]` / `[data-box="areas"]`: the new View section had shifted the indices.

**Inspecting live derived values:** in a Playwright `page.evaluate` on the Vite dev server,
`await import('/src/state/derived.ts')` and `await import('/src/state/store.ts')` return the app's own module
instances, so thicknesses, floors or `coveredArea` can be read on the real plan.

Pitfalls when writing such a script: [Playwright flow-check pitfalls](playwright-flow-checks.md) and
[Bash hook blocks `*.key` patterns and path colons](bash-hook-key-paths.md).
