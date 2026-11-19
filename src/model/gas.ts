import { closestOnSegment, dist, type Vec } from './geometry'
import { corners, local, placeFurniture, toLocal, type Placement } from './furniture'
import { storeyOf, type GasInsideMaterial, type GasMaterial, type Layer, type Plan, type Ref, type Service, type ServiceKind } from './plan'
import { layerFaces, regionAt, type Region } from './regions'
import { gasTree, type GasEntry, type GasRouting } from './gasRouting'
import { clearTree, downstream, fromRoot, obstaclesOf, pathLength, routeKey, router, type TreeEdge, type TreeNode } from './routing'
import { KCAL_PER_KW } from './hvac'
import { placeService, portOf, serviceInfo, sizeForSpec, specOf, specText, tabOf, type ServiceInfo, type ServiceTab } from './services'
import { isCovered, type SolidsSource } from './solids'
import { levelOf } from './storeys'
import { layerWalls, roomHeight, WALL_HEIGHT } from './walls'

/**
 * The gas installation (the Gas tab): the pipe from where the gas comes in to every appliance that burns it, worked
 * out on every edit from what stands on the plan and never stored, as the plumbing is (see plumbing.ts).
 *
 * The gas comes from a natural gas meter or a cabinet of LPG cylinders put down on this tab. What burns it is put
 * down where it belongs: the cooker on the Floor tab (its Oven, unless it is made electric here), the gas water
 * heater on the Plumbing tab, the boiler and the balanced-flue heaters on the HVAC tab, and gas outlets on this tab
 * for what is not drawn. Each keeps its one owner (see services.ts, `links.gas`); this tab draws the others faded
 * and pipes them.
 *
 * The pipe is a tree from the supply, routed square to the walls (routing.ts), on the ground floor with a rise to an
 * appliance upstairs. Each section gets a preliminary Renouard low-pressure size for the gas flowing through it,
 * using a fitting allowance and the farthest downstream appliance. The rooms where an appliance takes
 * its air (a cooker, an open-flue water heater) get two permanent vents, and an open-flue water heater its flue up
 * past the roof. These are coordination assumptions, not an executable gas design: a gasista matriculado must replace
 * them with certified product data, submit the installation, and obtain distributor approval.
 */

/** The gases: what a cubic metre gives, kcal (lower heating value), and how heavy it is against air. */
export const GASES = {
  natural: { title: 'Natural gas', heat: 9300, density: 0.65 },
  lpg: { title: 'Bottled gas (LPG)', heat: 22400, density: 1.52 },
} as const
export type GasKind = keyof typeof GASES

/** The pressure the pipe may lose from the supply to the farthest appliance, mm of water column. */
export const DROP = 10
export const PRESSURE_DROP_MBAR = 1
export const EQUIVALENT_LENGTH_FACTOR = 1.2
export const RENOUARD = 23200

/**
 * The pipe sizes: the nominal size (DN, and its inches for steel), the outside diameter of the matching PE-Al-PE pipe,
 * and a conservative design bore. Certified products must be checked against their actual internal diameter and
 * manufacturer pressure-loss data before construction.
 */
export const GAS_SIZES = [
  { dn: 15, inch: '1/2"', od: 20, bore: 12.7 },
  { dn: 20, inch: '3/4"', od: 25, bore: 19.05 },
  { dn: 25, inch: '1"', od: 32, bore: 25.4 },
  { dn: 32, inch: '1 1/4"', od: 40, bore: 31.75 },
  { dn: 40, inch: '1 1/2"', od: 50, bore: 38.1 },
  { dn: 50, inch: '2"', od: 63, bore: 50.8 },
] as const

/**
 * Fallback appliance consumption used until the actual nameplate rating is known.
 */
export const BURNS = { cooker: 9500, boilerEfficiency: 0.9, heaterEfficiency: 0.85 }
export const STORAGE_HEATER_LOADS = [
  { litres: 50, kcal: 4000 },
  { litres: 75, kcal: 5000 },
  { litres: 110, kcal: 6500 },
  { litres: 150, kcal: 8000 },
] as const
/** Conservative planning capacity for a 45 kg LPG-cylinder battery. */
export const CYLINDER = { kg: 45, activeFraction: 0.5, coldKcalPerHour: 6000, heat: 11000 }
/** An open-flue heater's flue: its diameter, mm, and how far it rises above the roof, m. */
export const FLUE = { size: 100, above: 0.6 }
/** The permanent vents in a room where an appliance takes its air: one low, one high. */
export const VENTS_PER_ROOM = 2
/** A fitting for each bend and each tee, and these at each appliance (an elbow and its connection). */
export const GAS_FITTINGS = { point: 2, bend: 1 }
/** The trench for gas pipe buried outside the buildings, m. */
export const GAS_TRENCH = { width: 0.3, depth: 0.5 }
export const USUAL_GAS_PIPE: GasInsideMaterial = 'pe-al-pe'
export const GAS_PIPE_TITLES: Record<GasMaterial, string> = { 'pe-al-pe': 'Approved multilayer gas system', steel: 'Epoxy-coated steel', pe: 'Polyethylene (buried)' }
/** How the pipe is routed unless chosen otherwise, and what each way is called. */
export const USUAL_GAS_ROUTING: GasRouting = 'outside'
export const GAS_ROUTING_TITLES: Record<GasRouting, string> = {
  outside: 'Outside, in next to each appliance',
  entry: 'Outside, one entry per building',
  direct: 'Shortest, under the house',
}
/** How far outside a building a shut-off valve still closes it off, or reaches an appliance standing outside, m. */
export const VALVE_REACH = 4

/** A size in words, as the material is sold: "Ø20" for multilayer, '3/4"' for steel. */
export function gasSizeLabel(dn: number, material: GasMaterial): string {
  const size = GAS_SIZES.find((s) => s.dn === dn)
  if (!size) return `DN${dn}`
  return material === 'steel' ? size.inch : `Ø${size.od}`
}

/** What a pipe of this bore carries, m³/h, over `length` m for the gas's density. */
export const equivalentLength = (length: number): number => Math.max(1, length * EQUIVALENT_LENGTH_FACTOR)

/** Preliminary low-pressure capacity by Renouard linear, using a conservative design bore. */
export function renouardFlow(bore: number, length: number, density: number, drop = PRESSURE_DROP_MBAR): number {
  return ((drop * bore ** 4.82) / (RENOUARD * density * equivalentLength(length))) ** (1 / 1.82)
}

/** The smallest size that carries `flow` m³/h over `length` m, or the largest (and `short`) when none does. */
export function gasSizeFor(flow: number, length: number, density: number): { dn: number; short: boolean } {
  for (const s of GAS_SIZES) if (renouardFlow(s.bore, length, density) >= flow - 1e-9) return { dn: s.dn, short: false }
  return { dn: GAS_SIZES[GAS_SIZES.length - 1].dn, short: true }
}

/** Something that burns gas, wherever it was put down: a cooker, a piece of equipment of any tab, a gas outlet. */
export interface GasAppliance {
  /** The cooker (furniture) or the piece of equipment (service) it is. */
  ref: Ref
  kind: 'cooker' | ServiceKind
  title: string
  /** The tab it is put down on: the Floor tab's cooker, or the tab that owns the piece. */
  from: 'floor' | ServiceTab
  /** Its gas point: where the pipe ends. */
  at: Vec
  /** Its footprint, to pick it and draw it. */
  placed: Placement
  storey: number
  level: number
  /** The area it stands in ('' when none), its room's key, and what the room is used for. */
  room: string
  roomKey: string
  /** Whether it stands inside a building. */
  inside: boolean
  /** What it burns, kcal/h. */
  burns: number
  /** It takes its air from the room (a cooker, an open-flue water heater): the room needs permanent vents. */
  open: boolean
  /** Its fumes go up a flue past the roof (an open-flue water heater). */
  flue: boolean
  exhaust?: 'vertical-open' | 'balanced-wall'
  /** A cooker made electric on this tab: it is listed, and not piped. */
  electric: boolean
  /** Where a vent goes when it needs one: the point of its room's outline nearest it. */
  wall?: Vec
}

/** A piece of the Gas tab's own equipment: a meter, a cabinet of cylinders, a gas outlet. */
export interface GasPiece {
  ref: Ref
  kind: ServiceKind
  info: ServiceInfo
  service: Service
  at: Vec
  placed: Placement
  storey: number
  level: number
  room: string
  spec: number | null
  specText: string
  inside: boolean
}

/** A stretch of gas pipe between two junctions. */
export interface GasRun {
  kind: 'gas'
  /** Its nominal size, DN. */
  size: number
  material: GasMaterial
  /** The gas through it when everything downstream burns, m³/h. */
  flow: number
  /** The appliance it ends at, when it is the branch to one. */
  to?: Ref
  /** The appliances and valves it leads to (downstream of it), for moving it by hand (see movedRoutes). */
  ends?: Ref[]
  path: Vec[]
  storey: number
  length: number
  rise: number
  /** How much of it is buried outside the buildings, m. */
  outdoor: number
}

/** A room that needs permanent vents, and where they go. */
export interface GasVent {
  room: string
  roomKey: string
  storey: number
  at: Vec
  count: number
  /** What takes its air there. */
  for: string[]
}

export interface GasPlan {
  frame: number
  /** The gas the house runs on, from its supply; null with none. */
  gas: GasKind | null
  /** The Gas tab's own pieces, and among them the supply. */
  pieces: GasPiece[]
  supply: GasPiece[]
  /** Everything that burns gas (electric cookers included, marked), in plan order. */
  appliances: GasAppliance[]
  runs: GasRun[]
  risers: { at: Vec; from: number; to: number }[]
  vents: GasVent[]
  flues: { ref: Ref; at: Vec; storey: number; length: number; room: string; kind: 'vertical-open' | 'balanced-wall' }[]
  /** Where the pipe goes into a building: on its wall's outside face, just outside it, and what it feeds there. */
  entries: { at: Vec; out: Vec; feeds: string[]; rooms: string[] }[]
  /** What the pipe is made of inside the buildings and outside them, and how it is routed. */
  materials: { inside: GasMaterial; outside: GasMaterial }
  routing: GasRouting
  /** What the fed appliances burn at once, kcal/h and m³/h of the house's gas (the shut-off valves' reserve included in `flow`). */
  load: number
  /** What the shut-off valves keep for what will hang off them later, kcal/h. */
  reserve: number
  flow: number
  /** What the supply gives, m³/h of its gas (a meter's rating; the cylinders' draw). */
  capacity: number
  /** The pipe from the supply to the farthest appliance, m (rises included): what every section is sized over. */
  longest: number
  valves: number
  fittings: number
  /** Pieces running on electricity that have a gas counterpart (see GAS_COUNTERPART): what could burn gas instead. */
  electric: { ref: Ref; kind: ServiceKind; title: string; room: string; from: ServiceTab; to: ServiceKind }[]
  problems: string[]
  notes: string[]
}

const direct: SolidsSource = { faces: layerFaces, walls: (layer) => layerWalls(layer, layerFaces(layer).thickness) }

/** What a piece of equipment burns, kcal/h; 0 for what burns nothing. */
export function burnsOf(kind: ServiceKind, spec: number | null): number {
  switch (kind) {
    case 'heater-gas': {
      const litres = spec ?? 0
      const published = STORAGE_HEATER_LOADS.find((entry) => litres <= entry.litres)
      return published?.kcal ?? Math.max(8000, (litres / 150) * 8000)
    }
    case 'boiler':
      return Math.round((spec ?? 0) / BURNS.boilerEfficiency)
    case 'gas-heater':
      return Math.round((spec ?? 0) / BURNS.heaterEfficiency)
    case 'gas-outlet':
      return spec ?? 0
    default:
      return 0
  }
}

/** The gas piece that does what an electric one does: a gas water heater for an electric one, a boiler for a heat pump. */
export const GAS_COUNTERPART: Partial<Record<ServiceKind, ServiceKind>> = { 'heater-electric': 'heater-gas', 'heat-pump': 'boiler' }

/**
 * A piece switched to its gas counterpart where it stands, turned as it was, at the size that rates it as the piece
 * did: a 155 l electric water heater becomes a gas one of about 155 l, a 16 kW heat pump a boiler of about as many
 * kcal/h (snapped to the sizes it is sold in). The same piece when it has no counterpart.
 */
export function toGas(s: Service): Service {
  const to = GAS_COUNTERPART[s.kind]
  if (!to) return s
  const from = serviceInfo(s.kind)
  const info = serviceInfo(to)
  const rating = specOf(from, s.width, s.depth) ?? 0
  const value = s.kind === 'heat-pump' ? rating * KCAL_PER_KW : rating
  // the size for that rating, the rating it is sold in at that size, and the size for exactly that
  const raw = sizeForSpec(info, value)
  const sold = specOf(info, raw.width, raw.depth) ?? value
  return { ...s, kind: to, ...sizeForSpec(info, sold) }
}

/** Whether a piece of furniture is a cooker: the Floor tab's Oven is drawn with its hob over it. */
export const isCooker = (f: { kind: string; style?: string }): boolean => f.kind === 'appliance' && f.style === 'oven'

/** Whether a cooker has been made electric on the Gas tab. */
export const isElectric = (plan: Plan, ref: { layer: string; id: string }): boolean => plan.gas?.appliances?.[`${ref.layer}:${ref.id}`]?.fuel === 'electric'

/** What a cubic metre of a supply's gas gives, and what the supply gives at most, m³/h. */
function supplyCapacity(p: GasPiece): number {
  if (p.kind === 'gas-meter') return p.spec ?? 0
  const kg = p.spec ?? 0
  const cylinders = Math.max(1, Math.floor(kg / CYLINDER.kg))
  const active = cylinders > 1 ? Math.max(1, Math.floor(cylinders * CYLINDER.activeFraction)) : 1
  return (active * CYLINDER.coldKcalPerHour) / GASES.lpg.heat
}

/**
 * `avoid`: the other installations' pipes the gas keeps clear of inside the buildings where it would run along one
 * (the Plumbing tab's water and condensate, the HVAC tab's heating; see routing.ts, clearPath, and derived.ts).
 */
export function gasPlan(plan: Plan, source: SolidsSource = direct, avoid: readonly { path: readonly Vec[]; size: number; storey: number }[] = []): GasPlan {
  const r = router(plan, source)
  const { frame, buildings, buildingAt, outdoorLength } = r
  const inside = plan.gas?.material ?? USUAL_GAS_PIPE
  const materials = { inside, outside: plan.gas?.outdoor ?? inside }
  const routing: GasRouting = plan.gas?.routing ?? USUAL_GAS_ROUTING
  /** The building a point is in, or the one whose walls are within VALVE_REACH of it; -1 when none. */
  const buildingNear = (p: Vec): number => {
    const b = buildingAt(p)
    if (b >= 0) return b
    let best = { b: -1, d: VALVE_REACH }
    buildings.forEach((rings, i) => {
      for (const ring of rings) for (let k = 0; k < ring.length; k++) {
        const d = closestOnSegment(p, ring[k], ring[(k + 1) % ring.length]).dist
        if (d <= best.d) best = { b: i, d }
      }
    })
    return best.b
  }
  const pieces: GasPiece[] = []
  const appliances: GasAppliance[] = []

  // ---- what stands on the plan: the supply and outlets here, and what burns gas on every tab
  // the named rooms of every visible layer, so a piece finds its room when the walls are drawn on another layer
  const floors = plan.layers
    .filter((l) => l.visible)
    .map((l) => {
      // one call: an uncached source makes new regions each time, and rooms are keyed by them
      const regions = source.faces(l).regions
      return { layer: l, storey: storeyOf(l), regions, rooms: roomsOf(l, regions) }
    })
  for (const layer of plan.layers) {
    if (!layer.visible) continue
    const storey = storeyOf(layer)
    const level = storey ? levelOf(layer) : 0
    // its own layer's rooms first, then the others on its floor
    const mine = floors.filter((f) => f.storey === storey).sort((a, b) => Number(b.layer === layer) - Number(a.layer === layer))
    const roomAt = (p: Vec) => {
      let unnamed: { region: Region; room: string; roomKey: string } | undefined
      for (const f of mine) {
        const region = regionAt(f.regions, p)
        const room = region ? f.rooms.get(region) : undefined
        if (region && room) return { region, room: room.name, roomKey: `${f.layer.id}:${f.regions.indexOf(region)}` }
        if (region && !unnamed) unnamed = { region, room: '', roomKey: `${f.layer.id}:${f.regions.indexOf(region)}` }
      }
      return unnamed ?? { region: null, room: '', roomKey: '' }
    }
    const wallOf = (region: Region | null, p: Vec): Vec | undefined => {
      if (!region) return undefined
      let best: { d: number; at: Vec } | undefined
      const ring = region.outer
      ring.forEach((a, i) => {
        const c = closestOnSegment(p, a, ring[(i + 1) % ring.length])
        if (!best || c.dist < best.d) best = { d: c.dist, at: c.point }
      })
      return best?.at
    }
    for (const [id, f] of Object.entries(layer.furniture)) {
      if (!isCooker({ kind: f.kind, style: 'style' in f ? f.style : undefined })) continue
      const pl = placeFurniture(layer, f)
      if (!pl) continue
      const ref: Ref = { layer: layer.id, kind: 'furniture', id }
      const at = local(pl, 0, -pl.depth / 2 + 0.05)
      const where = roomAt(pl.at)
      appliances.push({
        ref,
        kind: 'cooker',
        title: 'Cooker',
        from: 'floor',
        at,
        placed: pl,
        storey,
        level,
        room: where.room,
        roomKey: where.roomKey,
        inside: buildingAt(pl.at) >= 0 || !!where.region?.indoor,
        burns: BURNS.cooker,
        open: true,
        flue: false,
        electric: isElectric(plan, ref),
        wall: wallOf(where.region, pl.at),
      })
    }
    for (const [id, s] of Object.entries(layer.services)) {
      const info = serviceInfo(s.kind)
      const owner = tabOf(info)
      if (owner !== 'gas' && !info.links?.gas) continue
      const ref: Ref = { layer: layer.id, kind: 'service', id }
      const where = roomAt(s.at)
      const placed = placeService(s)
      const spec = specOf(info, s.width, s.depth)
      const inside = buildingAt(s.at) >= 0 || !!where.region?.indoor
      if (owner === 'gas') pieces.push({ ref, kind: s.kind, info, service: s, at: s.at, placed, storey, level, room: where.room, spec, specText: specText(info, s.width, s.depth), inside })
      const burns = burnsOf(s.kind, spec)
      if (!burns) continue
      // an open-flue water heater takes its air from the room; a sealed boiler and a balanced-flue heater do not
      const open = s.kind === 'heater-gas'
      const exhaust = open ? 'vertical-open' : s.kind === 'boiler' || s.kind === 'gas-heater' ? 'balanced-wall' : undefined
      appliances.push({
        ref,
        kind: s.kind,
        title: info.title,
        from: owner,
        // its gas connection (portOf), apart from its water and heating
        at: portOf(s, 'gas'),
        placed,
        storey,
        level,
        room: where.room,
        roomKey: where.roomKey,
        inside,
        burns,
        open,
        flue: !!exhaust,
        ...(exhaust ? { exhaust } : {}),
        electric: false,
        wall: exhaust ? wallOf(where.region, s.at) : undefined,
      })
    }
  }

  const problems: string[] = []
  const notes: string[] = []
  const say = (list: string[], text: string) => list.push(text)
  const fed = appliances.filter((a) => !a.electric)
  const meters = pieces.filter((p) => p.kind === 'gas-meter')
  const cylinders = pieces.filter((p) => p.kind === 'gas-cylinders')
  // one installation runs on one gas: natural gas when there is a meter
  const gas: GasKind | null = meters.length ? 'natural' : cylinders.length ? 'lpg' : null
  const candidates = gas === 'natural' ? meters : gas === 'lpg' ? cylinders : []
  // Separate sources must not silently become one manifold. Until the user models separate installations, use one.
  const supply = candidates.slice(0, 1)
  const heat = gas ? GASES[gas].heat : GASES.natural.heat
  const density = gas ? GASES[gas].density : GASES.natural.density
  const load = fed.reduce((sum, a) => sum + a.burns, 0)
  const capacity = supply.reduce((sum, p) => sum + supplyCapacity(p), 0)

  // ---- the pipe: a tree from the supply to the valves and to every appliance fed not behind one, and from each valve
  // to what it closes off; routed outside the buildings where it can be (gasRouting.ts), each section sized for the
  // gas that flows through it, a valve's reserve included
  const runs: GasRun[] = []
  const risers: GasPlan['risers'] = []
  const entries: GasPlan['entries'] = []
  let longest = 0
  let valves = 0
  let fittings = 0
  let short = false
  const shutoffs = pieces.filter((p) => p.kind === 'gas-valve')
  const reserve = shutoffs.reduce((sum, v) => sum + (v.service.reserve ?? 0), 0)
  // what each valve closes off: the fed appliances in the building it stands in or by, or outside within reach of it
  const valveBuilding = shutoffs.map((v) => buildingNear(v.at))
  const behind = new Map<GasAppliance, number>()
  for (const a of fed) {
    const b = buildingAt(a.placed.at)
    let best = -1
    shutoffs.forEach((v, i) => {
      const mine = b >= 0 ? valveBuilding[i] === b : dist(v.at, a.at) <= VALVE_REACH
      if (mine && (best < 0 || dist(v.at, a.at) < dist(shutoffs[best].at, a.at))) best = i
    })
    if (best >= 0) behind.set(a, best)
  }
  // the ends the pipe goes to: the valves, then the appliances; each with the gas it takes
  const ends: { at: Vec; storey: number; level: number; takes: number; ref: Ref; title: string; room: string }[] = [
    ...shutoffs.map((v) => ({ at: v.at, storey: v.storey, level: v.level, takes: v.service.reserve ?? 0, ref: v.ref, title: v.info.title, room: v.room })),
    ...fed.map((a) => ({ at: a.at, storey: a.storey, level: a.level, takes: a.burns, ref: a.ref, title: a.title, room: a.room })),
  ]
  if (supply.length && ends.length) {
    const nodes: TreeNode[] = []
    const edges: TreeEdge[] = []
    const addEntries = (list: GasEntry[], map: (i: number) => number) => {
      for (const e of list) {
        const fedThere = e.targets.map(map).map((i) => ends[i])
        entries.push({ at: e.wall, out: e.out, feeds: fedThere.map((x) => x.title), rooms: [...new Set(fedThere.map((x) => x.room).filter(Boolean))] })
      }
    }
    // the main: the supply to the valves and to what no valve closes off
    const first = [...shutoffs.map((_, i) => i), ...fed.flatMap((a, i) => (behind.has(a) ? [] : [shutoffs.length + i]))]
    // the routes set by hand on this tab, by what the run leads to (routing.ts, routeKey)
    const routes = plan.gas?.routes ?? {}
    const guideOf = (i: number) => routes[routeKey('gas', ends[i].ref)]
    // the ground floor's electrical boxes, which an entry keeps clear of
    const boxes = plan.layers.filter((l) => l.visible && !storeyOf(l)).flatMap((l) => Object.values(l.electrical).map((e) => e.at))
    const main = gasTree(r, supply.map((p) => p.at), first.map((i) => ends[i].at), routing, first.map(guideOf), boxes)
    for (const n of main.tree.nodes) nodes.push({ ...n, target: n.target >= 0 ? first[n.target] : -1 })
    edges.push(...main.tree.edges)
    addEntries(main.entries, (i) => first[i])
    // each valve on to what it closes off
    shutoffs.forEach((v, k) => {
      const at = nodes.findIndex((n) => n.target === k)
      const mine = fed.flatMap((a, i) => (behind.get(a) === k ? [shutoffs.length + i] : []))
      if (at < 0 || !mine.length) return
      const branch = gasTree(r, [v.at], mine.map((i) => ends[i].at), routing, mine.map(guideOf), boxes)
      const base = nodes.length - 1
      const to = (i: number) => (i === 0 ? at : base + i)
      branch.tree.nodes.forEach((n, i) => i > 0 && nodes.push({ p: n.p, target: n.target >= 0 ? mine[n.target] : -1, parent: to(n.parent) }))
      for (const e of branch.tree.edges) edges.push({ from: to(e.from), to: to(e.to), path: e.path })
      addEntries(branch.entries, (i) => mine[i])
    })
    // inside the buildings, clear of the other installations where it would run along one
    const within = (p: Vec) => buildingAt(p) >= 0
    const obstacles = obstaclesOf(avoid, within)
    // (sized after it is routed: cleared as for a 1 1/4" pipe, bigger than a house's inside stretches come to)
    const laid = { nodes, edges }
    const downstreamOf = downstream(laid)
    // but where it leads to a route set by hand
    const tree = clearTree(laid, () => GAS_SIZES[3].bore / 2000, 0, obstacles, frame, within, (i) => downstreamOf[i].some((t) => guideOf(t)))
    const below = downstream(tree)
    const depth = fromRoot(tree)
    const riseOf = (i: number) => (ends[i].storey ? ends[i].level : 0)
    const targetDepth = new Map<number, number>()
    // the length every section is sized over: the supply to the farthest end, its rise included
    tree.nodes.forEach((n, k) => {
      if (n.target >= 0) {
        const length = depth[k] + riseOf(n.target)
        targetDepth.set(n.target, length)
        longest = Math.max(longest, length)
      }
    })
    tree.edges.forEach((e, i) => {
      const n = tree.nodes[e.to]
      const end = n.target >= 0 ? ends[n.target] : null
      const through = below[i].reduce((sum, t) => sum + ends[t].takes, 0) / heat
      const designLength = Math.max(...below[i].map((t) => targetDepth.get(t) ?? longest), longest ? 0 : 1)
      const size = gasSizeFor(through, designLength, density)
      short ||= size.short
      const length = pathLength(e.path)
      const rise = n.target >= 0 ? riseOf(n.target) : 0
      if (length < 1e-6 && rise < 1e-6) return
      const outdoor = outdoorLength(e.path)
      runs.push({
        kind: 'gas',
        size: size.dn,
        material: outdoor > (length + rise) / 2 ? materials.outside : materials.inside,
        flow: through,
        ...(end ? { to: end.ref } : {}),
        ends: below[i].map((t) => ends[t].ref),
        path: e.path,
        storey: 0,
        length,
        rise,
        outdoor,
      })
      fittings += Math.max(0, e.path.length - 2) * GAS_FITTINGS.bend
    })
    fittings += tree.nodes.filter((n) => n.target < 0 && n.parent >= 0).length + fed.length * GAS_FITTINGS.point
    for (const a of fed) if (a.storey) risers.push({ at: a.at, from: 0, to: a.storey })
    // a valve at each appliance, and the main one after each meter or regulator; the shut-off valves are pieces
    valves = fed.length + supply.length
  }

  // ---- ventilation and combustion exhaust are required by appliances, even before a supply is placed
  const vents: GasVent[] = []
  const flues: GasPlan['flues'] = []
  const byRoom = new Map<string, GasVent>()
  for (const a of fed) {
    if (!a.open || !a.inside || !a.roomKey || !a.wall) continue
    const vent = byRoom.get(a.roomKey) ?? { room: a.room, roomKey: a.roomKey, storey: a.storey, at: a.wall, count: VENTS_PER_ROOM, for: [] }
    vent.for.push(a.title.toLowerCase())
    byRoom.set(a.roomKey, vent)
  }
  vents.push(...byRoom.values())
  for (const a of fed) {
    if (!a.exhaust) continue
    if (a.exhaust === 'balanced-wall') {
      flues.push({ ref: a.ref, at: a.wall ?? a.at, storey: a.storey, length: 0.3, room: a.room, kind: a.exhaust })
      continue
    }
    const top = a.inside ? topOver(plan, source, a.at, a.storey) : a.level
    flues.push({
      ref: a.ref,
      at: a.at,
      storey: a.storey,
      length: Math.max(FLUE.above, top + FLUE.above - (a.level + serviceInfo(a.kind as ServiceKind).height)),
      room: a.room,
      kind: a.exhaust,
    })
  }

  // ---- what to check
  const flow = (load + reserve) / heat
  const kcal = (x: number) => `${Math.round(x / 100) * 100} kcal/h`
  const plusReserve = reserve ? ` (${kcal(reserve)} of it kept at the shut-off valves for later)` : ''
  if (fed.length && !supply.length) {
    say(problems, `${fed.length} appliance${fed.length > 1 ? 's burn' : ' burns'} gas, but nothing supplies it: put a natural gas meter or gas cylinders down${fed.some((a) => a.kind === 'cooker') ? ', or make the cooker electric' : ''}.`)
  }
  if (meters.length && cylinders.length) say(problems, 'There is a natural gas meter and gas cylinders: an installation runs on one gas. The cylinders are left out; delete one or the other.')
  if (candidates.length > 1) say(problems, `There are ${candidates.length} gas supplies. They cannot be combined automatically; keep one source per installation or have the gasista split and size separate systems.`)
  if (gas === 'natural' && flow > capacity + 1e-9) {
    say(problems, `The appliances burn ${flow.toFixed(2)} m³/h of natural gas at once${plusReserve}; the meter gives ${capacity} m³/h. Ask the gas company for a bigger one (drag its Flow).`)
  }
  if (gas === 'lpg' && flow > capacity + 1e-9) {
    const kg = supply.reduce((sum, p) => sum + (p.spec ?? 0), 0)
    say(problems, `The appliances burn ${kcal(load + reserve)}${plusReserve}; ${kg} kg of cylinders give a conservative ${kcal(capacity * heat)} in cold weather with half the battery active. Add cylinders (drag its Capacity), or bring in natural gas.`)
  }
  if (short) say(problems, `A section carries more gas than a ${GAS_SIZES[GAS_SIZES.length - 1].inch} pipe does over ${longest.toFixed(1)} m: bring the supply nearer the appliances.`)
  for (const a of fed) if (a.open && a.inside) {
    const room = a.room.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    const prohibited = /(^|\b)(bath|bathroom|bano|bedroom|dormitorio|habitacion)(\b|$)/.test(room)
    if (prohibited) say(problems, `The ${a.title.toLowerCase()} is in ${a.room}: an open-flue appliance must not stand in a bathroom or bedroom. Move it or use a sealed appliance.`)
    else say(problems, `The ${a.title.toLowerCase()}${a.room ? ` in ${a.room}` : ''} takes combustion air from the room. Its room eligibility, permanent-vent free area and flue must be verified by a registered gas installer.`)
  }
  for (const p of pieces) {
    if (p.info.outdoor && p.inside) say(problems, `The ${p.info.title.toLowerCase()} stands inside a building: put it outside, ventilated, on the lot.`)
    if (p.info.ground && p.storey) say(problems, `The ${p.info.title.toLowerCase()} is on a floor above: it goes on the ground floor.`)
  }
  if (runs.length) {
    say(notes, `Preliminary sizes use Renouard linear for a ${DROP} mm water-column drop and a ${Math.round((EQUIVALENT_LENGTH_FACTOR - 1) * 100)}% equivalent-length allowance, with all downstream appliances burning at once. A registered gas installer must replace assumptions with certified pipe data and submit the design.`)
  }
  if (vents.length) say(notes, `${vents.length} room${vents.length > 1 ? 's need' : ' needs'} indicative high/low permanent-vent locations: ${vents.map((v) => v.room || 'a room').join(', ')}. Their free area and exact placement are not calculated.`)
  if (flues.length) say(notes, `${flues.length} combustion exhaust terminal${flues.length > 1 ? 's are' : ' is'} shown for coordination only; diameter, clearances and termination height follow the certified appliance and approved design.`)
  say(notes, 'Preliminary coordination and quantity estimate only. A gasista matriculado must design, submit and sign the installation, and the distributor must approve it before work.')
  const others = fed.filter((a) => a.from !== 'gas' && a.from !== 'floor')
  if (others.length) say(notes, `Put down on other tabs and piped here: ${others.map((a) => `${a.title.toLowerCase()} (${a.from === 'hvac' ? 'HVAC' : 'Plumbing'})`).join(', ')}.`)
  const electric = appliances.filter((a) => a.electric)
  if (electric.length) say(notes, `Electric, so not piped: ${electric.map((a) => `the cooker${a.room ? ` in ${a.room}` : ''}`).join(', ')}.`)
  // what runs on electricity and could burn gas instead: the heating's heat pumps, the electric water heaters
  const electricPieces: GasPlan['electric'] = []
  for (const layer of plan.layers) {
    if (!layer.visible) continue
    for (const [id, s] of Object.entries(layer.services)) {
      const to = GAS_COUNTERPART[s.kind]
      if (!to) continue
      const info = serviceInfo(s.kind)
      electricPieces.push({ ref: { layer: layer.id, kind: 'service', id }, kind: s.kind, title: info.title, room: '', from: tabOf(info), to })
    }
  }
  const count = (kind: ServiceKind) => electricPieces.filter((e) => e.kind === kind).length
  const plural = (n: number, one: string, many: string) => (n === 1 ? `a ${one}` : `${n} ${many}`)
  if (count('heat-pump')) {
    say(notes, `The heating comes from ${plural(count('heat-pump'), 'heat pump', 'heat pumps')}, which run on electricity: the radiators and radiant floors they feed take no gas. Switch ${count('heat-pump') === 1 ? 'it' : 'them'} to a boiler below to heat with gas.`)
  }
  if (count('heater-electric')) say(notes, `The hot water comes from ${plural(count('heater-electric'), 'electric water heater', 'electric water heaters')}: no gas. Switch ${count('heater-electric') === 1 ? 'it' : 'them'} to gas below.`)
  if (!appliances.length && !electricPieces.length) {
    say(notes, "Nothing burns gas yet: an oven on the Floor tab is a cooker, the Plumbing tab has a gas water heater, the HVAC tab a boiler and gas heaters, and this tab's library gas outlets.")
  }

  return { frame, gas, pieces, supply, appliances, runs, risers, vents, flues, entries, materials, routing, load, reserve, flow, capacity, longest, valves, fittings, electric: electricPieces, problems, notes }
}

/**
 * The named rooms of a layer by region, and what each is used for: as set on the Interior tab, else from the furniture
 * standing in it on any of `floor`'s layers (the layers on its floor).
 */
function roomsOf(layer: Layer, regions: readonly Region[]): Map<Region, { name: string }> {
  const out = new Map<Region, { name: string }>()
  for (const a of Object.values(layer.areas)) {
    const r = regionAt(regions, a.at)
    if (!r || a.lot || out.has(r)) continue
    out.set(r, { name: a.name })
  }
  return out
}

/** The top of the building over a point on a floor, m from the ground: the walls' top of the highest covered room over it. */
function topOver(plan: Plan, source: SolidsSource, p: Vec, storey: number): number {
  let top = 0
  for (const layer of plan.layers) {
    if (!layer.visible || storeyOf(layer) < storey) continue
    const region = regionAt(source.faces(layer).regions, p)
    if (!region || !isCovered(region)) continue
    top = Math.max(top, (storeyOf(layer) ? levelOf(layer) : 0) + roomHeight(layer, region))
  }
  return top || (storey ? 0 : WALL_HEIGHT)
}

/** A gas piece's or appliance's footprint outline, for drawing. */
export const outlineOf = (pl: Placement): Vec[] => corners(pl)

/** The appliance a ref names, if it burns gas. */
export const applianceOf = (g: GasPlan, ref: { layer: string; kind: string; id: string }): GasAppliance | undefined =>
  g.appliances.find((a) => a.ref.layer === ref.layer && a.ref.kind === ref.kind && a.ref.id === ref.id)

/** The appliance under a point on a floor: its footprint, grown by `reach`. */
export function applianceAt(g: GasPlan, storey: number, p: Vec, reach: number): GasAppliance | undefined {
  return g.appliances.find((a) => {
    if (a.storey !== storey) return false
    const q = toLocal(a.placed, p)
    return Math.abs(q.x) <= a.placed.width / 2 + reach && Math.abs(q.y) <= a.placed.depth / 2 + reach
  }) ?? g.appliances.find((a) => a.storey === storey && dist(a.at, p) <= reach)
}


