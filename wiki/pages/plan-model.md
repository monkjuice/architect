---
title: Plan model and file format
type: component
summary: "The saved plan: a zod schema in src/model/plan.ts (format \"architect/plan\", schemaVersion 1, meters with +y down, the site's north and location for the sun, per-layer vertex/segment graphs with segment kinds, optional wall thickness and height, wall-side finishes and open-edge colonnades, named areas (rooms, or lots of land) with optional floor finishes, styled doors/windows/gates/fireplaces hosted by segments, drawn roofs and free-standing furniture with kitchen sinks kept in counters, embedded base image), with parsing, migrations and serialization in planFile.ts."
tags: [model, file-format, schema, site, walls, roof, colonnades, fireplace, furniture, finishes, lots, levels]
sources: []
updated: 2026-11-07
---

# Plan model and file format

## Key files

- `src/model/plan.ts`: the zod schemas (`PlanSchema`, `LayerSchema`, `SegmentSchema`, `AreaSchema`,
  `OpeningSchema`, `BaseImageSchema`, …), the types inferred from them, `createPlan`, `createLayer`, `segmentKind`,
  `SEGMENT_KINDS`, `ROOF_TYPES`, `RoofSchema`, `FurnitureSchema`, `Ref` (a selectable segment, vertex, area,
  opening, roof or piece of furniture),
  `refExists` (used by the store to prune the selection) and `checkIntegrity`.
- `src/model/planFile.ts`: `parsePlanText` / `parsePlan`, `MIGRATIONS` and `serializePlan`.
- `src/model/edit.ts`: the immutable edits ([Code conventions](code-conventions.md)).

## Shape

- Top level: `format: "architect/plan"`, `schemaVersion: 1`, `name`, `site`, an optional `image` and `layers` (at
  least one). All objects are strict, so unknown keys are rejected.
- `site` (`SiteSchema`): `north` (degrees clockwise from plan-up to true north), `latitude`, `longitude` (north and
  east positive) and `utcOffset` in hours; `DEFAULT_SITE` is Buenos Aires with north 0. `updateSite` in `edit.ts`
  returns the same plan when nothing changes ([Sun and shadows](sun.md)).
- World units are meters, with +x to the right and +y down (as in SVG).
- Each layer is a small graph: `id`, `name`, `color` (`#rrggbb`), `visible`, `locked`, `vertices` (id → `{x, y}`)
  and `segments` (id → `{a, b}` vertex ids). Lines that share a vertex are connected, and connections exist only
  within a layer ([Snapping and connections](snapping-and-connections.md)). An optional `level` (0 to 20 m; the UI
  keeps a ground-floor layer at 3 m or less, set through `LayerPatch`) raises the layer's floor above the ground on
  a plinth with steps ([House solids](house-solids.md)), or, with an optional `storey` (1–3, since 2026-11-07), puts
  it on a floor above, on a slab ([Floors](storeys.md)).
- A segment may carry `kind: "open"` (an open edge) or `kind: "outline"` (a ground-level edge such as a pool).
  Without the key it is a wall ([Open edges and outlines are segment kinds](segment-kind-not-layer.md)).
- A segment may also carry a positive `thickness` and `height` in meters, used only while it is a wall. Vertices
  are wall centrelines. Absent thickness is automatic (0.30 m facing outside, 0.15 m inside), absent height
  2.70 m; the automatic value is never stored ([Walls](walls.md)).
- A segment may carry `colonnade: {style, spacing}` (`COLUMN_STYLES`: `roman`, `metal`, and since `acdb212`
  `timber`), used only while it is an
  open edge ([Colonnades](colonnades.md)).
- A segment may carry `finish: {left?, right?}`, material ids for its two sides named looking from `a` to `b`, used
  only while it is a wall; an area may carry `floor`, a material id. Ids are not checked against the catalogue
  ([Materials and finishes](materials-and-finishes.md)).
- `areas` (id → `{name, at, floor?, lot?}`): named points whose outline is computed from the layer's lines, never
  stored ([Areas](areas.md)). `lot: true` marks the land of a plot, not a room ([Lots](lots.md)).
- `openings` (id → door, window, gate or fireplace): a zod `discriminatedUnion` on `kind` (`DoorSchema`,
  `WindowSchema`, `GateSchema`, `FireplaceSchema`). Each has a `style` from `DOOR_STYLES` / `WINDOW_STYLES` /
  `GATE_STYLES` / `FIREPLACE_STYLES` and the common fields `segment`, a centre `offset` from the segment's `a` end,
  `width`, `hinge` (for a sliding gate: the end it slides towards) and `swing` (for a fireplace: the side it stands
  on) ([Doors, windows and gates](doors-and-windows.md), [Door, window and gate styles](opening-styles.md),
  [hosted by a segment](openings-hosted-by-segment.md)). A fireplace cuts no gap ([Fireplaces](fireplaces.md)). A
  door may carry its own `height` (positive, at most 6 m; absent = `DOOR_HEAD` 2.10 m), set through `OpeningPatch`.
- `roofs` (id → `RoofSchema`: `outline`, `type`, `pitch`, `height`, `overhang`, `edge`, `parapet`, and optional
  `finish` and `soffit` material ids and `skylights: {count, width}`): outlines drawn on the Roof tab, independent of the lines, so they do not
  follow moved walls ([Roofs: model and geometry](roofs.md)).
- `furniture` (id → `FurnitureSchema`, a union on `kind`: counter, sink, bathtub, shower, toilet, bidet, bed, sofa,
  table, chair, with sinks a nested union on `style`): standing pieces have `at`, `angle`, `width`, `depth` (bathtubs
  and showers also `shower`; a counter may have `style: 'island'`, absent = against a wall; a sofa an optional
  `mirror`, which puts a sectional's return on the left); a kitchen sink has `counter` and
  `offset` instead of a position ([Furniture and fixtures](furniture.md),
  [Furniture stands free](furniture-free-standing.md)).
- Ids: `v1`, `v2`…, `s1`, `s2`…, `a1`, `a2`…, `o1`, `o2`…, `r1`, `r2`… and `f1`, `f2`… within each layer (`nextId` in `edit.ts`), and `L1`,
  `L2`… for layers (`addLayer`). A new plan has one layer, `L1` "Walls".
- `image`: `src` must be a `data:image/` URL, because the photo is embedded so that the file is self-contained. It
  also holds the natural `width`/`height`, the placement (`cx`, `cy`, `rotation` in radians, `scale` in m/px), an
  optional `crop` in image pixels, `opacity`, `visible`, `locked` and `calibration` (known lengths, with ends in image
  pixels). See [Base image placement and calibration](base-image-calibration.md).
- Not in the plan: the open tab, active layer, tool, line kind to draw, opening style, furniture or material to place, roof type to draw,
  view, selection and prompt (editor state), and the sun's season, time, cloudiness and shadows, the View section's
  toggles and the Exterior's roof toggle (per-browser prefs). See [Editor store and state](editor-store.md). The 3-D
  Exterior and the Elevations are derived from the plan; roofs and finishes are the only 3-D data it stores.

## Loading

`parsePlan` checks, in this order:

1. `format`.
2. An integer `schemaVersion` of at least 1 that is not newer than the app's.
3. Each `MIGRATIONS[v]` step from v to v+1.
4. `PlanSchema.safeParse`.
5. `checkIntegrity`: duplicate layer ids, segments that point at missing vertices, segments whose two ends are
   the same vertex, openings on missing segments, and kitchen sinks whose counter is missing.

Errors name the exact field, with the ids of list items (`layers[0] (L1).vertices.v3.x: …`). The UI shows up to 12 of
them.

## Saving

`serializePlan` runs the plan through `PlanSchema.parse` again. This puts keys in schema order, and an invalid plan
throws, which `savePlan` reports and does not save. Vertex coordinates, opening offsets, roof outline points,
furniture `at` and kitchen-sink `offset` are rounded to 0.1 mm
(1e-4 m) only here; edits keep full precision, and so do the image transform values. The output is 2-space JSON with a trailing newline.
The autosaved draft stores the same text.

## Changing the format

1. Bump `SCHEMA_VERSION`.
2. Add the N → N+1 step to `MIGRATIONS`.
3. Add a test that loads a version-N file.

`MIGRATIONS` is empty at version 1.

Additive changes that older files satisfy do not need a bump. Segment kinds (an optional key) and areas
(`z.record(…).default({})`) were added on 2026-11-02 at version 1: files saved before them parse with `areas: {}`,
and `planFile.test.ts` covers loading such a file. Saving such a file again writes `"areas": {}`. Openings
(`.default({})`) were added the same way in the third session. Opening styles came in the fourth session: `style`
defaults to `'single'` for doors and `'fixed'` for windows, which is how older openings looked, and `hinge`/`swing`
gained defaults on both kinds (`openings.test.ts` loads a pre-style file). Gates (a third union member, `style`
defaulting to `'single'`) came in the fifth session, also at version 1. `site` (`.default` of `DEFAULT_SITE`) came
in the sixth session at version 1; `sun.test.ts` loads a file without it. The `outline` segment kind (a second
value in the optional `kind` enum) came in the seventh session, also at version 1. Wall `thickness` and `height`
(optional segment keys) came after it, still at version 1: older files load with every wall automatic and 2.70 m
tall. Layer `roofs` (`.default({})`) came in the eighth session, also at version 1: older files load unroofed,
since the automatic roof was removed at the same time ([Roofs are drawn outlines](roofs-drawn-outlines.md)).
On 2026-11-04 the optional segment `colonnade` and the `fireplace` opening kind came, still at version 1
([Colonnades are an open-edge setting; fireplaces are an opening kind](colonnade-setting-fireplace-opening.md)).
Later that day layer `furniture` (`.default({})`) came, also at version 1, and then the optional segment `finish`
and area `floor`, and after them the optional area `lot` (`z.literal(true)`), all still at version 1. On
2026-11-05 the optional roof `finish` and `soffit` came, also at version 1, and on 2026-11-06 the optional layer
`level`, roof `skylights` and a fifth roof type, `pergola` (`59bcfa6`). On 2026-11-07 a third column style,
`timber` (`acdb212`), also at version 1, then layer `storey`, `level` up to 20 and the `stair` furniture kind.
