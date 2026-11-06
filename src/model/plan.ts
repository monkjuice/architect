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
 * the roof. An open edge can carry a colonnade: columns shared out along it under a beam.
 *
 * Walls are finished on each side and areas on their floors with materials (see materials.ts and finishes.ts).
 *
 * Furniture and fixtures (counters, sinks, bathtubs, showers, toilets, bidets, beds, sofas, tables, chairs) stand where they are put, turned to
 * an angle; a kitchen sink sits in a counter and goes where its counter goes (see furniture.ts).
 *
 * Roofs are outlines drawn over a layer's plan (the Roof tab), each with a type and slope (see roofs.ts). They do
 * not follow the walls: they are drawn to cover them.
 */

/** Identifies the file format; checked before anything else when a file is loaded. */
export const PLAN_FORMAT = 'architect/plan'

/** Current schema version. Bump it and add a step to `MIGRATIONS` whenever the format changes. */
export const SCHEMA_VERSION = 1

const Num = z.number()
const Positive = z.number().positive()

export const VecSchema = z.strictObject({ x: Num, y: Num })

export const COLUMN_STYLES = ['roman', 'metal'] as const

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

export const WindowSchema = z.strictObject({ kind: z.literal('window'), style: z.enum(WINDOW_STYLES).default('fixed'), ...OpeningFields })

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
])

export const ROOF_TYPES = ['flat', 'shed', 'gable', 'hip'] as const

export const RoofSchema = z.strictObject({
  /** What the roof covers, usually the walls' outside faces; the eaves stand `overhang` beyond it. */
  outline: z.array(VecSchema).min(3),
  /** A flat slab, one slope (shed), two slopes meeting at a ridge (gable) or a slope from every side (hip). */
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
})

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
  /**
   * Its floor level above the ground, m: everything on it stands that high, on a plinth under its rooms and
   * galleries, with steps down to the ground outside its doors to the outside and along its galleries' open edges.
   */
  level: z.number().min(0).max(3).optional(),
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

/** Buenos Aires, north straight up: plans from before sites start here. */
export const DEFAULT_SITE = { north: 0, latitude: -34.6, longitude: -58.4, utcOffset: -3 } as const

export const PlanSchema = z.strictObject({
  format: z.literal(PLAN_FORMAT),
  schemaVersion: z.literal(SCHEMA_VERSION),
  name: z.string(),
  site: SiteSchema.default({ ...DEFAULT_SITE }),
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
export type Layer = z.infer<typeof LayerSchema>
export type Calibration = z.infer<typeof CalibrationSchema>
export type Crop = z.infer<typeof CropSchema>
export type BaseImage = z.infer<typeof BaseImageSchema>
export type Plan = z.infer<typeof PlanSchema>
export type Site = z.infer<typeof SiteSchema>

/** Distinct, saturated colours that read on white paper and on the dark canvas alike. */
export const LAYER_COLORS = ['#3b82f6', '#ef4444', '#22c55e', '#a855f7', '#f59e0b', '#14b8a6', '#ec4899']

export function createLayer(id: string, name: string, color = LAYER_COLORS[0]): Layer {
  return { id, name, color, visible: true, locked: false, vertices: {}, segments: {}, areas: {}, openings: {}, roofs: {}, furniture: {} }
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

/** One selectable item of a layer: a segment, a vertex, an area, an opening (door or window), a roof or a piece of furniture. */
export interface Ref {
  layer: string
  kind: 'segment' | 'vertex' | 'area' | 'opening' | 'roof' | 'furniture'
  id: string
}

/** Whether the item a reference points at exists. */
export function refExists(plan: Plan, r: Ref): boolean {
  const layer = findLayer(plan, r.layer)
  if (!layer) return false
  const items = { segment: layer.segments, vertex: layer.vertices, area: layer.areas, opening: layer.openings, roof: layer.roofs, furniture: layer.furniture }[r.kind]
  return !!items[r.id]
}

export const sameRef = (a: Ref | null | undefined, b: Ref | null | undefined): boolean =>
  !!a && !!b && a.layer === b.layer && a.kind === b.kind && a.id === b.id

export const findLayer = (plan: Plan, id: string): Layer | undefined => plan.layers.find((l) => l.id === id)

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
  }
  return errors
}
