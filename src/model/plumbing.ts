import { add, closestOnSegment, dist, lerp, mul, sub, type Vec } from './geometry'
import { furnitureInfo, isCorner, local, placeFurniture, showerPoint, type Placement } from './furniture'
import {
  storeyOf,
  type BED_STYLES,
  type FittingMaterial,
  type Furniture,
  type PipeMaterial,
  type PipeNetwork,
  type Plan,
  type Ref,
  type Service,
  type ServiceKind,
} from './plan'
import { layerFaces, regionAt, type Region } from './regions'
import { offsetPolygon } from './roofs'
import { downstream, fromRoot, pathLength, router } from './routing'
import { placeService, serviceInfo, specOf, specText, tabOf, type ServiceInfo, type ServiceRole } from './services'
import type { SolidsSource } from './solids'
import { levelOf } from './storeys'
import { layerWalls, WALL_HEIGHT } from './walls'

/**
 * The plumbing plan (the Plumbing tab): the pipes between the fixtures drawn on the floor plan and the equipment put
 * down on this one, worked out on every edit and never stored.
 *
 * Nothing here is assumed about the house: what it has is what has been put down (see services.ts). The cold water
 * runs through whatever stages of a supply exist, in this order — a source (the mains, or a well), a well pump, a
 * cistern, tanks, a pressure pump, a filter, a manifold — and the last of them feeds the fixtures, so a house on the
 * mains, one with a well and a tank on a tower, and one with a cistern and a pressure pump are all drawn. Hot water
 * comes from the water heaters (and the HVAC tab's boilers) put down, each fed with cold water, each feeding the
 * fixtures nearest it. Waste runs from each fixture to its room's floor trap (a kitchen sink and a
 * dishwasher to one of their own, or a grease trap), and from the traps, toilets and floor drains into each
 * building's main, out at an inspection chamber and on to whatever the waste ends in: the sewer, or a septic tank or
 * biodigestor and its soakaway. Each fixture has its own connections and trap, metal or plastic as chosen.
 *
 * Pipes are routed square to the walls, each branch teeing off the nearest pipe already laid (`routeTree`), so the
 * lengths are close to what a plumber would lay: a suggestion to cost and check the installation, not an installer's
 * design. Sizes, the checks and the quantities follow the constants below, which are usual values, not a calculation.
 *
 * Heating, cooling and ventilation are the HVAC tab's (see hvac.ts). Its pieces meet the plumbing only where they
 * need it (`ServiceInfo.links`): a boiler makes hot water, so it is a root of the hot tree and fed cold water; a heat
 * pump is filled from the cold water; a split unit's condensate runs to the nearest trap. They are `linked` here,
 * drawn faded, and never counted in the plumbing's quantities.
 */

/** The water a person uses in a day, l, and how much hot water and waste treatment each needs. */
export const WATER = { perPerson: 200, hotPerPerson: 50, wastePerPerson: 260 }
/** People a bed sleeps, by its style. */
export const SLEEPS: Record<(typeof BED_STYLES)[number], number> = { single: 1, double: 2, queen: 2, king: 2 }
/** The people a house is taken to be for when it has no beds drawn. */
export const HOUSEHOLD = 4
/** Supply pipes, mm: a pipe feeding `mainPoints` points or more is a main; the stages of the supply are joined by `feed`. */
export const SUPPLY = { main: 25, branch: 20, feed: 25, mainPoints: 3 }
/** Drains, mm: a fixture to its trap, a trap or floor drain to the main, the main (toilets on it); the main's fall and its cover at the top end, m. */
export const DRAIN = { fixture: 50, trap: 63, main: 110, slope: 0.02, cover: 0.3 }
/** A condensate line from an HVAC unit to the nearest drain, mm; farther than `reach` m it spills outside instead. */
export const CONDENSATE = { pipe: 20, reach: 8 }
/** How far an inspection chamber's centre stands outside its building's walls, and how near a chamber put down by hand is taken as that building's, m. */
export const CHAMBER = { out: 0.6, adopt: 6 }
/** How far apart a well and a septic tank, biodigestor or soakaway stand at least, m (the local code may ask more). */
export const WELL_CLEARANCE = 15
/** A building's vent: the main's top end carried up past its roof, this much over its walls, m. */
export const VENT_ABOVE = 0.6
/** Fittings for a supply point (a tee, an elbow, a threaded elbow for the tap) and for each bend. */
export const FITTINGS = { point: 3, bend: 1 }
/** A trench for pipes buried outside the buildings, m. */
export const TRENCH = { width: 0.3, depth: 0.6 }
/** How deep a waste inlet may be before the dig gets hard, m. */
export const DEEP_INLET = 1.2
/** Hot water comes out left of a mixer and cold right, this far from its middle, m. */
const MIXER = 0.08

/** What each network's pipes are made of unless chosen otherwise, and what each material is called. */
export const USUAL_PIPE: Record<PipeNetwork, PipeMaterial> = { cold: 'ppr', hot: 'ppr', drain: 'pvc' }
export const PIPE_TITLES: Record<PipeMaterial, string> = { ppr: 'Polypropylene (thermofusion)', pex: 'PEX', copper: 'Copper', pvc: 'PVC', pp: 'Polypropylene (silent)' }
/** What each network's pipes may be made of. */
export const PIPE_CHOICES: Record<PipeNetwork, PipeMaterial[]> = { cold: ['ppr', 'pex', 'copper'], hot: ['ppr', 'pex', 'copper'], drain: ['pvc', 'pp'] }
/** What a fixture's connections and its trap are made of unless chosen otherwise. */
export const USUAL_FITTING: { connection: FittingMaterial; trap: FittingMaterial } = { connection: 'metal', trap: 'plastic' }

/** The stages the cold water passes through, in order; the last one present feeds the house. */
export const SUPPLY_CHAIN: ServiceRole[] = ['source', 'well-pump', 'store', 'tank', 'pump', 'inline']

export type RunKind = 'feed' | 'cold' | 'hot' | 'drain' | 'condensate'

/** The network a run belongs to, for its material. */
export const networkOf = (kind: RunKind): PipeNetwork => (kind === 'feed' ? 'cold' : kind === 'condensate' ? 'drain' : kind)

/** A run of pipe between two junctions: a stage of the supply, a main, a branch, a fixture's drain, an HVAC unit's condensate line. */
export interface Run {
  kind: RunKind
  /** Diameter, mm. */
  size: number
  material: PipeMaterial
  /** The fixture or piece of equipment it ends at, when it is the branch to one. */
  to?: Ref
  /** Its route on the plan, square to the walls. */
  path: Vec[]
  /** The floor it is laid on. */
  storey: number
  /** Along the plan, m. */
  length: number
  /** Up (or down) to another floor, m. */
  rise: number
  /** How much of its length runs outside the buildings, buried, m. */
  outdoor: number
}

/** What a fixture, or a tap put down by hand, takes: its water points and its drain. */
export interface WetPoint {
  /** The fixture (furniture) or the tap or floor drain (service) it is. */
  ref: Ref
  /** What fixture it is, and its style; absent for equipment put down by hand. */
  fixture?: Furniture['kind']
  style?: string
  title: string
  storey: number
  /** Its floor's level, m, on a floor above (0 on the ground floor). */
  level: number
  /** The area it is in ('' when none), and its room's key (layer and region), to group a room's fixtures. */
  room: string
  roomKey: string
  cold?: Vec
  hot?: Vec
  drain?: Vec
  /** Its drain runs into its room's floor trap (Ø50), or straight into the main (a toilet, a floor drain). */
  drainTo?: 'trap' | 'main'
  toilet?: boolean
  /** On the floor just in front of it: where a floor trap goes. */
  front: Vec
}

/** A floor trap: the room's fixtures drain into it, and it into the main. A grease trap put down by hand is one too. */
export interface Trap {
  layer: string
  storey: number
  level: number
  at: Vec
  room: string
  /** How many fixtures drain into it. */
  fixtures: number
  /** A grease trap put down by hand, rather than a floor trap worked out for the room. */
  grease?: boolean
  /** The kitchen's own trap: a kitchen sink and dishwasher never share the room's. */
  kitchen?: boolean
}

/** What a fixture's own plumbing is: its connections (hoses and angle valves, one per supply) and its trap (siphon). */
export interface FixtureWork {
  ref: Ref
  title: string
  room: string
  /** Cold, and hot when it takes it. */
  supplies: number
  /** Whether it has a trap of its own (a toilet's is built in). */
  trap: boolean
  connection: FittingMaterial
  trapMaterial: FittingMaterial
}

/** A piece of equipment on the plan, with where it stands and what it is rated at. */
export interface Equipment {
  ref: Ref
  kind: ServiceKind
  info: ServiceInfo
  service: Service
  at: Vec
  placed: Placement
  storey: number
  level: number
  /** The area it stands in, '' when none. */
  room: string
  /** What it is rated at, or null when it has no rating. */
  spec: number | null
  specText: string
  /** Whether it stands inside a building. */
  inside: boolean
}

/** What the installation adds up to, for the Plumbing section. */
export interface SystemSummary {
  /** The stages the cold water passes through, in order. */
  chain: Equipment[][]
  /** The reserve put down and a day's water for the people the house is for, l. */
  reserve: number
  reserveNeed: number
  /** Hot water stored (a boiler makes it as it goes, so it counts as enough), l. */
  hot: number
  hotNeed: number
  heaters: Equipment[]
  /** Heating: what makes it and what gives it off. */
  /** The HVAC tab's pieces the plumbing serves: boilers it takes hot water from, what it fills, what drains into it. */
  linked: { dhw: Equipment[]; fill: Equipment[]; condensate: Equipment[] }
  /** Where the waste ends, its treatment capacity and what the house needs, l. */
  waste: Equipment[]
  wasteLitres: number
  wasteNeed: number
  sewer: boolean
}

export interface PlumbingPlan {
  /** The angle pipes run square to, radians: the walls' main direction. */
  frame: number
  /** The people the house is for, from its beds. */
  occupants: number
  equipment: Equipment[]
  /** The HVAC tab's pieces on the plan, shown faded here; those with a link to the plumbing are joined to it. */
  linked: Equipment[]
  points: WetPoint[]
  /** Each fixture's own connections and trap. */
  fixtures: FixtureWork[]
  traps: Trap[]
  /** Inspection chambers: those put down by hand, and one worked out outside each building that has none. */
  chambers: { at: Vec; own: boolean }[]
  runs: Run[]
  /** Where a pipe goes up to another floor: on the plan, and the floors it joins. */
  risers: { at: Vec; from: number; to: number; kind: 'cold' | 'hot' | 'drain' }[]
  /** Vents, one up from each building's main, and their length, m. */
  vents: { at: Vec; length: number }[]
  summary: SystemSummary
  /** What each network's pipes are made of. */
  materials: Record<PipeNetwork, PipeMaterial>
  valves: number
  fittings: number
  /** The longest drain to where the waste ends, m, and how deep it arrives at its fall. */
  fall: { run: number; depth: number } | null
  /** What is missing or wrong, and what is worth knowing, in words. */
  problems: string[]
  notes: string[]
}

/** What a fixture takes: hot water besides cold, and where it drains; null for what takes no water. */
function needsOf(f: Furniture, indoor: boolean): { hot: boolean; drain: 'trap' | 'main' } | null {
  switch (f.kind) {
    case 'sink':
      // a laundry sink in the laundry gets hot water; out in the yard, cold
      return { hot: f.style !== 'outdoor' || indoor, drain: 'trap' }
    case 'bathtub':
    case 'shower':
    case 'bidet':
      return { hot: true, drain: 'trap' }
    case 'toilet':
      return { hot: false, drain: 'main' }
    case 'appliance':
      return f.style === 'washer' || f.style === 'dishwasher' ? { hot: false, drain: 'trap' } : null
    default:
      return null
  }
}

export function fixtureTitle(f: Furniture): string {
  const info = furnitureInfo(f.kind, 'style' in f ? f.style : undefined)
  return f.kind === 'bathtub' ? `Bathtub (${info.title.toLowerCase()})` : info.title
}

/** Where a fixture's supply and drain are, in its own frame. */
function fixturePoints(f: Furniture, pl: Placement): { supply: Vec; drain: Vec } {
  const back = -pl.depth / 2
  if (f.kind === 'bathtub' || f.kind === 'shower') {
    // the mixer under the shower head; a tub drains at that end, a shower tray in its middle
    const head = showerPoint(pl, f.shower, isCorner(f))
    return { supply: head, drain: f.kind === 'shower' ? pl.at : lerp(head, pl.at, 0.3) }
  }
  if (f.kind === 'toilet') return { supply: local(pl, -0.12, back + 0.05), drain: local(pl, 0, back + 0.25) }
  return { supply: local(pl, 0, back + 0.05), drain: local(pl, 0, back + 0.12) }
}

/** The people a house is for: what its beds sleep, or a usual family when none is drawn. */
export function occupantsOf(plan: Plan): number {
  let n = 0
  for (const layer of plan.layers) if (layer.visible) for (const f of Object.values(layer.furniture)) if (f.kind === 'bed') n += SLEEPS[f.style]
  return n || HOUSEHOLD
}

const centroid = (pts: readonly Vec[]): Vec => mul(pts.reduce(add, { x: 0, y: 0 }), 1 / pts.length)

const nearestTo = <T extends { at: Vec }>(list: readonly T[], p: Vec): T | undefined => [...list].sort((a, b) => dist(a.at, p) - dist(b.at, p))[0]

const direct: SolidsSource = { faces: layerFaces, walls: (layer) => layerWalls(layer, layerFaces(layer).thickness) }

export function plumbingPlan(plan: Plan, source: SolidsSource = direct): PlumbingPlan {
  const { frame, buildings, buildingAt, route, outdoorLength, square, outside } = router(plan, source)
  const materials: Record<PipeNetwork, PipeMaterial> = { ...USUAL_PIPE, ...plan.plumbing?.materials }
  const runs: Run[] = []
  const addRun = (kind: RunKind, size: number, path: Vec[], storey: number, rise = 0, to?: Ref) => {
    const length = pathLength(path)
    if (length < 1e-6 && rise < 1e-6) return
    runs.push({ kind, size, material: materials[networkOf(kind)], ...(to ? { to } : {}), path, storey, length, rise, outdoor: outdoorLength(path) })
  }

  // ---- what stands on the plan: the fixtures' points and the equipment put down
  const points: WetPoint[] = []
  const equipment: Equipment[] = []
  const linked: Equipment[] = []
  for (const layer of plan.layers) {
    if (!layer.visible) continue
    const storey = storeyOf(layer)
    const level = storey ? levelOf(layer) : 0
    const regions = source.faces(layer).regions
    // rooms by their region; a lot is the outside, not a room
    const names = new Map<Region, string>()
    const lots = new Set<Region>()
    for (const a of Object.values(layer.areas)) {
      const r = regionAt(regions, a.at)
      if (r && a.lot) lots.add(r)
      else if (r && !names.has(r)) names.set(r, a.name)
    }
    const roomAt = (p: Vec) => {
      const found = regionAt(regions, p)
      const r = found && !lots.has(found) ? found : null
      return { region: r, room: (r && names.get(r)) ?? '', roomKey: r ? `${layer.id}:${regions.indexOf(r)}` : `${layer.id}@${p.x.toFixed(2)},${p.y.toFixed(2)}` }
    }
    for (const [id, f] of Object.entries(layer.furniture)) {
      const pl = placeFurniture(layer, f)
      if (!pl) continue
      const where = roomAt(pl.at)
      const needs = needsOf(f, !!where.region?.indoor)
      if (!needs) continue
      const { supply, drain } = fixturePoints(f, pl)
      const side = mul(pl.u, MIXER)
      points.push({
        ref: { layer: layer.id, kind: 'furniture', id },
        fixture: f.kind,
        style: 'style' in f ? f.style : undefined,
        title: fixtureTitle(f),
        storey,
        level,
        room: where.room,
        roomKey: where.roomKey,
        cold: needs.hot ? add(supply, side) : supply,
        hot: needs.hot ? sub(supply, side) : undefined,
        drain,
        drainTo: needs.drain,
        toilet: f.kind === 'toilet' || undefined,
        front: local(pl, 0, pl.depth / 2 + 0.15),
      })
    }
    for (const [id, s] of Object.entries(layer.services)) {
      const info = serviceInfo(s.kind)
      const where = roomAt(s.at)
      const ref: Ref = { layer: layer.id, kind: 'service', id }
      // the HVAC tab's pieces: kept apart, joined to the plumbing only where they need it
      ;(tabOf(info) === 'hvac' ? linked : equipment).push({
        ref,
        kind: s.kind,
        info,
        service: s,
        at: s.at,
        placed: placeService(s),
        storey,
        level,
        room: where.room,
        spec: specOf(info, s.width, s.depth),
        specText: specText(info, s.width, s.depth),
        inside: buildingAt(s.at) >= 0,
      })
      // a tap takes water like a fixture; a floor drain gives the main its own inlet
      if (s.kind === 'tap') {
        points.push({ ref, title: s.hot ? 'Tap, hot and cold' : 'Tap', storey, level, room: where.room, roomKey: where.roomKey, cold: s.at, hot: s.hot ? s.at : undefined, front: s.at })
      } else if (s.kind === 'floor-drain') {
        points.push({ ref, title: 'Floor drain', storey, level, room: where.room, roomKey: where.roomKey, drain: s.at, drainTo: 'main', front: s.at })
      }
    }
  }

  const of = (...roles: ServiceRole[]) => equipment.filter((e) => roles.includes(e.info.role))
  const ofKind = (...kinds: ServiceKind[]) => equipment.filter((e) => kinds.includes(e.kind))
  const occupants = occupantsOf(plan)
  const problems: string[] = []
  const notes: string[] = []
  const risers: PlumbingPlan['risers'] = []
  const rise = (storey: number, level: number, from: number) => (storey !== from ? level : 0)
  let valves = 0
  let fittings = 0

  // ---- the water: through the stages put down, then out to every point that takes it
  const chain = SUPPLY_CHAIN.map((role) => of(role)).filter((stage) => stage.length > 0)
  for (let i = 1; i < chain.length; i++) {
    const stage = chain[i]
    const linked = stage[0].info.role === 'store' || stage[0].info.role === 'tank'
    if (!linked) {
      for (const item of stage) {
        const from = nearestTo(chain[i - 1], item.at)
        if (from) addRun('feed', SUPPLY.feed, square(from.at, item.at, true), 0, Math.abs(item.level - from.level), item.ref)
      }
      continue
    }
    // several tanks (or cisterns) are linked one to the next: the nearest to the stage before is fed, the rest hang off it
    const left = [...stage].sort((a, b) => dist(a.at, nearestTo(chain[i - 1], a.at)!.at) - dist(b.at, nearestTo(chain[i - 1], b.at)!.at))
    const done: Equipment[] = []
    for (const item of left) {
      const from = done.length ? nearestTo(done, item.at)! : nearestTo(chain[i - 1], item.at)!
      addRun('feed', SUPPLY.feed, square(from.at, item.at, true), 0, Math.abs(item.level - from.level), item.ref)
      done.push(item)
    }
  }
  valves += chain.flat().length
  // the house's hot water comes from the water heaters, and from the boilers the HVAC tab puts down; what the HVAC
  // fills (a boiler, a heat pump) is fed like any other cold point
  const dhw = linked.filter((e) => e.info.links?.dhw)
  const fill = linked.filter((e) => e.info.links?.fill && !e.info.links.dhw)
  const heaters = [...of('heater'), ...dhw]
  const cold = points.filter((p) => p.cold)
  const hot = points.filter((p) => p.hot)
  const roots = chain.length ? chain[chain.length - 1] : []
  if (roots.length) {
    // the heaters are fed like any other cold point
    const targets = [
      ...cold.map((p) => ({ at: p.cold!, storey: p.storey, level: p.level, ref: p.ref })),
      ...[...heaters, ...fill].map((h) => ({ at: h.at, storey: h.storey, level: h.level, ref: h.ref })),
    ]
    const tree = route(roots.map((r) => r.at), targets.map((t) => t.at))
    const below = downstream(tree)
    tree.edges.forEach((e, i) => {
      const n = tree.nodes[e.to]
      const t = n.target >= 0 ? targets[n.target] : null
      addRun('cold', below[i].length >= SUPPLY.mainPoints ? SUPPLY.main : SUPPLY.branch, e.path, 0, t ? rise(t.storey, t.level, 0) : 0, t?.ref)
      fittings += (e.path.length - 2) * FITTINGS.bend
    })
    fittings += tree.nodes.filter((n) => n.target < 0 && n.parent >= 0).length + targets.length * FITTINGS.point
    for (const p of cold) if (p.storey) risers.push({ at: p.cold!, from: 0, to: p.storey, kind: 'cold' })
    valves += new Set(cold.filter((p) => p.room).map((p) => p.roomKey)).size
  }
  if (hot.length && heaters.length) {
    const tree = route(heaters.map((h) => h.at), hot.map((p) => p.hot!))
    const below = downstream(tree)
    tree.edges.forEach((e, i) => {
      const n = tree.nodes[e.to]
      const p = n.target >= 0 ? hot[n.target] : null
      addRun('hot', below[i].length >= SUPPLY.mainPoints ? SUPPLY.main : SUPPLY.branch, e.path, 0, p ? rise(p.storey, p.level, 0) : 0, p?.ref)
      fittings += (e.path.length - 2) * FITTINGS.bend
    })
    fittings += tree.nodes.filter((n) => n.target < 0 && n.parent >= 0).length + hot.length * FITTINGS.point
    for (const p of hot) if (p.storey) risers.push({ at: p.hot!, from: 0, to: p.storey, kind: 'hot' })
    valves += new Set(hot.filter((p) => p.room).map((p) => p.roomKey)).size + heaters.length
  }

  // ---- the drains: fixtures to their room's trap (a kitchen sink to a grease trap), then into each building's main
  const greaseTraps = of('grease')
  const traps: Trap[] = []
  const byRoom = new Map<string, WetPoint[]>()
  for (const p of points) {
    if (p.drainTo !== 'trap') continue
    // a kitchen sink and a dishwasher drain through a grease trap when there is one, and never share a trap with the rest of a room
    const fatty = (p.fixture === 'sink' && p.style === 'kitchen') || (p.fixture === 'appliance' && p.style === 'dishwasher')
    const grease = fatty && greaseTraps.length ? nearestTo(greaseTraps, p.drain!) : undefined
    if (grease) {
      addRun('drain', DRAIN.fixture, square(p.drain!, grease.at), p.storey, 0, p.ref)
      continue
    }
    const key = fatty ? `${p.roomKey}:kitchen` : p.roomKey
    byRoom.set(key, [...(byRoom.get(key) ?? []), p])
  }
  for (const [key, list] of byRoom) {
    const first = list[0]
    const kitchen = key.endsWith(':kitchen')
    const trap: Trap = { layer: first.ref.layer, storey: first.storey, level: first.level, at: centroid(list.map((p) => p.front)), room: first.room, fixtures: list.length, ...(kitchen ? { kitchen } : {}) }
    traps.push(trap)
    for (const p of list) addRun('drain', DRAIN.fixture, square(p.drain!, trap.at), p.storey, 0, p.ref)
  }
  // the HVAC's condensate: to the nearest trap on its floor, or out through the nearest wall when none is near
  const condensate = linked.filter((e) => e.info.links?.condensate)
  for (const unit of condensate) {
    const trap = nearestTo(
      traps.filter((t) => t.storey === unit.storey),
      unit.at,
    )
    if (trap && dist(trap.at, unit.at) <= CONDENSATE.reach) {
      addRun('condensate', CONDENSATE.pipe, square(unit.at, trap.at), unit.storey, 0, unit.ref)
      continue
    }
    const out = outside(unit.at)
    if (out) addRun('condensate', CONDENSATE.pipe, square(unit.at, out), unit.storey, 0, unit.ref)
  }
  // each fixture's own connections and trap, as chosen for it
  const fixtures: FixtureWork[] = points
    .filter((p) => p.ref.kind === 'furniture')
    .map((p) => {
      const chosen = plan.plumbing?.fixtures?.[`${p.ref.layer}:${p.ref.id}`]
      return {
        ref: p.ref,
        title: p.title,
        room: p.room,
        supplies: (p.cold ? 1 : 0) + (p.hot ? 1 : 0),
        trap: p.drainTo === 'trap',
        connection: chosen?.connection ?? USUAL_FITTING.connection,
        trapMaterial: chosen?.trap ?? USUAL_FITTING.trap,
      }
    })
  for (const g of greaseTraps) traps.push({ layer: g.ref.layer, storey: g.storey, level: g.level, at: g.at, room: g.room, fixtures: 0, grease: true })
  const inlets = [
    ...traps.map((t) => ({ at: t.at, storey: t.storey, level: t.level, toilet: false })),
    ...points.filter((p) => p.drainTo === 'main').map((p) => ({ at: p.drain!, storey: p.storey, level: p.level, toilet: !!p.toilet })),
  ]
  const waste = of('waste')
  const sewer = waste.some((w) => w.kind === 'sewer')
  const soakaways = of('soak')
  const ownChambers = of('chamber')
  const used = new Set<Equipment>()
  const chambers: PlumbingPlan['chambers'] = []
  const reach = new Map<number, number>()
  const outlets: { at: Vec; toilet: boolean; farthest: number }[] = []
  const vents: PlumbingPlan['vents'] = []
  buildings.forEach((rings, b) => {
    const mine = inlets.map((inlet, i) => ({ inlet, i })).filter(({ inlet }) => buildingAt(inlet.at) === b)
    if (!mine.length) return
    const middle = centroid(mine.map(({ inlet }) => inlet.at))
    const target = waste.length ? nearestTo(waste, middle)!.at : middle
    // a chamber put down near this building is its own; otherwise one is worked out outside the wall facing the waste
    const own = ownChambers.filter((c) => !used.has(c)).sort((x, y) => dist(x.at, target) - dist(y.at, target))[0]
    let chamber: Vec | null = null
    if (own && Math.min(...rings.map((ring) => Math.min(...ring.map((p, k) => closestOnSegment(own.at, p, ring[(k + 1) % ring.length]).dist)))) <= CHAMBER.adopt) {
      used.add(own)
      chamber = own.at
      chambers.push({ at: own.at, own: true })
    } else {
      for (const ring of rings) {
        const out = offsetPolygon(ring, CHAMBER.out)
        for (let k = 0; k < out.length; k++) {
          const c = closestOnSegment(target, out[k], out[(k + 1) % out.length]).point
          if (!chamber || dist(c, target) < dist(chamber, target)) chamber = c
        }
      }
      chambers.push({ at: chamber!, own: false })
    }
    const tree = route([chamber!], mine.map(({ inlet }) => inlet.at))
    const below = downstream(tree)
    const depth = fromRoot(tree)
    tree.edges.forEach((e, i) => {
      const n = tree.nodes[e.to]
      const inlet = n.target >= 0 ? mine[n.target].inlet : null
      addRun('drain', below[i].some((t) => mine[t].inlet.toilet) ? DRAIN.main : DRAIN.trap, e.path, 0, inlet && inlet.storey ? inlet.level : 0)
    })
    tree.nodes.forEach((n, k) => n.target >= 0 && reach.set(mine[n.target].i, depth[k]))
    for (const { inlet } of mine) if (inlet.storey) risers.push({ at: inlet.at, from: 0, to: inlet.storey, kind: 'drain' })
    const top = Math.max(0, ...mine.map(({ inlet }) => inlet.level))
    const far = tree.nodes.reduce((a, n, k) => (n.target >= 0 && depth[k] > depth[a] ? k : a), 0)
    vents.push({ at: tree.nodes[far].p, length: top + WALL_HEIGHT + VENT_ABOVE })
    outlets.push({ at: chamber!, toilet: mine.some(({ inlet }) => inlet.toilet), farthest: Math.max(0, ...mine.map(({ i }) => reach.get(i) ?? 0)) })
  })
  for (const c of ownChambers) if (!used.has(c)) chambers.push({ at: c.at, own: true })
  const loose = inlets.filter((inlet) => buildingAt(inlet.at) < 0)
  let fall: PlumbingPlan['fall'] = null
  if (waste.length && (outlets.length || loose.length || ownChambers.length > 0)) {
    const targets = [
      ...outlets.map((o) => ({ at: o.at, toilet: o.toilet, before: o.farthest, storey: 0, level: 0, chamber: true })),
      ...loose.map((inlet) => ({ ...inlet, before: 0, chamber: false })),
      ...ownChambers.filter((c) => !used.has(c)).map((c) => ({ at: c.at, toilet: false, before: 0, storey: 0, level: 0, chamber: true })),
    ]
    const tree = route(waste.map((w) => w.at), targets.map((t) => t.at))
    const below = downstream(tree)
    const depth = fromRoot(tree)
    tree.edges.forEach((e, i) => {
      const n = tree.nodes[e.to]
      const t = n.target >= 0 ? targets[n.target] : null
      addRun('drain', below[i].some((k) => targets[k].toilet || targets[k].chamber) ? DRAIN.main : DRAIN.trap, e.path, 0, t && t.storey ? t.level : 0)
    })
    const run = Math.max(0, ...tree.nodes.map((n, k) => (n.target >= 0 ? depth[k] + targets[n.target].before : 0)))
    fall = { run, depth: DRAIN.cover + run * DRAIN.slope }
  }
  // the treated water on to its soakaway
  for (const w of waste) {
    if (w.kind === 'sewer') continue
    const soak = nearestTo(soakaways, w.at)
    if (soak) addRun('drain', DRAIN.main, square(w.at, soak.at, true), 0)
  }

  // ---- what it adds up to, and what to check
  const tanks = [...of('tank'), ...of('store')]
  const reserve = tanks.reduce((sum, t) => sum + (t.spec ?? 0), 0)
  const reserveNeed = occupants * WATER.perPerson
  const hotLitres = heaters.reduce((sum, h) => sum + (h.info.spec?.measure === 'capacity' ? (h.spec ?? 0) : 0), 0)
  const hotNeed = occupants * WATER.hotPerPerson
  const wasteLitres = waste.reduce((sum, w) => sum + (w.spec ?? 0), 0)
  const wasteNeed = occupants * WATER.wastePerPerson
  const summary: SystemSummary = {
    chain,
    reserve,
    reserveNeed,
    hot: hotLitres,
    hotNeed,
    heaters,
    linked: { dhw, fill, condensate },
    waste,
    wasteLitres,
    wasteNeed,
    sewer,
  }

  const say = (list: string[], text: string) => list.push(text)
  if (cold.length && !roots.length) say(problems, 'Nothing supplies the water: put a mains connection or a well (with its pump) down, and a tank or a cistern if the house keeps a reserve.')
  if (ofKind('well').length && !of('well-pump').length) say(problems, 'The well has no pump: put a well pump down to lift its water.')
  if (hot.length && !heaters.length) say(problems, `${hot.length} fixtures take hot water, but nothing heats it: put a water heater or a boiler down.`)
  if (heaters.length && hotLitres > 0 && hotLitres < hotNeed) {
    say(problems, `The water heaters hold ${hotLitres} l; ${occupants} people want about ${hotNeed} l. Make one bigger (drag its Capacity), or add another.`)
  }
  if (tanks.length && reserve < reserveNeed) say(problems, `The reserve holds ${reserve} l; a day for ${occupants} people is about ${reserveNeed} l. Resize a tank or add one.`)
  if (!tanks.length && roots.length) say(notes, 'No reserve: the house depends on what the source gives at the time. A tank or a cistern carries it through a cut.')
  if (tanks.length && !of('pump').length) say(notes, 'The tanks feed by gravity, so they must stand well above the fixtures (about 1 m for every 0.1 bar). A pressure pump does away with that.')
  if (dhw.length) say(notes, `The hot water also comes from the HVAC tab's ${dhw.length > 1 ? `${dhw.length} boilers` : 'boiler'}: it is fed cold water here and its hot water is piped from here.`)
  if (fill.length) say(notes, `The cold water fills ${fill.length} piece${fill.length > 1 ? 's' : ''} of the HVAC tab's heating (${fill.map((e) => e.info.title.toLowerCase()).join(', ')}).`)
  if (condensate.length) say(notes, `${condensate.length} HVAC unit${condensate.length > 1 ? 's drain their' : ' drains its'} condensate into the drains here, or outside when no trap is near.`)
  const powered = equipment.filter((e) => e.info.links?.power)
  if (powered.length) say(notes, `${powered.length} plumbing piece${powered.length > 1 ? 's need' : ' needs'} an electrical supply: add suitably rated points and circuits on the Electricity tab.`)
  if (inlets.length && !waste.length) say(problems, 'The drains end nowhere: put a sewer connection, or a septic tank or biodigestor, down. Until then they stop at the inspection chambers.')
  if (!sewer && waste.length && wasteLitres < wasteNeed) {
    say(problems, `The waste treatment holds ${wasteLitres} l; ${occupants} people want about ${wasteNeed} l. Make it bigger, or add another.`)
  }
  if (!sewer && waste.length && !soakaways.length) say(problems, 'The treated water has nowhere to go: put a soakaway down after the septic tank or biodigestor.')
  for (const w of ofKind('well')) {
    for (const other of [...waste.filter((x) => x.kind !== 'sewer'), ...soakaways]) {
      const gap = dist(w.at, other.at)
      if (gap < WELL_CLEARANCE) say(problems, `The well is ${gap.toFixed(1)} m from the ${other.info.title.toLowerCase()}: keep them at least ${WELL_CLEARANCE} m apart, the well uphill (the local code may ask more).`)
    }
  }
  for (const e of equipment) if (e.info.outdoor && e.inside) say(problems, `The ${e.info.title.toLowerCase()} stands inside a building: put it outside, on the lot.`)
  for (const e of equipment) if (e.info.ground && e.storey) say(problems, `The ${e.info.title.toLowerCase()} is on a floor above: it can only be on the ground floor (move its layer, or put it down there).`)
  if (fall && fall.depth > DEEP_INLET) {
    say(problems, `The longest drain runs ${fall.run.toFixed(1)} m: falling ${DRAIN.slope * 100} %, it arrives ${fall.depth.toFixed(2)} m deep. Moving the waste nearer the house keeps the dig shallower.`)
  }
  if (greaseTraps.length) say(notes, 'The kitchen sinks drain through the grease trap; the other fixtures keep their rooms’ floor traps.')
  if (!points.length) say(notes, 'No fixtures yet: put sinks, toilets, showers and the washer down on the Floor tab, and they get their water and drains here.')

  return { frame, occupants, equipment, linked, points, fixtures, traps, chambers, runs, risers, vents, summary, materials, valves, fittings, fall, problems, notes }
}

/** How much pipe of each kind, size and material, m (rises included), by the key its takeoff row uses. */
export function pipeLengths(p: Pick<PlumbingPlan, 'runs' | 'vents' | 'materials'>): { key: string; material: PipeMaterial; length: number }[] {
  const out = new Map<string, { key: string; material: PipeMaterial; length: number }>()
  const put = (key: string, material: PipeMaterial, l: number) => {
    const id = `${key}|${material}`
    const row = out.get(id) ?? { key, material, length: 0 }
    row.length += l
    out.set(id, row)
  }
  for (const r of p.runs) {
    const key = r.kind === 'drain' ? `drain.pipe${r.size}` : r.kind === 'condensate' ? 'drain.condensate' : `water.pipe${r.size}`
    put(key, r.material, r.length + r.rise)
  }
  for (const v of p.vents) put(`drain.pipe${DRAIN.trap}`, p.materials.drain, v.length)
  return [...out.values()]
}
