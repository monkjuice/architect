import { add, closestOnSegment, clamp, dist, dot, lineSegmentIntersection, mul, sub, type Vec } from './geometry'
import { facing } from './furniture'
import { placeOpening } from './openings'
import {
  isEditable,
  segmentKind,
  type Board,
  type BoardSupply,
  type CircuitKind,
  type ElectricKind,
  type ElectricPoint,
  type ElectricMount,
  type Electrical,
  type Layer,
  type Plan,
  type SocketUse,
} from './plan'
import { isCovered, pointInPolygon, regionAt, type Region } from './regions'
import { WALL_HEIGHT } from './walls'

/**
 * Electrical boards and points (the Electricity tab): a board on a wall, and the switches, light outlets and sockets it
 * feeds, each fixed to what suits it: switches and boards to walls, light outlets to the ceiling or a wall, sockets to a
 * wall or the floor. Like furniture they stand where they are put (`at`, facing `angle`), snapped to a wall's face when
 * put down or dragged; they do not follow walls that move. How they are wired is in wiring.ts.
 */

export const ELECTRIC_TITLES: Record<ElectricKind, string> = { board: 'Board', switch: 'Switch', light: 'Light outlet', socket: 'Socket' }

export const MOUNT_TITLES: Record<ElectricMount, string> = { wall: 'Wall', ceiling: 'Ceiling', floor: 'Floor' }

export const SUPPLY_TITLES: Record<BoardSupply, string> = { biphasic: 'Biphasic', triphasic: 'Triphasic' }

export const USE_TITLES: Record<SocketUse, string> = { general: 'General', special: 'Special' }

/** What each kind may be fixed to, the usual first. Only sockets go in the floor. */
export const MOUNTS: Record<ElectricKind, readonly ElectricMount[]> = {
  board: ['wall'],
  switch: ['wall'],
  light: ['ceiling', 'wall'],
  socket: ['wall', 'floor'],
}

/** Usual heights of the middle of a box above the floor, m: a board's, a switch's, a wall socket's and a wall light's. */
export const HEIGHTS = { board: 1.5, switch: 1.1, socket: 0.3, wallLight: 2.0 }

/**
 * Design loads, VA, when a point has no power of its own: a light outlet, a socket on a general circuit and one on a
 * special circuit (an oven, an AC, a pump). A switch draws nothing.
 */
export const LOADS = { light: 100, socket: 200, special: 2200 }

/** How far from a wall's face the cursor still puts a wall-mounted item on it, m. */
export const ELECTRIC_REACH_M = 0.6

/** How far a wall box keeps from a door's or a gate's jamb, m. */
const JAMB_CLEAR = 0.05

/** Where a box is above the floor, m; a ceiling light's is the ceiling (`ceiling`, the walls' height there). */
export function heightOf(e: Electrical, ceiling = WALL_HEIGHT): number {
  // a floor item's box is in the floor (a floor light's post stands on it)
  if (e.mount === 'floor') return 0
  if (e.height !== undefined) return e.height
  if (e.mount === 'ceiling') return ceiling
  if (e.kind === 'board') return HEIGHTS.board
  if (e.kind === 'switch') return HEIGHTS.switch
  if (e.kind === 'light') return HEIGHTS.wallLight
  return HEIGHTS.socket
}

/** What a point is expected to draw, VA. */
export function loadOf(e: Electrical): number {
  if (e.kind === 'board' || e.kind === 'switch') return 0
  if (e.power !== undefined) return e.power
  return e.kind === 'light' ? LOADS.light : e.use === 'special' ? LOADS.special : LOADS.socket
}

/** The way an item faces on the plan, a unit vector: out of its wall. */
export const frontOf = (angle: number): Vec => {
  const r = (angle * Math.PI) / 180
  return { x: -Math.sin(r), y: Math.cos(r) }
}

/** A short name: "Switch", "Ceiling light", "Floor socket", "Special socket"… */
export function electricTitle(e: Pick<Electrical, 'kind' | 'mount'> & { use?: SocketUse }): string {
  if (e.kind === 'light') return e.mount === 'wall' ? 'Wall light' : e.mount === 'floor' ? 'Floor light' : 'Ceiling light'
  if (e.kind === 'socket') return `${e.use === 'special' ? 'Special' : e.mount === 'floor' ? 'Floor' : 'Wall'} socket`
  return ELECTRIC_TITLES[e.kind]
}

/** Where an item being put down goes: on the active layer, at a wall's face or in a room. */
export interface ElectricTarget {
  layer: string
  at: Vec
  angle: number
  /** Why it cannot go there, if it cannot. */
  problem?: string
  /** The lines a ceiling or floor item snapped to (a room's centre line, another item's line), to draw. */
  guides?: [Vec, Vec][]
}

export interface ElectricOptions {
  kind: ElectricKind
  mount: ElectricMount
  /** The layer it goes on (the active one). */
  layer: string
  /** How far from a wall's face it still goes on it, m. */
  reach: number
  /** Each wall's thickness. */
  thickness: (layer: Layer, segment: string) => number
  /** Each layer's regions (rooms, galleries). */
  regions: (layer: Layer) => readonly Region[]
  /** False puts a ceiling or floor item where the cursor is, without snapping. */
  snap?: boolean
  /** How far a ceiling or floor item snaps to a line, m (a screen distance at the zoom). */
  snapReach?: number
  /** The item being dragged: it does not line up with itself. */
  ignore?: { layer: string; id: string }
}

/** The smallest room (region) of the plan's visible layers around `p`, or null. */
export function roomAt(plan: Plan, p: Vec, regions: (layer: Layer) => readonly Region[]): Region | null {
  let best: Region | null = null
  for (const layer of plan.layers) {
    if (!layer.visible) continue
    const r = regionAt(regions(layer), p)
    if (r && (!best || r.area < best.area)) best = r
  }
  return best
}

/**
 * Where an item goes for cursor `p` on `plan` (the active floor's layers): a wall mount on the face of the nearest wall
 * of any visible layer, facing out of it and kept clear of doors; a ceiling mount inside a room, snapping to its
 * centre lines; a floor mount in a room likewise, or outdoors (no room, or a terrace or lot), lining up with others. Null when the active layer cannot be edited.
 */
export function electricTarget(plan: Plan, p: Vec, opts: ElectricOptions): ElectricTarget | null {
  const layer = plan.layers.find((l) => l.id === opts.layer)
  if (!isEditable(layer)) return null
  const what = electricTitle({ kind: opts.kind, mount: opts.mount }).toLowerCase()
  if (opts.mount !== 'wall') {
    const room = roomAt(plan, p, opts.regions)
    // a floor item may also stand outdoors (a garden light, a socket by the pool): it is fed underground
    if (!room && opts.mount === 'ceiling') return { layer: layer.id, at: p, angle: 0, problem: `A ${what} goes inside a room or a gallery: an area its lines close.` }
    if (opts.snap === false) return { layer: layer.id, at: p, angle: 0 }
    return { layer: layer.id, angle: 0, ...snapInRoom(plan, p, room && (opts.mount === 'ceiling' || isCovered(room)) ? room : null, opts.mount, opts.snapReach ?? 0.15, opts.ignore) }
  }

  let best: { d: number; at: Vec; angle: number; problem?: string } | null = null
  for (const host of plan.layers) {
    if (!host.visible) continue
    for (const [id, s] of Object.entries(host.segments)) {
      if (segmentKind(s) !== 'wall') continue
      const [a, b] = [host.vertices[s.a], host.vertices[s.b]]
      const length = dist(a, b)
      if (length < 1e-6) continue
      const c = closestOnSegment(p, a, b)
      const half = opts.thickness(host, id) / 2
      const fromFace = c.dist - half
      if (fromFace > opts.reach || (best && fromFace >= best.d)) continue
      const t = mul(sub(b, a), 1 / length)
      let n = { x: -t.y, y: t.x }
      if (dot(sub(p, c.point), n) < 0) n = mul(n, -1)
      const along = clamp(c.t * length, Math.min(0.1, length / 2), Math.max(length - 0.1, length / 2))
      const at = add(add(a, mul(t, along)), mul(n, half))
      // not in a doorway: a door or gate leaves no wall to fix a box to
      let problem: string | undefined
      for (const o of Object.values(host.openings)) {
        if (o.segment !== id || (o.kind !== 'door' && o.kind !== 'gate')) continue
        const placed = placeOpening(host, o)
        if (placed && Math.abs(placed.offset - along) < o.width / 2 + JAMB_CLEAR) problem = `That is a ${o.kind}way: put the ${what} on the wall beside it.`
      }
      best = { d: fromFace, at, angle: facing(n), problem }
    }
  }
  if (!best) return { layer: layer.id, at: p, angle: 0, problem: `A ${what} goes on a wall: bring it near one.` }
  return { layer: layer.id, at: best.at, angle: best.angle, problem: best.problem }
}

/** Where a ray from `o` along `dir` leaves a room, both ways: the nearest boundary ahead (t > 0) and behind (t < 0). */
function across(room: Region, o: Vec, dir: Vec): [number, number] | null {
  let [ahead, behind] = [Infinity, -Infinity]
  for (const ring of [room.outer, ...room.holes]) {
    for (let i = 0; i < ring.length; i++) {
      const hit = lineSegmentIntersection(o, dir, ring[i], ring[(i + 1) % ring.length])
      if (!hit) continue
      if (hit.t > 1e-9) ahead = Math.min(ahead, hit.t)
      else if (hit.t < -1e-9) behind = Math.max(behind, hit.t)
    }
  }
  return Number.isFinite(ahead) && Number.isFinite(behind) ? [behind, ahead] : null
}

/**
 * A ceiling or floor item's place near `p` in `room`, snapped on each of two axes, along and across the room's
 * nearest wall: onto the room's centre line across (down a corridor's middle) or along, or into line with another
 * item of the same mount on the floor, whichever is nearest within `reach`. Both axes at the centre is the room's
 * middle. Returns the lines it snapped to, to draw.
 */
function snapInRoom(plan: Plan, p: Vec, room: Region | null, mount: ElectricMount, reach: number, ignore?: { layer: string; id: string }): { at: Vec; guides: [Vec, Vec][] } {
  // outdoors (or on a terrace, a lot): no walls to centre between, only other items to line up with, square to the plan
  let nearest: { d: number; dir: Vec } | null = room ? null : { d: 0, dir: { x: 1, y: 0 } }
  for (const ring of room ? [room.outer, ...room.holes] : []) {
    for (let i = 0; i < ring.length; i++) {
      const [a, b] = [ring[i], ring[(i + 1) % ring.length]]
      const l = dist(a, b)
      const c = closestOnSegment(p, a, b)
      if (l > 1e-6 && (!nearest || c.dist < nearest.d)) nearest = { d: c.dist, dir: mul(sub(b, a), 1 / l) }
    }
  }
  if (!nearest) return { at: p, guides: [] }
  const along = nearest.dir
  const over = { x: -along.y, y: along.x }
  const others = plan.layers.flatMap((l) =>
    l.visible ? Object.entries(l.electrical).flatMap(([id, e]) => (e.mount === mount && !(ignore && ignore.layer === l.id && ignore.id === id) ? [e.at] : [])) : [],
  )
  // on each axis, the nearest of: the centre between the walls either side, another item's line
  const axis = (dir: Vec) => {
    let best: { off: number; to?: Vec } | null = null
    const span = room && across(room, p, dir)
    if (span) best = { off: (span[0] + span[1]) / 2 }
    if (best && Math.abs(best.off) > reach) best = null
    for (const q of others) {
      const off = dot(sub(q, p), dir)
      if (Math.abs(off) <= reach && (!best || Math.abs(off) < Math.abs(best.off))) best = { off, to: q }
    }
    return best
  }
  const [a, o] = [axis(along), axis(over)]
  const at = add(add(p, mul(along, a?.off ?? 0)), mul(over, o?.off ?? 0))
  const guides: [Vec, Vec][] = []
  // a centre line runs the width of the room through the point; a line to another item, from it
  for (const [snap, dir] of [
    [o, along],
    [a, over],
  ] as const) {
    if (!snap) continue
    if (snap.to) guides.push([snap.to, at])
    else if (room) {
      const span = across(room, at, dir)
      if (span) guides.push([add(at, mul(dir, span[0])), add(at, mul(dir, span[1]))])
    }
  }
  return { at, guides }
}

/** Board fields that the placing tool does not decide. */
export interface BoardFields {
  name: string
  supply: BoardSupply
  layers: string[]
  /** A sub-board's: the board it is fed from and the areas it feeds. */
  parent?: { layer: string; board: string }
  areas?: { layer: string; area: string }[]
}

/** An item put down where `t` says. */
export function electricFor(kind: ElectricKind, mount: ElectricMount, t: ElectricTarget, extra: { use?: SocketUse; board?: BoardFields } = {}): Electrical {
  const fixed = { at: { x: t.at.x, y: t.at.y }, angle: t.angle }
  if (kind === 'board') {
    const b: BoardFields = extra.board ?? { name: 'Board', supply: 'triphasic', layers: [] }
    const board: Board = { kind, name: b.name, supply: b.supply, layers: [...b.layers], areas: [...(b.areas ?? [])], circuits: {}, mount: 'wall', ...fixed }
    if (b.parent) board.parent = { ...b.parent }
    return board
  }
  if (kind === 'switch') return { kind, mount: 'wall', ...fixed }
  if (kind === 'light') return { kind, mount, ...fixed }
  return { kind, mount: mount === 'floor' ? 'floor' : 'wall', use: extra.use ?? 'general', ...fixed }
}

/** The boards on the plan, with their layers, in layer order. */
export function boardsOf(plan: Plan): { layer: Layer; id: string; board: Board }[] {
  return plan.layers.flatMap((layer) => Object.entries(layer.electrical).flatMap(([id, e]) => (e.kind === 'board' ? [{ layer, id, board: e }] : [])))
}

/** The name the next board gets: Main board, then Board 2, Board 3… */
export function nextBoardName(plan: Plan): string {
  const names = new Set(boardsOf(plan).map((b) => b.board.name))
  if (!names.size) return 'Main board'
  let n = names.size + 1
  while (names.has(`Board ${n}`)) n++
  return `Board ${n}`
}

/** The main board that feeds a layer (the first that lists it), if any. */
export function boardFeeding(plan: Plan, layerId: string): { layer: Layer; id: string; board: Board } | undefined {
  return boardsOf(plan).find((b) => !b.board.parent && b.board.layers.includes(layerId))
}

/** The sub-board that feeds a named area (the first that lists it), if any. */
export function boardOfArea(plan: Plan, layerId: string, areaId: string): { layer: Layer; id: string; board: Board } | undefined {
  return boardsOf(plan).find((b) => b.board.parent && b.board.areas.some((a) => a.layer === layerId && a.area === areaId))
}

/** Where a point is, to tell which room it is in: in front of a wall box, else where it is. */
export const probeOf = (e: Pick<Electrical, 'at' | 'angle' | 'mount'>): Vec => (e.mount === 'wall' ? add(e.at, mul(frontOf(e.angle), 0.05)) : e.at)

const inRegion = (p: Vec, r: Region) => pointInPolygon(p, r.outer) && !r.holes.some((h) => pointInPolygon(p, h))

/**
 * The board that feeds a point of layer `layerId` at its place: the sub-board one of whose areas (of that layer) it
 * is in, else the main board of its layer. A point put on a circuit by hand is fed by that circuit's board instead
 * (`boardOfPoint`); this is the board new circuits and points on no circuit go on.
 */
export function boardFor(
  plan: Plan,
  layerId: string,
  e: Pick<Electrical, 'at' | 'angle' | 'mount'>,
  regions: (layer: Layer) => readonly Region[],
): { layer: Layer; id: string; board: Board } | undefined {
  const layer = plan.layers.find((l) => l.id === layerId)
  if (!layer) return undefined
  // as wiringPlan decides it: the smallest area around it of a sub-board on a visible layer
  const p = probeOf(e)
  let best: { b: { layer: Layer; id: string; board: Board }; area: number } | null = null
  for (const b of boardsOf(plan)) {
    if (!b.board.parent || !b.layer.visible) continue
    for (const a of b.board.areas) {
      const area = a.layer === layerId ? layer.areas[a.area] : undefined
      const r = area && regionAt(regions(layer), area.at)
      if (r && inRegion(p, r) && (!best || r.area < best.area)) best = { b, area: r.area }
    }
  }
  // a sub-board from before sub-boards fed areas still feeds the layers it lists (see wiringPlan)
  const legacy = boardsOf(plan).find((b) => b.board.parent && b.layer.visible && b.board.layers.includes(layerId))
  return best?.b ?? legacy ?? boardFeeding(plan, layerId)
}

/** Which kind of circuit a point goes on: a switch or light outlet on lighting, a socket by its use. */
export const circuitKindOf = (e: ElectricPoint): CircuitKind => (e.kind === 'switch' || e.kind === 'light' ? 'lighting' : e.use === 'special' ? 'special' : 'sockets')

type BoardEntry = { layer: Layer; id: string; board: Board }

/**
 * Whether board `b` may feed a point of layer `layerId` at `e`'s place: a main board the layers it lists, a sub-board
 * the named areas it lists (the first to list one has it) or, from before areas, the layers it lists; and any board
 * whatever its own sub-boards may (it feeds them). A circuit defined by hand may only hold points its board may feed.
 */
export function boardCovers(plan: Plan, b: BoardEntry, layerId: string, e: Pick<Electrical, 'at' | 'angle' | 'mount'>, regions: (layer: Layer) => readonly Region[]): boolean {
  const layer = plan.layers.find((l) => l.id === layerId)
  if (!layer) return false
  const p = probeOf(e)
  const seen = new Set<string>()
  const covers = (x: BoardEntry): boolean => {
    const key = boardKey({ layer: x.layer.id, id: x.id })
    if (seen.has(key)) return false
    seen.add(key)
    if (x.board.layers.includes(layerId)) return true
    if (x.board.parent) {
      for (const a of x.board.areas) {
        if (a.layer !== layerId || !layer.areas[a.area]) continue
        const first = boardOfArea(plan, a.layer, a.area)
        if (!first || first.layer.id !== x.layer.id || first.id !== x.id) continue
        const r = regionAt(regions(layer), layer.areas[a.area].at)
        if (r && inRegion(p, r)) return true
      }
    }
    return boardChildren(plan, { layer: x.layer.id, id: x.id }).some((c) => c.layer.visible && covers(c))
  }
  return covers(b)
}

/**
 * The board holding the circuit a point of layer `layerId` was put on by hand, when there is one it fits (for that
 * layer, of its kind, and on a board that may feed it there): `byArea`, the board feeding its spot, when it has it
 * (ids were once only unique per board), else the first visible board that has it. Undefined when it is on none, its
 * circuit is gone, or its board may not feed it (its layer or area was unticked).
 */
export function circuitBoardOf(plan: Plan, layerId: string, e: ElectricPoint, regions: (layer: Layer) => readonly Region[], byArea?: BoardEntry): BoardEntry | undefined {
  const id = e.circuit
  if (!id) return undefined
  const holds = (b: Board) => b.circuits[id]?.layer === layerId && b.circuits[id].type === circuitKindOf(e)
  if (byArea && holds(byArea.board)) return byArea
  return boardsOf(plan).find((b) => b.layer.visible && holds(b.board) && boardCovers(plan, b, layerId, e, regions))
}

/**
 * The board that feeds a point: the board of the circuit it was put on by hand, when that board may feed it there (a
 * circuit may be moved to another board, points and all), else the board feeding its spot (`boardFor`).
 */
export function boardOfPoint(plan: Plan, layerId: string, e: ElectricPoint, regions: (layer: Layer) => readonly Region[]): BoardEntry | undefined {
  const byArea = boardFor(plan, layerId, e, regions)
  return circuitBoardOf(plan, layerId, e, regions, byArea) ?? byArea
}

/**
 * Where a board is: its own place, or for a sub-board integrated in its parent, its parent's (up to the board on a
 * wall), with the layer of the board whose place it is.
 */
export function boardPlace(plan: Plan, b: { layer: Layer; id: string; board: Board }): { layer: Layer; at: Vec; angle: number; board: Board } {
  let here = b
  for (let i = 0; i < 10 && here.board.integrated && here.board.parent; i++) {
    const layer = plan.layers.find((l) => l.id === here.board.parent!.layer)
    const parent = layer?.electrical[here.board.parent.board]
    if (!layer || parent?.kind !== 'board') break
    here = { layer, id: here.board.parent.board, board: parent }
  }
  return { layer: here.layer, at: here.board.at, angle: here.board.angle, board: here.board }
}

/** A board's key, unique within the plan. */
export const boardKey = (ref: { layer: string; id: string }): string => `${ref.layer}:${ref.id}`

/** The boards fed straight from `ref` (sub-boards whose `parent` is it). */
export function boardChildren(plan: Plan, ref: { layer: string; id: string }): { layer: Layer; id: string; board: Board }[] {
  return boardsOf(plan).filter((b) => b.board.parent?.layer === ref.layer && b.board.parent.board === ref.id)
}

/**
 * `ref` and every board fed from it, directly or through others: what a board may not be fed from (it, or one
 * of its own sub-boards, would make a loop).
 */
export function boardAndDescendants(plan: Plan, ref: { layer: string; id: string }): Set<string> {
  const out = new Set<string>([boardKey(ref)])
  const queue = [ref]
  while (queue.length) {
    for (const c of boardChildren(plan, queue.shift()!)) {
      const key = boardKey({ layer: c.layer.id, id: c.id })
      if (out.has(key)) continue
      out.add(key)
      queue.push({ layer: c.layer.id, id: c.id })
    }
  }
  return out
}

/** The item under `p` on the plan's editable layers, within `reach` of its mark (the smallest distance wins). */
export function electricAt(plan: Plan, p: Vec, reach: number): { layer: string; id: string } | null {
  let best: { layer: string; id: string; d: number } | null = null
  for (const layer of plan.layers) {
    if (!isEditable(layer)) continue
    for (const [id, e] of Object.entries(layer.electrical)) {
      // a sub-board in its parent's enclosure is not on the plan: it is picked in the Boards list
      if (e.kind === 'board' && e.integrated) continue
      // wall items are drawn out from the wall's face, so they are picked there
      const mark = e.mount === 'wall' ? add(e.at, mul(frontOf(e.angle), e.kind === 'board' ? 0.1 : 0.12)) : e.at
      const d = Math.min(dist(mark, p), dist(e.at, p))
      if (d <= reach && (!best || d < best.d)) best = { layer: layer.id, id, d }
    }
  }
  return best && { layer: best.layer, id: best.id }
}
