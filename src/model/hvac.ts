import { dist, type Vec } from './geometry'
import type { Placement } from './furniture'
import { placeFurniture } from './furniture'
import { storeyOf, type HeatingMaterial, type Plan, type Ref, type Service, type ServiceKind } from './plan'
import { layerFaces, regionAt, regionLabel, type Region } from './regions'
import { clearPath, clearTree, downstream, obstaclesOf, pathLength, routeKey, router } from './routing'
import { placeService, portOf, serviceInfo, specOf, specText, tabOf, type ServiceInfo } from './services'
import type { SolidsSource } from './solids'
import { levelOf } from './storeys'
import { layerWalls, roomHeight } from './walls'

/**
 * The HVAC plan (the HVAC tab): heating, cooling and ventilation, worked out on every edit from the pieces put down
 * on it (see services.ts) and the rooms marked with a radiant floor, never stored.
 *
 * - Heating: the boilers and heat pumps feed the radiators and underfloor manifolds through flow and return pipes
 *   routed square to the walls; each room with a radiant floor has its loops in the screed, fed from the nearest
 *   manifold on its floor.
 * - Cooling: each indoor split unit is joined by refrigerant lines to the nearest outdoor unit.
 * - Ventilation: each extractor fan and range hood is ducted to the nearest outside wall.
 * - Loads: each room's heat and cooling, from its volume, against what is in it — radiators, a radiant floor, split
 *   units (heat-and-cool: they count for both) — and whether a bathroom with no window has an extractor.
 *
 * The plumbing is not piped here (see plumbing.ts): a boiler's hot water, the fill of a boiler or heat pump and a
 * split's condensate are the Plumbing tab's, which shows these pieces faded with their connections, as this tab shows
 * the plumbing's. The rates are usual values for a house, not a heat-loss calculation.
 */

/** What a room needs per m³ of it: heat in kcal/h and cooling in frigorías/h. */
export const LOAD = { heat: 40, cool: 50 }
/**
 * A radiant floor: the heat it gives per m² of floor (kcal/h), the spacing of its loops (m), the most floor one loop
 * heats (m²), and the insulation board under it.
 */
export const RADIANT = { output: 60, spacing: 0.2, loop: 15 }
/** Pipe sizes, mm: heating flow and return, a radiant loop, a split's refrigerant line set; duct diameters. */
export const HVAC_SIZES = { heating: 20, loop: 16, refrigerant: 10, extractor: 100, hood: 150 }
/** kcal/h in a kW. */
export const KCAL_PER_KW = 860
/** What the heating circuits are made of unless chosen otherwise, and what they may be. */
export const USUAL_HEATING: HeatingMaterial = 'pex'
export const HEATING_CHOICES: HeatingMaterial[] = ['pex', 'copper', 'ppr']

export type HvacRunKind = 'heating' | 'radiant' | 'refrigerant' | 'duct'

/** A run of the HVAC: a heating pipe (flow and return along one route), a radiant loop's lead, a refrigerant line set, a duct. */
export interface HvacRun {
  kind: HvacRunKind
  /** Diameter, mm. */
  size: number
  /** What a heating or radiant pipe is made of. */
  material?: HeatingMaterial
  /** The piece or room it is the branch to. */
  to?: Ref
  /** On a main, the radiators and manifolds it leads to, for moving it by hand (see movedRoutes). */
  ends?: Ref[]
  path: Vec[]
  storey: number
  length: number
  rise: number
}

/** A piece of the HVAC tab's equipment on the plan. */
export interface HvacPiece {
  ref: Ref
  kind: ServiceKind
  info: ServiceInfo
  service: Service
  at: Vec
  placed: Placement
  storey: number
  level: number
  room: string
  /** Its room's key (layer and area id), '' when it stands in none. */
  roomKey: string
  spec: number | null
  specText: string
}

/** A room: what it needs and what is in it. */
export interface RoomLoad {
  /** Its layer and area. */
  ref: Ref
  name: string
  storey: number
  /** Where its label goes. */
  at: Vec
  outer: Vec[]
  holes: Vec[][]
  /** Floor inside its walls, m², and height, m. */
  floor: number
  height: number
  volume: number
  /** kcal/h. */
  heatNeed: number
  heat: number
  /** frigorías/h. */
  coolNeed: number
  cool: number
  radiant: boolean
  /** Radiant loops in its floor. */
  loops: number
  /** A bathroom, a toilet, a laundry: it needs a window or an extractor. */
  wet: boolean
  window: boolean
  extractor: boolean
  /** What heats and cools it, in words. */
  emitters: string[]
}

export interface HvacPlan {
  frame: number
  pieces: HvacPiece[]
  rooms: RoomLoad[]
  runs: HvacRun[]
  materials: { heating: HeatingMaterial }
  /** Radiant floor: m² and m of loop pipe (lead included), per room as well in `rooms`. */
  radiant: { floor: number; pipe: number; loops: number }
  summary: {
    sources: HvacPiece[]
    emitters: HvacPiece[]
    /** What the sources give and what the emitters give off, kcal/h. */
    sourceOutput: number
    emitterOutput: number
    heatNeed: number
    coolNeed: number
    cool: number
    indoor: HvacPiece[]
    outdoor: HvacPiece[]
    extractors: HvacPiece[]
    /** Pieces that need an electrical point (the Electricity tab). */
    power: number
    /** What the Plumbing tab gives it: the boilers it takes hot water from, what it fills, what drains into it. */
    plumbing: { dhw: HvacPiece[]; fill: HvacPiece[]; condensate: HvacPiece[] }
    /** The pieces that burn the Gas tab's gas: a boiler, gas heaters. */
    gas: HvacPiece[]
  }
  problems: string[]
  notes: string[]
}

const direct: SolidsSource = { faces: layerFaces, walls: (layer) => layerWalls(layer, layerFaces(layer).thickness) }

const nearestTo = <T extends { at: Vec }>(list: readonly T[], p: Vec): T | undefined => [...list].sort((a, b) => dist(a.at, p) - dist(b.at, p))[0]

/** What a piece gives off as heat, kcal/h: a radiator's or a gas heater's rating, a heat-and-cool split's (frigorías ≈ kcal). */
const heatOf = (p: HvacPiece): number => (p.kind === 'radiator' || p.kind === 'split-indoor' || p.kind === 'gas-heater' ? (p.spec ?? 0) : 0)

/**
 * `avoid`: the other installations' pipes the heating keeps clear of where it would run along one (the Plumbing tab's
 * water and condensate; see routing.ts, clearPath, and derived.ts), so the MEP tab finds them apart.
 */
export function hvacPlan(plan: Plan, source: SolidsSource = direct, avoid: readonly { path: readonly Vec[]; size: number; storey: number }[] = []): HvacPlan {
  const { frame, route, square, outside, buildingAt, guided } = router(plan, source)
  const inside = (p: Vec) => buildingAt(p) >= 0
  const obstacles = obstaclesOf(avoid, inside)
  const materials = { heating: plan.hvac?.materials?.heating ?? USUAL_HEATING }
  const runs: HvacRun[] = []
  const addRun = (kind: HvacRunKind, size: number, path: Vec[], storey: number, rise = 0, to?: Ref, ends?: Ref[]) => {
    const length = pathLength(path)
    if (length < 1e-6 && rise < 1e-6) return
    const material = kind === 'heating' || kind === 'radiant' ? materials.heating : undefined
    runs.push({ kind, size, ...(material ? { material } : {}), ...(to ? { to } : {}), ...(ends?.length ? { ends } : {}), path, storey, length, rise })
  }
  // the routes set by hand on this tab, by run kind and what the run leads to (routing.ts, routeKey)
  const routes = plan.hvac?.routes ?? {}
  const guide = (kind: HvacRunKind, ref?: Ref) => (ref ? routes[routeKey(kind, ref)] : undefined)

  // ---- the rooms and the pieces in them
  const pieces: HvacPiece[] = []
  const rooms: RoomLoad[] = []
  const shared = new Set<RoomLoad>()
  for (const layer of plan.layers) {
    if (!layer.visible) continue
    const storey = storeyOf(layer)
    const level = storey ? levelOf(layer) : 0
    const regions = source.faces(layer).regions
    const byRegion = new Map<Region, RoomLoad>()
    for (const [id, area] of Object.entries(layer.areas)) {
      const region = regionAt(regions, area.at)
      if (!region || area.lot || area.depth || !region.indoor) continue
      // two areas in one outline (a wall between them not closed) are one room here, and said so
      const same = byRegion.get(region)
      if (same) {
        same.name = `${same.name} + ${area.name}`
        shared.add(same)
        continue
      }
      const height = roomHeight(layer, region)
      const volume = region.floor * height
      const room: RoomLoad = {
        ref: { layer: layer.id, kind: 'area', id },
        name: area.name,
        storey,
        at: regionLabel(region),
        outer: region.outer,
        holes: region.holes,
        floor: region.floor,
        height,
        volume,
        heatNeed: volume * LOAD.heat,
        heat: 0,
        coolNeed: volume * LOAD.cool,
        cool: 0,
        radiant: !!area.radiant,
        loops: area.radiant ? Math.max(1, Math.ceil(region.floor / RADIANT.loop)) : 0,
        wet: false,
        window: Object.values(layer.openings).some((o) => o.kind === 'window' && region.wallIds.includes(o.segment)),
        extractor: false,
        emitters: [],
      }
      if (room.radiant) {
        room.heat += region.floor * RADIANT.output
        room.emitters.push('radiant floor')
      }
      byRegion.set(region, room)
      rooms.push(room)
    }
    const roomOf = (p: Vec) => {
      const r = regionAt(regions, p)
      return r ? byRegion.get(r) : undefined
    }
    // wet rooms: where a toilet, a shower, a bathtub or a washer stands
    for (const f of Object.values(layer.furniture)) {
      if (!['toilet', 'shower', 'bathtub', 'bidet'].includes(f.kind) && !(f.kind === 'appliance' && f.style === 'washer')) continue
      const pl = placeFurniture(layer, f)
      const room = pl && roomOf(pl.at)
      if (room) room.wet = true
    }
    for (const [id, s] of Object.entries(layer.services)) {
      const info = serviceInfo(s.kind)
      if (tabOf(info) !== 'hvac') continue
      const room = roomOf(s.at)
      const piece: HvacPiece = {
        ref: { layer: layer.id, kind: 'service', id },
        kind: s.kind,
        info,
        service: s,
        at: s.at,
        placed: placeService(s),
        storey,
        level,
        room: room?.name ?? '',
        roomKey: room ? `${room.ref.layer}:${room.ref.id}` : '',
        spec: specOf(info, s.width, s.depth),
        specText: specText(info, s.width, s.depth),
      }
      pieces.push(piece)
      if (!room) continue
      room.heat += heatOf(piece)
      if (s.kind === 'split-indoor') room.cool += piece.spec ?? 0
      if (s.kind === 'extractor') room.extractor = true
      if (s.kind === 'radiator' || s.kind === 'split-indoor' || s.kind === 'gas-heater') room.emitters.push(`${info.title.toLowerCase()} ${piece.specText}`)
    }
  }

  const ofKind = (...kinds: ServiceKind[]) => pieces.filter((p) => kinds.includes(p.kind))
  const problems: string[] = []
  const notes: string[] = []

  // ---- heating: the sources feed the radiators and manifolds; each radiant room its manifold
  const sources = ofKind('boiler', 'heat-pump')
  const emitters = ofKind('radiator', 'underfloor-manifold')
  if (sources.length && emitters.length) {
    // from each source's heating connection (portOf), apart from its water and gas; kept clear of the water but where
    // it leads to a route set by hand
    const guides = emitters.map((e) => guide('heating', e.ref))
    const routed = route(
      sources.map((s) => portOf(s.service, 'heating')),
      emitters.map((e) => e.at),
      guides,
    )
    const below = downstream(routed)
    const tree = clearTree(routed, () => HVAC_SIZES.heating / 2000, 0, obstacles, frame, inside, (i) => below[i].some((t) => guides[t]))
    tree.edges.forEach((e, i) => {
      const n = tree.nodes[e.to]
      const t = n.target >= 0 ? emitters[n.target] : null
      addRun('heating', HVAC_SIZES.heating, e.path, 0, t && t.storey ? t.level : 0, t?.ref, below[i].map((k) => emitters[k].ref))
    })
  }
  const manifolds = ofKind('underfloor-manifold')
  const loopsOn = new Map<HvacPiece, number>()
  let radiantPipe = 0
  for (const room of rooms.filter((r) => r.radiant)) {
    const sameFloor = manifolds.filter((m) => m.storey === room.storey)
    const manifold = nearestTo(sameFloor.length ? sameFloor : manifolds, room.at)
    // the loops themselves: the floor at their spacing
    radiantPipe += room.floor / RADIANT.spacing
    if (!manifold) continue
    loopsOn.set(manifold, (loopsOn.get(manifold) ?? 0) + room.loops)
    const own = guide('radiant', room.ref)
    const lead = own ? guided(manifold.at, room.at, own) : clearPath(square(manifold.at, room.at), HVAC_SIZES.loop / 2000, room.storey, obstacles, frame, inside)
    addRun('radiant', HVAC_SIZES.loop, lead, room.storey, 0, room.ref)
    // each loop runs from the manifold to the room and back
    radiantPipe += pathLength(lead) * 2 * room.loops
  }

  // ---- cooling: each indoor unit to the nearest outdoor one
  const indoor = ofKind('split-indoor')
  const outdoorUnits = ofKind('split-outdoor')
  const served = new Map<HvacPiece, number>()
  for (const unit of indoor) {
    const pair = nearestTo(outdoorUnits, unit.at)
    if (!pair) continue
    served.set(pair, (served.get(pair) ?? 0) + (unit.spec ?? 0))
    addRun('refrigerant', HVAC_SIZES.refrigerant, guided(unit.at, pair.at, guide('refrigerant', unit.ref)), unit.storey, Math.abs(unit.level - pair.level), unit.ref)
  }

  // ---- ventilation: each extractor and hood ducted out through the nearest wall
  for (const fan of ofKind('extractor', 'range-hood')) {
    const out = outside(fan.at)
    if (out) addRun('duct', fan.kind === 'range-hood' ? HVAC_SIZES.hood : HVAC_SIZES.extractor, guided(fan.at, out, guide('duct', fan.ref)), fan.storey, 0, fan.ref)
  }

  // ---- what it comes to, and what to check
  const sourceOutput = sources.reduce((sum, s) => sum + (s.kind === 'heat-pump' ? (s.spec ?? 0) * KCAL_PER_KW : (s.spec ?? 0)), 0)
  const emitterOutput =
    ofKind('radiator').reduce((sum, r) => sum + (r.spec ?? 0), 0) + rooms.filter((r) => r.radiant).reduce((sum, r) => sum + r.floor * RADIANT.output, 0)
  const heated = rooms.filter((r) => r.heat > 0)
  const cooled = rooms.filter((r) => r.cool > 0)
  const radiantRooms = rooms.filter((r) => r.radiant)
  const summary: HvacPlan['summary'] = {
    sources,
    emitters,
    sourceOutput,
    emitterOutput,
    heatNeed: rooms.reduce((sum, r) => sum + r.heatNeed, 0),
    coolNeed: rooms.reduce((sum, r) => sum + r.coolNeed, 0),
    cool: indoor.reduce((sum, u) => sum + (u.spec ?? 0), 0),
    indoor,
    outdoor: outdoorUnits,
    extractors: ofKind('extractor', 'range-hood'),
    power: pieces.filter((p) => p.info.links?.power).length,
    plumbing: {
      dhw: pieces.filter((p) => p.info.links?.dhw),
      fill: pieces.filter((p) => p.info.links?.fill && !p.info.links.dhw),
      condensate: pieces.filter((p) => p.info.links?.condensate),
    },
    gas: pieces.filter((p) => p.info.links?.gas),
  }
  const say = (list: string[], text: string) => list.push(text)
  const round = (x: number) => Math.round(x / 10) * 10
  if ((emitters.length || radiantRooms.length) && !sources.length) say(problems, 'The radiators and radiant floors have nothing to feed them: put a boiler or a heat pump down.')
  if (radiantRooms.length && !manifolds.length) say(problems, `${radiantRooms.length} room${radiantRooms.length > 1 ? 's have' : ' has'} a radiant floor but there is no underfloor manifold: put one down on ${radiantRooms.length > 1 ? 'their floor' : 'its floor'}.`)
  for (const [manifold, loops] of loopsOn) {
    if (loops > (manifold.spec ?? 0)) say(problems, `An underfloor manifold${manifold.room ? ` in ${manifold.room}` : ''} has ${manifold.spec} circuits for ${loops} loops: make it wider (more circuits), or add another.`)
  }
  if (sources.length && sourceOutput < emitterOutput) say(problems, `The boilers and heat pumps give ${round(sourceOutput)} kcal/h; the radiators and radiant floors want ${round(emitterOutput)}. Choose a bigger one.`)
  const short = heated.filter((r) => r.heat < r.heatNeed * 0.9)
  if (short.length) say(problems, `Short of heat: ${short.map((r) => `${r.name} (${round(r.heat)} of ${round(r.heatNeed)} kcal/h)`).join(', ')}. Widen a radiator, add one, or give it a radiant floor.`)
  const warm = cooled.filter((r) => r.cool < r.coolNeed * 0.9)
  if (warm.length) say(problems, `Short of cooling: ${warm.map((r) => `${r.name} (${round(r.cool)} of ${round(r.coolNeed)} frig/h)`).join(', ')}. Choose a bigger split.`)
  for (const b of ofKind('boiler')) if (!inside(b.at)) say(problems, `A boiler stands outside${b.room ? ` by ${b.room}` : ''}: it hangs inside, on a wall, its flue out through it. Move it in, onto the inside of an outside wall.`)
  if (indoor.length && !outdoorUnits.length) say(problems, 'The split units have no outdoor unit: put one down outside.')
  for (const [unit, load] of served) {
    if (load > (unit.spec ?? 0)) say(problems, `An outdoor unit of ${unit.specText} serves ${load} frig/h of indoor units: choose a bigger one, or add another.`)
  }
  const stuffy = rooms.filter((r) => r.wet && !r.window && !r.extractor)
  if (stuffy.length) say(problems, `No window and no extractor: ${stuffy.map((r) => r.name).join(', ')}. Put an extractor fan in ${stuffy.length > 1 ? 'each' : 'it'}.`)
  const cold = rooms.filter((r) => r.heat <= 0)
  if (rooms.length && cold.length && (heated.length || sources.length)) say(notes, `Not heated: ${cold.map((r) => r.name).join(', ')}.`)
  if (summary.plumbing.dhw.length) say(notes, 'The boiler also makes the house’s hot water: the Plumbing tab feeds it cold water and pipes its hot water.')
  if (summary.plumbing.fill.length) say(notes, `The Plumbing tab fills ${summary.plumbing.fill.length} piece${summary.plumbing.fill.length > 1 ? 's' : ''} from its cold water.`)
  if (summary.plumbing.condensate.length) say(notes, `The split units' condensate drains into the Plumbing tab's traps, or outside.`)
  if (summary.gas.length) say(notes, `The Gas tab pipes gas to ${summary.gas.map((p) => p.info.title.toLowerCase()).join(', ')}.`)
  if (summary.power) say(notes, `${summary.power} HVAC piece${summary.power > 1 ? 's need' : ' needs'} an electrical supply: add suitably rated points and circuits on the Electricity tab.`)
  for (const room of shared) say(notes, `${room.name} share one outline: their loads are counted together. Close the wall between them on the Floor tab.`)
  if (!pieces.length && !radiantRooms.length) say(notes, 'Nothing yet: put a boiler or heat pump and radiators down, mark rooms with a radiant floor, or gas heaters; add split units and extractors from the library.')

  return {
    frame,
    pieces,
    rooms,
    runs,
    materials,
    radiant: { floor: radiantRooms.reduce((sum, r) => sum + r.floor, 0), pipe: radiantPipe, loops: radiantRooms.reduce((sum, r) => sum + r.loops, 0) },
    summary,
    problems,
    notes,
  }
}
