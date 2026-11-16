# Architect

A lightweight browser app for sketching a house over a measured plan: load a photo or scan of the survey,
straighten and calibrate it so it reads in real meters, then draw connected lines on layers on top of it, roof
it, and see the house in elevation and in 3-D. It runs locally with no backend; the stack and structure follow the Forge H1 planner
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
| **Roof** | The roof plan: roofs drawn over the floor plan (see [Roof](#roof)). |
| **Elevations** | The four facades, drawn from the floor plan and the roofs (see [Elevations](#elevations)). |
| **Exterior** | The house in 3-D, built from the floor plan and the roofs (see [Exterior](#exterior)). |
| **Materials** | What the house needs to be built, with quantities (see [Materials list](#materials-list)). |
| **Foundation** | The foundation plan, worked out from the ground floor's walls and columns (see [Foundation](#foundation)). |
| **Electricity** | Each layer's electrical plan: boards, switches, light outlets and sockets, with the circuits, cables and their runs worked out from them (see [Electricity](#electricity)). |
| **Plumbing** | The water supply, the hot water and the drains, worked out from the fixtures and the equipment put down (see [Plumbing](#plumbing)). |
| **HVAC** | Heating, cooling and ventilation: boilers, heat pumps, radiators, radiant floors, split units, extractors, and each room's loads (see [HVAC](#hvac)). |
| Interior, Gas | Not built yet: shown, disabled. |

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

The **library** (left panel) holds what can be drawn or placed, in three groups that fold away like their sections:

- **Drawing**: the line types (wall, outline, open edge) with the length of each drawn so far.
- **Materials**: what walls and floors are finished in (see [Materials](#materials)), under *Walls* and *Floors*
  by family, with how many wall sides or floors have each.
- **Objects**: door, window, gate and fireplace styles with how many there are and the width the next one gets,
  colonnades with how many open edges have one and the most their columns stand apart, and furniture (counters,
  sinks, kitchen and laundry appliances, bathtubs, showers, toilets and bidets, beds, sofas, tables, chairs) with
  how many there are and their size.

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

A layer can stand above the ground: its **floor level** (the Layers section, for the active layer) raises everything
on it in 3-D and the elevations (floors, walls, doors and windows, roofs, furniture) onto a plinth under its rooms
and galleries, out to the walls' outside faces, with steps down to the ground (each at most 0.18 m high, 0.30 m
deep) outside its doors to the outside and along its galleries' open edges. A house usually stands 0.15 to 0.45 m
up.

### Upper floors and lofts

Every layer is on a **floor**: the ground floor, or up to three above it. **+ Floor** (on the right of the Floor
and Roof tabs' toolbar) adds a layer on a new floor over the top one, at the top of the walls below plus a 0.30 m
slab (3.00 m over 2.70 m walls), and makes it active; **Floor** there switches between the floors. The canvas shows
the active layer's floor, with the floor below faded under it to draw over (lines snap to it), and only the active
floor's things can be picked. The Layers section sets the active layer's floor and its **floor level** (a loft is a
floor set lower), and a layer added there goes on the active layer's floor.

In 3-D an upper floor stands on a 0.30 m slab (the ceiling below) under its **named** areas, out to its walls'
outside faces: a space left unnamed, such as a **stairwell** or the void over a double-height room, has no floor.
An **open edge** with a floor on one side only (round a stairwell, a loft's edge, a balcony's front) gets a 1.00 m
glass railing between steel posts; an **outline** is a plain edge, as where a stair arrives. On an upper floor only
open edges to the outside carry a beam under a roof. Draw that floor's roofs on its own layer: their heights count
from its level.

A **stair** (Library → Stairs) climbs from its front (the dot) to its back (the arrow) up to the floor above, in
treads of about 0.28 m along its length; the Selection panel gives its steps' height (it warns over 19 cm). On the
floor above, leave the stairwell over it unnamed, edged with open edges, and an outline where it arrives.

The Areas panel lists the areas by floor; *Covered, with walls* counts every floor, *Lot covered* (FOS) only the
ground floor, and *Lot built* (FOT) every floor.

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

A **lot** is an area that is the land of a plot, not a room: tick *Lot* for it in the Selection panel (draw the
lot lines, the boundary walls and any outline between two lots, on a layer of their own, and name each region).
A lot is outdoors even though its boundary walls close it in, so lawn and paving suit it; its size is to its
boundary lines (the lot lines), not inside the walls; and the Areas panel leaves lots out of *Total floor* and
*Covered, with walls* and sums them as *Lots*, with *Lot covered*: the covered area as a share of the lots (the
*FOS*). Its label goes on its open ground, clear of the other layers' areas (the house, a pool), so it covers
none of them. In 3-D a lot is the ground, or with a ground cover (its floor material) a thin layer under the
house's floors.

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

### Fireplaces

A **fireplace** (library, *Fireplaces*: masonry, 1.20 m wide) goes against a wall, in the room on the side the
cursor is on, and follows the wall like a door does, but cuts no gap in it. In plan it shows its brick surround
standing 0.50 m out from the wall's face, the dark firebox, the hearth before it (dashed) and its flue (crossed).
*Flip side* moves it to the other side of the wall. Its **chimney** rises from the mantel (1.10 m) through the
roof over it to 1 m above the roof there (above a flat roof's parapet; with no roof, 1 m above its wall), under a
stone cap: it shows on the Roof tab's plan, in the elevations and in 3-D.

A **parrilla** (*Fireplaces*: an Argentine grill, 1.80 m wide) is the built-in kind for a gallery or quincho: it
stands 0.80 m out from the wall, with a niche for firewood in its base, a stone counter at 0.90 m, the fire
opening over it across all but its 0.15 m cheeks with the grill and the ember basket (*brasero*) in it, a hood up
to 2.30 m and its chimney from there; firewood is stacked in the niche, log ends out. A fireplace's or parrilla's masonry is exposed brick, or the material picked
for it in the Selection panel (stone cladding, concrete, plaster...).

### Colonnades

An open edge (a gallery's front, a porch) can carry a **colonnade**: columns shared out evenly along it, no
farther apart than its spacing, one at each end unless a wall holds that end, under a beam that follows the roof
over it (or stands level with the walls' height when there is none).

| Columns | |
|---|---|
| **Roman** | 0.32 m stone columns on a square plinth, with a round base, a shaft that narrows towards the top and a capital, under a 0.35 m stone beam; 2.40 m apart at most. |
| **Metal** | 0.10 m round steel posts between plates, under a 0.20 m steel beam; 3.00 m apart at most. |
| **Timber** | 0.14 m square timber posts on black steel shoes, a curved steel knee brace each way up to a 0.22 m timber beam (a carport's or a pergola's); 3.00 m apart at most. |
| **Glazed** | A greenhouse's side: 0.05 m square galvanized steel posts with glass between them, on a 0.40 m concrete base, up to a 0.08 m steel rail that follows the roof over it; 1.00 m apart at most. A door, gate or window put in the edge breaks the base and the glass (glass goes on over it from its head). |

Pick one in the library (*Colonnades*) and click an open edge, or drag it there; walls and outlines are refused.
Select an open edge to change its columns (*None*, *Roman*, *Metal*, *Timber*, *Glazed*) and their spacing in the Selection panel,
which also says how many there are. The plan draws each column at its size.

### Furniture

Furniture and fixtures go where you click (pick one in the library, or drag it onto the plan), at their real size:

| | | |
|---|---|---|
| **Counter** | 2.40 × 0.60 m, 0.90 m high: cabinets, a toe kick and a stone worktop | backs up to a wall |
| **Kitchen island** | 2.00 × 1.00 m, 0.90 m high: cabinets all round under a worktop that overhangs the front 0.25 m for stools | stands where it is put |
| **Sinks** | *Outdoor* 0.70 × 0.50 m, a stone basin on a pedestal; *Bathroom* 0.60 × 0.45 m, a vanity with its basin; *Kitchen* 0.80 × 0.45 m | outdoor and bathroom back up to a wall; a kitchen sink only goes in a counter |
| **Appliances** | *Fridge* 0.90 × 0.70 m; *Dishwasher* and *Oven* 0.60 × 0.60 m; *Clothes washer* and *Dryer* 0.60 × 0.65 m | back up to a wall; each has its own plan symbol and 3-D form |
| **Bathtubs** | *Alcove* 1.70 × 0.75 m; *Clawfoot* 1.65 × 0.78 m, on feet; *Drop in* 1.85 × 0.95 m, in a deck; *Corner* 1.40 m along each wall, a quarter round with a curved front | back up to a wall |
| **Shower** | 0.90 × 0.90 m tray behind a glass screen, its head at the back | backs up to a wall |
| **Toilets** | *Toilet* 0.40 × 0.70 m, its cistern to the wall; *Bidet* 0.38 × 0.55 m | back up to a wall |
| **Beds** | *Single* 0.95 × 2.00, *Double* 1.45 × 2.00, *Queen* 1.65 × 2.10, *King* 1.85 × 2.10 m (mattress and frame) | head to a wall |
| **Sofas** | *Armchair* 0.90 × 0.90 m, *Loveseat* 1.60 × 0.90 m, *Three-seater* 2.20 × 0.95 m, *Sectional* 2.80 × 1.70 m (an L whose return, at its right end, *Flip* moves to its left), 0.85 m high | back up to a wall |
| **Tables** | *Square* 0.90 × 0.90 m, *Circle* Ø 1.10 m, 0.75 m high; *Coffee* (mesa ratona) 1.20 × 0.60 m, 0.42 m high, with a shelf; *Oak trestle* 3.20 × 1.10 m, 0.78 m high, any length: a 9 cm top of long boards over leg frames (square legs on a foot rail, a third frame in the middle when over 4 m), a low stretcher and braces, in solid reclaimed oak with its grain along each piece | stand where they are put; a coffee table stands centred 0.40 m in front of a sofa it is put by (a sectional's main seat), squared to it |
| **Chairs** | 0.45 × 0.50 m | turn to face a dining table they are put by |
| **Outdoor living** | *Teak outdoor sofa* 2.20 × 0.90 m and *armchair* 0.85 m square (sofa styles): a teak frame with slatted arms and back under thick linen cushions; *Teak coffee table* 1.30 × 0.70 m, 0.40 m high (a table style), slatted | the sofa backs up to a wall; the armchair stands where it is put; the table stands before a sofa like a coffee table |
| **Plants** | In a pot: *Olive tree* (foliage 1.20 m across, 2 m high), *Shrub* (0.60 m). In the ground: *Bush* (1 m), *Agapanthus* (0.70 m, its blue-violet flower heads on tall stems), *Lavender* (0.60 m), *Climber* (1.60 m along a wall, 2.60 m up it, with white flowers); each in-ground one a little different | stand where they are put; a climber backs up to a wall |
| **Trees** | *Shade tree* a crown 6 m across, 7 m high; *Tall tree* 3.5 m across, 11 m high (taller as they are wider) | stand where they are put, for gardens and streets |

Near a wall, a piece that goes against one turns its back to the wall and stands flush with its face (`Alt`
keeps it from snapping); `R` turns it a quarter turn, while placing or with it selected. A **kitchen sink** sits in
a counter or an island (over an island's cabinets, not its overhang): it is refused anywhere else, slides along its counter when dragged (or onto another counter), moves and
turns with its counter, and goes when its counter is deleted. A **bathtub** or a **shower** shows its shower head as a
round mark on its rim (a tub's at its left end at first, a shower's at its back): select it and drag the mark
round the rim (a corner tub's round its curved front too) to move it; in 3-D a riser goes up from there to the
head at 1.95 m.

Select a piece to drag it (it snaps as when it was put down) or to change its style (a bed's or a table's size
comes with it), width and depth (a round table's diameter) and turn in the Selection panel. Furniture is drawn on
the plan with the usual symbols (a basin and its drain, a bed's pillows and turned sheet, a chair's back), and in
3-D and the elevations as simple blocks. It does not move with the walls.

### Materials

Each side of a wall and the floor of each named area can be finished in a material from the library's *Materials*
group: plaster and paint, brick and stone, concrete, wood, ceramic tile (among them a black and white checkered
tile and 5 cm ocean blue, sage green and warm terracotta mosaics), large stone slabs (0.60 m squares, for steps and outdoor paths), metal sheet, and for the
ground gravel, lawn, a garden bed's mulch, a dirt road, pool water and a **stone pool** (its lining of 0.20 m green stones seen through the
water). An outdoor area can be a **pool**: give it a *Pool depth* in the Selection panel and in 3-D it sinks into the
ground that deep, lined in its floor material (white tile when that is just water) under water 0.1 m below its rim,
with the ground and a lot's lawn opened over it; the elevations leave it out. For **steps** in a pool, divide it with
outline lines and name each part as an area with its own (shallower) depth: between two parts a riser goes from one
floor to the other, with no wall up through the water, and the water is one surface. Pick one under *Walls* and click the side of a wall it goes on (hovering marks that face and
names what it faces: a room, or the outside), or pick one under *Floors* and click inside a named area; or drag
it there. A material that does not suit the place is refused with the reason: a wall side or floor is outdoors
unless it is in a room (so a gallery is outdoors, and a [lot](#walls-open-edges-outlines-and-areas)), and stone cladding, decks, pavers and lawn are for outdoors
only. For a selected wall the Selection panel has a material for each side, named by where it is on screen and
what it faces, offering the materials that suit it; for an area, its floor material. *None* takes one off.

The plan draws a finished side as a line in its material's colour just inside that face, and a floor tinted in
its colour (a checkered one in its squares); *Materials* in the View section hides them. The Exterior and the elevations draw them in their colours too: each side on every piece of its wall
(over and under doors and windows, a gable end), the wall's ends and the reveals of its openings half in each
side's material. A wall keeps its finishes when it is split, or turned into an open edge and back.

In the Exterior, brick, wood and lawn are drawn at their real size with a texture and relief: brick in running bond
(0.24 × 0.055 m with 1 cm recessed joints, each brick a slightly different tone), boards 0.156 m wide with
staggered ends, grain and seams, and a lawn of grass blades and patches; tiles and stone slabs as square tiles of
their size (stone each a different tone, porcelain even), the stone pool's lining under rippling water, stone
cladding as stacked stone in courses, the checkered tile in its squares, and ceramic mosaics as small multi-colour tiles with recessed grout. The open ground around the site is
the same lawn, and fireplaces and chimneys are exposed brick unless finished otherwise. Plaster, concrete, metal
and gravel are still flat colours.

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
(the length labels on every line), *Area names*, *Area sizes*, *Materials* (wall finishes and floor materials;
the Exterior and the elevations still show them) and *Sun*. A hidden area label cannot be dragged;
click inside the area to select it instead. The rest are per browser.

Every panel section folds away from its title, and stays folded the next time.

## Foundation

The **Foundation** tab is the foundation plan: the ground floor faded, and what it stands on, worked out from its
walls, columns and rooms. *System* (in the bar) is how the house stands on the ground:

| System | |
|---|---|
| **Strip footings** | A strip footing of lean concrete with brick rubble under every wall (its width the wall's thickness + 0.15 m, at least 0.30 m; 0.60 m deep under walls of 25 cm or more, 0.40 m under the rest), with a reinforced ring beam on it under the load-bearing walls (dashed). |
| **Piles and ground beams** | A reinforced ground beam under every wall of the house (0.40 m deep under outside walls, 0.30 m under partitions), on bored piles Ø 25 cm, 3 m deep, along the outside walls at most 2.5 m apart: for soft or expansive soil. |
| **Raft slab** | A reinforced slab 15 cm thick under the covered areas, out to the walls' outside faces, thickened into a beam under every wall: for weak soil. It replaces the sub-floor. |

Whatever the system, boundary and garden walls (nothing indoors on either side) stand on strip footings, columns
of galleries and colonnades on 0.80 m pad footings, and load-bearing walls have tie columns at their ends and at
most 4 m apart. *Select* (V) picks a wall's footing (Shift adds); the Foundation section then sets its width and
depth by hand (drawn with a heavier edge) or puts it back to the one worked out from the wall, and lists what the
foundation takes, the same rows as the Materials tab's first chapter. These are usual sizes for ordinary soil, not
a structural design: a soil study and an engineer's calculation set the real ones.

## Electricity

The **Electricity** tab is the electrical plan of one layer at a time (*Plan of*, in the bar; *All layers* shows
every layer of that floor together), over its floor faded, in the usual notation. Its tools put down:

| Tool | Fixed to | |
|---|---|---|
| **Board** (`B`) | a wall | An electrical board, *Biphasic* or *Triphasic* (two or three phases with the neutral). Once placed it asks its name and what feeds it. Fed from the **meter** it is a main board and feeds whole layers (those no board feeds yet ticked; each layer feeds from one main board, so ticking one another board feeds moves it). Fed from **another board** it is a sub-board and feeds **areas** of its parent's layers (a kitchen, a workshop): the points in those areas are on it, the rest stay on the parent. A sub-board is either *in its parent's enclosure* (its own rows in the parent's box, drawn with it, with no feeder run) or a box of its own, on its own wall, fed by a feeder circuit from its parent. A board cannot be fed from itself or from one of its own sub-boards. |
| **Switch** (`S`) | a wall | A light switch. |
| **Light** (`L`) | the ceiling, a wall or the floor | A light outlet: inside a room on the ceiling, on a wall's face as a wall light, or on the floor: in a room (a step light) or outdoors (a garden uplight, a bollard, a lamp post; its *Post* in the Electricity section, 0 for one flush in the ground). |
| **Socket** (`O`) | a wall or the floor | A socket, *General* or *Special* (an oven, an AC, a pump: a circuit of its own), on a wall's face or in the floor, in a room or outdoors. |

A wall mount goes on the face of the nearest wall of the floor, facing out of it, and never in a doorway. A floor
light or socket outside every room, or on an open terrace or a lot, is **outdoors**: it is fed underground (see
*Runs*). A ceiling light or a floor light or socket snaps as it is placed or dragged (`Alt`: not), on each axis on its own, shown by a
dashed guide: to the middle between two walls (a light in the middle of a corridor, along its centre line), or in
line with others of its kind (ceiling lights in a row). Like furniture, points stand where they are put: they do not follow walls that move
(drag them again).

**Circuits are chosen when a point is placed.** The bar's *Circuit* field holds the circuit new points go on; with
one picked, a new switch, light or socket goes on it (if it may: lighting takes switches and lights, general
sockets take sockets, and the circuit's board must feed the spot). With *New circuit…* picked, placing a
point asks for the new circuit's name (offering one such as *Kitchen lighting*), appends it to the board feeding the
spot and picks it, so the next points follow it. A special socket always asks for a circuit of its own. Clicking a
point with *Select* picks its circuit. Switches and lights are not paired: what a switch switches is up to the
electrician, a lighting circuit just holds both.

**A point is fed by its circuit's board.** Which board *may* feed a spot: a main board anywhere on the layers it
feeds, a sub-board in the areas it feeds, and any board wherever its own sub-boards may (the main board may keep a
kitchen circuit even once a kitchen sub-board exists). Which board feeds it *by default*, for a new circuit or a
point on none: the sub-board whose area it is in, else its layer's main board. So a circuit is not tied to where its
points are, only bounded by it:

- **Moving a circuit to another board**: its *Move to…* field, in the Circuits list, moves it with all its points to
  the end of that board's list (a circuit grouped automatically asks a name and is kept there). Boards that do not
  feed all its points are listed but greyed out: tick their area or layer on that board first.
- **When a board starts feeding more** (a new board, or a layer or area ticked on one), the circuits on other boards
  whose points are all in what it now feeds by default are offered to move to it, ticked; untick any to leave it.
- A point's *Circuit* field (or several points' together) lists the circuits of every board that may feed them,
  other boards' named with their board.
- Unticking a layer or area on a board takes its circuits' points there off it: they go back to the board feeding
  their spot by default, grouped automatically, until it is ticked again.

From the boards and points the tab works out, after the rules for dwellings of AEA 90364-7-771 (220 V, copper in
conduit):

- **Circuits**, per board: the ones made by hand, in the order they were added, then points on none (older plans)
  grouped automatically by nearness (lighting IUG and general sockets TUG at most 15 points, one per special
  socket TUE), shared over the board's phases by load; a sub-board of its own gets a feeder circuit on its parent,
  sized to its main breaker, and one in its parent's enclosure just adds its rows there.
- **Runs**: each circuit is a tree from the board, box to box, along the walls' centrelines (lighting and a
  sub-board's feeder in the ceiling, solid; sockets in the floor, dashed), a ceiling or floor box reaching its
  walls straight. Buildings apart are joined by buried runs (dotted), and outdoor points are reached underground
  from the foot of the nearest wall and from one another (garden lights in a row); a layer, or a sub-board, on
  another floor gets a riser at the board.
- **Conduit and cable by where they run**: in walls and ceilings, corrugated PVC conduit (IRAM 62386) with
  single-core cables (IRAM NM 247-3); in the floor screed, reinforced corrugated PVC; underground, a three-core
  subterranean cable (IRAM 2178: single-core cables are not made for wet ground) in a rigid PVC pipe 0.7 m deep,
  down the wall from a ceiling run. Conduit is sized for line, neutral and earth at 35 % fill, the pipe for the
  cable at 53 %.
- **Sizes**: each circuit's breaker, line and earth sections (the least that carries the breaker and keeps the
  voltage drop to its farthest box within 3 %), conduit and length; each board's main breaker, RCD, feeder and
  enclosure. What each board's installation takes is in the Materials tab's *Electrical installation* chapter
  (see [Materials list](#materials-list)), priced at local prices.

Each circuit shows where its length goes (along walls, ceilings and floors; up and down to its boxes; buried;
risers), and so does a selected point's own cable; *How lengths and sizes are worked out*, under the circuits, says
how and what is left out. In short:

- **Along**: wall centrelines on the plan (a few cm off per corner against a conduit inside the wall), from the
  wall behind one box to the next; walls are straight, so there are no curves to follow.
- **Up and down**: each run climbs or drops at both ends from its box's height (a switch 1.10 m, a socket 0.30 m,
  a board 1.50 m, or as set) to its plane: the ceiling at the height of the wall nearest the box (so a taller wall
  gives a taller ceiling), or the floor. A sloping ceiling under a pitched roof is taken flat at the wall's height.
- **Buried**: 0.7 m down and up at each end, and a ceiling run's way down the wall into the ground.
- **Section and drop**: 220 V phase to neutral, ΔU = 2·L·I·ρ/S summed along the tree (each run carrying what is
  beyond it), ρ = 0.0225 Ω·mm²/m (copper at its working temperature), every point's load at once (a light 100 VA,
  a socket 200 VA, a special socket 2200 VA, or its *Power*); ampacities after AEA's table for conduit in a wall,
  rounded down.
- **Not counted**: the slack in boxes and offcuts (the Materials tab adds 10 %), the meter-to-board feeder, the
  switched conductor between a switch and its lights (switches are not paired with lights), derating for
  circuits sharing a conduit or hot places, short-circuit and earth-fault checks. Wall thickness only enters as
  the short tie from a box on the wall's face to its centreline.

The Electricity section lists the boards as a tree (sub-boards under their parent). Each board shows what feeds
it and what it feeds (layers, or areas grouped by layer, with *+ Sub-board in it* for one in its enclosure), and
its circuits, numbered, with their names editable in place: *+ Circuit* (lighting, general sockets or special, and
which of its layers) asks a name and appends it, picked; an automatic one can be *Kept* as a circuit of its own;
*Move to…* sends one to another board; × deletes one, sending its points back to being grouped automatically.

*Select* (`V`) picks a board or point (Shift adds, or drag a box) to set it in the Electricity section (a board's
name, supply, what feeds it and what it feeds; a point's height, power and circuit), and drags it along its wall or
to another. Click a cable run to pick the point it feeds, then drag a stretch of it sideways or one of its bends to
run it another way; *Route along the walls* goes back to the worked-out way. The boards, switches, lights and
sockets also stand in the Exterior tab and the elevations, at their heights. These are usual sizes, not a signed
design: a registered electrician sets the real one.
## Plumbing

The **Plumbing** tab is the water supply, the hot water and the drains, drawn over the floor shown (faded, its
fixtures with it). Heating, cooling and ventilation are the [HVAC](#hvac) tab's: their pieces show faded here, joined
to the plumbing where they need it. Nothing about the house is assumed: the pipes are worked out from the fixtures on the Floor
tab and from the equipment you put down here, so a house on the mains, one with a well and a tank on a tower, one
with a cistern and a pressure pump, one on the sewer and one with a biodigestor are all drawn the same way.

### The library

The left column lists every piece, in three groups. Click one and click where it goes, or drag it onto the plan;
pieces that stand against a wall back up to the nearest one (*Snap*, or `Alt` while placing). Each item shows how
many the visible layers hold and what a new one is rated at. What is drilled, buried or on the ground outside (the
mains and sewer connections, the well and its pump, the cistern, the grease trap, chambers, septic tank,
biodigestor and soakaway) goes on the ground floor only: upstairs it is greyed out, and one found there is flagged.

| Group | Pieces |
|---|---|
| **Water supply** | Mains water, well, well pump, cistern, water tank, pressure pump, filter / softener, manifold, tap. |
| **Hot water** | Gas and electric water heaters. (A combi boiler is the HVAC tab's; it makes hot water for the plumbing too.) |
| **Drains & waste** | Floor drain, grease trap, inspection chamber, septic tank, biodigestor, soakaway, sewer connection. |

### What is worked out from it

- **Water** runs through whatever stages are on the plan, in this order: a source (mains or well) → well pump →
  cistern → tanks → pressure pump → filter → manifold. The last of them feeds every fixture that takes cold water,
  and the water heaters. Mains Ø25 (a pipe feeding three points or more), branches Ø20. Several tanks (or cisterns)
  are linked one to the next — the nearest to the stage before is fed and the rest hang off it — and all count in
  the reserve.
- **Hot water** comes from the water heaters put down, and from any boiler on the HVAC tab, each fed with cold water,
  each feeding the fixtures nearest it. Sinks, bathtubs, showers and bidets take hot water; toilets, washers and dishwashers cold only; an
  outdoor sink only when it stands in an indoor room (a laundry).
- **The HVAC's pieces** meet the plumbing where they need it: a boiler is fed cold water and makes hot water, a
  heat pump is filled from the cold water, a split unit's condensate runs (Ø20) to the nearest floor trap, or out
  through the nearest wall. The Plumbing section's *HVAC* line says which; their own pipes are the HVAC tab's.
- **Drains**: each fixture but a toilet drains (Ø50) into its room's floor trap; a kitchen sink and a dishwasher
  always get a trap of their own (never the bathroom's), or go through a grease trap when there is one. Every
  fixture also has its own trap (siphon) and, per supply, a flexible connection with an angle valve, so it can be
  worked on. The traps, toilets and floor drains run into the building's main (Ø110
  once a toilet is on it), which leaves each building at an inspection chamber — one you put down near it, or one
  worked out outside the wall facing the waste — and runs on to the nearest sewer connection, septic tank or
  biodigestor, whose treated water goes to a soakaway. Each building's main is vented through its roof, and the
  longest drain, falling 2 %, says how deep it arrives.
- **Pipes** are routed square to the walls (the house may be turned on the plan), each branch teeing off the
  nearest pipe already laid: a suggestion to cost and check the installation, not an installer's design. The supply
  is dashed blue, cold water blue, hot water red (drawn beside the cold), drains brown (the main solid and heavier,
  a condensate line thin and dotted), each with its size. Horizontal runs are laid on the ground floor
  and rise to a floor above (a circle crossed marks where).

### Moving and resizing

*Select* (`V`) picks a piece (`Shift` adds, or drag a box round several), drags it to another place (it backs up to
a wall where that suits it), `R` turns it and `Del` removes it. Hovering a pipe, a fixture's point, a floor trap or
a chamber says what it is.

The **Selection** section changes the selected piece, like the Floor tab's: its type (a gas heater for an electric
one, a septic tank for a biodigestor), its size, how it is turned, and **what it is rated at** — the litres a tank
or heater holds, the heat a boiler, heat pump or radiator gives, the water a pump moves, the circuits a manifold
runs. Size and rating are one and the same: resizing a piece re-rates it (rounded to the sizes it is sold in), and
typing a rating resizes it. A radiator's output follows its length; a tank's litres its footprint.

### Pipes and materials

Click a pipe to pick it: the Selection section says what it is and where it runs, and sets what its whole network
is made of — a house runs one material per network: polypropylene (thermofusion), PEX or copper for the cold and the
hot water, PVC or silent polypropylene for the drains (also in the Plumbing section's *Pipes*); the heating's is set
on the HVAC tab.
When the pipe is the branch to a fixture, it also sets that fixture's own plumbing: its connections (braided metal
or plastic hoses) and its trap (chromed metal or plastic). Prices were seen for polypropylene water pipe and PVC
drains; the other materials and the fixtures' fittings are counted and priced on site.

### What it tells you

The **Plumbing** section sums up the installation (the water's way through the plan, the reserve against a day's
use, the hot water, the heating, the cooling, the waste), lists each room's fixtures and what it all takes with its
price, the same rows as the Materials tab's plumbing chapter. It warns when something is missing or wrong: nothing
supplying the water, a well with no pump, hot-water fixtures with no heater, a reserve or a heater or a treatment
too small for the people the house is for (counted from its beds, 200 l a person a day), radiators with nothing to
feed them, more indoor split units than outdoor ones, drains ending nowhere, no soakaway after a septic tank or
biodigestor, a well within 15 m of either, a piece that belongs outdoors standing inside a building, or a drain
arriving more than 1.2 m deep. *Show* hides each kind of pipe, the sizes, the labels or the HVAC's pieces.

## HVAC

The **HVAC** tab is the heating, the cooling and the ventilation, laid out as the Plumbing tab is: its library on
the left (*Heating*: boiler, heat pump, radiator, underfloor manifold; *Cooling*: split indoor and outdoor units;
*Ventilation*: extractor fan, range hood), the floor shown faded under what it works out, and its Selection, HVAC,
Show and Layers sections on the right. The plumbing's pieces show faded, with the pipes that join them to the HVAC.

- **Heating**: the boilers and heat pumps feed the radiators and underfloor manifolds through flow and return pipes
  (Ø20, drawn as two amber lines) routed square to the walls. *Radiant floor* (in the bar) marks a room's floor as
  heated — click a named room, click again to take it off: its loops (every 0.20 m, at most 15 m² each, 60 kcal/h
  per m²) are hatched in it, with their lead to the nearest underfloor manifold on its floor.
- **Cooling**: each indoor split unit is joined by refrigerant lines (violet) to the nearest outdoor unit; an outdoor
  unit can serve several up to its rating. Split units heat as well as cool, so they count for both.
- **Ventilation**: each extractor fan and range hood is ducted (grey) to the nearest outside wall.
- **Loads**: each room wants about 40 kcal/h of heat and 50 frig/h of cooling per m³ of it (its floor inside the
  walls times its walls' height). Rooms big enough on screen show what they have against what they want (green when
  met, amber when short); the HVAC section lists every room (click one to select it). A bathroom, toilet or laundry
  with no window needs an extractor. Two areas drawn in one outline (a wall between them not closed) are counted as
  one room, and said so.
- **Links**: a boiler also makes the house's hot water and a heat pump is filled with water — the Plumbing tab
  feeds them; a split's condensate drains into the Plumbing tab's traps; most pieces need a suitably rated point and
  circuit on the Electricity tab. Each piece's Selection says which.

*Select* (`V`) picks a piece, a pipe, line or duct, or a room: a piece's size and rating as on the Plumbing tab; a
heating pipe's material (PEX, copper or polypropylene, for every heating pipe and radiant loop); a room's volume,
loads, what heats and cools it, its radiant floor and its ventilation. `Del` removes pieces only, never a room.
The section warns about what is missing or wrong: emitters with nothing to feed them, radiant rooms with no
manifold, a manifold with fewer circuits than loops, sources giving less than the emitters want, rooms short of heat
or cooling, indoor units with no or too small an outdoor unit, wet rooms with no window or extractor. Its rows are
the Materials tab's HVAC chapter: each piece with its rating, heating pipe (counted twice, flow and return), the
radiant floors (priced per m²), their loop pipe and board, refrigerant lines and ducts.

Equipment goes on the active layer, and shows in 3-D on the [Exterior](#exterior) tab and on the elevations. The well's drilling and pump, a cistern, a soakaway and the mains and sewer
connections are counted but priced on site; the rest is priced from the catalogue, scaled by what each piece is
rated at.

## Roof

The **Roof** tab is the roof plan: the floor plan faded, and the roofs over it. A roof is an outline (what it
covers, usually the walls' outside faces) on a layer, and its eaves stand an **overhang** beyond it. Its type:

| Type | |
|---|---|
| **Flat** | A 0.20 m slab, level, with a parapet round its edge (0.30 m unless set; 0 for none). |
| **Shed** | One slope, rising away from one side. *Turn the slope* moves the low side round the outline. |
| **Gable** | Two slopes meeting at a ridge along one side's direction; the other sides are gable ends. *Turn the ridge* runs it the other way. |
| **Hip** | A slope from every side, meeting at hips and a ridge. It needs a convex outline: draw an L-shaped house as two overlapping roofs (the panel warns otherwise). |
| **Pergola** | No slab: timber rafters (0.07 × 0.20 m, every 0.60 m) on the beams of the open edges under it, running down its slight slope (2° unless set); with a *Covering* they carry a thin sheet of it (*Polycarbonate* lets the light through and casts no shadow), without one it is open. For a carport or a garden pergola: enclose the area with open edges (columns where no wall holds them, or a colonnade for timber, steel or stone columns along them), name it, and draw a pergola over it; *Fit to the walls* (Roofs section) then brings its sides that run along a wall (a boundary wall, the house, on any layer, within 1.5 m) to that wall's face, so it sits between them, and puts its overhang on its free sides only. |
| **Glass** | A greenhouse's roof: no slab, but galvanized steel glazing bars (0.04 × 0.06 m, every 0.75 m) on the beams of the open edges under it, running down its slope (10° unless set), under glass. *Grow lights* (Roofs section) hangs rows of LED grow lights 1.2 m apart, level, 0.35 m under the bars, drawn dashed pink on the roof plan; their diodes glow. For a lean-to greenhouse against a wall: draw its other sides as open edges with *Glazed* columns, draw a glass roof over it sloping down away from the wall (*Turn the slope*), and *Fit to the walls* to bring its high side to the wall's face; set its height and pitch so the high side meets the top of the wall. |

- **Roof the house** covers the active layer's covered areas out to the walls' outside faces (0.15 m past the
  centrelines), as high as their tallest wall: one roof of the type picked under *New roofs* per group of rooms
  that touch, and apart from them, so it can have its own pitch, a nearly flat shed (2°) per group of galleries
  (bounded by walls and open edges), sloping down away from the house and tucked 0.1 m under the top of its walls,
  under the house's eaves. A gallery's roof overhangs 0.5 m on its open sides only (drawn into its outline): along
  the house it stops at the face of the house's walls. Each wall stops at the underside of the roof over its middle
  (the highest one whose outline it is in, or the lowest overhang over it) where that is lower than its top, all
  along it: a gallery's end walls stop under its roof.
- **Roof** (`R`) draws one: click its corners (they snap to the plan's points and lines; `Shift` keeps 45°), then
  click the first corner or press `Enter`. `Backspace` takes a corner back, `Esc` cancels.
- **Select** (`V`): click a roof (`Shift` adds), drag it to move it, drag a corner of a selected roof to reshape
  it, `Delete` removes it. The Roofs section lists the roofs and sets the selected one's type, **pitch** (in
  degrees; the slope in % is shown), **height at the walls** (its underside where it crosses the outline at an
  eaves side, 2.70 m by default), overhang and parapet, with the area it covers, its own sloped area, and the
  heights of its eaves and top; and what it is made of: its **covering** (standing seam or corrugated metal,
  membrane, a green roof, gravel, concrete; on top and a pitched roof's fascia) and its **soffit** (its underside:
  under the eaves and over a gallery, in wood, plaster or concrete). In 3-D standing seam is drawn as 0.45 m panels
  with raised seams running down each slope; the roof plan tints a covered roof in its colour. **Skylights**: a
  number of glazed strips, each the width set, evenly spaced along the roof's eaves side (a shed's low edge) and
  running across it, 0.50 m in from its outline (on a gable, one opening each side of the ridge); in 3-D the slab is
  open there with glass halfway through it, so the sun falls through onto the floor, and the roof plan shows them.
- The roof plan shades each slope by the way it faces, with an arrow down it, the eaves line solid and the walls'
  line dashed under an overhang, and a label with the type, pitch and top. New roofs start with their slopes
  running off the outline's longest side, 25° (shed 10°) and a 0.50 m overhang (flat: none).

Roofs do not follow the walls: move a wall and redraw or reshape the roof. The chimneys of fireplaces show where
they come up through the roofs.

## Elevations

The **Elevations** tab draws the four facades from the same 3-D model as the Exterior tab, so they follow the
floor plan and the roofs as you change them. The views are square to the house's main walls (their directions,
weighted by length), and each is named by the compass direction it faces, from the plan's north (for example
North-west). Faces are drawn as on paper, the farthest first so nearer ones cover them, with the ground line,
level marks (±0.00, the tops of walls, the eaves and tops of roofs) and the overall width. *All four* shows them
together; click one to open it, and *Save SVG* downloads it as a standalone drawing. The **Layers** checkboxes
hide a layer everywhere (an undoable change), for example the boundary wall that would stand in front of the house.

## Exterior

The **Exterior** tab shows the house in 3-D, built again from the visible layers on every change (undo works
across tabs):

- walls at their thickness and height, cut by their doors, windows and gates, with the wall over each door and
  window and under each window; doors are 2.10 m tall unless given a height of their own (Selection panel; up to their wall's, with no wall over them then) and windows reach 2.10 m and sit on a 0.90 m sill (awnings on
  1.50 m) unless given a *Top* and *Sill* of their own (Selection panel: a top up to the wall's, a sill down to 0 for
  glass from floor to ceiling), gates are as tall as their wall (1.80 m in a fence drawn as an open edge);
- frames, glass and closed door and gate leaves;
- the floor of every named area (tiled under cover, paved where outlines bound it: a pool, a terrace; a lot only
  when it has a ground cover), in its material when it has one;
- the roofs from the Roof tab, with the walls that face outside filled up to the roof over them (gable ends), and a
  wall between rooms under different roofs filled up to the higher one (a double-height room beside a lower one); a
  wall with no roof of its own layer over it and no floor built over it rises to a roof drawn on a floor above (a
  double-height room roofed from the 1st floor), and so does a fireplace's chimney;
- open edges under a roof as beams following its underside, on columns where no wall holds them, and colonnades
  with their columns;
- fireplaces, with their chimneys through the roof;
- the Electricity tab's boards, switches, light outlets and sockets, on their walls, ceilings and floors at their
  heights: white plates and boxes with a grey rocker, socket face or breaker window, light fixtures glowing, floor
  sockets as metal lids, floor lights flush in the ground or on their post (look in with *Roof* off or *Up to*, and zoom towards a wall).
- the Plumbing and HVAC tabs' equipment at its real size, where it is fitted: a water tank on the roof over it on a
  concrete base (on a steel tower where no roof is), water heaters and outdoor units on the ground (a gas heater
  with its flue, an outdoor unit with its fan), a boiler, a split unit, an extractor and manifolds on the wall at
  their usual heights, radiators low on the wall, a range hood over the cooker, a tap on its post, a well's head and
  its pump, a meter box; of what is buried (a cistern, a septic tank or biodigestor, chambers, a soakaway, the sewer)
  only what shows at ground level, lids and a biodigestor's neck.

Its toolbar has the camera (*Aerial*, *Top* as the plan, and the four facades by the plan's north), *Roof* to hide
the roofs and look into the rooms (a tank on a roof goes with them), *Equipment* to hide the plumbing and HVAC
equipment, *Up to* (with upper floors) to hide the floors over the one picked and look into
it from above (remembered per browser), the sun's season and time (the same as the Floor tab's Sun section, with its site and
cloudiness) and *Save image* (a PNG at twice the screen resolution). Drag to orbit, right-drag to pan, wheel to
zoom: towards what is under the cursor, 15% of the way per notch but at least 0.40 m, so it keeps going close up
and carries on through when it gets there; the point orbited stays at least 3 m ahead, and panning keeps at least
the speed it has 10 m away, so neither slows to a crawl when you are close. Finished walls and floors are drawn in their materials (see [Materials](#materials); brick, wood and lawn
with a texture and relief); the rest is a fixed basic palette. three.js loads only when the tab opens.

## Materials list

The **Materials** tab lists what the house needs to be built, worked out from the visible layers (the *Layers*
checkboxes leave out the street or a neighbour's lot), in the chapters of an Argentine *cómputo métrico*:
earthworks and foundations, concrete structure, masonry, damp-proofing and insulation, plaster and paint, sub-floors
and screeds, floors and skirting, wall finishes, ceilings, roofing, doors and windows, glazing, metalwork and timber,
electrical installation, pools, fixtures, garden, and the basic materials. Each row has its quantity and unit, its unit price and cost,
pools, plumbing, HVAC, fixtures, garden, and the basic materials. Each row has its quantity and unit, its unit price and cost,
where it is used and how it was worked out. *Language* shows it in English or Spanish (Argentine building terms,
numbers as 1.234,5); the choice is kept per browser. *Save CSV* downloads it for a spreadsheet, in the language
shown (in Spanish with semicolons and decimal commas, as a spreadsheet set to Argentina reads it).

- **Measured** from the plan and the 3-D model: each side of each wall net of its openings and up to the roof
  over it (gable ends included), floors inside the walls, skirting along the rooms' walls, roof slopes, doors,
  windows and gates by size, glass by what holds it, columns, beams, railings, pools (lining, shell, dig), fixtures
  and plants.
- **From the Foundation tab**: footings, ground beams, piles, pad footings or the raft, with each wall's size
  set there or worked out from it (see [Foundation](#foundation)).
- **From the Electricity tab**: each board's circuits' cable (by section; line, neutral and earth of the same
  section share one row; the three-core subterranean cable apart), conduit by kind (walls and ceilings, floor,
  buried pipe; only light corrugated 3/4" has a local price), boxes, switches, sockets and breakers, and its main breaker, RCD and
  enclosure (a sub-board in its parent's enclosure adds its breakers there, with no box of its own); one earth rod per board fed straight from the meter (a sub-board's comes with its feeder) (see
  [Electricity](#electricity)).
- **From the Plumbing tab**: water and drain pipe by size and material along its routes, fittings, valves, each
  fixture's connections and trap, every piece of equipment put down with what it is rated at and the room it stands
  in, the floor traps and chambers worked out, and the trench for what is buried outside (see [Plumbing](#plumbing)).
- **From the HVAC tab**: its equipment, heating pipe, radiant floors, refrigerant lines and ducts (see [HVAC](#hvac)).
- **Assumed** behind them, by what each wall separates and how thick it is: a wall between a room and the outside
  (an indoor space counts when it is named or has a roof or a floor over it) is an insulated double wall when 25 cm
  or more (12 cm solid brick, cavity, 5 cm EPS, vapour barrier, 8 cm hollow brick), else 18 or 12 cm hollow brick;
  a partition is 18, 12 or 8 cm hollow brick; a wall with nothing indoors on either side (a boundary or garden
  wall) is solid brick, 24 or 12 cm, in facing brick when finished in brick. Ground-floor walls have a damp-proof
  course; load-bearing ones have a ring beam on top and tie columns at most 4 m apart. Slabs (upper floors, flat roofs) are joist and block slabs; ground floors are 12 cm
  of lean concrete on polyethylene, every built floor a 3 cm screed. Unfinished wall sides are counted as plastered
  and painted, unfinished floors and roof coverings as "not chosen".
- **Basic materials**: cement (50 kg bags), hydrated lime (25 kg bags), sand, gravel and rubble from the usual
  dosages of each mortar and concrete; rebar at 90 kg per m³ of reinforced concrete.

- **Prices**: retail in the Buenos Aires area (AMBA), in pesos with VAT, materials only (no labour), from the
  sources noted in `src/model/prices.ts` (hover a unit price for how it is sold and where it was seen; ≈ marks an
  estimate). Only rows that are bought as they are have a price: work rows (a wall's m², a footing, plaster) take
  their materials from the rows that are, so nothing is counted twice; doors, windows and gates are priced per m²
  of opening, glass included. Each chapter shows its subtotal and the list its total, also in dollars at the MEP
  rate of the day the prices were seen.

The build-ups, rates and dosages are constants at the top of `src/model/takeoff.ts` (the foundation's in
`src/model/foundations.ts`, the plumbing's in `src/model/plumbing.ts`), the words in `src/model/takeoffText.ts` and the prices in `src/model/prices.ts`. A
structural design will change the concrete. Prices go stale quickly: update them with their date.

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
| `R` | Turns the furniture being placed, or the selected furniture, a quarter turn. |
| `F` / `G` / `S` | Fit the plan / toggle the grid / show or hide the sun. The other view toggles are in the View section. |
| `Ctrl+Z` / `Ctrl+Y` | Undo / redo (`Ctrl+Shift+Z` also redoes). |
| `Ctrl+S` / `Ctrl+Shift+S` / `Ctrl+O` | Save / save as / open. |

These keys work on the Floor tab; on the Roof tab `V`, `R`, `M` and `H` pick its tools; on the Electricity tab
`V`, `B`, `S`, `L`, `O`, `M` and `H`; and on the Plumbing and HVAC tabs `V`, `M` and `H`, with `R` to turn and the
library to arm the Place tool (see [Plumbing](#plumbing), [HVAC](#hvac)). The Selection panel shows a line's length
(edit it to resize the line: the end with fewer other lines on it
moves), its angle and type (wall, open edge or outline), a wall's thickness and height and the material of each
side, for several lines their total length and, when they form one closed outline, its area, and for an area its
name, floor area, floor material and boundary. A click on a thick wall's face picks it, not only on its centreline.

## Files

A plan is one JSON file with the base image embedded, so it is self-contained:

- `site`: `north` (degrees clockwise from straight up on the plan), `latitude`, `longitude` and `utcOffset`, for
  the sun.
- `plumbing` (optional): `materials` (`cold`, `hot`: `ppr`, `pex` or `copper`; `drain`: `pvc` or `pp`; absent:
  polypropylene and PVC) and `fixtures` (keyed `layer:id` of a fixture → `connection` and `trap`, `metal` or
  `plastic`; absent: metal connections, plastic traps).
- `hvac` (optional): `materials.heating` (`pex`, `copper` or `ppr`; absent: PEX).
- `image`: the photo as a data URL, its placement (`cx`, `cy`, `rotation`, `scale` in meters per pixel), crop,
  opacity and the known lengths used to calibrate it.
- `layers`: each with an optional `level` (its floor level in m) and `storey` (its floor, 1 to 3; absent for the
  ground floor), `vertices` (id → `{x, y}` in meters, +y down), `segments` (id → `{a, b}` vertex ids, plus
  `kind: "open"` for an open edge or `"outline"` for an outline, a wall's own `thickness` and `height` in
  meters when set (without them it is automatic and 2.70 m), and an open edge's `colonnade` (`{style, spacing}`,
  `style` `roman`, `metal`, `timber` or `glazed`, `spacing` the most its columns stand apart in m), and a wall's `finish` (`{left,
  right}`, the material ids of its two sides looking from `a` to `b`, either left out when unfinished)), `areas`
  (id → `{name, at, floor, lot, radiant}`, `at` being a point inside the area, `floor` its floor's material id when
  set, `lot: true` for the land of a lot, `radiant: true` for a room heated by a radiant floor) and
  `openings` (id → `{kind, style, segment, offset, width, hinge, swing}`: `kind` is `door` (styles `single`,
  `double`, `sliding`), `window` (`fixed`, `sliding`, `double-hung`, `awning`, `casement`), `gate`
  (`single`, `double`, `sliding`) or `fireplace` (`masonry`); `offset` is the centre's distance from the segment's `a` end, `hinge` the
  end a single leaf hangs from (a sliding gate: the end it slides towards), `swing` the side it opens or
  slides to (a fireplace: the side it stands on) looking from `a` to `b`; a door may have its own `height`, a window
  its own `height`, its top, and `sill`, in m above the floor), and `roofs` (id → `{outline, type, pitch, height, overhang, edge,
  parapet}`: `type` is `flat`, `shed`, `gable`, `hip`, `pergola` or `glass`, `pitch` in degrees, `height` the underside at the
  outline in meters, `edge` the outline side a shed slopes down to or a gable's ridge runs along; a glass roof's
  `lights: true` hangs grow lights under it), and
  `furniture` (id → `{kind, style, at, angle, width, depth}`: `kind` is `counter` (style `island` for a kitchen island, none against a wall), `sink` (`outdoor`, `kitchen`,
  `bathroom`), `appliance` (`fridge`, `dishwasher`, `oven`, `washer`, `dryer`), `bathtub` (`alcove`, `clawfoot`, `drop-in`, `corner`, with `shower`, the shower head's place
  round the rim from 0 to 4), `shower` (with `shower` too), `toilet`, `bidet`, `bed` (`single`, `double`, `queen`, `king`), `sofa`
  (`armchair`, `loveseat`, `three-seater`, `sectional`, with `mirror` for a sectional's return on its left), `table` (`square`, `circle`, `coffee`), `chair` or `stair`; `at` is its
  centre and `angle` its turn in degrees, clockwise; a kitchen sink has `counter` and `offset` (its centre's
  distance from the counter's left end) instead of `at` and `angle`), and `electrical` (id → a board, switch, light
  or socket: `kind`, `mount` (`wall`, `ceiling` for a light, `floor` for a light or a socket), `at`, `angle` and an optional
  `height` (a floor item's box is in the floor, whatever it says), an optional `route` (the plan points the cable feeding it passes through), a point's optional `circuit`
  (a circuit id; new ones are unique in the plan, so it names one circuit on whichever board holds it), a light's or socket's optional `power` in W, a floor light's optional `post` (m; absent or 0: flush in the ground) and a socket's `use` (`general`, `special`); a
  board's `name`, `supply` (`biphasic`, `triphasic`), `layers` (a main board's), `areas` (`{layer, area}`, a
  sub-board's), `circuits` (id → `{type, name, layer}`, `type` `lighting`, `sockets` or `special`, in the order
  they were added), `parent` (`{layer, board}`, a sub-board's) and `integrated: true` for a sub-board in its
  parent's enclosure), and `services` (id → `{kind, at, angle, width,
  depth}`, the plumbing and thermomechanical equipment put down on the Plumbing tab: `kind` is one of
  `mains-water`, `well`, `well-pump`, `cistern`, `tank`, `pump`, `filter`, `manifold`, `tap` (with `hot: true` for
  hot water too), `heater-gas`, `heater-electric`, `boiler`, `heat-pump`, `radiator`, `underfloor-manifold`,
  `split-indoor`, `split-outdoor`, `extractor`, `range-hood`, `floor-drain`, `grease-trap`, `chamber`, `septic`,
  `biodigestor`, `soakaway` or `sewer`; what each is rated at follows its size; the Plumbing tab lists some, the HVAC
  tab the rest). Material ids are those of the catalogue in
  `src/model/materials.ts`; one it does not know is kept but drawn plain. Files saved before areas, openings,
  styles, wall thicknesses, roofs, furniture, materials, electrical items or service equipment existed open
  unchanged (older openings read as single doors and fixed windows, older walls as automatic, the service points of
  the first Plumbing tab become equipment of their catalogue size, and a heating material saved with the plumbing
  moves to `hvac`).

In Chrome and Edge *Save* writes back to the file you opened; elsewhere it downloads. The latest state is also
autosaved in the browser (IndexedDB), so a reload never loses work. Loading validates the file and reports the
exact field of any problem; `schemaVersion` with migrations (in `src/model/planFile.ts`) covers future format
changes.

## Code

- `src/model/`: pure TypeScript, no React or DOM, unit-tested. `plan.ts` (schema and types), `planFile.ts`
  (parse, validate, serialize), `edit.ts` (immutable edits), `regions.ts` (the outlines lines enclose, which
  walls face outside, floor areas inside the walls, area label points), `walls.ts` (wall thickness and height,
  walls drawn at their thickness with their joints), `openings.ts` (doors, windows, gates and fireplaces laid out on their walls, where a new one goes),
  `colonnades.ts` (column styles and where columns stand), `furniture.ts` (the furniture catalogue, where pieces
  stand and snap, their plan symbols), `furniture3d.ts` (furniture in 3-D), `materials.ts` (the materials
  catalogue, which suit which surfaces, outdoors or in), `finishes.ts` (a wall's two sides, what each faces),
  `faces.ts` (the flat faces solids are made of), `takeoff.ts` (the materials list and its build-ups),
  `foundations.ts` (the foundation plan), `wallUse.ts` (what each wall separates), `electrical.ts` (boards and
  points, where they go), `wiring.ts` (circuits, cable runs and sizes), `services.ts`
  (the catalogue of the Plumbing and HVAC tabs' equipment, its ratings, links and plan symbols), `routing.ts` (pipes
  and ducts routed square to the walls, the buildings, picking a run), `plumbing.ts` (the plumbing plan: the
  fixtures' points, the pipe routes, sizes and checks), `services3d.ts` (the equipment in 3-D), `hvac.ts` (the HVAC plan: circuits, radiant floors, lines,
  ducts, room loads and checks), `takeoffText.ts` (the materials list's words in English and Spanish),
  `prices.ts` (local prices),
  `sun.ts` (sun position, sunrise and sunset, shadows), `roofs.ts` (roof slopes, faces, eaves and the house's
  outline), `solids.ts` (the house in 3-D as solids of flat faces), `elevations.ts` (the facades from the
  solids), `snap.ts`, `pick.ts` (hit tests, loops),
  `baseImage.ts` (image placement, calibration, crop), `geometry.ts`.
- `src/state/`: the editor store (tab, undo history, gestures, selection, tool, view), `derived.ts` (regions, wall
  thicknesses and shapes, placed areas, the covered area and the 3-D solids, cached per object), prefs, files and
  autosave, user-level actions.
- `src/ui/canvas/`: the SVG canvas. Each tool in `tools/` is a plain controller that gets pointer and key
  events and returns overlay data the canvas draws.
- `src/ui/panels/`: the Library (left) and View, Base plan, Layers, Selection, Areas and Sun (right).
  `src/ui/TopBar.tsx` is the tab row; `FloorTab.tsx`, `RoofTab.tsx` (with `canvas/Roofs.tsx` and
  `panels/RoofPanel.tsx`), `FoundationTab.tsx`, `ElectricityTab.tsx` (with `canvas/Electrical.tsx` and
  `panels/ElectricityPanel.tsx`), `PlumbingTab.tsx` and `HvacTab.tsx` (with `canvas/Plumbing.tsx` and
  `canvas/Hvac.tsx` for what each works out, `canvas/Services.tsx` for the equipment of both, and the
  `ServiceLibraryPanel`, `ServicePanel`, `PlumbingPanel` and `HvacPanel` sections) and `ElevationsTab.tsx` lay out
  those tabs.
- `src/ui/exterior/ExteriorTab.tsx` and `src/render/`: the Exterior tab and its three.js engine (lights from the
  sun, shadows, camera presets), house meshes and `textures.ts` (brick, wood, lawn and checkered textures and
  their relief, painted on canvases once a session), adapted from the Forge H1 planner's render tab and loaded on
  demand.
