import { z } from 'zod'

/**
 * The plan model: everything the editor saves.
 *
 * World units are meters, +x to the right and +y down (as in SVG). The base image is placed in the world by
 * its own transform (see baseImage.ts). Each layer holds a small graph: vertices joined by segments. Lines
 * that share a vertex are connected, so moving that vertex moves every line on it. Connections exist only
 * within a layer; lines on different layers may touch but stay independent.
 *
 * A segment is a wall, an open edge (a porch front, a colonnade: the limit of a covered space, drawn dashed
 * like things overhead) or an outline (an edge at ground level with no height: a pool, paving, a deck, a
 * planter, drawn thin like things seen below the plan's cut). All three bound areas; they differ in how they are
 * drawn and counted, and only walls stand up (they cast shadows). Lines are drawn on their centrelines; a wall
 * stands its thickness around its line and its height tall (see walls.ts). An area is a named point: its outline is the region of its
 * layer's lines that encloses that point, worked out from the lines on demand (see regions.ts), so it follows
 * the walls as they move.
 *
 * Doors, windows and gates are openings hosted by a segment: they sit at a distance along it, so they follow it when
 * it moves, and they leave a gap in the line. They do not open regions: a room stays closed through its doors.
 * A fireplace is hosted the same way, against one side of a wall, but leaves no gap; its chimney goes up through
 * the roof. An open edge can carry a colonnade: columns shared out along it under a beam (or, glazed, steel posts
 * with glass between them: a greenhouse's sides).
 *
 * Walls are finished on each side and areas on their floors with materials (see materials.ts and finishes.ts).
 *
 * Furniture and fixtures (counters, sinks, appliances, bathtubs, showers, toilets, bidets, beds, sofas, tables, chairs) stand where they are put, turned to
 * an angle; a kitchen sink sits in a counter and goes where its counter goes (see furniture.ts).
 *
 * Roofs are outlines drawn over a layer's plan (the Roof tab), each with a type and slope (see roofs.ts). They do
 * not follow the walls: they are drawn to cover them.
 *
 * Plumbing and thermomechanical equipment (where the water comes from, is kept, pushed, heated and where the waste
 * goes) is put down by hand on the Plumbing tab, like furniture; the fixtures' own water and drain points and the
 * pipes between everything are worked out from them (see plumbing.ts).
 *
 * Each layer is on a floor (a storey): the ground floor, or one above it, standing on a slab at its level (see
 * storeys.ts). The canvas shows one floor at a time, over the floor below.
 *
 * Electrical boards, switches, light outlets and sockets stand where they are put on a wall, the ceiling or the
 * floor, like furniture (see electrical.ts); each board feeds the layers it lists, and the circuits, their cables
 * and the way those run are worked out from them (see wiring.ts), except the runs drawn by hand.
 */

/** Identifies the file format; checked before anything else when a file is loaded. */
export const PLAN_FORMAT = 'architect/plan'

/** Current schema version. Bump it and add a step to `MIGRATIONS` whenever the format changes. */
export const SCHEMA_VERSION = 4

const Num = z.number()
const Positive = z.number().positive()

export const VecSchema = z.strictObject({ x: Num, y: Num })

export const COLUMN_STYLES = ['roman', 'metal', 'timber', 'glazed'] as const

export const SegmentSchema = z.strictObject({
  a: z.string().min(1),
  b: z.string().min(1),
  /** Absent for a wall. */
  kind: z.enum(['open', 'outline']).optional(),
  /**
   * A wall's thickness in m, centred on its line; absent: automatic, by whether it faces outside (see walls.ts).
   * Kept but unused while the segment is another kind, so turning it back into a wall restores it.
   */
  thickness: Positive.optional(),
  /** A wall's height in m; absent: the usual height (see walls.ts). */
  height: Positive.optional(),
  /**
   * An open edge's columns: their style and the most they stand apart, in m (they are shared out evenly along
   * it, see colonnades.ts). Kept but unused while the segment is another kind.
   */
  colonnade: z.strictObject({ style: z.enum(COLUMN_STYLES), spacing: Positive }).optional(),
  /**
   * A wall's finish on each side, as material ids (see materials.ts), its sides named looking from `a` to `b`;
   * kept but unused while the segment is another kind.
   */
  finish: z.strictObject({ left: z.string().min(1).optional(), right: z.string().min(1).optional() }).optional(),
  /**
   * A ground-floor wall's footing set by hand, m: the width and depth of its strip footing, or of its ground beam
   * on piles or under a raft (see foundations.ts); either absent: worked out from the wall. Kept while it is another kind.
   */
  footing: z.strictObject({ width: z.number().positive().max(3).optional(), depth: z.number().positive().max(5).optional() }).optional(),
})

export type SegmentKind = 'wall' | 'open' | 'outline'

export const SEGMENT_KINDS: readonly SegmentKind[] = ['wall', 'open', 'outline']

export const AreaSchema = z.strictObject({
  name: z.string(),
  /** A point inside the area; the editor keeps it at the area's label position, well inside (see regionLabel). */
  at: VecSchema,
  /** Its floor's finish, a material id (see materials.ts). */
  floor: z.string().min(1).optional(),
  /**
   * The land of a lot (a plot), not a room: outdoors even where its boundary walls close it in, sized to its
   * boundary lines, and summed apart from the rooms.
   */
  lot: z.literal(true).optional(),
  /** A pool's depth, m: its floor (its lining) sinks this far into the ground, under water 0.1 m below its rim. */
  depth: z.number().positive().max(5).optional(),
  /** Heated by a radiant floor (the HVAC tab): loops of pipe in its screed, fed from an underfloor manifold. */
  radiant: z.literal(true).optional(),
})

export const DOOR_STYLES = ['single', 'double', 'sliding'] as const
export const WINDOW_STYLES = ['fixed', 'sliding', 'double-hung', 'awning', 'casement'] as const
export const GATE_STYLES = ['single', 'double', 'sliding'] as const
export const FIREPLACE_STYLES = ['masonry', 'parrilla'] as const

const OpeningFields = {
  /** The segment it sits in. */
  segment: z.string().min(1),
  /** Distance from the segment's `a` end to the opening's centre, in m. */
  offset: Num,
  width: Positive,
  /**
   * The end a single hinged leaf hangs from (single doors and gates, one-leaf casements), towards the segment's
   * `a` or `b` end; for a sliding gate, the end it slides away towards.
   */
  hinge: z.enum(['a', 'b']).default('a'),
  /**
   * The side of the segment it opens or slides to, looking from `a` to `b`: into the room for a door, outside
   * for a casement or an awning; the side a fireplace stands on.
   */
  swing: z.enum(['left', 'right']).default('left'),
}

// files from before door and window styles hold single doors and fixed windows, which is what they showed
export const DoorSchema = z.strictObject({
  kind: z.literal('door'),
  style: z.enum(DOOR_STYLES).default('single'),
  ...OpeningFields,
  /** Its height, m: 2.10 when not set (a sliding door is often taller, up to its wall's full height). */
  height: z.number().positive().max(6).optional(),
})

export const WindowSchema = z.strictObject({
  kind: z.literal('window'),
  style: z.enum(WINDOW_STYLES).default('fixed'),
  ...OpeningFields,
  /** Its top, m above the floor: 2.10 when not set, as a door's (a tall pane can reach its wall's full height). */
  height: z.number().positive().max(6).optional(),
  /** Its sill, m above the floor: 0.90 when not set (an awning's 1.50); 0 for glass down to the floor. */
  sill: z.number().min(0).max(5).optional(),
})

/** Gates go in fences and boundary walls (often open edges): a pedestrian leaf, a pair, or a sliding gate. */
export const GateSchema = z.strictObject({ kind: z.literal('gate'), style: z.enum(GATE_STYLES).default('single'), ...OpeningFields })

/** A fireplace against a wall, in the room on its `swing` side; it cuts no gap in the wall. */
export const FireplaceSchema = z.strictObject({
  kind: z.literal('fireplace'),
  style: z.enum(FIREPLACE_STYLES).default('masonry'),
  ...OpeningFields,
  /** What its masonry is finished in, a material id (see materials.ts); exposed brick when not. */
  finish: z.string().min(1).optional(),
})

export const OpeningSchema = z.discriminatedUnion('kind', [DoorSchema, WindowSchema, GateSchema, FireplaceSchema])

export const SINK_STYLES = ['outdoor', 'kitchen', 'bathroom'] as const
export const APPLIANCE_STYLES = ['fridge', 'dishwasher', 'oven', 'washer', 'dryer'] as const
export const BATHTUB_STYLES = ['alcove', 'clawfoot', 'drop-in', 'corner'] as const
export const BED_STYLES = ['single', 'double', 'queen', 'king'] as const
export const SOFA_STYLES = ['armchair', 'loveseat', 'three-seater', 'sectional', 'teak-sofa', 'teak-armchair'] as const
export const TABLE_STYLES = ['square', 'circle', 'coffee', 'trestle', 'teak-coffee'] as const

const Standing = {
  /** Its centre on the plan, in m. */
  at: VecSchema,
  /** Turned clockwise on screen, in degrees; at 0 its back is up the sheet and its front faces down. */
  angle: Num,
  /** Across its front, and from its back to its front, in m (a round table's diameter is its width). */
  width: Positive,
  depth: Positive,
}

/** A counter against a wall, or (style `island`) a kitchen island standing free; files from before islands have no style. */
export const CounterSchema = z.strictObject({ kind: z.literal('counter'), style: z.literal('island').optional(), ...Standing })

/** A kitchen sink sits in a counter, `offset` m from the counter's left end to its own centre. */
export const KitchenSinkSchema = z.strictObject({
  kind: z.literal('sink'),
  style: z.literal('kitchen'),
  counter: z.string().min(1),
  offset: Num,
  width: Positive,
  depth: Positive,
})

export const StandingSinkSchema = z.strictObject({ kind: z.literal('sink'), style: z.enum(['outdoor', 'bathroom']), ...Standing })

export const SinkSchema = z.discriminatedUnion('style', [KitchenSinkSchema, StandingSinkSchema])

/** A kitchen or laundry appliance standing with its back against a wall. */
export const ApplianceSchema = z.strictObject({ kind: z.literal('appliance'), style: z.enum(APPLIANCE_STYLES), ...Standing })

export const BathtubSchema = z.strictObject({
  kind: z.literal('bathtub'),
  style: z.enum(BATHTUB_STYLES),
  ...Standing,
  /**
   * Where the shower head is round the rim: 0–1 along the back from its left end, 1–2 down the right, 2–3 the
   * front, 3–4 up the left (a corner tub's right and front are its curved front, 1–3).
   */
  shower: z.number().min(0).max(4),
})

/** A shower tray behind a glass screen; its head is round its edge the way a bathtub's is. */
export const ShowerSchema = z.strictObject({ kind: z.literal('shower'), ...Standing, shower: z.number().min(0).max(4) })

export const ToiletSchema = z.strictObject({ kind: z.literal('toilet'), ...Standing })

export const BidetSchema = z.strictObject({ kind: z.literal('bidet'), ...Standing })

export const BedSchema = z.strictObject({ kind: z.literal('bed'), style: z.enum(BED_STYLES), ...Standing })

/** A sofa; a sectional's return (its chaise) is at its right end, seen from the front, unless it is `mirror`ed. */
export const SofaSchema = z.strictObject({ kind: z.literal('sofa'), style: z.enum(SOFA_STYLES), ...Standing, mirror: z.boolean().optional() })

export const TableSchema = z.strictObject({ kind: z.literal('table'), style: z.enum(TABLE_STYLES), ...Standing })

export const ChairSchema = z.strictObject({ kind: z.literal('chair'), ...Standing })

/** A straight flight of stairs up to the floor above, climbing from its front to its back (see storeys.ts). */
export const StairSchema = z.strictObject({ kind: z.literal('stair'), ...Standing })

export const TREE_STYLES = ['shade', 'slender'] as const

export const PLANT_STYLES = ['olive', 'shrub', 'bush', 'agapanthus', 'lavender', 'climber'] as const

/**
 * A plant, `width` its foliage across: in a pot (a small olive tree, a shrub), or in the ground (a bush, a clump of
 * agapanthus, lavender, a climber up a wall behind it).
 */
export const PlantSchema = z.strictObject({ kind: z.literal('plant'), style: z.enum(PLANT_STYLES), ...Standing })

/** A tree, its crown `width` across (its trunk at `at`): a broad shade tree, or a tall slender one. */
export const TreeSchema = z.strictObject({ kind: z.literal('tree'), style: z.enum(TREE_STYLES), ...Standing })

export const FurnitureSchema = z.discriminatedUnion('kind', [
  CounterSchema,
  SinkSchema,
  ApplianceSchema,
  BathtubSchema,
  ShowerSchema,
  ToiletSchema,
  BidetSchema,
  BedSchema,
  SofaSchema,
  TableSchema,
  ChairSchema,
  TreeSchema,
  PlantSchema,
  StairSchema,
])

/**
 * The equipment put down on the Plumbing, HVAC and Gas tabs: where the water comes from and is kept, what pushes and
 * heats it and where the waste goes (plumbing); what heats, cools and ventilates the rooms (HVAC); and where gas
 * enters, is isolated and terminates (Gas). Each stands at a point,
 * turned, with its own footprint, like furniture; what it is rated at (litres held, heat given, water moved) follows
 * its size, and setting the rating resizes it (see services.ts). What the pipes do with them is worked out, never
 * stored (see plumbing.ts).
 */
export const SERVICE_KINDS = [
  'mains-water',
  'well',
  'well-pump',
  'cistern',
  'tank',
  'pump',
  'filter',
  'manifold',
  'tap',
  'heater-gas',
  'heater-electric',
  'boiler',
  'heat-pump',
  'radiator',
  'underfloor-manifold',
  'split-indoor',
  'split-outdoor',
  'extractor',
  'range-hood',
  'floor-drain',
  'grease-trap',
  'chamber',
  'septic',
  'biodigestor',
  'soakaway',
  'sewer',
  'gas-heater',
  'gas-meter',
  'gas-cylinders',
  'gas-outlet',
  'gas-valve',
] as const

export const ServiceSchema = z.strictObject({
  kind: z.enum(SERVICE_KINDS),
  /** Its centre on the plan, m. */
  at: VecSchema,
  /** Turned clockwise on screen, in degrees; at 0 its back is up the sheet. */
  angle: Num,
  /** Across its front and from its back to its front, m; its rating follows them. */
  width: Positive,
  depth: Positive,
  /** A tap with hot water as well as cold. */
  hot: z.literal(true).optional(),
  /** Future connected load reserved downstream of a sectional gas valve, kcal/h. */
  reserve: z.number().positive().max(500000).optional(),
})

export const ROOF_TYPES = ['flat', 'shed', 'gable', 'hip', 'pergola', 'glass'] as const

export const RoofSchema = z.strictObject({
  /** What the roof covers, usually the walls' outside faces; the eaves stand `overhang` beyond it. */
  outline: z.array(VecSchema).min(3),
  /**
   * A flat slab, one slope (shed), two slopes meeting at a ridge (gable) or a slope from every side (hip); or one
   * slope of rafters under a sheet (pergola) or of steel glazing bars under glass (glass, a greenhouse's).
   */
  type: z.enum(ROOF_TYPES),
  /** Slope in degrees; a flat roof has none. */
  pitch: z.number().min(0).max(70),
  /** Height of the roof's underside where it crosses the outline at its eaves, in m (usually the top of the walls). */
  height: Positive,
  overhang: z.number().min(0).max(3),
  /** The outline edge (by index) a shed roof slopes down to, or a gable roof's ridge runs along. */
  edge: z.number().int().min(0),
  /** A flat roof's parapet above the slab, in m; 0 for none. */
  parapet: z.number().min(0).max(2),
  /** What it is covered in (its top, and a pitched roof's fascia), a material id (see materials.ts). */
  finish: z.string().min(1).optional(),
  /** Its underside (the soffit under the eaves, a gallery's ceiling), a material id. */
  soffit: z.string().min(1).optional(),
  /** Glazed openings in it: `count` strips `width` m wide, evenly spaced along its `edge`, running across it. */
  skylights: z.strictObject({ count: z.number().int().min(1).max(40), width: z.number().positive().max(10) }).optional(),
  /** A glass roof's grow lights: rows of LED bars hung under its glazing bars. */
  lights: z.literal(true).optional(),
})

/** How a board is supplied: two phases and neutral, or three phases and neutral (see wiring.ts). */
export const BOARD_SUPPLIES = ['biphasic', 'triphasic'] as const

/** What an electrical point is fixed to: a wall, the ceiling (under a roof or the floor above) or the floor. */
export const ELECTRIC_MOUNTS = ['wall', 'ceiling', 'floor'] as const

/** A socket on a general circuit, or on a circuit of its own for one big appliance (an oven, an AC, a pump). */
export const SOCKET_USES = ['general', 'special'] as const

/** A circuit the user laid out by hand, kept on its board: the kind of point it may hold, and which layer. */
export const CIRCUIT_TYPES = ['lighting', 'sockets', 'special'] as const

const Fixed = {
  /** Where it is on the plan, m: a wall mount's on the wall's face, a ceiling or floor mount's anywhere in a room. */
  at: VecSchema,
  /** Which way it faces, degrees clockwise, as furniture's front: out of its wall into the room. */
  angle: Num,
  /** The middle of its box above the floor, m; absent: the usual height for what it is (see electrical.ts). */
  height: z.number().min(0).max(6).optional(),
}

/**
 * The cable that feeds a point, drawn by hand: the plan points it passes through on its way from the box before it
 * on its circuit (see wiring.ts); absent, it is routed along the walls.
 */
const Route = z.array(VecSchema).max(64).optional()

/** A point that takes a cable: it may be put on a circuit by hand (its id on the feeding board), else it is grouped automatically. */
const Wired = { ...Fixed, route: Route, circuit: z.string().min(1).optional() }

/** A circuit defined by hand on a board: what it may hold, a name, and the layer (one of the board's) it organises. */
export const CircuitSchema = z.strictObject({ type: z.enum(CIRCUIT_TYPES), name: z.string(), layer: z.string().min(1) })

/**
 * An electrical board. A main board (no `parent`) is on a wall and feeds the points of the layers it lists (each
 * layer from one main board). A sub-board is fed from another board (`parent`) and feeds the points in the named
 * areas it lists (each area from one sub-board), taking them from the board that feeds their layer; it is either on
 * a wall of its own, with a feeder from its parent, or `integrated` in its parent's enclosure (then it has no place
 * of its own: its `at` and `angle` are its parent's). Either may hold circuits defined by hand.
 */
export const BoardSchema = z.strictObject({
  kind: z.literal('board'),
  name: z.string(),
  supply: z.enum(BOARD_SUPPLIES),
  /** A main board's layers. */
  layers: z.array(z.string().min(1)),
  /** A sub-board's areas: the named areas (layer and area id) whose points it feeds. */
  areas: z.array(z.strictObject({ layer: z.string().min(1), area: z.string().min(1) })).default([]),
  circuits: z.record(z.string(), CircuitSchema).default({}),
  /** The board it is fed from (a sub-board), if any. */
  parent: z.strictObject({ layer: z.string().min(1), board: z.string().min(1) }).optional(),
  /** A sub-board inside its parent's enclosure, not on a wall of its own. */
  integrated: z.literal(true).optional(),
  mount: z.literal('wall'),
  ...Fixed,
  route: Route,
})

export const SwitchSchema = z.strictObject({ kind: z.literal('switch'), mount: z.literal('wall'), ...Wired })

/**
 * A light outlet on the ceiling, a wall or the floor (in a room, or outdoors: a garden light, fed underground); `power`
 * its lamps', W (absent: the usual, see electrical.ts); a floor light's `post`, m: absent or 0 flush in the ground (an
 * uplight, a step light), else a bollard or lamp post this tall.
 */
export const LightSchema = z.strictObject({
  kind: z.literal('light'),
  mount: z.enum(['ceiling', 'wall', 'floor']),
  ...Wired,
  power: z.number().positive().max(20000).optional(),
  post: z.number().min(0).max(6).optional(),
})

/** A socket on a wall or in the floor (in a room, or outdoors); `power` what it is expected to feed, W (absent: the usual for its use). */
export const SocketSchema = z.strictObject({
  kind: z.literal('socket'),
  mount: z.enum(['wall', 'floor']),
  use: z.enum(SOCKET_USES),
  ...Wired,
  power: z.number().positive().max(20000).optional(),
})

export const ElectricalSchema = z.discriminatedUnion('kind', [BoardSchema, SwitchSchema, LightSchema, SocketSchema])

export const LayerSchema = z.strictObject({
  id: z.string().min(1),
  name: z.string(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'colours are "#rrggbb"'),
  visible: z.boolean(),
  locked: z.boolean(),
  vertices: z.record(z.string(), VecSchema),
  segments: z.record(z.string(), SegmentSchema),
  /** Named areas (rooms, porches, patios), bounded by this layer's segments. Files from before areas lack it. */
  areas: z.record(z.string(), AreaSchema).default({}),
  /** Doors and windows in this layer's segments. Files from before openings lack it. */
  openings: z.record(z.string(), OpeningSchema).default({}),
  /** Roofs over this layer's walls. Files from before roofs lack it. */
  roofs: z.record(z.string(), RoofSchema).default({}),
  /** Furniture and fixtures in this layer's rooms. Files from before furniture lack it. */
  furniture: z.record(z.string(), FurnitureSchema).default({}),
  /** Electrical boards, switches, light outlets and sockets (the Electricity tab). Files from before them lack it. */
  electrical: z.record(z.string(), ElectricalSchema).default({}),
  /** Plumbing and thermomechanical equipment put down by hand (see ServiceSchema). Files from before it lack it. */
  services: z.record(z.string(), ServiceSchema).default({}),
  /**
   * Its floor level above the ground, m: everything on it stands that high. On the ground floor (up to 3 m) on a
   * plinth under its rooms and galleries, with steps down to the ground outside its doors to the outside and along
   * its galleries' open edges; on a floor above, on a slab under its named areas (see storeys.ts).
   */
  level: z.number().min(0).max(20).optional(),
  /** The floor it is on, counted up from the ground floor (absent): 1 is the floor above it. */
  storey: z.number().int().min(1).max(3).optional(),
})

/** A known length on the image: two points in image pixels and the real distance between them in meters. */
export const CalibrationSchema = z.strictObject({ a: VecSchema, b: VecSchema, length: Positive })

/** The visible part of the image, in image pixels. */
export const CropSchema = z.strictObject({ x: Num, y: Num, w: Positive, h: Positive })

export const BaseImageSchema = z.strictObject({
  /** The image itself, embedded so a plan file is self-contained. */
  src: z.string().startsWith('data:image/', 'the image must be an embedded data: URL'),
  /** Natural size in pixels. */
  width: Positive,
  height: Positive,
  /** World position of the image centre, rotation in radians (clockwise on screen), meters per pixel. */
  cx: Num,
  cy: Num,
  rotation: Num,
  scale: Positive,
  crop: CropSchema.optional(),
  opacity: z.number().min(0).max(1),
  visible: z.boolean(),
  locked: z.boolean(),
  calibration: z.array(CalibrationSchema),
})

/**
 * Where the plan is in the world, for the sun: where true north points on the plan (degrees clockwise from
 * straight up), latitude and longitude (degrees, north and east positive) and the clock's UTC offset in hours.
 */
export const SiteSchema = z.strictObject({
  north: Num,
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  utcOffset: z.number().min(-12).max(14),
})

/** How the house stands on the ground: strip footings under its walls, piles under ground beams, or a raft slab. */
export const FOUNDATION_SYSTEMS = ['strip', 'piles', 'raft'] as const

export const FoundationSchema = z.strictObject({ system: z.enum(FOUNDATION_SYSTEMS) })

/** What pipes are made of: polypropylene (thermofusion), PEX and copper for water and heating; PVC and silent polypropylene for drains. */
export const PIPE_MATERIALS = ['ppr', 'pex', 'copper', 'pvc', 'pp'] as const
/** What a fixture's connections (its hoses and angle valves) and its trap are made of. */
export const FITTING_MATERIALS = ['metal', 'plastic'] as const

/** Manually adjusted derived routes, keyed by network and terminal reference (see routing.ts). */
export const RoutesSchema = z.record(z.string(), z.array(VecSchema).max(400))

/**
 * The plumbing's choices (the Plumbing tab): what each network's pipes are made of (absent: polypropylene for water,
 * PVC for drains), and per fixture (keyed "layer:id" of the furniture) what its connections and trap are made of
 * (absent: metal connections, plastic traps). The pipes themselves are worked out, never stored.
 */
export const PlumbingSchema = z.strictObject({
  materials: z
    .strictObject({
      cold: z.enum(['ppr', 'pex', 'copper']).optional(),
      hot: z.enum(['ppr', 'pex', 'copper']).optional(),
      drain: z.enum(['pvc', 'pp']).optional(),
    })
    .optional(),
  fixtures: z.record(z.string(), z.strictObject({ connection: z.enum(FITTING_MATERIALS).optional(), trap: z.enum(FITTING_MATERIALS).optional() })).optional(),
  routes: RoutesSchema.optional(),
})

/**
 * The HVAC's choices (the HVAC tab): what the heating circuits are made of (absent: PEX). Its equipment is in
 * `layer.services` and its radiant floors on the areas; what they need is worked out (see hvac.ts).
 */
export const HvacSchema = z.strictObject({
  materials: z.strictObject({ heating: z.enum(['pex', 'copper', 'ppr']).optional() }).optional(),
  routes: RoutesSchema.optional(),
})

/** Gas-pipe material choices. Actual products still require distributor and installer approval. */
export const GAS_MATERIALS = ['pe-al-pe', 'steel', 'pe'] as const
export const GAS_INSIDE_MATERIALS = ['pe-al-pe', 'steel'] as const
export const GAS_ROUTING_CHOICES = ['outside', 'entry', 'direct'] as const

/** Saved Gas-tab choices; the installation and its suggested sizes remain derived. */
export const GasSchema = z.strictObject({
  material: z.enum(GAS_INSIDE_MATERIALS).optional(),
  outdoor: z.enum(GAS_MATERIALS).optional(),
  routing: z.enum(GAS_ROUTING_CHOICES).optional(),
  routes: RoutesSchema.optional(),
  appliances: z.record(z.string(), z.strictObject({ fuel: z.literal('electric') })).optional(),
})

/** Buenos Aires, north straight up: plans from before sites start here. */
export const DEFAULT_SITE = { north: 0, latitude: -34.6, longitude: -58.4, utcOffset: -3 } as const

export const PlanSchema = z.strictObject({
  format: z.literal(PLAN_FORMAT),
  schemaVersion: z.literal(SCHEMA_VERSION),
  name: z.string(),
  site: SiteSchema.default({ ...DEFAULT_SITE }),
  /** Its foundation (the Foundation tab); absent: strip footings. */
  foundation: FoundationSchema.optional(),
  /** The plumbing's materials (the Plumbing tab); absent: the usual ones. */
  plumbing: PlumbingSchema.optional(),
  /** The HVAC's materials (the HVAC tab); absent: the usual ones. */
  hvac: HvacSchema.optional(),
  /** Gas routing/material choices and cookers explicitly changed to electric. */
  gas: GasSchema.optional(),
  image: BaseImageSchema.optional(),
  layers: z.array(LayerSchema).min(1),
})

export type Segment = z.infer<typeof SegmentSchema>
export type Area = z.infer<typeof AreaSchema>
export type Opening = z.infer<typeof OpeningSchema>
export type OpeningKind = Opening['kind']
export type DoorStyle = (typeof DOOR_STYLES)[number]
export type WindowStyle = (typeof WINDOW_STYLES)[number]
export type GateStyle = (typeof GATE_STYLES)[number]
export type FireplaceStyle = (typeof FIREPLACE_STYLES)[number]
export type OpeningStyle = DoorStyle | WindowStyle | GateStyle | FireplaceStyle
export type ColumnStyle = (typeof COLUMN_STYLES)[number]
export type Colonnade = NonNullable<Segment['colonnade']>
export type Roof = z.infer<typeof RoofSchema>
export type Furniture = z.infer<typeof FurnitureSchema>
export type FurnitureKind = Furniture['kind']
export type KitchenSink = z.infer<typeof KitchenSinkSchema>
/** Everything but a kitchen sink stands where it is put. */
export type StandingFurniture = Exclude<Furniture, KitchenSink>
export type RoofType = (typeof ROOF_TYPES)[number]
export type Electrical = z.infer<typeof ElectricalSchema>
export type ElectricKind = Electrical['kind']
export type ElectricMount = (typeof ELECTRIC_MOUNTS)[number]
export type Board = z.infer<typeof BoardSchema>
export type BoardSupply = (typeof BOARD_SUPPLIES)[number]
export type SocketUse = (typeof SOCKET_USES)[number]
export type BoardCircuit = z.infer<typeof CircuitSchema>
export type CircuitKind = (typeof CIRCUIT_TYPES)[number]
/** A switch, light outlet or socket: what a board feeds. */
export type ElectricPoint = Exclude<Electrical, Board>
export type Layer = z.infer<typeof LayerSchema>
export type Calibration = z.infer<typeof CalibrationSchema>
export type Crop = z.infer<typeof CropSchema>
export type BaseImage = z.infer<typeof BaseImageSchema>
export type Plan = z.infer<typeof PlanSchema>
export type Site = z.infer<typeof SiteSchema>
export type FoundationSystem = (typeof FOUNDATION_SYSTEMS)[number]
export type Footing = NonNullable<Segment['footing']>
export type Service = z.infer<typeof ServiceSchema>
export type PlumbingSettings = z.infer<typeof PlumbingSchema>
export type PipeNetwork = keyof NonNullable<PlumbingSettings['materials']>
export type PipeMaterial = (typeof PIPE_MATERIALS)[number]
export type FittingMaterial = (typeof FITTING_MATERIALS)[number]
export type FixturePlumbing = NonNullable<PlumbingSettings['fixtures']>[string]
export type HvacSettings = z.infer<typeof HvacSchema>
export type HeatingMaterial = NonNullable<NonNullable<HvacSettings['materials']>['heating']>
export type ServiceKind = (typeof SERVICE_KINDS)[number]
export type GasSettings = z.infer<typeof GasSchema>
export type Routes = z.infer<typeof RoutesSchema>
export type GasMaterial = (typeof GAS_MATERIALS)[number]
export type GasInsideMaterial = (typeof GAS_INSIDE_MATERIALS)[number]
export type GasRoutingChoice = (typeof GAS_ROUTING_CHOICES)[number]

/** Distinct, saturated colours that read on white paper and on the dark canvas alike. */
export const LAYER_COLORS = ['#3b82f6', '#ef4444', '#22c55e', '#a855f7', '#f59e0b', '#14b8a6', '#ec4899']

export function createLayer(id: string, name: string, color = LAYER_COLORS[0]): Layer {
  return { id, name, color, visible: true, locked: false, vertices: {}, segments: {}, areas: {}, openings: {}, roofs: {}, furniture: {}, electrical: {}, services: {} }
}

export function createPlan(): Plan {
  return {
    format: PLAN_FORMAT,
    schemaVersion: SCHEMA_VERSION,
    name: 'House plan',
    site: { ...DEFAULT_SITE },
    layers: [createLayer('L1', 'Walls')],
  }
}

export const segmentKind = (s: Segment): SegmentKind => s.kind ?? 'wall'

/**
 * One selectable item of a layer: a segment, a vertex, an area, an opening (door or window), a roof, a piece of
 * furniture, an electrical item (a board or a point), or a piece of service equipment.
 */
export interface Ref {
  layer: string
  kind: 'segment' | 'vertex' | 'area' | 'opening' | 'roof' | 'furniture' | 'electrical' | 'service'
  id: string
}

/** Whether the item a reference points at exists. */
export function refExists(plan: Plan, r: Ref): boolean {
  const layer = findLayer(plan, r.layer)
  if (!layer) return false
  const items = {
    segment: layer.segments,
    vertex: layer.vertices,
    area: layer.areas,
    opening: layer.openings,
    roof: layer.roofs,
    furniture: layer.furniture,
    electrical: layer.electrical,
    service: layer.services,
  }[r.kind]
  return !!items[r.id]
}

export const sameRef = (a: Ref | null | undefined, b: Ref | null | undefined): boolean =>
  !!a && !!b && a.layer === b.layer && a.kind === b.kind && a.id === b.id

export const findLayer = (plan: Plan, id: string): Layer | undefined => plan.layers.find((l) => l.id === id)

/** The floor a layer is on: 0 for the ground floor. */
export const storeyOf = (layer: Layer | undefined): number => layer?.storey ?? 0

/** A layer that can be drawn on and edited: visible and unlocked. */
export type EditableLayer = Layer & { visible: true; locked: false }

export const isEditable = (layer: Layer | undefined): layer is EditableLayer => !!layer && layer.visible && !layer.locked

/** Cross-references the schema cannot express. */
export function checkIntegrity(plan: Plan): string[] {
  const errors: string[] = []
  const ids = new Set<string>()
  for (const layer of plan.layers) {
    if (ids.has(layer.id)) errors.push(`layers: the id "${layer.id}" is used twice`)
    ids.add(layer.id)
    for (const [id, s] of Object.entries(layer.segments)) {
      for (const end of [s.a, s.b]) {
        if (!layer.vertices[end]) errors.push(`layers (${layer.id}).segments.${id}: vertex "${end}" does not exist`)
      }
      if (s.a === s.b) errors.push(`layers (${layer.id}).segments.${id}: both ends are the same vertex`)
    }
    for (const [id, o] of Object.entries(layer.openings)) {
      if (!layer.segments[o.segment]) errors.push(`layers (${layer.id}).openings.${id}: segment "${o.segment}" does not exist`)
    }
    for (const [id, f] of Object.entries(layer.furniture)) {
      if (f.kind === 'sink' && f.style === 'kitchen' && layer.furniture[f.counter]?.kind !== 'counter') {
        errors.push(`layers (${layer.id}).furniture.${id}: counter "${f.counter}" does not exist`)
      }
    }
    for (const [id, e] of Object.entries(layer.electrical)) {
      if (e.kind !== 'board' || !e.parent) continue
      const parentLayer = plan.layers.find((l) => l.id === e.parent!.layer)
      if (parentLayer?.electrical[e.parent.board]?.kind !== 'board') {
        errors.push(`layers (${layer.id}).electrical.${id}: parent board "${e.parent.layer}:${e.parent.board}" does not exist`)
      }
    }
  }
  return errors
}
