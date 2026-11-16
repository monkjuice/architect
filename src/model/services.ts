import { clamp, closestOnSegment, dist, dot, mul, sub, type Box, type Vec } from './geometry'
import { corners, ellipse, facing, local, placement, toLocal, type Placement, type SymbolPart } from './furniture'
import { isEditable, segmentKind, type Layer, type Plan, type Service, type ServiceKind } from './plan'

/**
 * The catalogue of equipment put down on the Plumbing and HVAC tabs. The Plumbing tab's: where the water comes from
 * (a mains connection, a well), where it is kept (a cistern, tanks), what pushes it (a well pump, a pressure pump),
 * what heats it (a water heater), and where the waste goes (floor drains, a grease trap, chambers, a septic tank or
 * biodigestor with its soakaway, or the sewer). The HVAC tab's: what heats the rooms (a boiler, a heat pump,
 * radiators, underfloor manifolds), cools them (split units) and ventilates them (extractors, range hoods).
 *
 * Each belongs to one tab (`tabOf`), where it is listed, picked and edited. What one tab's pieces need from another
 * is in their `links`: a boiler makes the hot water and is filled from the cold, a heat pump is filled, a split's
 * condensate drains into the plumbing, and most need power (the Electricity tab). The other tab shows them faded, with
 * the pipes that join them to it, so the relationship shows when moving between the tabs.
 *
 * Each piece stands where it is put, turned, with a footprint, like furniture. What it is rated at follows its
 * size: a tank twice the footprint holds about twice as much, snapped to the sizes it is sold in, and typing a
 * rating resizes it (`specOf`, `sizeForSpec`). Nothing here says what it is connected to: plumbing.ts works the
 * pipes out from what stands on the plan (see plumbing.ts).
 */

/** The groups, each listed in one tab's library: the Plumbing tab's first three, the HVAC tab's last three. */
export const SERVICE_GROUPS = ['supply', 'hot', 'waste', 'heating', 'cooling', 'ventilation'] as const
export type ServiceGroup = (typeof SERVICE_GROUPS)[number]
export type ServiceTab = 'plumbing' | 'hvac'
export const TAB_GROUPS: Record<ServiceTab, readonly ServiceGroup[]> = { plumbing: ['supply', 'hot', 'waste'], hvac: ['heating', 'cooling', 'ventilation'] }
export const TAB_TITLES: Record<ServiceTab, string> = { plumbing: 'Plumbing', hvac: 'HVAC' }

export const GROUP_TITLES: Record<ServiceGroup, string> = {
  supply: 'Water supply',
  hot: 'Hot water',
  waste: 'Drains & waste',
  heating: 'Heating',
  cooling: 'Cooling',
  ventilation: 'Ventilation',
}

/** The tab a piece belongs to: where it is listed, picked and edited. */
export const tabOf = (info: Pick<ServiceInfo, 'group'>): ServiceTab => (TAB_GROUPS.hvac.includes(info.group) ? 'hvac' : 'plumbing')

/**
 * What a piece does, which is what the pipes are worked out from: the water comes from a `source`, is lifted by a
 * `well-pump`, kept in a `store` (a cistern) or a `tank` above, pushed by a `pump`, passed through an `inline`
 * piece (a filter, a manifold), heated by a `heater` (a boiler heats the rooms too), given off by an `emitter` fed
 * by a `heat-source`, blown by an `indoor-unit` paired with a `condenser`, drawn from a `tap`, taken in by a
 * `drain` (a floor drain), caught by a `grease` trap, passed through a `chamber` and ended in a `waste` (the sewer,
 * a septic tank, a biodigestor) and its `soak`away.
 */
export type ServiceRole =
  | 'extract'
  | 'source'
  | 'well-pump'
  | 'store'
  | 'tank'
  | 'pump'
  | 'inline'
  | 'heater'
  | 'heat-source'
  | 'emitter'
  | 'indoor-unit'
  | 'condenser'
  | 'tap'
  | 'drain'
  | 'grease'
  | 'chamber'
  | 'waste'
  | 'soak'

/** What a piece is rated at, and how that follows its size. */
export interface SpecInfo {
  /** What the number means: litres held, heat given or taken, water moved, circuits run. */
  measure: 'capacity' | 'power' | 'flow' | 'circuits'
  unit: string
  /** Its rating at the catalogue size. */
  value: number
  /** Resizing scales it by the footprint (a tank) or by the width alone (a radiator's length). */
  scale: 'area' | 'width'
  /** The sizes it is sold in: a resized piece takes the nearest. */
  steps?: number[]
  /** What it is rounded to when it is not sold in steps. */
  grain?: number
}

export interface ServiceInfo {
  kind: ServiceKind
  group: ServiceGroup
  role: ServiceRole
  title: string
  /** The size a new one gets, and how tall it is, m. */
  width: number
  depth: number
  height: number
  /** Whether it backs up to the nearest wall when it is put down. */
  snap: 'wall' | 'none'
  spec: SpecInfo | null
  /** Whether it stands outside the house (the checks warn when it is inside a building). */
  outdoor?: boolean
  /** Whether it can only be on the ground floor: buried, drilled, or on the ground outside. */
  ground?: boolean
  /**
   * What it needs from the other tabs: `dhw` it heats the house's hot water (the Plumbing tab feeds it cold water and
   * takes the hot from it), `fill` it is filled from the cold water, `condensate` it drains its condensate into the
   * plumbing, `power` it needs an electrical point (the Electricity tab).
   */
  links?: { dhw?: true; fill?: true; condensate?: true; power?: true }
  /** What it is for, in the library and the Selection section. */
  note: string
}

/** Usual sizes: tanks and cisterns in litres, water heaters in litres, septic tanks and biodigestors in litres. */
const TANKS = [500, 750, 850, 1100, 1500, 2000, 2500, 5000]
const CISTERNS = [1000, 2000, 2500, 5000, 10000]
const HEATERS = [50, 80, 110, 150, 180, 250, 300]
const WASTE = [600, 1300, 3000, 7000, 10000]

export const SERVICES: readonly ServiceInfo[] = [
  {
    kind: 'mains-water',
    ground: true,
    group: 'supply',
    role: 'source',
    title: 'Mains water',
    width: 0.4,
    depth: 0.4,
    height: 0.4,
    snap: 'none',
    spec: null,
    outdoor: true,
    note: 'Where the water main reaches the lot, with its meter and stopcock. With it the house needs no well.',
  },
  {
    kind: 'well',
    ground: true,
    group: 'supply',
    role: 'source',
    title: 'Well',
    width: 0.8,
    depth: 0.8,
    height: 0.6,
    snap: 'none',
    spec: null,
    outdoor: true,
    note: 'A bore down to the aquifer. Put a well pump in it, and keep it well away from any septic tank or soakaway.',
  },
  {
    kind: 'well-pump',
    ground: true,
    group: 'supply',
    links: { power: true },
    role: 'well-pump',
    title: 'Well pump',
    width: 0.3,
    depth: 0.3,
    height: 0.9,
    snap: 'none',
    spec: { measure: 'flow', unit: 'l/h', value: 3000, scale: 'area', steps: [1500, 3000, 5000, 8000] },
    note: 'Submersible, in the well: it lifts the water to the cistern or the tanks.',
  },
  {
    kind: 'cistern',
    ground: true,
    group: 'supply',
    role: 'store',
    title: 'Cistern',
    width: 1.8,
    depth: 1.4,
    height: 1.5,
    snap: 'none',
    spec: { measure: 'capacity', unit: 'l', value: 2500, scale: 'area', steps: CISTERNS },
    outdoor: true,
    note: 'A buried tank that takes what the well or the mains give, for the pump to lift.',
  },
  {
    kind: 'tank',
    group: 'supply',
    role: 'tank',
    title: 'Water tank',
    width: 1.1,
    depth: 1.1,
    height: 1.1,
    snap: 'none',
    spec: { measure: 'capacity', unit: 'l', value: 1100, scale: 'area', steps: TANKS },
    note: 'Over the house or on a tower: the day’s reserve, feeding the house by gravity or through a pressure pump.',
  },
  {
    kind: 'pump',
    group: 'supply',
    links: { power: true },
    role: 'pump',
    title: 'Pressure pump',
    width: 0.5,
    depth: 0.3,
    height: 0.35,
    snap: 'wall',
    spec: { measure: 'flow', unit: 'l/h', value: 3600, scale: 'area', steps: [1800, 3600, 5400, 7200] },
    note: 'Gives the house its pressure where a tank alone would not (showers on the same floor as the tank).',
  },
  {
    kind: 'filter',
    group: 'supply',
    role: 'inline',
    title: 'Filter / softener',
    width: 0.35,
    depth: 0.35,
    height: 1.1,
    snap: 'wall',
    spec: { measure: 'flow', unit: 'l/h', value: 1500, scale: 'area', grain: 100 },
    note: 'Treats what comes from the well or the mains before it reaches the house.',
  },
  {
    kind: 'manifold',
    group: 'supply',
    role: 'inline',
    title: 'Manifold',
    width: 0.5,
    depth: 0.12,
    height: 0.25,
    snap: 'wall',
    spec: { measure: 'circuits', unit: 'circuits', value: 6, scale: 'width', grain: 1 },
    note: 'A collector with a valve per circuit: the branches leave from here instead of being teed off a main.',
  },
  {
    kind: 'tap',
    group: 'supply',
    role: 'tap',
    title: 'Tap',
    width: 0.12,
    depth: 0.12,
    height: 0.6,
    snap: 'none',
    spec: null,
    note: 'A garden tap or hose bib. Tick its hot water for a utility mixer.',
  },
  {
    kind: 'heater-gas',
    group: 'hot',
    role: 'heater',
    title: 'Gas water heater',
    width: 0.55,
    depth: 0.55,
    height: 1.5,
    snap: 'wall',
    spec: { measure: 'capacity', unit: 'l', value: 150, scale: 'area', steps: HEATERS },
    note: 'A storage heater on natural gas; it needs a flue (the Gas tab, when it comes).',
  },
  {
    kind: 'heater-electric',
    group: 'hot',
    links: { power: true },
    role: 'heater',
    title: 'Electric water heater',
    width: 0.5,
    depth: 0.5,
    height: 1.4,
    snap: 'wall',
    spec: { measure: 'capacity', unit: 'l', value: 155, scale: 'area', steps: HEATERS },
    note: 'A storage heater on electricity: no flue, but a heavier circuit.',
  },
  {
    kind: 'boiler',
    group: 'heating',
    role: 'heat-source',
    links: { dhw: true, fill: true, power: true },
    title: 'Boiler (combi)',
    width: 0.45,
    depth: 0.3,
    height: 0.8,
    snap: 'wall',
    spec: { measure: 'power', unit: 'kcal/h', value: 24000, scale: 'area', steps: [18000, 24000, 32000, 40000] },
    note: 'Heats the rooms through the radiators and underfloor circuits, and the house’s hot water too: the Plumbing tab feeds it and takes its hot water.',
  },
  {
    kind: 'heat-pump',
    group: 'heating',
    links: { fill: true, power: true },
    role: 'heat-source',
    title: 'Heat pump',
    width: 1.1,
    depth: 0.45,
    height: 0.9,
    snap: 'wall',
    spec: { measure: 'power', unit: 'kW', value: 9, scale: 'area', steps: [5, 9, 12, 16] },
    note: 'Air to water, outside: it feeds the radiators or underfloor circuits without gas; it is filled from the cold water.',
  },
  {
    kind: 'radiator',
    group: 'heating',
    role: 'emitter',
    title: 'Radiator',
    width: 0.8,
    depth: 0.12,
    height: 0.6,
    snap: 'wall',
    spec: { measure: 'power', unit: 'kcal/h', value: 960, scale: 'width', grain: 40 },
    note: 'Wider is warmer: about 120 kcal/h for every 10 cm of it. It is fed by the boiler or the heat pump.',
  },
  {
    kind: 'underfloor-manifold',
    group: 'heating',
    role: 'emitter',
    title: 'Underfloor manifold',
    width: 0.6,
    depth: 0.15,
    height: 0.7,
    snap: 'wall',
    spec: { measure: 'circuits', unit: 'circuits', value: 6, scale: 'width', grain: 1 },
    note: 'Where the radiant floor loops of the rooms near it start (mark the rooms with Radiant floor); it is fed by the boiler or the heat pump.',
  },
  {
    kind: 'split-indoor',
    group: 'cooling',
    links: { condensate: true, power: true },
    role: 'indoor-unit',
    title: 'Split (indoor)',
    width: 0.9,
    depth: 0.22,
    height: 0.3,
    snap: 'wall',
    spec: { measure: 'power', unit: 'frig/h', value: 3000, scale: 'area', steps: [2200, 3000, 4500, 6000, 9000] },
    note: 'A heat-and-cool unit in the room: it pairs with an outdoor unit, and its condensate drains into the plumbing.',
  },
  {
    kind: 'split-outdoor',
    group: 'cooling',
    links: { power: true },
    role: 'condenser',
    title: 'Split (outdoor)',
    width: 0.85,
    depth: 0.35,
    height: 0.6,
    snap: 'wall',
    spec: { measure: 'power', unit: 'frig/h', value: 3000, scale: 'area', steps: [2200, 3000, 4500, 6000, 9000] },
    note: 'The condenser outside, joined to its indoor units by refrigerant lines; one can serve several up to its rating.',
  },
  {
    kind: 'extractor',
    group: 'ventilation',
    role: 'extract',
    links: { power: true },
    title: 'Extractor fan',
    width: 0.25,
    depth: 0.12,
    height: 0.25,
    snap: 'wall',
    spec: { measure: 'flow', unit: 'm³/h', value: 100, scale: 'area', steps: [80, 100, 150, 200, 300] },
    note: 'On the wall or ceiling of a bathroom, a toilet or a laundry with no window, ducted outside.',
  },
  {
    kind: 'range-hood',
    group: 'ventilation',
    role: 'extract',
    links: { power: true },
    title: 'Range hood',
    width: 0.6,
    depth: 0.5,
    height: 0.5,
    snap: 'wall',
    spec: { measure: 'flow', unit: 'm³/h', value: 400, scale: 'area', steps: [300, 400, 600, 800] },
    note: 'Over the cooker, ducted outside.',
  },
  {
    kind: 'floor-drain',
    group: 'waste',
    role: 'drain',
    title: 'Floor drain',
    width: 0.2,
    depth: 0.2,
    height: 0.2,
    snap: 'none',
    spec: null,
    note: 'A grated trap in a patio, a laundry or a garage floor; it drains into the main.',
  },
  {
    kind: 'grease-trap',
    ground: true,
    group: 'waste',
    role: 'grease',
    title: 'Grease trap',
    width: 0.7,
    depth: 0.5,
    height: 0.6,
    snap: 'none',
    spec: { measure: 'capacity', unit: 'l', value: 60, scale: 'area', steps: [30, 60, 120, 200] },
    outdoor: true,
    note: 'Kitchen sinks drain through it, so fat does not reach the main.',
  },
  {
    kind: 'chamber',
    ground: true,
    group: 'waste',
    role: 'chamber',
    title: 'Inspection chamber',
    width: 0.6,
    depth: 0.6,
    height: 0.6,
    snap: 'none',
    spec: null,
    outdoor: true,
    note: 'Where the main can be opened; one is put outside each building by itself, and more can be added.',
  },
  {
    kind: 'septic',
    ground: true,
    group: 'waste',
    role: 'waste',
    title: 'Septic tank',
    width: 1.6,
    depth: 1.2,
    height: 1.7,
    snap: 'none',
    spec: { measure: 'capacity', unit: 'l', value: 3000, scale: 'area', steps: WASTE },
    outdoor: true,
    note: 'Settles the waste where there is no sewer; its water goes on to a soakaway.',
  },
  {
    kind: 'biodigestor',
    ground: true,
    group: 'waste',
    role: 'waste',
    title: 'Biodigestor',
    width: 1.2,
    depth: 1.2,
    height: 1.9,
    snap: 'none',
    spec: { measure: 'capacity', unit: 'l', value: 1300, scale: 'area', steps: WASTE },
    outdoor: true,
    note: 'Treats the waste where there is no sewer (1300 l serves about five people); its water goes on to a soakaway.',
  },
  {
    kind: 'soakaway',
    ground: true,
    group: 'waste',
    role: 'soak',
    title: 'Soakaway',
    width: 1.5,
    depth: 1.5,
    height: 2,
    snap: 'none',
    spec: null,
    outdoor: true,
    note: 'An infiltration well or trench for the treated water; a percolation test sizes it.',
  },
  {
    kind: 'sewer',
    ground: true,
    group: 'waste',
    role: 'waste',
    title: 'Sewer connection',
    width: 0.5,
    depth: 0.5,
    height: 0.8,
    snap: 'none',
    spec: null,
    outdoor: true,
    note: 'Where the main sewer is reached. With it the house needs no septic tank, biodigestor or soakaway.',
  },
]

export const serviceInfo = (kind: ServiceKind): ServiceInfo => SERVICES.find((i) => i.kind === kind)!

export const servicesOf = (group: ServiceGroup): ServiceInfo[] => SERVICES.filter((i) => i.group === group)

/** How many of each kind the visible layers hold. */
export function serviceCounts(plan: Plan): Map<ServiceKind, number> {
  const out = new Map<ServiceKind, number>()
  for (const layer of plan.layers) if (layer.visible) for (const s of Object.values(layer.services)) out.set(s.kind, (out.get(s.kind) ?? 0) + 1)
  return out
}

/** Every piece on the visible layers, with where it stands. */
export function placedServices(plan: Plan): { layer: Layer; id: string; service: Service; info: ServiceInfo; at: Placement }[] {
  const out = []
  for (const layer of plan.layers) {
    if (!layer.visible) continue
    for (const [id, service] of Object.entries(layer.services)) {
      out.push({ layer, id, service, info: serviceInfo(service.kind), at: placement(service.at, service.angle, service.width, service.depth) })
    }
  }
  return out
}

// ---- what a piece is rated at ---------------------------------------------------------------------------------

const nearest = (value: number, steps: readonly number[]): number => steps.reduce((best, s) => (Math.abs(s - value) < Math.abs(best - value) ? s : best), steps[0])

/** What a piece of this size is rated at: the catalogue's rating scaled by its size, as it is sold. */
export function specOf(info: ServiceInfo, width: number, depth: number): number | null {
  const spec = info.spec
  if (!spec) return null
  const ratio = spec.scale === 'width' ? width / info.width : (width * depth) / (info.width * info.depth)
  const raw = spec.value * Math.max(0.05, ratio)
  if (spec.steps) return nearest(raw, spec.steps)
  const grain = spec.grain ?? 10
  return Math.max(grain, Math.round(raw / grain) * grain)
}

/** The size a piece takes to be rated at `value`: the catalogue's size scaled, its proportions kept. */
export function sizeForSpec(info: ServiceInfo, value: number): { width: number; depth: number } {
  const spec = info.spec
  if (!spec || !(value > 0)) return { width: info.width, depth: info.depth }
  const ratio = value / spec.value
  if (spec.scale === 'width') return { width: round(info.width * ratio), depth: info.depth }
  const k = Math.sqrt(ratio)
  return { width: round(info.width * k), depth: round(info.depth * k) }
}

const round = (v: number) => Math.max(0.05, Math.round(v * 1000) / 1000)

/** A rating in words: "1100 l", "24 000 kcal/h", "6 circuits". */
export function specLabel(info: ServiceInfo, value: number | null): string {
  if (value === null || !info.spec) return ''
  const shown = value >= 10000 ? `${Math.round(value / 1000)} 000` : `${value}`
  return info.spec.measure === 'circuits' ? `${value} ${value === 1 ? 'circuit' : 'circuits'}` : `${shown} ${info.spec.unit}`
}

/** What a piece of this size is rated at, in words, or '' when it has no rating. */
export const specText = (info: ServiceInfo, width: number, depth: number): string => specLabel(info, specOf(info, width, depth))

// ---- where a piece stands -------------------------------------------------------------------------------------

export const placeService = (s: Service): Placement => placement(s.at, s.angle, s.width, s.depth)

/** Whether a plan point is on a piece. */
export const onService = (pl: Placement, p: Vec): boolean => {
  const q = toLocal(pl, p)
  return Math.abs(q.x) <= pl.width / 2 && Math.abs(q.y) <= pl.depth / 2
}

/** The piece of a tab under `p` on an editable layer, the smallest first; top layer first. `reach` keeps small marks pickable. */
export function serviceAt(plan: Plan, p: Vec, tab: ServiceTab, reach = 0): { layer: string; id: string } | null {
  for (const layer of [...plan.layers].reverse()) {
    if (!isEditable(layer)) continue
    let best: { id: string; area: number } | null = null
    for (const [id, s] of Object.entries(layer.services)) {
      // the other tab's pieces show faded: they are picked and edited on their own tab
      if (tabOf(serviceInfo(s.kind)) !== tab) continue
      const pl = placeService(s)
      const grown = placement(s.at, s.angle, s.width + 2 * reach, s.depth + 2 * reach)
      if (!onService(grown, p)) continue
      if (!best || pl.width * pl.depth < best.area) best = { id, area: pl.width * pl.depth }
    }
    if (best) return { layer: layer.id, id: best.id }
  }
  return null
}

/** The pieces of a tab whose centres are inside `box`, on editable layers. */
export function servicesInBox(plan: Plan, box: Box, tab: ServiceTab): { layer: string; id: string }[] {
  const out: { layer: string; id: string }[] = []
  for (const layer of plan.layers) {
    if (!isEditable(layer)) continue
    for (const [id, s] of Object.entries(layer.services)) {
      if (tabOf(serviceInfo(s.kind)) !== tab) continue
      if (s.at.x >= box.x0 && s.at.x <= box.x1 && s.at.y >= box.y0 && s.at.y <= box.y1) out.push({ layer: layer.id, id })
    }
  }
  return out
}

export interface ServiceTarget {
  layer: string
  at: Vec
  angle: number
  problem?: string
}

/** Where a piece put down at `p` goes: pieces that stand against a wall back up to the nearest wall face. */
export function serviceTarget(
  plan: Plan,
  p: Vec,
  opts: { kind: ServiceKind; width: number; depth: number; angle: number; layer: string; reach: number; snap: boolean; thickness: (layer: Layer, segment: string) => number },
): ServiceTarget | null {
  const layer = plan.layers.find((l) => l.id === opts.layer)
  if (!isEditable(layer)) return null
  const free: ServiceTarget = { layer: layer.id, at: p, angle: opts.angle }
  if (!opts.snap || serviceInfo(opts.kind).snap !== 'wall') return free
  let best: { d: number; at: Vec; angle: number } | null = null
  for (const [id, s] of Object.entries(layer.segments)) {
    if (segmentKind(s) !== 'wall') continue
    const [a, b] = [layer.vertices[s.a], layer.vertices[s.b]]
    const length = dist(a, b)
    if (length < 1e-9) continue
    const c = closestOnSegment(p, a, b)
    const half = opts.thickness(layer, id) / 2
    const fromFace = c.dist - half
    if (fromFace > opts.depth + opts.reach || fromFace < -half || (best && fromFace >= best.d)) continue
    const t = mul(sub(b, a), 1 / length)
    let n = { x: -t.y, y: t.x }
    if (dot(sub(p, c.point), n) < 0) n = mul(n, -1)
    const along = clamp(c.t * length, Math.min(opts.width / 2, length / 2), Math.max(length - opts.width / 2, length / 2))
    best = { d: fromFace, at: { x: a.x + t.x * along + n.x * (half + opts.depth / 2), y: a.y + t.y * along + n.y * (half + opts.depth / 2) }, angle: facing(n) }
  }
  return best ? { layer: layer.id, at: best.at, angle: best.angle } : free
}

// ---- plan symbols ----------------------------------------------------------------------------------------------

/** Pieces drawn as a circle (a tank, a well, a biodigestor); the rest are drawn as their footprint. */
const DISCS: ServiceKind[] = ['well', 'well-pump', 'cistern', 'tank', 'biodigestor', 'septic', 'soakaway', 'filter', 'tap', 'pump', 'grease-trap']

/** Whether a piece is drawn as a circle (an ellipse when it is not square): its plan symbol and its 3-D body. */
export const isDisc = (kind: ServiceKind): boolean => DISCS.includes(kind)

/** Whether a piece is round in plan: drawn as a circle and square in its catalogue size, so it has one diameter. */
export const isRound = (kind: ServiceKind): boolean => {
  const info = serviceInfo(kind)
  return DISCS.includes(kind) && Math.abs(info.width - info.depth) < 1e-9
}

/** The lines of a piece's plan symbol, in world coordinates (see furnitureSymbol). */
export function serviceSymbol(kind: ServiceKind, pl: Placement): SymbolPart[] {
  const [hw, hd] = [pl.width / 2, pl.depth / 2]
  const box = (role: 'outline' | 'detail' | 'soft' | 'heavy' = 'outline', by = 0): SymbolPart => ({ pts: corners(placement(pl.at, pl.angle, pl.width - 2 * by, pl.depth - 2 * by)), closed: true, role })
  const disc = (k: number, role: 'outline' | 'detail' | 'soft' | 'heavy' = 'outline'): SymbolPart => ({ pts: ellipse(pl, -hw * k, -hd * k, hw * k, hd * k), closed: true, role })
  const line = (x0: number, y0: number, x1: number, y1: number, role: 'detail' | 'soft' | 'heavy' = 'detail'): SymbolPart => ({ pts: [local(pl, x0, y0), local(pl, x1, y1)], closed: false, role })
  const cross: SymbolPart[] = [line(-hw, -hd, hw, hd), line(hw, -hd, -hw, hd)]
  switch (kind) {
    case 'tank':
    case 'cistern':
      // a round tank with its lid
      return [disc(1), disc(0.35, 'detail')]
    case 'well':
      return [disc(1), ...cross]
    case 'well-pump':
    case 'pump':
      // a pump: a circle with the direction it pushes
      return [disc(1), { pts: [local(pl, -hw * 0.5, -hd * 0.5), local(pl, hw * 0.6, 0), local(pl, -hw * 0.5, hd * 0.5)], closed: true, role: 'heavy' }]
    case 'filter':
      return [disc(1), line(-hw, 0, hw, 0), line(0, -hd, 0, hd)]
    case 'tap':
      return [disc(1, 'heavy'), line(0, -hd, 0, -hd * 2.2, 'heavy')]
    case 'biodigestor':
    case 'septic':
      return [disc(1), disc(0.55, 'detail')]
    case 'soakaway':
      return [disc(1), disc(0.6, 'soft'), disc(0.25, 'soft')]
    case 'grease-trap':
      return [disc(1), disc(0.5, 'soft')]
    case 'chamber':
      return [box(), ...cross]
    case 'floor-drain':
      // a grille
      return [box(), line(-hw * 0.4, -hd, -hw * 0.4, hd), line(0, -hd, 0, hd), line(hw * 0.4, -hd, hw * 0.4, hd)]
    case 'radiator': {
      // fins across it
      const fins = Math.max(3, Math.round(pl.width / 0.1))
      return [box(), ...Array.from({ length: fins - 1 }, (_, i) => line(-hw + ((i + 1) * pl.width) / fins, -hd, -hw + ((i + 1) * pl.width) / fins, hd, 'soft'))]
    }
    case 'manifold':
    case 'underfloor-manifold': {
      const n = Math.max(2, Math.round(pl.width / 0.1))
      return [box(), ...Array.from({ length: n }, (_, i) => line(-hw + ((i + 0.5) * pl.width) / n, hd, -hw + ((i + 0.5) * pl.width) / n, hd * 1.8, 'detail'))]
    }
    case 'split-indoor':
      return [box(), line(-hw, hd * 0.3, hw, hd * 0.3, 'soft'), line(-hw, hd * 0.75, hw, hd * 0.75, 'soft')]
    case 'split-outdoor':
    case 'heat-pump':
      return [box(), disc(0.55, 'detail'), line(-hw, 0, hw, 0, 'soft')]
    case 'heater-gas':
    case 'heater-electric':
      return [disc(1), { pts: ellipse(pl, -hw * 0.45, -hd * 0.45, hw * 0.45, hd * 0.45), closed: true, role: 'detail' }, line(-hw * 0.3, 0, hw * 0.3, 0, 'heavy')]
    case 'boiler':
      return [box(), box('detail', Math.min(hw, hd) * 0.35), line(-hw * 0.4, hd, hw * 0.4, hd, 'heavy')]
    case 'mains-water':
      return [box(), line(0, -hd, 0, hd, 'heavy'), line(-hw * 0.5, 0, hw * 0.5, 0, 'heavy')]
    case 'extractor':
      // a fan: a box with its blades
      return [box(), disc(0.7, 'detail'), line(-hw * 0.5, -hd * 0.5, hw * 0.5, hd * 0.5), line(hw * 0.5, -hd * 0.5, -hw * 0.5, hd * 0.5)]
    case 'range-hood':
      return [box(), box('detail', Math.min(hw, hd) * 0.3), line(-hw, hd * 0.6, hw, hd * 0.6, 'soft')]
    case 'sewer':
      return [box(), ...cross, box('soft', Math.min(hw, hd) * 0.5)]
    default:
      return [box()]
  }
}
