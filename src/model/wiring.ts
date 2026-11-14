import { closestOnSegment, cross, dist, polylineLength, sub, type Vec } from './geometry'
import { boardKey, boardPlace, boardsOf, circuitKindOf, heightOf, loadOf, probeOf, roomAt } from './electrical'
import {
  segmentKind,
  storeyOf,
  type Board,
  type BoardSupply,
  type Electrical,
  type ElectricPoint,
  type CircuitKind,
  type Layer,
  type Plan,
} from './plan'
import { isCovered, pointInPolygon, regionAt, type Region } from './regions'
import { levelOf } from './storeys'
import { WALL_HEIGHT, wallHeight } from './walls'

/**
 * The wiring of the Electricity tab, worked out from the boards and the points they feed: each board's layers' points
 * are grouped into circuits, each circuit is laid as a tree from the board, box to box, its runs following the walls,
 * and each circuit gets its breaker, cable section, earth and conduit.
 *
 * - Which board feeds a point: the board of the circuit it was put on by hand, when that board may feed it (its
 *   layers, its areas, or its sub-boards'), else a sub-board, when the point is in one of the named areas it lists,
 *   else the main board of the point's layer. A sub-board is fed from its parent through a feeder circuit (a breaker only, for one
 *   in its parent's enclosure).
 * - Circuits follow the rules for dwellings of AEA 90364-7-771 (Argentina): lighting (IUG) and general sockets (TUG)
 *   of at most 15 points each, 1.5 and 2.5 mm² at least, and one special circuit (TUE) per special socket. Circuits
 *   defined by hand come first, in the order they were made; the points on none are grouped automatically, a
 *   layer's apart from another's.
 * - Runs go along the walls' centrelines (and, less willingly, open edges' beams) of the floor, from a box's wall to the
 *   next; a ceiling light or floor socket reaches the nearest wall straight. Lighting runs in the ceiling, sockets in
 *   the floor: each run climbs or drops from its boxes to that plane. Buildings apart (walls that do not touch) are
 *   joined by buried runs, and a floor above or below by a riser at the board.
 * - A circuit's tree is grown from the board (Prim's algorithm on the lengths along the walls).
 * - Sizes: the breaker is the first rating over the design current (and the circuit's least), the section the first
 *   that carries the breaker's current and keeps the voltage drop to the farthest box within `MAX_DROP`; circuits are
 *   shared over the board's phases by load.
 *
 * These are usual values for a house, not a certified design: an electrician registered for it signs the real one.
 */

// ---- figures ----------------------------------------------------------------------------------------------------

/** Phase-to-neutral voltage, V (Argentina, 50 Hz); between phases it is 380 V. */
export const VOLTAGE = 220

/** Copper's resistivity at working temperature, Ω·mm²/m. */
export const RHO = 0.0225

/** The most a circuit's voltage may drop from its board to its farthest box, %. */
export const MAX_DROP = 3

/**
 * Single-core cables (IRAM NM 247-3, PVC, 450/750 V) on sale: section in mm², the current one carries in conduit in a
 * wall with two loaded conductors, A (after AEA 90364-7-771's table, rounded down), and its outside diameter, mm.
 */
export const SECTIONS: readonly { section: number; amps: number; diameter: number }[] = [
  { section: 1.5, amps: 15, diameter: 3.0 },
  { section: 2.5, amps: 21, diameter: 3.6 },
  { section: 4, amps: 28, diameter: 4.2 },
  { section: 6, amps: 36, diameter: 4.8 },
  { section: 10, amps: 50, diameter: 6.2 },
  { section: 16, amps: 66, diameter: 7.3 },
  { section: 25, amps: 88, diameter: 9.0 },
  { section: 35, amps: 109, diameter: 10.2 },
]

/** Thermomagnetic breakers' ratings, A (curve C). */
export const BREAKERS = [6, 10, 16, 20, 25, 32, 40, 50, 63, 80, 100, 125]

/** Residual current devices' ratings, A; they trip at 30 mA. */
export const RCDS = [25, 40, 63, 80, 100, 125]

/** Conduits (semi-heavy, steel or PVC) by trade size, and their inside diameter, mm. */
export const CONDUITS: readonly { name: string; inside: number }[] = [
  { name: '3/4"', inside: 15.4 },
  { name: '7/8"', inside: 18.6 },
  { name: '1"', inside: 21.7 },
  { name: '1 1/4"', inside: 28.1 },
  { name: '1 1/2"', inside: 34 },
]

/** The share of a conduit's inside its cables may fill. */
export const CONDUIT_FILL = 0.35

/**
 * Underground, single-core cables in conduit will not do (they are not made for wet ground): a buried stretch takes
 * a subterranean cable (IRAM 2178, PVC, 1.1 kV) with three cores, line, neutral and earth, of the circuit's section.
 * Its outside diameter by section, mm (usual makes, rounded up).
 */
export const BURIED_CABLES: Record<number, number> = { 1.5: 11, 2.5: 12, 4: 13.5, 6: 15, 10: 18, 16: 21, 25: 25, 35: 28 }

/** Rigid PVC pipes a buried cable is pulled through, by outside diameter, and their inside, mm. */
export const BURIED_PIPES: readonly { name: string; inside: number }[] = [
  { name: '32 mm', inside: 29 },
  { name: '40 mm', inside: 36.4 },
  { name: '50 mm', inside: 46.4 },
  { name: '63 mm', inside: 59 },
]

/** The share of a pipe's inside one cable may fill. */
export const BURIED_FILL = 0.53

/** The least section of an earth conductor, mm² (it matches the phase's up to 16 mm²). */
export const MIN_EARTH = 2.5

/** The least section of a board's feeder, mm². */
export const MIN_FEEDER = 4

/** The least main breaker, A. */
export const MIN_MAIN = 25

/** The share of a board's circuits' loads drawn at once, for its main breaker and feeder. */
export const SIMULTANEITY = 0.8

/** How deep a buried run lies, m. */
export const BURIED_DEPTH = 0.7

/** Cable and conduit bought over what the runs measure: the ends in boxes, offcuts. */
export const WASTE = 0.1

/** How far a line's end may stop short of another line (a wall's face against another's) and still join it, m. */
const JOIN = 0.35

/** Open edges carry runs only along their beams: they cost this much more than walls. */
const OPEN_COST = 1.5

/**
 * `CircuitKind` (lighting, sockets, special) is what the user may define by hand on a board (plan.ts); `subfeeder`
 * is added here, for a sub-board's own feeder circuit on its parent, which is always worked out, never defined.
 */
export type CircuitType = CircuitKind | 'subfeeder'

/** Each type of circuit: its code, most points, breakers and least section, and the plane its runs take. */
export const CIRCUIT_RULES: Record<CircuitType, { code: string; title: string; maxPoints: number; minBreaker: number; maxBreaker: number; minSection: number }> = {
  lighting: { code: 'IUG', title: 'Lighting', maxPoints: 15, minBreaker: 10, maxBreaker: 16, minSection: 1.5 },
  sockets: { code: 'TUG', title: 'General sockets', maxPoints: 15, minBreaker: 16, maxBreaker: 20, minSection: 2.5 },
  special: { code: 'TUE', title: 'Special socket', maxPoints: 1, minBreaker: 16, maxBreaker: 32, minSection: 2.5 },
  subfeeder: { code: 'ALIM', title: 'Sub-board feeder', maxPoints: 1, minBreaker: 16, maxBreaker: 63, minSection: 4 },
}

/** Whether a point may go on a circuit of `type`, by hand: a switch or light on lighting, a socket by its use. */
export function fitsCircuit(e: ElectricPoint, type: CircuitKind): boolean {
  if (type === 'lighting') return e.kind === 'switch' || e.kind === 'light'
  if (e.kind !== 'socket') return false
  return type === 'sockets' ? e.use === 'general' : e.use === 'special'
}

/** Which kind of circuit a point goes on (defined with the boards, in electrical.ts). */
export { circuitKindOf }


export const PHASE_NAMES = ['L1', 'L2', 'L3']

export const phasesOf = (supply: BoardSupply): number => (supply === 'biphasic' ? 2 : 3)

// ---- the walls a floor's runs follow ------------------------------------------------------------------------------

/** A floor's walls and open edges as a graph: their centrelines, split wherever they meet, cross or nearly touch. */
export interface WallGraph {
  nodes: Vec[]
  edges: { u: number; v: number; /** Length, times OPEN_COST along an open edge. */ cost: number; /** The ceiling's height there, m. */ ceiling: number }[]
}

/** The graph of the walls and open edges of `layers` (a floor's visible layers). */
export function wallGraph(layers: readonly Layer[]): WallGraph {
  const segs: { a: Vec; b: Vec; open: boolean; ceiling: number }[] = []
  for (const layer of layers) {
    for (const s of Object.values(layer.segments)) {
      const kind = segmentKind(s)
      const [a, b] = [layer.vertices[s.a], layer.vertices[s.b]]
      if (kind === 'outline' || !a || !b || dist(a, b) < 1e-6) continue
      segs.push({ a, b, open: kind === 'open', ceiling: kind === 'wall' ? wallHeight(s) : WALL_HEIGHT })
    }
  }
  // points within a millimetre are one node: looked up in the 1 cm cells around them
  const nodes: Vec[] = []
  const cells = new Map<string, number[]>()
  const nodeOf = (p: Vec): number => {
    const [cx, cy] = [Math.floor(p.x * 100), Math.floor(p.y * 100)]
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (const i of cells.get(`${cx + dx},${cy + dy}`) ?? []) if (dist(nodes[i], p) <= 1e-3) return i
    const key = `${cx},${cy}`
    cells.set(key, [...(cells.get(key) ?? []), nodes.length])
    nodes.push({ x: p.x, y: p.y })
    return nodes.length - 1
  }
  const cuts: { t: number; p: Vec }[][] = segs.map((s) => [
    { t: 0, p: s.a },
    { t: 1, p: s.b },
  ])
  // a line's end on another line cuts it there (a T); an end that stops just short of a line it does not touch (a
  // wall of another layer built against it) is linked to it
  const links: [Vec, Vec][] = []
  for (let i = 0; i < segs.length; i++) {
    for (const end of [segs[i].a, segs[i].b]) {
      let near: { j: number; t: number; p: Vec; d: number } | null = null
      for (let j = 0; j < segs.length; j++) {
        if (j === i) continue
        const c = closestOnSegment(end, segs[j].a, segs[j].b)
        if (c.dist <= 1e-3) cuts[j].push({ t: c.t, p: c.point })
        else if (c.dist <= JOIN && (!near || c.dist < near.d)) near = { j, t: c.t, p: c.point, d: c.dist }
      }
      if (!near) continue
      cuts[near.j].push({ t: near.t, p: near.p })
      links.push([end, near.p])
    }
  }
  for (let i = 0; i < segs.length; i++) {
    for (let j = i + 1; j < segs.length; j++) {
      const hit = crossing(segs[i].a, segs[i].b, segs[j].a, segs[j].b)
      if (!hit) continue
      cuts[i].push({ t: hit.t, p: hit.p })
      cuts[j].push({ t: hit.u, p: hit.p })
    }
  }
  const edges = new Map<string, WallGraph['edges'][number]>()
  const addEdge = (u: number, v: number, cost: number, ceiling: number) => {
    if (u === v) return
    const key = u < v ? `${u}|${v}` : `${v}|${u}`
    const known = edges.get(key)
    if (!known || cost < known.cost) edges.set(key, { u, v, cost, ceiling })
  }
  segs.forEach((s, i) => {
    const ids = cuts[i].sort((x, y) => x.t - y.t).map((c) => nodeOf(c.p))
    for (let k = 1; k < ids.length; k++) addEdge(ids[k - 1], ids[k], dist(nodes[ids[k - 1]], nodes[ids[k]]) * (s.open ? OPEN_COST : 1), s.ceiling)
  })
  for (const [a, b] of links) addEdge(nodeOf(a), nodeOf(b), dist(a, b), WALL_HEIGHT)
  return { nodes, edges: [...edges.values()] }
}

function crossing(a: Vec, b: Vec, c: Vec, d: Vec): { t: number; u: number; p: Vec } | null {
  const r = sub(b, a)
  const s = sub(d, c)
  const denom = cross(r, s)
  if (Math.abs(denom) < 1e-12) return null
  const ac = sub(c, a)
  const t = cross(ac, s) / denom
  const u = cross(ac, r) / denom
  if (t <= 1e-9 || t >= 1 - 1e-9 || u <= 1e-9 || u >= 1 - 1e-9) return null
  return { t, u, p: { x: a.x + r.x * t, y: a.y + r.y * t } }
}

// ---- the result -------------------------------------------------------------------------------------------------

export interface PointRef {
  layer: string
  id: string
}

export const pointKey = (r: PointRef): string => `${r.layer}:${r.id}`

/** The cable into one point, from the box before it on its circuit (or from the board). */
export interface Run {
  to: PointRef
  /** The box it comes from; null: the board (or its riser, on another floor). */
  from: PointRef | null
  /** Its way on the plan, from the box before to this one. */
  path: Vec[]
  /** Whether each stretch of `path` is buried (between buildings). */
  buried: boolean[]
  /** Drawn by hand (the point's `route`). */
  manual: boolean
  /** Cable length, m: along the plan, up and down to the boxes, and down into the ground where buried. */
  length: number
  /** Of which buried, m: across the ground, down to and up from BURIED_DEPTH, and down a wall into it. */
  buriedLength: number
  /** Its way's length on the plan, m (buried stretches included), and the rises at its two boxes up or down to its plane. */
  plan: number
  vertical: number
}

export interface Circuit {
  board: PointRef
  /** C1, C2… on its board. */
  name: string
  /** Its id on the board's `circuits`, and the name given it there, when it was defined by hand. */
  manualId?: string
  label?: string
  type: CircuitType
  /** The layer whose points it feeds, and its floor. */
  layer: string
  storey: number
  /** Where its runs go: in the ceiling (lighting) or in the floor (sockets). */
  plane: 'ceiling' | 'floor'
  /** 0 for L1, 1 for L2, 2 for L3. */
  phase: number
  points: PointRef[]
  /** Design load, VA, and current, A. */
  load: number
  current: number
  breaker: number
  /** Line and neutral's section, and the earth's, mm². */
  section: number
  earth: number
  /** The conduit its runs in walls, ceilings and floors take (by trade size); see its `plane` for which kind. */
  conduit: string
  /** The rigid PVC pipe of its buried stretches, when it has any (a three-core subterranean cable inside). */
  buriedPipe?: string
  /** Cable run, m: the sum of its runs (each run carries line, neutral and earth), and the riser to its floor. */
  length: number
  buriedLength: number
  /**
   * Where its length goes, m, adding up to it: along walls, ceilings and floors on the plan; up and down from its
   * boxes to the plane it runs in; buried (across, down to BURIED_DEPTH and up, and down a wall into the ground);
   * and the riser between its board's floor and its own.
   */
  parts: { walls: number; vertical: number; buried: number; riser: number }
  /** Up or down from the board's floor to this one, m (0 on the board's floor). */
  riser: number
  /** Voltage drop to its farthest box, %. */
  drop: number
  /** Where its runs start on its floor: at the board, or at the board's riser. */
  origin: Vec
  runs: Run[]
  /** Where it breaks a rule it cannot be sized out of. */
  warnings: string[]
  /** A feeder to a sub-board in this board's enclosure: a breaker and no run. */
  integrated?: boolean
}

export interface BoardWiring {
  ref: PointRef
  board: Board
  /** The floor it is on and where (a sub-board in its parent's enclosure: its parent's), and whether it is so. */
  storey: number
  place: Vec
  integrated: boolean
  circuits: Circuit[]
  /** Load on each phase, VA (before simultaneity). */
  phaseLoads: number[]
  /** The heaviest phase's current with SIMULTANEITY, A. */
  demand: number
  mainBreaker: number
  poles: number
  rcd: number
  /** The feeder's section from the meter, mm². */
  feeder: number
  /** DIN modules its breakers take, and the enclosure's size with room to spare. */
  modules: number
  enclosure: number
}

export interface Wiring {
  boards: BoardWiring[]
  /** Each point's circuit, by pointKey. */
  circuitOf: Map<string, Circuit>
  /** The board (its boardKey) that feeds each point, by pointKey: its circuit's, for one put on a circuit by hand on a board that may feed it; else a sub-board for one in its areas, else the main board of its layer. */
  feedOf: Map<string, string>
  /** Points no board feeds, by layer. */
  unfed: Map<string, number>
  warnings: string[]
}

/** The circuits whose runs are on floor `storey`: every one there, or with `layer`, only that layer's. */
export const circuitsOn = (w: Wiring, storey: number, layer: string | null): Circuit[] =>
  w.boards.flatMap((b) => b.circuits.filter((c) => c.storey === storey && (layer === null || c.layer === layer)))

/** What wiring needs worked out elsewhere (and cached there). */
export interface WiringSource {
  regions: (layer: Layer) => readonly Region[]
  /** The graph of a floor's visible walls. */
  graph: (storey: number) => WallGraph
}

// ---- routing ----------------------------------------------------------------------------------------------------

interface Terminal {
  key: string
  at: Vec
  /** A ceiling or floor box: it reaches the walls round it straight, and the boxes like it in its room. */
  free?: { mount: 'ceiling' | 'floor'; room: Region | null; outdoor?: boolean }
}

/** How many walls round it a ceiling or floor box reaches, and how much farther than the nearest they may be, m. */
const REACH = { walls: 4, slack: 2 }

/** A floor's wall graph with the boxes joined to it: each box is a node, tied straight to the nearest wall. */
class Net {
  pts: Vec[]
  adj: { to: number; cost: number; buried: boolean }[][]
  /** Each terminal's node, and the ceiling height where it joins the walls. */
  node = new Map<string, number>()
  ceiling = new Map<string, number>()
  /** Outdoor boxes (a garden light, a socket by the pool), by key and node: reached underground. */
  outdoorKeys = new Set<string>()
  private outdoor = new Set<number>()
  private boxes: Set<number>

  constructor(graph: WallGraph, terminals: readonly Terminal[]) {
    this.pts = [...graph.nodes]
    const edges: { u: number; v: number; cost: number; buried: boolean }[] = []
    // where boxes join each wall: a wall box on the nearest, a ceiling or floor box on the few nearest round it
    const attach = new Map<number, { t: number; box: number }[]>()
    for (const terminal of terminals) {
      const box = this.pts.push(terminal.at) - 1
      this.node.set(terminal.key, box)
      if (terminal.free?.outdoor) {
        this.outdoor.add(box)
        this.outdoorKeys.add(terminal.key)
      }
      const all = graph.edges.map((e, i) => ({ i, ...closestOnSegment(terminal.at, graph.nodes[e.u], graph.nodes[e.v]) }))
      if (!all.length) {
        this.ceiling.set(terminal.key, WALL_HEIGHT)
        continue
      }
      const nearest = Math.min(...all.map((c) => c.dist))
      const near = all.filter((c) => c.dist <= nearest + REACH.slack).sort((a, b) => a.dist - b.dist)
      this.ceiling.set(terminal.key, graph.edges[near[0].i].ceiling)
      // besides the nearest, only walls it is square to: no slanting runs to a wall's end
      const square = near.filter((c, k) => k === 0 || (c.t > 1e-6 && c.t < 1 - 1e-6))
      const chosen = terminal.free ? square.filter((c, k) => k < REACH.walls && c.dist <= near[0].dist + REACH.slack) : [near[0]]
      for (const c of chosen) attach.set(c.i, [...(attach.get(c.i) ?? []), { t: c.t, box }])
    }
    graph.edges.forEach((e, i) => {
      const on = attach.get(i)
      if (!on) return edges.push({ u: e.u, v: e.v, cost: e.cost, buried: false })
      // the wall is cut where each box joins it, in order along it
      const [a, b] = [graph.nodes[e.u], graph.nodes[e.v]]
      let [last, lastT] = [e.u, 0]
      for (const { t, box } of on.sort((x, y) => x.t - y.t)) {
        const foot = this.pts.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }) - 1
        edges.push({ u: last, v: foot, cost: (t - lastT) * e.cost, buried: false })
        // an outdoor box is reached underground from the foot of the wall: down, across, up
        const under = this.outdoor.has(box)
        edges.push({ u: foot, v: box, cost: dist(this.pts[foot], this.pts[box]) + (under ? 2 * BURIED_DEPTH : 0), buried: under })
        ;[last, lastT] = [foot, t]
      }
      edges.push({ u: last, v: e.v, cost: (1 - lastT) * e.cost, buried: false })
    })
    // ceiling boxes in one room are joined straight across its ceiling, floor boxes across its floor
    const free = terminals.filter((t) => t.free?.room)
    for (let i = 0; i < free.length; i++) {
      for (let j = i + 1; j < free.length; j++) {
        const [a, b] = [free[i], free[j]]
        if (a.free!.mount === b.free!.mount && a.free!.room === b.free!.room) edges.push({ u: this.node.get(a.key)!, v: this.node.get(b.key)!, cost: dist(a.at, b.at), buried: false })
      }
    }
    // outdoor boxes are joined to one another underground (garden lights in a row)
    const out = terminals.filter((t) => t.free?.outdoor)
    for (let i = 0; i < out.length; i++) {
      for (let j = i + 1; j < out.length; j++) edges.push({ u: this.node.get(out[i].key)!, v: this.node.get(out[j].key)!, cost: dist(out[i].at, out[j].at) + 2 * BURIED_DEPTH, buried: true })
    }
    this.adj = this.pts.map(() => [])
    for (const e of edges) this.link(e.u, e.v, e.cost, e.buried)
    this.boxes = new Set(this.node.values())
    this.bridge(graph, this.boxes)
  }

  private link(u: number, v: number, cost: number, buried: boolean) {
    this.adj[u].push({ to: v, cost, buried })
    this.adj[v].push({ to: u, cost, buried })
  }

  /**
   * Joins the parts of the graph that hold boxes, nearest nodes first (a spanning tree of the parts): buried between
   * walls that do not touch (buildings apart), straight where a part is a lone box.
   */
  private bridge(graph: WallGraph, boxes: Set<number>) {
    const part = new Int32Array(this.pts.length).fill(-1)
    let parts = 0
    for (let s = 0; s < this.pts.length; s++) {
      if (part[s] >= 0) continue
      const stack = [s]
      part[s] = parts
      while (stack.length) {
        for (const { to } of this.adj[stack.pop()!]) {
          if (part[to] >= 0) continue
          part[to] = parts
          stack.push(to)
        }
      }
      parts++
    }
    const used = [...new Set([...boxes].map((n) => part[n]))]
    if (used.length < 2) return
    const walled = new Set<number>()
    for (let n = 0; n < graph.nodes.length; n++) walled.add(part[n])
    // the closest pair of nodes between each two parts
    const members = new Map(used.map((p) => [p, [] as number[]]))
    for (let n = 0; n < this.pts.length; n++) members.get(part[n])?.push(n)
    const pairs: { d: number; p: number; q: number; u: number; v: number }[] = []
    for (let i = 0; i < used.length; i++) {
      for (let j = i + 1; j < used.length; j++) {
        let best = { d: Infinity, u: -1, v: -1 }
        for (const u of members.get(used[i])!) for (const v of members.get(used[j])!) {
          const d = dist(this.pts[u], this.pts[v])
          if (d < best.d) best = { d, u, v }
        }
        pairs.push({ ...best, p: used[i], q: used[j] })
      }
    }
    const root = new Map(used.map((p) => [p, p]))
    const find = (p: number): number => (root.get(p) === p ? p : find(root.get(p)!))
    for (const pair of pairs.sort((x, y) => x.d - y.d)) {
      const [a, b] = [find(pair.p), find(pair.q)]
      if (a === b) continue
      root.set(a, b)
      const buried = walled.has(pair.p) && walled.has(pair.q)
      this.link(pair.u, pair.v, pair.d + (buried ? 2 * BURIED_DEPTH : 0), buried)
    }
  }

  /**
   * Shortest costs from a node, and the way back (Dijkstra), as far as it takes to reach every node of `targets`
   * (their costs and ways are then final). A cable enters a box only to end there: runs do not pass through other
   * boxes (nor across a room by another box's links).
   */
  from(source: number, targets: readonly number[]): Paths {
    const n = this.pts.length
    const cost = new Float64Array(n).fill(Infinity)
    const prev = new Int32Array(n).fill(-1)
    const heap = new MinHeap()
    const wanted = new Set(targets)
    wanted.delete(source)
    cost[source] = 0
    heap.push(source, 0)
    while (heap.size && wanted.size) {
      const c = heap.top
      const u = heap.pop()
      if (c > cost[u]) continue
      wanted.delete(u)
      if (u !== source && this.boxes.has(u)) continue
      for (const { to, cost: w } of this.adj[u]) {
        if (c + w < cost[to]) {
          cost[to] = c + w
          prev[to] = u
          heap.push(to, c + w)
        }
      }
    }
    return { cost, prev }
  }

  /**
   * The way from node `a` to node `b` (searched from `a`), as points, with whether each stretch is buried; collinear
   * points merged.
   */
  path(a: number, b: number, { prev }: Paths): { pts: Vec[]; buried: boolean[]; buriedLength: number; crossings: number; descents: number } {
    const ids = [b]
    while (ids[ids.length - 1] !== a && prev[ids[ids.length - 1]] >= 0) ids.push(prev[ids[ids.length - 1]])
    ids.reverse()
    const pts: Vec[] = [this.pts[ids[0]]]
    const buried: boolean[] = []
    let buriedLength = 0
    let crossings = 0
    let descents = 0
    for (let i = 1; i < ids.length; i++) {
      const under = this.adj[ids[i - 1]].some((e) => e.to === ids[i] && e.buried)
      const p = this.pts[ids[i]]
      if (dist(p, pts[pts.length - 1]) < 1e-6) continue
      if (under) {
        buriedLength += dist(p, pts[pts.length - 1]) + 2 * BURIED_DEPTH
        crossings++
        // it goes into the ground at a wall's foot (not at an outdoor box, which is there already)
        descents += (this.outdoor.has(ids[i - 1]) ? 0 : 1) + (this.outdoor.has(ids[i]) ? 0 : 1)
      }
      // a straight continuation of the same kind extends the last stretch
      const n = pts.length
      if (n >= 2 && buried[n - 2] === under && Math.abs(cross(sub(pts[n - 1], pts[n - 2]), sub(p, pts[n - 1]))) < 1e-9 * dist(pts[n - 2], p) ** 2 + 1e-12) {
        pts[n - 1] = p
        continue
      }
      pts.push(p)
      buried.push(under)
    }
    return { pts, buried, buriedLength, crossings, descents }
  }
}

interface Paths {
  cost: Float64Array
  prev: Int32Array
}

/** A binary min-heap of node ids by cost, in typed arrays (searches push and pop a great many). */
class MinHeap {
  private ids = new Int32Array(64)
  private keys = new Float64Array(64)
  size = 0

  push(id: number, cost: number) {
    if (this.size === this.ids.length) {
      const [ids, keys] = [new Int32Array(this.size * 2), new Float64Array(this.size * 2)]
      ids.set(this.ids)
      keys.set(this.keys)
      ;[this.ids, this.keys] = [ids, keys]
    }
    let i = this.size++
    while (i > 0) {
      const p = (i - 1) >> 1
      if (this.keys[p] <= cost) break
      this.ids[i] = this.ids[p]
      this.keys[i] = this.keys[p]
      i = p
    }
    this.ids[i] = id
    this.keys[i] = cost
  }

  /** The cheapest id (its cost is `top` before popping). */
  pop(): number {
    const top = this.ids[0]
    const n = --this.size
    const [id, cost] = [this.ids[n], this.keys[n]]
    let i = 0
    for (;;) {
      let m = 2 * i + 1
      if (m >= n) break
      if (m + 1 < n && this.keys[m + 1] < this.keys[m]) m++
      if (this.keys[m] >= cost) break
      this.ids[i] = this.ids[m]
      this.keys[i] = this.keys[m]
      i = m
    }
    this.ids[i] = id
    this.keys[i] = cost
    return top
  }

  get top(): number {
    return this.keys[0]
  }
}

// ---- circuits -----------------------------------------------------------------------------------------------------

interface Box {
  ref: PointRef
  key: string
  /** A point's own fields, or (for a sub-board's feeder circuit, on its parent) the sub-board's. */
  point: Electrical
  at: Vec
  load: number
}

/** Boxes packed into circuits near to one another: each starts at the box nearest `origin` and takes the nearest that fit. */
function pack<T extends { boxes: Box[]; load: number; at: Vec }>(groups: T[], origin: Vec, maxPoints: number, maxLoad: number): T[][] {
  const left = [...groups].sort((a, b) => dist(a.at, origin) - dist(b.at, origin))
  const out: T[][] = []
  while (left.length) {
    const circuit = [left.shift()!]
    let [points, load] = [circuit[0].boxes.length, circuit[0].load]
    // each group's distance to the circuit so far, kept up as it grows
    const near = new Map(left.map((g) => [g, dist(g.at, circuit[0].at)]))
    for (;;) {
      let best: T | null = null
      for (const g of left) if (points + g.boxes.length <= maxPoints && load + g.load <= maxLoad && (!best || near.get(g)! < near.get(best)!)) best = g
      if (!best) break
      circuit.push(best)
      left.splice(left.indexOf(best), 1)
      points += best.boxes.length
      load += best.load
      for (const g of left) near.set(g, Math.min(near.get(g)!, dist(g.at, best.at)))
    }
    out.push(circuit)
  }
  return out
}

const nextOf = (list: readonly number[], value: number): number => list.find((v) => v >= value - 1e-9) ?? list[list.length - 1]

/** The conduit that takes line, neutral and earth of these sections. */
export function conduitFor(section: number, earth: number): string {
  const d = (s: number) => SECTIONS.find((x) => x.section === s)?.diameter ?? 3
  const area = ((2 * d(section) ** 2 + d(earth) ** 2) * Math.PI) / 4
  return (CONDUITS.find((c) => (Math.PI * c.inside ** 2) / 4 * CONDUIT_FILL >= area) ?? CONDUITS[CONDUITS.length - 1]).name
}

/** The rigid PVC pipe a buried stretch of a circuit of `section` takes (its three-core cable inside). */
export function buriedPipeFor(section: number): string {
  const d = BURIED_CABLES[section] ?? 30
  return (BURIED_PIPES.find((p) => p.inside ** 2 * BURIED_FILL >= d ** 2) ?? BURIED_PIPES[BURIED_PIPES.length - 1]).name
}

/** The earth conductor for a line of `section`: the same up to 16 mm², at least MIN_EARTH, half above. */
export const earthFor = (section: number): number => Math.max(MIN_EARTH, section <= 16 ? section : nextOf(SECTIONS.map((s) => s.section), section / 2))

/** A board's net terminal on floor `storey`: its own, or a riser there. */
const terminalKey = (b: { layer: Layer; id: string }, storey: number): string => `board:${b.layer.id}:${b.id}:${storey}`

const inRegion = (p: Vec, r: Region) => pointInPolygon(p, r.outer) && !r.holes.some((h) => pointInPolygon(p, h))

/** Works out every board's circuits, runs and sizes (see the top of this file). */
export function wiringPlan(plan: Plan, source: WiringSource): Wiring {
  const warnings: string[] = []
  const circuitOf = new Map<string, Circuit>()
  const feedOf = new Map<string, string>()
  const unfed = new Map<string, number>()
  const visible = plan.layers.filter((l) => l.visible)
  const boards = boardsOf(plan).filter((b) => b.layer.visible)
  type B = (typeof boards)[number]
  const keyOf = (b: B) => boardKey({ layer: b.layer.id, id: b.id })
  const byKey = new Map(boards.map((b) => [keyOf(b), b]))

  // which board each sub-board is fed from: a dangling or looped parent is dropped to the meter, with a warning
  const parentOf = new Map<string, B>()
  for (const b of boards) {
    if (!b.board.parent) continue
    const pkey = boardKey({ layer: b.board.parent.layer, id: b.board.parent.board })
    const p = pkey !== keyOf(b) ? byKey.get(pkey) : undefined
    if (p) parentOf.set(keyOf(b), p)
    else warnings.push(`${b.board.name} is fed from a board that is gone: treated as fed from the meter.`)
  }
  const childrenOf = new Map<string, B[]>()
  for (const [key, p] of parentOf) childrenOf.set(keyOf(p), [...(childrenOf.get(keyOf(p)) ?? []), byKey.get(key)!])
  // where each board is (a sub-board in its parent's enclosure is where its parent is), and on which floor
  const place = (b: B) => boardPlace(plan, b)
  const storeyAt = (b: B) => storeyOf(place(b).layer)

  // which board feeds each point: a sub-board one of whose areas it is in (the smallest), else its layer's main board
  const mainOf = new Map<string, B>()
  for (const b of boards) if (!b.board.parent) for (const id of b.board.layers) if (!mainOf.has(id)) mainOf.set(id, b)
  // a sub-board from before sub-boards fed areas still feeds the layers it lists, over their main board
  for (const b of boards) {
    if (!b.board.parent || !b.board.layers.length) continue
    for (const id of b.board.layers) mainOf.set(id, b)
    warnings.push(`${b.board.name} feeds whole layers, as sub-boards did before they fed areas: tick its areas instead.`)
  }
  const zones: { b: B; layer: string; region: Region }[] = []
  const claimed = new Set<string>()
  for (const b of boards) {
    if (!b.board.parent) continue
    for (const a of b.board.areas) {
      const layer = visible.find((l) => l.id === a.layer)
      const area = layer?.areas[a.area]
      if (!layer || !area || claimed.has(`${a.layer}:${a.area}`)) continue
      claimed.add(`${a.layer}:${a.area}`)
      const region = regionAt(source.regions(layer), area.at)
      if (region) zones.push({ b, layer: layer.id, region })
    }
  }
  const fed = new Map<B, Map<string, Box[]>>()
  for (const layer of visible) {
    let loose = 0
    for (const [id, e] of Object.entries(layer.electrical)) {
      if (e.kind === 'board') continue
      const probe = probeOf(e)
      const inZones = zones.filter((z) => z.layer === layer.id && inRegion(probe, z.region)).sort((x, y) => x.region.area - y.region.area)
      const byArea = inZones[0]?.b ?? mainOf.get(layer.id)
      // a point put on a circuit by hand is fed by that circuit's board, when that board may feed it there: its layers,
      // its areas, or what its sub-boards may (a circuit may be moved to another board, points and all)
      const covers = (x: B, depth = 0): boolean =>
        depth < 10 && (x.board.layers.includes(layer.id) || inZones.some((z) => z.b === x) || (childrenOf.get(keyOf(x)) ?? []).some((c) => covers(c, depth + 1)))
      const holds = (x: B) => !!e.circuit && x.board.circuits[e.circuit]?.layer === layer.id && x.board.circuits[e.circuit].type === circuitKindOf(e)
      const b = byArea && holds(byArea) ? byArea : (boards.find((x) => holds(x) && covers(x)) ?? byArea)
      if (!b) {
        loose++
        continue
      }
      const ref = { layer: layer.id, id }
      feedOf.set(pointKey(ref), keyOf(b))
      const byLayer = fed.get(b) ?? (fed.set(b, new Map()), fed.get(b)!)
      byLayer.set(layer.id, [...(byLayer.get(layer.id) ?? []), { ref, key: pointKey(ref), point: e, at: e.at, load: loadOf(e) }])
    }
    if (loose) {
      unfed.set(layer.id, loose)
      warnings.push(`${layer.name}: ${loose} point${loose === 1 ? '' : 's'} no board feeds. Put a board on a wall, or tick ${layer.name} on one.`)
    }
  }

  // every box on each floor, boards and their risers included, joined to the walls there
  const terminals = new Map<number, Terminal[]>()
  const on = (storey: number) => terminals.get(storey) ?? (terminals.set(storey, []), terminals.get(storey)!)
  const riserTo = (b: B, storey: number) => {
    const list = on(storey)
    if (!list.some((t) => t.key === terminalKey(b, storey))) list.push({ key: terminalKey(b, storey), at: place(b).at })
  }
  for (const b of boards) {
    on(storeyAt(b)).push({ key: terminalKey(b, storeyAt(b)), at: place(b).at })
    for (const layerId of fed.get(b)?.keys() ?? []) {
      const layer = visible.find((l) => l.id === layerId)!
      if (storeyOf(layer) !== storeyAt(b)) riserTo(b, storeyOf(layer))
    }
    const parent = parentOf.get(keyOf(b))
    if (parent && !b.board.integrated && storeyAt(b) !== storeyAt(parent)) riserTo(parent, storeyAt(b))
  }
  for (const layer of visible) {
    const floor = { ...plan, layers: plan.layers.filter((l) => storeyOf(l) === storeyOf(layer)) }
    for (const [id, e] of Object.entries(layer.electrical)) {
      if (e.kind === 'board' || !feedOf.has(pointKey({ layer: layer.id, id }))) continue
      const room = e.mount === 'wall' ? null : roomAt(floor, e.at, source.regions)
      // a floor box in no room, or on a terrace or a lot (under no cover), is outdoors
      const outdoor = e.mount === 'floor' && !(room && isCovered(room))
      const free = e.mount === 'wall' ? undefined : { mount: e.mount, room: outdoor ? null : room, outdoor }
      on(storeyOf(layer)).push({ key: pointKey({ layer: layer.id, id }), at: e.at, free })
    }
  }
  const nets = new Map<number, Net>()
  const netOf = (storey: number) => nets.get(storey) ?? (nets.set(storey, new Net(source.graph(storey), terminals.get(storey) ?? [])), nets.get(storey)!)

  /** What a circuit of board `b` on layer `layer` is built from. */
  const contextOf = (b: B, layer: Layer): CircuitContext => {
    const at = place(b)
    return {
      layer,
      boardLayer: at.layer,
      board: at.board,
      boardRef: { layer: b.layer.id, id: b.id },
      net: netOf(storeyOf(layer)),
      originKey: terminalKey(b, storeyOf(layer)),
      boardStorey: storeyAt(b),
      storey: storeyOf(layer),
      origin: at.at,
    }
  }

  const sized = new Map<string, BoardWiring>()
  const inProgress = new Set<string>()
  function size(b: B): BoardWiring {
    const key = keyOf(b)
    const known = sized.get(key)
    if (known) return known
    const ref = { layer: b.layer.id, id: b.id }
    const circuits: Circuit[] = []
    let childModules = 0
    if (!inProgress.has(key)) {
      inProgress.add(key)
      const mine = fed.get(b) ?? new Map<string, Box[]>()
      // circuits defined by hand, in the order they were made; their points come off what is grouped automatically
      const used = new Set<string>()
      for (const [id, def] of Object.entries(b.board.circuits)) {
        const layer = visible.find((l) => l.id === def.layer)
        if (!layer) continue
        const members = (mine.get(def.layer) ?? []).filter((x) => x.point.kind !== 'board' && x.point.circuit === id && fitsCircuit(x.point as ElectricPoint, def.type))
        for (const m of members) used.add(m.key)
        circuits.push(buildCircuit(def.type, members, contextOf(b, layer), { manualId: id, label: def.name || undefined }))
      }
      // the points on no circuit of this board: grouped automatically, layer by layer, the board's own first
      const layers = visible.filter((l) => mine.has(l.id)).sort((x, y) => Number(y === b.layer) - Number(x === b.layer))
      for (const layer of layers) circuits.push(...autoCircuits((mine.get(layer.id) ?? []).filter((x) => !used.has(x.key)), place(b).at, contextOf(b, layer)))
      // its sub-boards: a feeder each, or only a breaker for one in its own enclosure
      for (const child of childrenOf.get(key) ?? []) {
        const cw = size(child)
        if (child.board.integrated) {
          circuits.push(internalFeeder(ref, child, cw, place(b).at, storeyAt(b)))
          childModules += cw.modules
        } else circuits.push(feederCircuit(child, cw, contextOf(b, place(child).layer), terminalKey(child, storeyAt(child))))
      }
      if (!mine.size && !(childrenOf.get(key) ?? []).length) {
        warnings.push(b.board.parent ? `${b.board.name} feeds no area: tick the areas it feeds.` : `${b.board.name} feeds no layer and no sub-board: tick what it feeds.`)
      }
      inProgress.delete(key)
    } else warnings.push(`${b.board.name}: a loop in its sub-boards stopped here.`)
    // shared over the phases, the heaviest first onto the lightest phase
    const phases = phasesOf(b.board.supply)
    const phaseLoads = new Array<number>(phases).fill(0)
    for (const c of [...circuits].sort((x, y) => y.load - x.load)) {
      const p = phaseLoads.indexOf(Math.min(...phaseLoads))
      c.phase = p
      phaseLoads[p] += c.load
    }
    circuits.forEach((c, i) => {
      c.name = `C${i + 1}`
      for (const p of c.points) circuitOf.set(pointKey(p), c)
    })
    const demand = (Math.max(0, ...phaseLoads) * SIMULTANEITY) / VOLTAGE
    const mainBreaker = nextOf(BREAKERS, Math.max(MIN_MAIN, demand))
    const feederSection = (SECTIONS.find((s) => s.section >= MIN_FEEDER && s.amps >= mainBreaker) ?? SECTIONS[SECTIONS.length - 1]).section
    // the main breaker cuts the phases and the neutral; the RCD is four-pole; a sub-board in this enclosure adds its own
    const poles = phases + 1
    const modules = poles + 4 + 2 * circuits.length + childModules
    const result: BoardWiring = {
      ref,
      board: b.board,
      storey: storeyAt(b),
      place: place(b).at,
      integrated: !!b.board.integrated && parentOf.has(key),
      circuits,
      phaseLoads,
      demand,
      mainBreaker,
      poles,
      rcd: nextOf(RCDS, mainBreaker),
      feeder: feederSection,
      modules,
      enclosure: b.board.integrated && parentOf.has(key) ? 0 : nextOf([12, 24, 36, 48, 72, 96], Math.ceil(modules * 1.2)),
    }
    sized.set(key, result)
    return result
  }
  const out = boards.map(size)
  return { boards: out, circuitOf, feedOf, unfed, warnings }
}

/**
 * A layer's points that are on no circuit defined by hand, grouped automatically: lighting (switches and light
 * outlets), then general sockets, packed by nearness from the board, then one circuit per special socket.
 */
function autoCircuits(boxes: Box[], origin: Vec, ctx: CircuitContext): Circuit[] {
  const out: Circuit[] = []
  const cap = (t: CircuitType) => 0.8 * CIRCUIT_RULES[t].maxBreaker * VOLTAGE
  const single = (list: Box[]) => list.map((x) => ({ boxes: [x], load: x.load, at: x.at }))
  const lighting = boxes.filter((x) => x.point.kind === 'switch' || x.point.kind === 'light')
  for (const packed of pack(single(lighting), origin, CIRCUIT_RULES.lighting.maxPoints, cap('lighting'))) out.push(buildCircuit('lighting', packed.flatMap((g) => g.boxes), ctx))
  const sockets = boxes.filter((x) => x.point.kind === 'socket' && x.point.use !== 'special')
  for (const packed of pack(single(sockets), origin, CIRCUIT_RULES.sockets.maxPoints, cap('sockets'))) out.push(buildCircuit('sockets', packed.flatMap((g) => g.boxes), ctx))
  for (const x of boxes.filter((x) => x.point.kind === 'socket' && x.point.use === 'special')) out.push(buildCircuit('special', [x], ctx))
  return out
}

/**
 * A sub-board's feeder on its parent, for a sub-board on a wall of its own: a circuit of one member, the sub-board
 * itself, its design current the sub-board's own main breaker (it must carry at least that). Runs overhead.
 */
function feederCircuit(child: { layer: Layer; id: string; board: Board }, childResult: BoardWiring, ctx: CircuitContext, childKey: string): Circuit {
  const member: Box = { ref: { layer: child.layer.id, id: child.id }, key: childKey, point: child.board, at: child.board.at, load: childResult.mainBreaker * VOLTAGE }
  return buildCircuit('subfeeder', [member], ctx)
}

/**
 * A sub-board in its parent's enclosure: its breaker on the parent, sized to the sub-board's main breaker, joined
 * inside the enclosure, so with no run, no conduit and no drop.
 */
function internalFeeder(parentRef: PointRef, child: { layer: Layer; id: string; board: Board }, childResult: BoardWiring, origin: Vec, storey: number): Circuit {
  const rules = CIRCUIT_RULES.subfeeder
  const current = childResult.mainBreaker
  const breaker = nextOf(BREAKERS, Math.max(rules.minBreaker, current))
  const section = (SECTIONS.find((s) => s.section >= rules.minSection && s.amps >= breaker) ?? SECTIONS[SECTIONS.length - 1]).section
  return {
    board: parentRef,
    name: '',
    type: 'subfeeder',
    integrated: true,
    layer: child.layer.id,
    storey,
    plane: 'ceiling',
    phase: 0,
    points: [{ layer: child.layer.id, id: child.id }],
    load: current * VOLTAGE,
    current,
    breaker,
    section,
    earth: earthFor(section),
    conduit: '',
    length: 0,
    buriedLength: 0,
    parts: { walls: 0, vertical: 0, buried: 0, riser: 0 },
    riser: 0,
    drop: 0,
    origin,
    runs: [],
    warnings: [],
  }
}

interface CircuitContext {
  layer: Layer
  boardLayer: Layer
  board: Board
  boardRef: PointRef
  net: Net
  originKey: string
  boardStorey: number
  storey: number
  origin: Vec
}

/** A circuit's tree from the board, its runs, and its sizes. */
function buildCircuit(type: CircuitType, members: Box[], ctx: CircuitContext, extra: { manualId?: string; label?: string } = {}): Circuit {
  const { net, board } = ctx
  const rules = CIRCUIT_RULES[type]
  // the plane its runs take: lighting (and a feeder) in the ceiling, sockets in the floor (a special socket high on a wall, in the ceiling)
  const ceilingPlane = type === 'lighting' || type === 'subfeeder' || (type === 'special' && members.length > 0 && heightOf(members[0].point) >= 1.2)
  const ceilingAt = (key: string) => net.ceiling.get(key) ?? WALL_HEIGHT
  const rise = (x: Box) => {
    // an outdoor box is reached underground: its way down and up is in the buried run
    if (net.outdoorKeys.has(x.key)) return 0
    const h = heightOf(x.point, ceilingAt(x.key))
    return ceilingPlane ? Math.max(0, ceilingAt(x.key) - h) : h
  }
  // from the board's box up or down to the plane on this floor
  const boardHeight = heightOf(board, ceilingAt(ctx.originKey))
  const planeHere = ceilingPlane ? ceilingAt(ctx.originKey) : 0
  const riser = ctx.storey === ctx.boardStorey ? 0 : Math.abs(levelOf(ctx.layer) + planeHere - (levelOf(ctx.boardLayer) + boardHeight))
  const rootRise = ctx.storey === ctx.boardStorey ? Math.abs(planeHere - boardHeight) : riser

  // Prim: grow the tree from the board, the nearest box first
  const nodes = [ctx.originKey, ...members.map((m) => m.key)]
  const nodeIds = nodes.map((k) => net.node.get(k)!)
  const rises = [rootRise, ...members.map(rise)]
  // the searches from each box of the circuit, as far as its other boxes
  const searches = new Map<number, Paths>()
  const search = (i: number) => searches.get(i) ?? (searches.set(i, net.from(nodeIds[i], nodeIds)), searches.get(i)!)
  const cost = (i: number, j: number) => search(i).cost[nodeIds[j]] + rises[i] + rises[j]
  const inTree = nodes.map((_, i) => i === 0)
  const best = nodes.map((_, j) => (j > 0 ? { cost: cost(0, j), parent: 0 } : { cost: Infinity, parent: -1 }))
  const parent = new Array<number>(nodes.length).fill(-1)
  const order: number[] = []
  for (let step = 1; step < nodes.length; step++) {
    let j = -1
    for (let k = 1; k < nodes.length; k++) if (!inTree[k] && (j < 0 || best[k].cost < best[j].cost)) j = k
    inTree[j] = true
    parent[j] = best[j].parent
    order.push(j)
    for (let k = 1; k < nodes.length; k++) {
      if (inTree[k]) continue
      const c = cost(j, k)
      if (c < best[k].cost) best[k] = { cost: c, parent: j }
    }
  }

  // the runs: along the walls, or the way drawn by hand
  const posOf = (i: number) => (i === 0 ? ctx.origin : members[i - 1].at)
  const runs: Run[] = []
  const runOf = new Map<number, Run>()
  for (const j of order) {
    const m = members[j - 1]
    const i = parent[j]
    const route = m.point.route
    let run: Run
    if (route?.length) {
      const path = [posOf(i), ...route, m.at]
      const buried = path.slice(1).map(() => false)
      // drawn by hand to or from an outdoor box: its stretch at that box is underground, down from the wall's foot
      let buriedLength = 0
      const ends = [i > 0 && net.outdoorKeys.has(members[i - 1].key) ? 0 : -1, net.outdoorKeys.has(m.key) ? path.length - 2 : -1]
      for (const k of new Set(ends.filter((k) => k >= 0))) {
        buried[k] = true
        buriedLength += dist(path[k], path[k + 1]) + 2 * BURIED_DEPTH + (ceilingPlane ? ceilingAt(m.key) : 0)
      }
      const flat = polylineLength(path)
      const vertical = rises[i] + rises[j]
      const extra = buriedLength - buried.reduce((sum, b, k) => sum + (b ? dist(path[k], path[k + 1]) : 0), 0)
      run = { to: m.ref, from: i ? members[i - 1].ref : null, path, buried, manual: true, length: flat + extra + vertical, buriedLength, plan: flat, vertical }
    } else {
      const way = net.path(nodeIds[i], nodeIds[j], search(i))
      // a ceiling run goes down the wall into the ground, and up again, wherever it goes underground at a wall
      const under = way.descents * (ceilingPlane ? ceilingAt(m.key) : 0)
      const flat = polylineLength(way.pts)
      run = {
        to: m.ref,
        from: i ? members[i - 1].ref : null,
        path: way.pts,
        buried: way.buried,
        manual: false,
        length: flat + 2 * BURIED_DEPTH * way.crossings + under + rises[i] + rises[j],
        buriedLength: way.buriedLength + under,
        plan: flat,
        vertical: rises[i] + rises[j],
      }
    }
    runs.push(run)
    runOf.set(j, run)
  }

  // sizes: the breaker over the design current, then the least section that carries it and keeps the drop in bounds
  const load = members.reduce((s, m) => s + m.load, 0)
  const current = load / VOLTAGE
  const breaker = nextOf(BREAKERS, Math.max(rules.minBreaker, current))
  const warnings: string[] = []
  if (breaker > rules.maxBreaker) warnings.push(`needs ${breaker} A, over the ${rules.maxBreaker} A a ${rules.code} circuit may have: split its load`)
  if (members.length > rules.maxPoints) warnings.push(`${members.length} points, more than the ${rules.maxPoints} a ${rules.code} circuit usually has`)
  // the load downstream of each box, for the voltage drop along the tree
  const below = nodes.map((_, k) => (k ? members[k - 1].load : 0))
  for (const j of [...order].reverse()) if (parent[j] > 0) below[parent[j]] += below[j]
  const dropAt = (section: number) => {
    const drop = new Array<number>(nodes.length).fill(0)
    drop[0] = (2 * riser * current * RHO) / section
    for (const j of order) drop[j] = drop[parent[j]] + (2 * runOf.get(j)!.length * (below[j] / VOLTAGE) * RHO) / section
    return (100 * Math.max(...drop)) / VOLTAGE
  }
  let pick = SECTIONS.find((s) => s.section >= rules.minSection && s.amps >= breaker && dropAt(s.section) <= MAX_DROP)
  if (!pick) {
    pick = SECTIONS[SECTIONS.length - 1]
    warnings.push(`drops ${dropAt(pick.section).toFixed(1)} % even at ${pick.section} mm²: bring its board nearer`)
  }
  const earth = earthFor(pick.section)
  const length = runs.reduce((s, r) => s + r.length, 0) + riser
  return {
    board: ctx.boardRef,
    name: '',
    manualId: extra.manualId,
    label: extra.label,
    type,
    layer: ctx.layer.id,
    storey: ctx.storey,
    plane: ceilingPlane ? 'ceiling' : 'floor',
    phase: 0,
    points: members.map((m) => m.ref),
    load,
    current,
    breaker,
    section: pick.section,
    earth,
    conduit: conduitFor(pick.section, earth),
    buriedPipe: runs.some((r) => r.buriedLength > 0) ? buriedPipeFor(pick.section) : undefined,
    length,
    buriedLength: runs.reduce((s, r) => s + r.buriedLength, 0),
    parts: {
      walls: runs.reduce((s, r) => s + r.length - r.buriedLength - r.vertical, 0),
      vertical: runs.reduce((s, r) => s + r.vertical, 0),
      buried: runs.reduce((s, r) => s + r.buriedLength, 0),
      riser,
    },
    riser,
    drop: dropAt(pick.section),
    origin: ctx.origin,
    runs,
    warnings,
  }
}
