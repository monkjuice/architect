import type { Box, Vec } from '../../../model/geometry'
import type { PlacedOpening } from '../../../model/openings'
import type { Opening, Ref } from '../../../model/plan'
import type { Snap } from '../../../model/snap'
import type { Prefs } from '../../../state/prefs'
import type { EditorStore } from '../../../state/store'

/** Snap reach and hit tolerances, in screen pixels. */
export const SNAP_PX = 10
export const HIT_VERTEX_PX = 8
export const HIT_SEGMENT_PX = 6
/** A press that moves less than this is a click, not a drag. */
export const DRAG_PX = 3
/** Walls are picked for doors and windows from a little farther than points snap: they are long, thin targets. */
export const WALL_REACH_PX = 14

export interface PointerInfo {
  /** World position in meters. */
  p: Vec
  /** World units per screen pixel at the current zoom. */
  px: number
  shift: boolean
  alt: boolean
}

export interface ToolContext {
  store: EditorStore
  prefs: () => Prefs
  /** Re-renders the canvas after the tool's own state (not the plan) changed. */
  redraw: () => void
}

export type LineStyle = 'preview' | 'preview-open' | 'measure' | 'calibration' | 'level' | 'crop' | 'guide'
export type PointStyle = 'anchor' | 'measure' | 'handle'
export type LabelStyle = 'accent' | 'measure' | 'calibration' | 'warning'

/** What a tool wants drawn on top of the plan, in world coordinates. */
export interface OverlayData {
  lines?: { a: Vec; b: Vec; style: LineStyle }[]
  /** A filled outline (a closed measurement). */
  area?: Vec[]
  /** A region to highlight (the area tool's hover). */
  region?: { outer: Vec[]; holes: Vec[][] }
  points?: { p: Vec; style: PointStyle }[]
  /** Text centred on a segment, along it. */
  labels?: { a: Vec; b: Vec; text: string; style: LabelStyle }[]
  /** A boxed note next to a point (usually the cursor). */
  tag?: { p: Vec; text: string; style?: LabelStyle }
  snap?: Snap
  /** A door or window being placed or dragged; `problem` when it cannot go there. */
  opening?: { opening: Opening; placed: PlacedOpening; problem: boolean; /** Its wall's thickness, m. */ wall: number }
  marquee?: Box
  hover?: Ref
}

export interface Tool {
  cursor: () => string
  /** Called when the tool becomes active or stops being active: tools start over each time. */
  reset?: () => void
  down?: (e: PointerInfo) => void
  move?: (e: PointerInfo) => void
  up?: (e: PointerInfo) => void
  /** Returns true when it handled the key. */
  key?: (e: KeyboardEvent) => boolean
  /** Right click: finish what is in progress. */
  cancel?: () => void
  overlay: () => OverlayData
}
