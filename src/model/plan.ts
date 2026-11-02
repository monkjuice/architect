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
 */

/** Identifies the file format; checked before anything else when a file is loaded. */
export const PLAN_FORMAT = 'architect/plan'

/** Current schema version. Bump it and add a step to `MIGRATIONS` whenever the format changes. */
export const SCHEMA_VERSION = 1

const Num = z.number()
const Positive = z.number().positive()

export const VecSchema = z.strictObject({ x: Num, y: Num })

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
})

export type SegmentKind = 'wall' | 'open' | 'outline'

export const SEGMENT_KINDS: readonly SegmentKind[] = ['wall', 'open', 'outline']

export const AreaSchema = z.strictObject({
  name: z.string(),
  /** A point inside the area; the editor keeps it at the area's label position, well inside (see regionLabel). */
  at: VecSchema,
})

export const DOOR_STYLES = ['single', 'double', 'sliding'] as const
export const WINDOW_STYLES = ['fixed', 'sliding', 'double-hung', 'awning', 'casement'] as const
export const GATE_STYLES = ['single', 'double', 'sliding'] as const

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
   * for a casement or an awning.
   */
  swing: z.enum(['left', 'right']).default('left'),
}

// files from before door and window styles hold single doors and fixed windows, which is what they showed
export const DoorSchema = z.strictObject({ kind: z.literal('door'), style: z.enum(DOOR_STYLES).default('single'), ...OpeningFields })

export const WindowSchema = z.strictObject({ kind: z.literal('window'), style: z.enum(WINDOW_STYLES).default('fixed'), ...OpeningFields })

/** Gates go in fences and boundary walls (often open edges): a pedestrian leaf, a pair, or a sliding gate. */
export const GateSchema = z.strictObject({ kind: z.literal('gate'), style: z.enum(GATE_STYLES).default('single'), ...OpeningFields })

export const OpeningSchema = z.discriminatedUnion('kind', [DoorSchema, WindowSchema, GateSchema])

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
export type OpeningStyle = DoorStyle | WindowStyle | GateStyle
export type Layer = z.infer<typeof LayerSchema>
export type Calibration = z.infer<typeof CalibrationSchema>
export type Crop = z.infer<typeof CropSchema>
export type BaseImage = z.infer<typeof BaseImageSchema>
export type Plan = z.infer<typeof PlanSchema>
export type Site = z.infer<typeof SiteSchema>

/** Distinct, saturated colours that read on white paper and on the dark canvas alike. */
export const LAYER_COLORS = ['#3b82f6', '#ef4444', '#22c55e', '#a855f7', '#f59e0b', '#14b8a6', '#ec4899']

export function createLayer(id: string, name: string, color = LAYER_COLORS[0]): Layer {
  return { id, name, color, visible: true, locked: false, vertices: {}, segments: {}, areas: {}, openings: {} }
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

/** One selectable item of a layer: a segment, a vertex, an area or an opening (door or window). */
export interface Ref {
  layer: string
  kind: 'segment' | 'vertex' | 'area' | 'opening'
  id: string
}

/** Whether the item a reference points at exists. */
export function refExists(plan: Plan, r: Ref): boolean {
  const layer = findLayer(plan, r.layer)
  if (!layer) return false
  const items = { segment: layer.segments, vertex: layer.vertices, area: layer.areas, opening: layer.openings }[r.kind]
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
  }
  return errors
}
