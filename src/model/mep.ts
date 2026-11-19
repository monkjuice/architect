import { dist, type Vec } from './geometry'
import type { Vec3 } from './faces'
import { heightOf, HEIGHTS } from './electrical'
import { GAS_SIZES, GAS_TRENCH, type GasPlan } from './gas'
import { HVAC_SIZES, type HvacPlan } from './hvac'
import { findLayer, storeyOf, type Plan, type Ref } from './plan'
import { DRAIN, TRENCH, type PlumbingPlan } from './plumbing'
import type { Router } from './routing'
import { MOUNT } from './services3d'
import { levelOf as layerLevel, storeyLevel } from './storeys'
import { WALL_HEIGHT } from './walls'
import { BURIED_DEPTH, type Wiring } from './wiring'

/**
 * MEP coordination (the MEP tab): every installation together — the Electricity tab's cable runs, the Plumbing tab's
 * water and drains, the HVAC tab's heating, refrigerant lines and ducts, the Gas tab's pipe — as lines in 3-D, to see
 * where each goes through the walls and under the ground, and where they come too close.
 *
 * Each tab routes on the plan; the heights here are how such lines are usually laid, not something a tab decides:
 * cold and hot water, heating and floor circuits in the floor's screed, lighting circuits in the slab over the room,
 * drains under the floor falling to where they leave, split lines and ducts high on the walls, and anything outside
 * the buildings buried at its trench's depth. Inside, heights are from the floor of the building a line is in (a
 * ground floor on a plinth stands above the ground). The gas comes up out of the ground outside the wall, goes through
 * it in a sleeve above the floor inside (`MEP.gasEntry`), and runs low in the sub-floor (`MEP.gasFloor`), under what
 * the screed carries. Where a line passes from outside a building to inside it is a crossing: a sleeve through the
 * wall or under its foundation.
 *
 * Lines of different systems closer than `MEP.clearance` (the pipes' own sizes aside) are flagged: running side by
 * side over `MEP.together` or more, or, for gas and electricity, crossing at all (`MEP.gasElectric` apart). These are
 * usual coordination clearances to check on site, not code values.
 */

export const MEP = {
  /** Pipes and conduit in the floor's screed, m above the floor; a second layer where they cross is not modelled. */
  screed: 0.03,
  /** Lighting conduit in the slab over the room, m under the walls' top. */
  slab: 0.08,
  /** Where a water or gas point comes out of the wall to its fixture or appliance, m. */
  point: 0.5,
  /** Where the gas pipe goes through an outside wall, m above the floor inside. */
  gasEntry: 0.3,
  /**
   * Where the gas runs inside, m from the floor: low in the sub-floor, under the screed where the water, the heating
   * and the floor's conduits run, so it crosses them a hand's width below and never runs along them.
   */
  gasFloor: -0.1,
  /** Split units' refrigerant lines and ducts, m: under the ceiling. */
  high: 2.3,
  /** How close two systems may run, m, between their pipes' outsides; gas and electricity farther apart. */
  clearance: 0.05,
  gasElectric: 0.1,
  /** Side by side over this much counts as running together, m. */
  together: 0.3,
  /** Lines thinner than this are drawn at it in 3-D, m (radius), so they show from across the house. */
  minRadius: 0.018,
}

/** What each line is, for its colour and its toggle. */
export type MepKind = 'cable' | 'feed' | 'cold' | 'hot' | 'drain' | 'condensate' | 'heating' | 'radiant' | 'refrigerant' | 'duct' | 'gas'
export const MEP_SYSTEMS = ['electricity', 'water', 'drains', 'hvac', 'gas'] as const
export type MepSystem = (typeof MEP_SYSTEMS)[number]
export const SYSTEM_OF: Record<MepKind, MepSystem> = {
  cable: 'electricity',
  feed: 'water',
  cold: 'water',
  hot: 'water',
  drain: 'drains',
  condensate: 'drains',
  heating: 'hvac',
  radiant: 'hvac',
  refrigerant: 'hvac',
  duct: 'hvac',
  gas: 'gas',
}
export const SYSTEM_TITLES: Record<MepSystem, string> = { electricity: 'Electricity', water: 'Water', drains: 'Drains', hvac: 'HVAC', gas: 'Gas' }
/** Each kind's colour, as each tab draws it (electricity in one colour here, not a colour per circuit). */
export const KIND_COLORS: Record<MepKind, string> = {
  cable: '#34d399',
  feed: '#38bdf8',
  cold: '#38bdf8',
  hot: '#f87171',
  drain: '#c8965f',
  condensate: '#c8965f',
  // orange here: the HVAC tab's amber is too near the gas pipe's yellow with both shown
  heating: '#fb923c',
  radiant: '#fb923c',
  refrigerant: '#a78bfa',
  duct: '#9ca3af',
  gas: '#facc15',
}

export interface MepLine {
  kind: MepKind
  system: MepSystem
  /** Plan x and y, height z above the ground floor, m. */
  pts: Vec3[]
  /** Its pipe's or conduit's radius, m (a duct's). */
  radius: number
  title: string
  /** What it is the branch to, when it is one (a fixture, a piece, a point). */
  to?: Ref
}

/** Where a line goes from outside a building to inside it: through the wall in a sleeve, or under its foundation. */
export interface MepCrossing {
  at: Vec3
  system: MepSystem
  kind: MepKind
  /** Through the wall above the ground, or under the foundation. */
  way: 'wall' | 'below'
  /** Which way the line runs through it, on the plan (a unit vector). */
  dir: Vec
  /** The sleeve's radius, m: a little over the line's. */
  radius: number
  title: string
}

/** A stretch of a line buried outside: its trench. */
export interface MepTrench {
  a: Vec
  b: Vec
  depth: number
  width: number
  system: MepSystem
}

/** Two systems too close: running together, or gas crossing electricity. */
export interface MepClash {
  at: Vec3
  systems: [MepSystem, MepSystem]
  kinds: [MepKind, MepKind]
  titles: [string, string]
  /** Between their outsides, m (0: touching or overlapping). */
  gap: number
  /** What is wrong: running side by side, or crossing. */
  how: 'together' | 'crossing'
  /** Side by side over, m. */
  length: number
}

/** A place on the plan that shows one of the construction details (see MepDetails). */
export interface MepSpot {
  detail: MepDetail
  at: Vec3
  label: string
}
export type MepDetail = 'gas-entry' | 'drain-exit' | 'buried-cable' | 'wall-chase'

export interface MepPlan {
  lines: MepLine[]
  crossings: MepCrossing[]
  trenches: MepTrench[]
  clashes: MepClash[]
  spots: MepSpot[]
  /** Length of each system's lines, m (verticals included), and how much of it is buried. */
  totals: Record<MepSystem, { length: number; buried: number }>
}

/** What the coordination is worked out from: each tab's own plan, and the buildings to tell outside from in. */
export interface MepSource {
  wiring: Wiring
  plumbing: PlumbingPlan
  hvac: HvacPlan
  gas: GasPlan
  router: Pick<Router, 'buildingAt'>
  /**
   * The floor's level under a point on a floor, m above the ground: the level of the layer whose rooms it is in (a
   * ground floor on a plinth stands above the ground), else the floor's own (see derived.ts). Absent: the floor's.
   */
  levelAt?: (p: Vec, storey: number) => number
}

const v3 = (p: Vec, z: number): Vec3 => ({ x: p.x, y: p.y, z })

/**
 * A plan path lifted into 3-D: each stretch at its height (`zs`, one per stretch), vertical where the height changes
 * at a point, and up or down at its ends from `start` and to `end`. Where it passes between outside and inside a
 * building (`outside`, per stretch; or between `startOutside` and its first stretch) and `cross` is given, it goes
 * through the wall at that height: up (or down) to it on the outside, across `WALL_PASS`, then to the inside's
 * height, as a gas pipe comes out of the ground and into a house.
 */
function lift(
  path: readonly Vec[],
  zs: readonly number[],
  opts: { start?: number; end?: number; outside?: readonly boolean[]; startOutside?: boolean; cross?: number } = {},
): Vec3[] {
  const out: Vec3[] = []
  const push = (p: Vec, z: number) => {
    const last = out[out.length - 1]
    if (!last || Math.abs(last.x - p.x) + Math.abs(last.y - p.y) + Math.abs(last.z - z) > 1e-6) out.push(v3(p, z))
  }
  /** Through the wall at `cross` at `at`, toward `toward`, ending at height `to`. */
  const through = (at: Vec, toward: Vec, to: number) => {
    const d = { x: toward.x - at.x, y: toward.y - at.y }
    const l = Math.hypot(d.x, d.y) || 1
    const k = Math.min(WALL_PASS, l * 0.9) / l
    const beyond = { x: at.x + d.x * k, y: at.y + d.y * k }
    push(at, opts.cross!)
    push(beyond, opts.cross!)
    push(beyond, to)
  }
  if (opts.start !== undefined) push(path[0], opts.start)
  if (opts.cross !== undefined && opts.outside && opts.startOutside !== undefined && opts.startOutside !== opts.outside[0]) through(path[0], path[1], zs[0])
  else push(path[0], zs[0])
  for (let i = 1; i < path.length; i++) {
    const z = zs[i - 1]
    push(path[i], z)
    if (i >= path.length - 1) break
    const next = zs[i]
    if (opts.outside && opts.cross !== undefined && opts.outside[i - 1] !== opts.outside[i]) through(path[i], path[i + 1], next)
    else if (Math.abs(next - z) > 1e-6) push(path[i], next)
  }
  if (opts.end !== undefined) push(path[path.length - 1], opts.end)
  return out
}

/** A path whose vertices have explicit elevations, preserving continuous slopes instead of stair-stepping them. */
function liftVertices(path: readonly Vec[], zs: readonly number[], start?: number, end?: number): Vec3[] {
  const out: Vec3[] = []
  const push = (p: Vec, z: number) => {
    const last = out[out.length - 1]
    if (!last || Math.abs(last.x - p.x) + Math.abs(last.y - p.y) + Math.abs(last.z - z) > 1e-6) out.push(v3(p, z))
  }
  if (start !== undefined) push(path[0], start)
  path.forEach((p, i) => push(p, zs[i] ?? zs[zs.length - 1]))
  if (end !== undefined) push(path[path.length - 1], end)
  return out
}

/** A line before it is lifted: its plan path, each stretch's height and whether it is outside, and how it ends. */
interface Draft {
  line: Omit<MepLine, 'pts'>
  /** Lines only inherit a parent height inside the same circuit or network. */
  group: string
  path: Vec[]
  zs: number[]
  /** Optional height at every path vertex, for genuinely sloped lines such as drains. */
  vertexZs?: number[]
  outside: boolean[]
  /** Where it starts, m; absent: where the line it branches off ends there (or its first stretch's height). */
  start?: number
  end?: number
  /** The height it goes through a wall at, between outside and inside (gas). */
  cross?: number
  /** Its trench, where it is buried outside. */
  trench?: { depth: number; width: number }
}

const pointKey = (p: Vec) => `${Math.round(p.x * 1000)},${Math.round(p.y * 1000)}`

/**
 * One system's lines: each begins where the line it branches off ends (the tabs' runs are the edges of a tree, so a
 * branch starts at its parent's last point), at that line's height, so a junction is continuous; the outside-to-
 * inside passes (within a run or between a run and its branch) are its crossings, the buried stretches its trenches.
 */
function build(drafts: readonly Draft[], sink: { lines: MepLine[]; crossings: MepCrossing[]; trenches: MepTrench[] }) {
  const ends = new Map<string, { z: number; outside: boolean }>()
  const key = (d: Draft, p: Vec) => `${d.group}|${pointKey(p)}`
  for (const d of drafts) {
    const sloped = d.vertexZs ?? (d.line.kind === 'drain' && d.zs.length === d.path.length ? d.zs : undefined)
    const lastZ = sloped?.[sloped.length - 1] ?? d.zs[d.zs.length - 1]
    ends.set(key(d, d.path[d.path.length - 1]), { z: lastZ, outside: d.outside[d.outside.length - 1] })
  }
  for (const d of drafts) {
    const parent = d.start === undefined ? ends.get(key(d, d.path[0])) : undefined
    const sloped = d.vertexZs ?? (d.line.kind === 'drain' && d.zs.length === d.path.length ? d.zs : undefined)
    const drainStart = d.line.kind === 'drain' && d.line.to ? d.end : d.start
    const drainEnd = d.line.kind === 'drain' ? undefined : d.end
    const pts = sloped
      ? liftVertices(d.path, sloped, drainStart ?? parent?.z, drainEnd)
      : lift(d.path, d.zs, { start: d.start ?? parent?.z, end: d.end, outside: d.outside, startOutside: parent?.outside, cross: d.cross })
    const line: MepLine = { ...d.line, pts }
    sink.lines.push(line)
    const crossAt = (i: number, z: number, fromOutside: boolean, toOutside: boolean) => {
      const [p, q] = [d.path[i], d.path[Math.min(i + 1, d.path.length - 1)]]
      const l = Math.hypot(q.x - p.x, q.y - p.y) || 1
      sink.crossings.push({
        // a gas pipe goes through at its crossing height, half a wall in from where it turns
        at: d.cross !== undefined ? v3({ x: p.x + ((q.x - p.x) / l) * 0.15, y: p.y + ((q.y - p.y) / l) * 0.15 }, d.cross) : v3(p, z),
        system: line.system,
        kind: line.kind,
        way: d.cross !== undefined || (!fromOutside && !toOutside) || z > 0 ? 'wall' : 'below',
        dir: { x: (q.x - p.x) / l, y: (q.y - p.y) / l },
        radius: Math.max(line.radius, MEP.minRadius) + 0.02,
        title: line.title,
      })
    }
    if (parent && parent.outside !== d.outside[0]) crossAt(0, Math.max(parent.z, d.zs[0]), parent.outside, d.outside[0])
    d.outside.forEach((o, i) => {
      const za = sloped?.[i] ?? d.zs[i]
      const zb = sloped?.[i + 1] ?? d.zs[i]
      if (o && d.trench && Math.min(za, zb) < 0) {
        const depth = sloped ? Math.max(0, -Math.min(za, zb)) : d.trench.depth
        sink.trenches.push({ a: d.path[i], b: d.path[i + 1], depth, width: d.trench.width, system: line.system })
      }
      if (i && o !== d.outside[i - 1]) crossAt(i, Math.max(d.zs[i], d.zs[i - 1]), d.outside[i - 1], o)
    })
  }
}

/** How far a line runs at its crossing height through a wall: a thick outside wall and a little over. */
const WALL_PASS = 0.4

const lengthOf = (pts: readonly Vec3[]) => pts.reduce((s, p, i) => (i ? s + Math.hypot(p.x - pts[i - 1].x, p.y - pts[i - 1].y, p.z - pts[i - 1].z) : s), 0)

export function mepPlan(plan: Plan, src: MepSource): MepPlan {
  const sink = { lines: [] as MepLine[], crossings: [] as MepCrossing[], trenches: [] as MepTrench[] }
  const spots: MepSpot[] = []
  const outsideOf = (path: readonly Vec[]) => path.slice(1).map((p, i) => src.router.buildingAt({ x: (p.x + path[i].x) / 2, y: (p.y + path[i].y) / 2 }) < 0)
  const mid = (a: Vec, b: Vec): Vec => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 })

  // ---- electricity: each circuit's runs in the slab over the room (lighting) or the screed (sockets), buried
  // between buildings; each run goes from box to box, so it starts at its own box
  const point = (ref: { layer: string; id: string } | null) => (ref ? findLayer(plan, ref.layer)?.electrical[ref.id] : undefined)
  const cables: Draft[] = []
  for (const bw of src.wiring.boards) {
    for (const c of bw.circuits) {
      if (c.integrated) continue
      const layer = findLayer(plan, c.layer)
      const level = layer ? layerLevel(layer) : 0
      const plane = level + (c.plane === 'ceiling' ? WALL_HEIGHT - MEP.slab : MEP.screed)
      for (const r of c.runs) {
        if (r.path.length < 2) continue
        const from = point(r.from)
        const to = point(r.to)
        const start = r.from ? (from ? level + heightOf(from) : plane) : c.storey === bw.storey ? level + HEIGHTS.board : plane
        const title = `${c.label || c.name} (${c.type === 'lighting' ? 'lighting' : c.type === 'sockets' ? 'sockets' : c.type === 'special' ? 'special socket' : 'sub-board feeder'})`
        cables.push({
          group: `electricity:${c.board.layer}:${c.board.id}:${c.name}:${c.layer}`,
          line: { kind: 'cable', system: 'electricity', radius: 0.01, title, to: { layer: r.to.layer, kind: 'electrical', id: r.to.id } },
          path: r.path,
          zs: r.buried.map((b) => (b ? -BURIED_DEPTH : plane)),
          outside: r.buried,
          start,
          end: to ? level + heightOf(to) : plane,
          trench: { depth: BURIED_DEPTH, width: 0.3 },
        })
        if (r.buried.some(Boolean) && !spots.some((s) => s.detail === 'buried-cable')) {
          const i = r.buried.indexOf(true)
          spots.push({ detail: 'buried-cable', at: v3(mid(r.path[i], r.path[i + 1]), -BURIED_DEPTH), label: title })
        }
      }
    }
  }
  build(cables, sink)

  // ---- plumbing: supplies in the screed (buried outside), drains under the floor falling to where they leave
  const water: Draft[] = []
  const drains: Draft[] = []
  /**
   * The level of the floor a run is laid on, m above the ground: on a floor above (a trap's, a radiant lead), or a
   * ground floor on a plinth, taken where the run is inside a building; 0 for one wholly outside.
   */
  const levelAt = src.levelAt ?? ((_: Vec, storey: number) => (storey ? storeyLevel(plan, storey) : 0))
  const levelOf = (r: { path: readonly Vec[]; storey: number }) => {
    const inside = r.path.slice(1).map((p, i) => mid(r.path[i], p)).find((p) => src.router.buildingAt(p) >= 0)
    return inside || r.storey ? levelAt(inside ?? r.path[0], r.storey) : 0
  }
  const stretchLevel = (path: readonly Vec[], i: number, storey: number) => {
    const at = mid(path[i], path[i + 1])
    return src.router.buildingAt(at) >= 0 || storey ? levelAt(at, storey) : 0
  }
  for (const r of src.plumbing.runs) {
    if (r.path.length < 2) continue
    const outside = outsideOf(r.path)
    const radius = r.size / 2000
    const lv = levelOf(r)
    if (r.kind === 'drain') {
      // Branches start at a fixture and fall toward their trap; main runs start at the outlet and rise upstream.
      const total = r.path.reduce((s, p, i) => (i ? s + dist(r.path[i - 1], p) : s), 0)
      let along = 0
      const vertexZs = r.path.map((p, i) => {
        if (i) along += dist(r.path[i - 1], p)
        const fall = r.to ? along : total - along
        return lv - DRAIN.cover - DRAIN.slope * fall
      })
      const zs = vertexZs
      drains.push({ group: 'drains:soil', line: { kind: 'drain', system: 'drains', radius, title: `Ø${r.size} drain`, ...(r.to ? { to: r.to } : {}) }, path: r.path, zs, outside, end: r.to ? lv + (r.rise || 0) : undefined, trench: { depth: lv - zs[0], width: 0.4 } })
      continue
    }
    if (r.kind === 'condensate') {
      drains.push({ group: 'drains:condensate', line: { kind: 'condensate', system: 'drains', radius, title: 'Condensate drain' }, path: r.path, zs: outside.map((_, i) => stretchLevel(r.path, i, r.storey) + MEP.screed), outside, start: lv + MOUNT.split - 0.3 })
      continue
    }
    const title = `Ø${r.size} ${r.kind === 'hot' ? 'hot water' : r.kind === 'feed' ? 'supply' : 'cold water'}`
    water.push({
      group: `water:${r.kind}`,
      line: { kind: r.kind, system: 'water', radius, title, ...(r.to ? { to: r.to } : {}) },
      path: r.path,
      zs: outside.map((o, i) => (o && !r.storey ? -TRENCH.depth : stretchLevel(r.path, i, r.storey) + MEP.screed + (r.kind === 'hot' ? 0.03 : 0))),
      outside,
      ...(r.kind === 'feed' ? { start: lv + MEP.point } : {}),
      end: r.to ? lv + (r.rise || 0) + MEP.point : undefined,
      trench: TRENCH,
    })
    // a branch to a fixture inside: up the wall in a chase to its point
    if (r.to?.kind === 'furniture' && !outside[outside.length - 1] && !spots.some((s) => s.detail === 'wall-chase')) {
      spots.push({ detail: 'wall-chase', at: v3(r.path[r.path.length - 1], MEP.point / 2), label: title })
    }
  }
  build(water, sink)
  build(drains, sink)
  const chamber = src.plumbing.chambers[0]
  if (chamber) spots.push({ detail: 'drain-exit', at: v3(chamber.at, -DRAIN.cover), label: chamber.own ? 'Inspection chamber' : 'Inspection chamber (worked out)' })

  // ---- HVAC: heating in the screed, refrigerant lines and ducts high on the walls
  const hvac: Draft[] = []
  for (const r of src.hvac.runs) {
    if (r.path.length < 2) continue
    const outside = outsideOf(r.path)
    const lv = levelOf(r)
    if (r.kind === 'heating' || r.kind === 'radiant') {
      hvac.push({
        group: `hvac:${r.kind}`,
        line: { kind: r.kind, system: 'hvac', radius: r.size / 2000, title: r.kind === 'heating' ? `Ø${r.size} heating` : `Ø${r.size} radiant lead` },
        path: r.path,
        zs: outside.map((o, i) => (o && !r.storey ? -TRENCH.depth : stretchLevel(r.path, i, r.storey) + MEP.screed)),
        outside,
        end: r.kind === 'heating' ? lv + (r.rise || 0) + MOUNT.radiator : undefined,
        trench: TRENCH,
      })
    } else {
      const high = lv + (r.kind === 'duct' ? MOUNT.extractor - 0.1 : MEP.high)
      hvac.push({
        group: `hvac:${r.kind}`,
        line: { kind: r.kind, system: 'hvac', radius: r.kind === 'duct' ? r.size / 2000 : HVAC_SIZES.refrigerant / 1000, title: r.kind === 'duct' ? `Ø${r.size} duct` : 'Refrigerant lines' },
        path: r.path,
        zs: outside.map((_, i) => stretchLevel(r.path, i, r.storey) + (r.kind === 'duct' ? MOUNT.extractor - 0.1 : MEP.high)),
        outside,
        start: high,
        end: r.kind === 'refrigerant' ? Math.max(0.4, high - (r.rise || 0)) : undefined,
      })
    }
  }
  build(hvac, sink)

  // ---- gas: buried outside, up out of the ground and through the wall in a sleeve, in the screed inside
  const gas: Draft[] = []
  for (const r of src.gas.runs) {
    if (r.path.length < 2) continue
    const outside = outsideOf(r.path)
    const to = r.to ? (r.to.kind === 'service' ? findLayer(plan, r.to.layer)?.services[r.to.id]?.kind : 'cooker') : undefined
    const size = GAS_SIZES.find((s) => s.dn === r.size)
    const fromSupply = src.gas.supply.some((p) => dist(p.at, r.path[0]) < 1)
    // inside, on the floor of the building it is in (on a plinth, above the ground); through the wall above that floor
    const lv = levelOf(r)
    gas.push({
      group: 'gas',
      line: { kind: 'gas', system: 'gas', radius: (size?.bore ?? 20) / 2000, title: `${size?.inch ?? ''} gas`, ...(r.to ? { to: r.to } : {}) },
      path: r.path,
      zs: outside.map((o, i) => (o ? -GAS_TRENCH.depth : stretchLevel(r.path, i, r.storey) + MEP.gasFloor)),
      outside,
      ...(fromSupply ? { start: MEP.point } : {}),
      end: to === 'gas-valve' ? 0 : to ? lv + (r.rise || 0) + MEP.point : undefined,
      cross: lv + MEP.gasEntry,
      trench: GAS_TRENCH,
    })
  }
  build(gas, sink)
  const entry = src.gas.entries[0]
  if (entry) {
    const crossing = sink.crossings
      .filter((item) => item.system === 'gas' && item.way === 'wall')
      .sort((a, b) => dist(a.at, entry.at) - dist(b.at, entry.at))[0]
    spots.push({ detail: 'gas-entry', at: crossing?.at ?? v3(entry.at, MEP.gasEntry), label: `Gas into ${entry.rooms.join(', ') || entry.feeds.join(', ').toLowerCase()}` })
  }

  const totals = Object.fromEntries(MEP_SYSTEMS.map((s) => [s, { length: 0, buried: 0 }])) as MepPlan['totals']
  for (const l of sink.lines) {
    totals[l.system].length += lengthOf(l.pts)
    for (let i = 1; i < l.pts.length; i++) if (l.pts[i].z < -0.1 && l.pts[i - 1].z < -0.1) totals[l.system].buried += Math.hypot(l.pts[i].x - l.pts[i - 1].x, l.pts[i].y - l.pts[i - 1].y)
  }
  spots.sort((a, b) => DETAILS.indexOf(a.detail) - DETAILS.indexOf(b.detail))
  return { lines: sink.lines, crossings: mergeCrossings(sink.crossings), trenches: sink.trenches, clashes: clashesOf(sink.lines), spots, totals }
}

/** The details in the order they are shown. */
export const DETAILS: readonly MepDetail[] = ['gas-entry', 'drain-exit', 'buried-cable', 'wall-chase']

/** Crossings of one system within 0.3 m of each other are one sleeve. */
function mergeCrossings(list: MepCrossing[]): MepCrossing[] {
  const out: MepCrossing[] = []
  for (const c of list) if (!out.some((o) => {
    const aligned = Math.abs(o.dir.x * c.dir.x + o.dir.y * c.dir.y) > 0.95
    return o.system === c.system && o.kind === c.kind && o.way === c.way && aligned && Math.hypot(o.at.x - c.at.x, o.at.y - c.at.y) < 0.3 && Math.abs(o.at.z - c.at.z) < 0.3
  })) out.push(c)
  return out
}

// ---- clashes -------------------------------------------------------------------------------------------------

interface Seg {
  a: Vec3
  b: Vec3
  line: MepLine
}

/** The closest points of segments p0–p1 and q0–q1, and how far apart they are. */
export function segmentGap(p0: Vec3, p1: Vec3, q0: Vec3, q1: Vec3): { d: number; p: Vec3; q: Vec3 } {
  const u = { x: p1.x - p0.x, y: p1.y - p0.y, z: p1.z - p0.z }
  const v = { x: q1.x - q0.x, y: q1.y - q0.y, z: q1.z - q0.z }
  const w = { x: p0.x - q0.x, y: p0.y - q0.y, z: p0.z - q0.z }
  const dot = (a: Vec3, b: Vec3) => a.x * b.x + a.y * b.y + a.z * b.z
  const [a, b, c, d, e] = [dot(u, u), dot(u, v), dot(v, v), dot(u, w), dot(v, w)]
  const den = a * c - b * b
  let s = den > 1e-12 ? (b * e - c * d) / den : 0
  s = Math.max(0, Math.min(1, s))
  let t = c > 1e-12 ? (b * s + e) / c : 0
  if (t < 0 || t > 1) {
    t = Math.max(0, Math.min(1, t))
    s = a > 1e-12 ? Math.max(0, Math.min(1, (b * t - d) / a)) : 0
  }
  const p = { x: p0.x + u.x * s, y: p0.y + u.y * s, z: p0.z + u.z * s }
  const q = { x: q0.x + v.x * t, y: q0.y + v.y * t, z: q0.z + v.z * t }
  return { d: Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z), p, q }
}

/**
 * Lines of different systems too close: side by side (nearly parallel, over `MEP.together` or more) within
 * `MEP.clearance` of each other's outsides, or gas and electricity within `MEP.gasElectric` anywhere, crossing
 * included. Segments are bucketed on a 1 m grid so only neighbours are compared; clashes within 0.5 m of each other
 * between the same two kinds are one.
 */
export function clashesOf(lines: readonly MepLine[]): MepClash[] {
  const segs: Seg[] = []
  for (const line of lines) for (let i = 1; i < line.pts.length; i++) segs.push({ a: line.pts[i - 1], b: line.pts[i], line })
  const CELL = 1
  const grid = new Map<string, number[]>()
  const reach = Math.max(MEP.clearance, MEP.gasElectric) + 0.1
  segs.forEach((s, i) => {
    // Walk the segment instead of filling its complete bounding rectangle: a long diagonal stays linear in length.
    const steps = Math.max(1, Math.ceil(Math.max(Math.abs(s.b.x - s.a.x), Math.abs(s.b.y - s.a.y)) / (CELL / 2)))
    const cells = new Set<string>()
    for (let step = 0; step <= steps; step++) {
      const t = step / steps
      const px = s.a.x + (s.b.x - s.a.x) * t
      const py = s.a.y + (s.b.y - s.a.y) * t
      const x0 = Math.floor((px - reach) / CELL)
      const x1 = Math.floor((px + reach) / CELL)
      const y0 = Math.floor((py - reach) / CELL)
      const y1 = Math.floor((py + reach) / CELL)
      for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) cells.add(`${x},${y}`)
    }
    for (const cell of cells) grid.set(cell, [...(grid.get(cell) ?? []), i])
  })
  const seen = new Set<string>()
  const out: MepClash[] = []
  for (const bucket of grid.values()) {
    for (let m = 0; m < bucket.length; m++) {
      for (let n = m + 1; n < bucket.length; n++) {
        const [i, j] = [bucket[m], bucket[n]]
        const key = i < j ? `${i}|${j}` : `${j}|${i}`
        if (seen.has(key)) continue
        seen.add(key)
        const [s, t] = [segs[i], segs[j]]
        if (s.line.system === t.line.system) continue
        const gasElectric = new Set([s.line.system, t.line.system]).size === 2 && [s.line.system, t.line.system].includes('gas') && [s.line.system, t.line.system].includes('electricity')
        const limit = gasElectric ? MEP.gasElectric : MEP.clearance
        const g = segmentGap(s.a, s.b, t.a, t.b)
        const gap = Math.max(0, g.d - s.line.radius - t.line.radius)
        if (gap >= limit) continue
        // side by side: nearly parallel, and over how long they overlap
        const u = unit(s)
        const w = unit(t)
        const parallel = Math.abs(u.x * w.x + u.y * w.y + u.z * w.z) > 0.95
        const length = parallel ? overlap(s, t, u) : 0
        const how = parallel && length >= MEP.together ? 'together' : 'crossing'
        if (how === 'crossing' && !gasElectric) continue
        const at = { x: (g.p.x + g.q.x) / 2, y: (g.p.y + g.q.y) / 2, z: (g.p.z + g.q.z) / 2 }
        const same = out.find((c) => c.kinds.includes(s.line.kind) && c.kinds.includes(t.line.kind) && Math.hypot(c.at.x - at.x, c.at.y - at.y, c.at.z - at.z) < 0.5)
        if (same) {
          same.length = Math.max(same.length, length)
          same.gap = Math.min(same.gap, gap)
          continue
        }
        out.push({ at, systems: [s.line.system, t.line.system], kinds: [s.line.kind, t.line.kind], titles: [s.line.title, t.line.title], gap, how, length })
      }
    }
  }
  return out
}

const unit = (s: Seg): Vec3 => {
  const d = { x: s.b.x - s.a.x, y: s.b.y - s.a.y, z: s.b.z - s.a.z }
  const l = Math.hypot(d.x, d.y, d.z) || 1
  return { x: d.x / l, y: d.y / l, z: d.z / l }
}

/** How long two nearly parallel segments run side by side: their overlap along the first's direction. */
function overlap(s: Seg, t: Seg, u: Vec3): number {
  const along = (p: Vec3) => (p.x - s.a.x) * u.x + (p.y - s.a.y) * u.y + (p.z - s.a.z) * u.z
  const [s0, s1] = [0, along(s.b)]
  const [t0, t1] = [along(t.a), along(t.b)].sort((a, b) => a - b)
  return Math.max(0, Math.min(s1, t1) - Math.max(s0, t0))
}

/** Where a line comes from, for a clash's words. */
export const storeyOfLine = (plan: Plan, line: MepLine): number => {
  const z = Math.max(...line.pts.map((p) => p.z))
  const floors = plan.layers.filter((l) => l.visible).map((l) => ({ storey: storeyOf(l), level: layerLevel(l) }))
  return floors.filter((f) => f.level <= z + 0.05).reduce((best, f) => Math.max(best, f.storey), 0)
}


