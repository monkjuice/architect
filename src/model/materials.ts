/**
 * The materials a house can be finished in, and what each one can go on: wood on walls, doors, window frames,
 * ceilings and floors, marble on floors and walls, grass only on the ground outside. A list for a surface shows
 * only the materials that suit it, grouped. Walls and floors take them so far (see finishes.ts); colours and
 * roughness are for the 3-D views and the elevations, and are approximate.
 */

/** What a material covers. */
export type Surface = 'wall' | 'floor' | 'ceiling' | 'roof' | 'door' | 'frame'

/** A pattern drawn on it in 3-D, repeated at its real size. */
export type Pattern = 'brick' | 'planks' | 'tiles' | 'stone' | 'grass' | 'gravel'

export interface Material {
  id: string
  title: string
  group: string
  surfaces: readonly Surface[]
  /** Whether it can be used outdoors (a facade, the ground) and indoors (a room). */
  outdoor: boolean
  indoor: boolean
  color: string
  roughness: number
  metalness: number
  pattern?: Pattern
  /** See-through (glass, water): 0 opaque. */
  clear?: number
  /** Laid as a checkerboard of squares `tile` m a side in two colours; `color` is their mix, for where they do not show. */
  checker?: { colors: readonly [string, string]; tile: number }
}

const m = (
  id: string,
  title: string,
  group: string,
  surfaces: Surface[],
  where: 'both' | 'outdoor' | 'indoor',
  color: string,
  roughness: number,
  extra: Partial<Pick<Material, 'metalness' | 'pattern' | 'clear' | 'checker'>> = {},
): Material => ({ id, title, group, surfaces, outdoor: where !== 'indoor', indoor: where !== 'outdoor', color, roughness, metalness: 0, ...extra })

/** The catalogue, in the order pickers list it, a group at a time. */
export const MATERIALS: readonly Material[] = [
  m('plaster-white', 'White plaster', 'Plaster and paint', ['wall', 'ceiling'], 'both', '#ebe8e1', 0.92),
  m('plaster-grey', 'Grey cement plaster', 'Plaster and paint', ['wall', 'ceiling'], 'both', '#a9a7a1', 0.94),
  m('plaster-sand', 'Sand textured plaster', 'Plaster and paint', ['wall'], 'both', '#d6c6a6', 0.96),
  m('brick-red', 'Exposed red brick', 'Brick and stone', ['wall', 'floor'], 'both', '#9a4b33', 0.9, { pattern: 'brick' }),
  m('brick-white', 'Painted brick', 'Brick and stone', ['wall'], 'both', '#e4e0d8', 0.9, { pattern: 'brick' }),
  m('stone-cladding', 'Stone cladding', 'Brick and stone', ['wall', 'floor'], 'outdoor', '#8c8477', 0.95, { pattern: 'stone' }),
  m('marble-white', 'White marble', 'Brick and stone', ['floor', 'wall'], 'both', '#e9e7e3', 0.25, { pattern: 'tiles' }),
  m('granite-grey', 'Grey granite', 'Brick and stone', ['floor', 'wall'], 'both', '#7d7b78', 0.4, { pattern: 'tiles' }),
  m('concrete-exposed', 'Exposed concrete', 'Concrete', ['wall', 'floor', 'ceiling', 'roof'], 'both', '#9b9993', 0.88),
  m('concrete-polished', 'Polished concrete', 'Concrete', ['floor'], 'both', '#8f8e8a', 0.35),
  m('paving-concrete', 'Concrete pavers', 'Concrete', ['floor'], 'outdoor', '#b3aea5', 0.9, { pattern: 'tiles' }),
  m('wood-oak', 'Oak', 'Wood', ['wall', 'floor', 'ceiling', 'door', 'frame'], 'both', '#b48a58', 0.62, { pattern: 'planks' }),
  m('wood-walnut', 'Walnut', 'Wood', ['wall', 'floor', 'ceiling', 'door', 'frame'], 'both', '#5e3e28', 0.58, { pattern: 'planks' }),
  m('wood-deck', 'Hardwood deck', 'Wood', ['floor', 'wall'], 'outdoor', '#7a4a2c', 0.7, { pattern: 'planks' }),
  m('tile-light', 'Light porcelain tile', 'Ceramic', ['floor', 'wall'], 'both', '#d9d5cd', 0.35, { pattern: 'tiles' }),
  m('tile-dark', 'Dark porcelain tile', 'Ceramic', ['floor', 'wall'], 'both', '#4a4845', 0.35, { pattern: 'tiles' }),
  m('tile-terracotta', 'Terracotta tile', 'Ceramic', ['floor'], 'both', '#b5643f', 0.85, { pattern: 'tiles' }),
  m('tile-checkered', 'Checkered tile', 'Ceramic', ['floor'], 'both', '#848280', 0.3, { checker: { colors: ['#161616', '#f2f0eb'], tile: 0.3 } }),
  m('aluminium-black', 'Black aluminium', 'Metal', ['frame', 'door'], 'both', '#1d1e20', 0.4, { metalness: 0.6 }),
  m('aluminium-white', 'White aluminium', 'Metal', ['frame', 'door'], 'both', '#e8e8e6', 0.4, { metalness: 0.3 }),
  m('aluminium-natural', 'Anodised aluminium', 'Metal', ['frame', 'door'], 'both', '#b9bbbe', 0.3, { metalness: 0.9 }),
  m('steel-black', 'Black steel', 'Metal', ['door', 'frame'], 'both', '#232425', 0.5, { metalness: 0.7 }),
  m('metal-sheet', 'Corrugated metal sheet', 'Metal', ['roof', 'wall'], 'outdoor', '#8e9396', 0.45, { metalness: 0.6 }),
  m('glass', 'Glass', 'Glass', ['door'], 'both', '#9fb8c4', 0.05, { clear: 0.7 }),
  m('roof-membrane', 'White roof membrane', 'Roofing', ['roof'], 'outdoor', '#dcdcd8', 0.85),
  m('roof-green', 'Green roof', 'Roofing', ['roof'], 'outdoor', '#5d7d3c', 1, { pattern: 'grass' }),
  m('gravel', 'Gravel', 'Ground and garden', ['floor', 'roof'], 'outdoor', '#a59f94', 1, { pattern: 'gravel' }),
  m('grass', 'Lawn', 'Ground and garden', ['floor'], 'outdoor', '#5f8a3a', 1, { pattern: 'grass' }),
  m('water', 'Pool water', 'Ground and garden', ['floor'], 'outdoor', '#2f8fb0', 0.05, { clear: 0.25 }),
]

const BY_ID = new Map(MATERIALS.map((x) => [x.id, x]))

export const findMaterial = (id: string | undefined): Material | undefined => (id ? BY_ID.get(id) : undefined)

/** Whether a material can go on a surface, outdoors or indoors. */
export const suits = (material: Material, surface: Surface, outdoor: boolean): boolean =>
  material.surfaces.includes(surface) && (outdoor ? material.outdoor : material.indoor)

/** The materials that suit a surface (outdoors or indoors, or either when `outdoor` is left out), by group in catalogue order. */
export function materialGroups(surface: Surface, outdoor?: boolean): { group: string; materials: Material[] }[] {
  const groups: { group: string; materials: Material[] }[] = []
  for (const material of MATERIALS) {
    if (outdoor === undefined ? !material.surfaces.includes(surface) : !suits(material, surface, outdoor)) continue
    const last = groups.at(-1)
    if (last?.group === material.group) last.materials.push(material)
    else groups.push({ group: material.group, materials: [material] })
  }
  return groups
}
