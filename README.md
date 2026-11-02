# Architect

A lightweight browser app for sketching a house over a measured plan: load a photo or scan of the survey,
straighten and calibrate it so it reads in real meters, then draw connected lines on layers on top of it, and see
the house in 3-D. It runs locally with no backend; the stack and structure follow the Forge H1 planner
(`../forge-h1/planner`).

## Run it

Needs Node 20.19+ (or 22.12+).

```sh
npm install
npm run dev        # http://localhost:5173
```

| Command | Does |
|---|---|
| `npm test` | Model tests (Vitest): geometry, edits, snapping, calibration, file format. |
| `npm run typecheck` | TypeScript, no emit. |
| `npm run lint` | oxlint (prints nothing when clean). |
| `npm run build` | Production build in `dist/`. |

## Tabs

The bar's first row holds the tabs, *Undo*/*Redo* and the file actions; its second row holds the open tab's own
actions. Every tab works on the same plan, with one undo history and one file:

| Tab | |
|---|---|
| **Floor** | The floor plan: the base plan, lines, areas, doors, windows and gates (everything below). |
| **Exterior** | The house in 3-D, built from the floor plan (see [Exterior](#exterior)). |
| Foundation, Roof, Elevations, Interior, Plumbing, Electricity, Gas, Materials | Not built yet: shown, disabled. |

## Workflow

1. **Load the base plan**: *Load image…* in the Base plan panel, drop an image on the canvas, or paste it
   (Ctrl+V). Images larger than 4096 px are scaled down.
2. **Straighten**: *Level by 2 points* and click along a line that should be horizontal or vertical (the lot's
   front, say); fine-tune with the rotation slider or field, or turn by 90°.
3. **Crop & position** (optional): *Crop* hides the parts of the photo you don't need; *Move* drags it.
4. **Calibrate**: *Calibrate*, click both ends of a dimension written on the plan (a long one, e.g. 28,00) and
   type its value. Add more known lengths with *Add known length*: the scale becomes their least-squares fit
   and each shows how far off it reads. A spread of more than a few tenths of a percent means the photo is
   skewed (shot at an angle) or a point was mis-clicked. Lock the base plan when done. Calibrate before
   drawing: lines are kept in meters, so recalibrating later changes the photo under them, not the lines.
5. **Draw** walls and open edges on layers (Layers panel: add, rename, colour, hide, lock, reorder). Lines
   connect only within their layer. You draw on the walls' centrelines; walls show at their thickness.
6. **Name areas**: with *Area*, click inside each closed outline (a room, the porch) and name it. Its floor
   area follows the walls as they move; the Areas panel lists them with totals.
7. **Put in doors, windows and gates** from the library on the left: pick one and click a wall (or a fence),
   or drag it there.

The **library** (left panel) holds what can be drawn or placed: line types (wall, open edge, outline) with the length
of each drawn so far, and door, window and gate styles with how many there are and the width the next one
gets.

### Walls, open edges, outlines and areas

A line is one of three types, drawn the way plans draw them:

- a **wall** (solid): it stands up, so it casts a shadow;
- an **open edge** (dashed, like anything overhead): the limit of a covered space with no wall, such as the
  front of a porch or gallery, or a colonnade;
- an **outline** (thin): an edge at ground level with no height, such as a pool, paving, a deck or a planter.

All three close an outline, so a porch bounded by the house wall and open edges, or a pool drawn with
outlines, is an area like any room; an area reports how much of its boundary is open or outline. Pick the type
before drawing (in the library, or `O` in the Line tool to go to the next one), or change selected lines in the
Selection panel.

### Wall thickness and height

Walls are drawn the way a plan's cut shows them: at their thickness, filled, with mitred corners and clean T
junctions (no line across a joint), a step where the thickness changes along a line, and cut through by their
doors and windows, whose jambs and frames span the wall. You keep drawing and snapping on the centrelines.
*Thick walls* in the View section switches back to thin lines, for tracing over the base plan.

A wall's thickness is **automatic** until you set one:

- **0.30 m** when it faces outside: the outside itself, or an area open to it across open edges or outlines (a
  gallery, a porch, a pool);
- **0.15 m** between two indoor rooms. Rooms that open onto each other through an open edge (an open-plan
  kitchen and living room) are still indoors.

So a wall changes from 0.15 to 0.30 m by itself when the room beside it becomes a gallery. Select walls to see
and set their **thickness** and **height** in the Selection panel (2.70 m unless set). Several walls with
different values show an empty field, and a number typed there sets them all. *Automatic thickness* clears a
thickness set by hand.

Heights are not drawn in plan, as on paper. Each wall's shadow uses its own height (see Sun), and so does the
Exterior tab's 3-D view.

An **area** is a name pinned inside a region: its outline is whatever its layer's lines enclose around that
point, worked out from the lines (they close where they meet or cross, with or without a shared point). Its
label sits at the middle of the region and shows its **floor area inside the walls** (each wall's half
thickness taken off, the standard room size), which updates as walls move. The Selection panel also gives the
size to the wall centrelines. The Areas panel totals the floor of every area, and the **covered area with
walls**: the indoor rooms plus every wall around and in them, measured to the walls' outside faces (the
*superficie cubierta*). Galleries, porches, pools and paving are left out of it. Drag the label into another room
to move the area there (one area per region). If walls stop enclosing it, the label turns into a dashed
*not enclosed* warning until the outline is closed again. A free-standing block inside a room (a chimney, a
stair core) is subtracted from the room's size.

### Doors, windows and gates

Doors, windows and gates sit **in a wall**, or in a fence drawn as an open edge: they cut a gap in it and
follow it when it moves. They come in styles, grouped in the library, each with its plan symbol and a usual
width:

| Doors | | Windows | |
|---|---|---|---|
| Single | 0.80 m, one leaf | Fixed | 1.00 m, one pane |
| Double | 1.40 m, two leaves meeting in the middle | Sliding | 1.50 m, two staggered sashes |
| Sliding | 1.60 m, two staggered panels | Double hung | 0.90 m, two parallel sashes |
| | | Awning | 1.00 m, the sash projecting outside (dashed) |
| | | Casement | 1.20 m, leaves swinging outside (two from 1.00 m, else one) |

| Gates | |
|---|---|
| Single | 1.00 m, a pedestrian gate: posts and one leaf |
| Double | 3.00 m, a driveway pair |
| Sliding | 4.00 m, a driveway panel, with the stretch of fence it parks along when open (dashed) |

A sliding gate parks towards the side with more fence; if the fence there runs out or another opening is in
the way, its parking outline turns amber and the Selection panel says how much is missing.

Pick a style in the library (`D` and `W` bring back the last door and window style picked) and hover a wall
to see where it would go and how much wall is left either side; it snaps to the wall's middle and to 5 cm
steps from the nearer corner (`Alt` turns that off). Whatever opens to one side opens to the side of the wall
the cursor is on: into the room for a door, outside for a casement or an awning, in for a gate. A single leaf
hangs from the jamb nearer the closer corner; `X` swaps it (or a sliding gate's direction) before you click. Type a number while placing to set the width;
it is remembered for that style.

Select one to drag it along its wall or onto another wall of its layer, or to change its style, width and the
wall left on either side (named by where they are on screen) in the Selection panel; *Flip side* and *Flip
hinge* appear when they make sense for the style. When a wall is stretched, its openings keep their distance to the nearer corner; when it is
split (a new wall meets it), each goes to the piece its centre is on; when it is deleted, they go with it.
Rooms stay closed through doors: an area does not leak into the next room.

### Sun

The **Sun** section (right panel, `S` shows and hides it) puts the sun over the plan: a dotted disc that travels
along a dotted yellow circle around the drawing, at the sun's compass direction, with the day's arc between
sunrise and sunset brighter and both times marked.

- **Season**: the solstices and equinoxes, named for the hemisphere (south of the equator, December is
  summer). **Time**: clock time through the day; the panel shows sunrise, solar noon and sunset, and how high
  and where the sun is. **Cloudiness** fades the sun and the shadows.
- **Wall shadows**: every wall on a visible layer casts a shadow on the ground as tall as its own height
  (there are no roofs yet). Open edges and outlines cast none, so draw a pool or paving with outlines.
- **Site** (saved in the plan): where north points on the plan, in degrees clockwise from straight up (set it
  with *From the plan's arrow*: click the tail of the survey's north arrow, then its tip), and the latitude,
  longitude and UTC offset the times are worked out for (Buenos Aires by default). Season, time and clouds
  are per browser.

Sun positions use the standard solar formulas (good to about a degree; sunrise and sunset to a few minutes).

### View

The **View** section (first on the right) turns what the plan shows on and off: *Base plan* (the photo; saved
with the plan, like the Base plan section's *Visible*), *Known lengths*, *Grid*, *Thick walls*, *Wall lengths*
(the length labels on every line), *Area names*, *Area sizes* and *Sun*. A hidden area label cannot be dragged;
click inside the area to select it instead. The rest are per browser.

Every panel section folds away from its title, and stays folded the next time.

## Exterior

The **Exterior** tab shows the house in 3-D, built again from the Floor tab's visible layers on every change
(undo works across tabs):

- walls at their thickness and height, cut by their doors, windows and gates, with the wall over each door and
  window and under each window; doors and windows are 2.10 m tall, windows sit on a 0.90 m sill (awnings on
  1.50 m), gates are as tall as their wall (1.80 m in a fence drawn as an open edge);
- frames, glass and closed door and gate leaves;
- the floor of every named area, and a flat 0.20 m roof over the covered ones: rooms, and areas bounded only by
  walls and open edges (a gallery), whose walls rise to the roof's top. An area bounded by outlines (a pool,
  paving) stays open and paved;
- open edges along a roofed area as beams under the roof, on columns where no wall holds them.

Its toolbar has the camera (*Aerial*, *Top* as the plan, and the four facades by the plan's north), *Roof* to look
into the rooms, the sun's season and time (the same as the Floor tab's Sun section, with its site and
cloudiness) and *Save image* (a PNG at twice the screen resolution). Drag to orbit, right-drag to pan, wheel to
zoom. Colours are a fixed basic palette: materials are not picked yet. three.js loads only when the tab opens.

## Tools and keys

| Key | Tool / action |
|---|---|
| `V` | **Select**: click or box-select lines, points and areas (click an area's label, or inside it); drag to move. A dragged point snaps, and dropped on a point or line of its layer it connects there; a dragged area label settles in the room it is dropped in. `Del` deletes, `Ctrl+A` selects the active layer's lines and areas, `Esc` clears. |
| `L` | **Line**: click to add connected points. Snaps to points, midpoints and lines (landing on a line splits it, a T junction). Type a number and `Enter` to place the next point at that distance. `O` goes to the next line type (wall, open edge, outline). Ends on a second click on the same spot, on closing the shape at its first point, `Esc`, `Enter` or right click. |
| `A` | **Area**: hover a closed outline to see its size, click to name it. |
| `D` / `W` | **Door** / **Window** (the style last picked in the library): hover a wall, click to put one in it. Type a width; `X` swaps a single leaf's hinge. Gates are picked in the library. |
| `M` | **Measure**: click points for a running total; click the first point again to close it and get the area. Nothing is drawn. |
| `H` | **Pan** (also `Space`+drag or the middle button, with any tool). The wheel zooms around the cursor. |
| `Shift` | Keeps lines, moves and measurements at 45° steps; while drawing it lines up with nearby points and stops at lines it crosses. |
| `Alt` | Turns snapping off while held (or untick *Snap* in the toolbar). |
| `F` / `G` / `S` | Fit the plan / toggle the grid / show or hide the sun. The other view toggles are in the View section. |
| `Ctrl+Z` / `Ctrl+Y` | Undo / redo (`Ctrl+Shift+Z` also redoes). |
| `Ctrl+S` / `Ctrl+Shift+S` / `Ctrl+O` | Save / save as / open. |

These keys work on the Floor tab. The Selection panel shows a line's length (edit it to resize the line: the end with fewer other lines on it
moves), its angle and type (wall, open edge or outline), a wall's thickness and height, for several lines their
total length and, when they form one closed outline, its area, and for an area its name, floor area and
boundary. A click on a thick wall's face picks it, not only on its centreline.

## Files

A plan is one JSON file with the base image embedded, so it is self-contained:

- `site`: `north` (degrees clockwise from straight up on the plan), `latitude`, `longitude` and `utcOffset`, for
  the sun.
- `image`: the photo as a data URL, its placement (`cx`, `cy`, `rotation`, `scale` in meters per pixel), crop,
  opacity and the known lengths used to calibrate it.
- `layers`: each with `vertices` (id → `{x, y}` in meters, +y down), `segments` (id → `{a, b}` vertex ids, plus
  `kind: "open"` for an open edge or `"outline"` for an outline, and a wall's own `thickness` and `height` in
  meters when set; without them it is automatic and 2.70 m), `areas` (id → `{name, at}`, `at` being a point inside the area) and
  `openings` (id → `{kind, style, segment, offset, width, hinge, swing}`: `kind` is `door` (styles `single`,
  `double`, `sliding`), `window` (`fixed`, `sliding`, `double-hung`, `awning`, `casement`) or `gate`
  (`single`, `double`, `sliding`); `offset` is the centre's distance from the segment's `a` end, `hinge` the
  end a single leaf hangs from (a sliding gate: the end it slides towards), `swing` the side it opens or
  slides to looking from `a` to `b`). Files saved before areas, openings, styles or wall thicknesses existed
  open unchanged (older openings read as single doors and fixed windows, older walls as automatic).

In Chrome and Edge *Save* writes back to the file you opened; elsewhere it downloads. The latest state is also
autosaved in the browser (IndexedDB), so a reload never loses work. Loading validates the file and reports the
exact field of any problem; `schemaVersion` with migrations (in `src/model/planFile.ts`) covers future format
changes.

## Code

- `src/model/`: pure TypeScript, no React or DOM, unit-tested. `plan.ts` (schema and types), `planFile.ts`
  (parse, validate, serialize), `edit.ts` (immutable edits), `regions.ts` (the outlines lines enclose, which
  walls face outside, floor areas inside the walls, area label points), `walls.ts` (wall thickness and height,
  walls drawn at their thickness with their joints), `openings.ts` (doors, windows and gates laid out on their walls, where a new one goes),
  `sun.ts` (sun position, sunrise and sunset, shadows), `solids.ts` (the house in 3-D as prisms extruded from
  the plan), `snap.ts`, `pick.ts` (hit tests, loops),
  `baseImage.ts` (image placement, calibration, crop), `geometry.ts`.
- `src/state/`: the editor store (tab, undo history, gestures, selection, tool, view), `derived.ts` (regions, wall
  thicknesses and shapes, placed areas, the covered area and the 3-D solids, cached per object), prefs, files and
  autosave, user-level actions.
- `src/ui/canvas/`: the SVG canvas. Each tool in `tools/` is a plain controller that gets pointer and key
  events and returns overlay data the canvas draws.
- `src/ui/panels/`: the Library (left) and View, Base plan, Layers, Selection, Areas and Sun (right).
  `src/ui/TopBar.tsx` is the tab row; `src/ui/FloorTab.tsx` lays out the Floor tab.
- `src/ui/exterior/ExteriorTab.tsx` and `src/render/`: the Exterior tab and its three.js engine (lights from the
  sun, shadows, camera presets) and house meshes, adapted from the Forge H1 planner's render tab and loaded on
  demand.
