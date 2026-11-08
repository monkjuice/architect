import { furnitureInfo } from './furniture'
import { findMaterial } from './materials'
import { bought, rowCost, unitPrice } from './prices'
import type { FurnitureKind } from './plan'
import {
  BAG,
  BRICKS,
  FLAT_ROOF,
  FOOTING,
  GROW_BAR,
  HYDROFUGE,
  JOIST_SLAB,
  PER_DOWNPIPE,
  POOL_DIG,
  POOL_SHELL,
  REBAR,
  RING_BEAM,
  TIE_COLUMN,
  type Chapter,
  type Mix,
  type RowParams,
  type TakeoffRow,
  type Unit,
  type WallBuild,
} from './takeoff'

/**
 * The materials list in words, in English or Spanish (Argentine building terms): chapter titles, units, and for each
 * row's key what it is and how it was worked out, with numbers written the language's way (1 234.5 or 1.234,5).
 */

export const LANGUAGES = ['en', 'es'] as const
export type Lang = (typeof LANGUAGES)[number]
export const LANGUAGE_NAMES: Record<Lang, string> = { en: 'English', es: 'Español' }

/** A number with `digits` after the point: grouped by thin spaces with a point in English, by points with a comma in Spanish. */
export function formatNumber(x: number, digits: number, lang: Lang): string {
  const [int, dec] = Math.abs(x).toFixed(digits).split('.')
  const group = lang === 'es' ? '.' : ' '
  const text = int.replace(/\B(?=(\d{3})+(?!\d))/g, group) + (dec ? (lang === 'es' ? ',' : '.') + dec : '')
  return x < 0 ? `−${text}` : text
}

export const CHAPTER_TITLES: Record<Chapter, Record<Lang, string>> = {
  foundations: { en: 'Earthworks and foundations', es: 'Movimiento de suelos y fundaciones' },
  structure: { en: 'Concrete structure', es: 'Estructura de hormigón' },
  masonry: { en: 'Masonry', es: 'Mampostería' },
  insulation: { en: 'Damp-proofing and insulation', es: 'Aislaciones' },
  plaster: { en: 'Plaster and paint', es: 'Revoques y pintura' },
  subfloors: { en: 'Sub-floors and screeds', es: 'Contrapisos y carpetas' },
  floors: { en: 'Floors and skirting', es: 'Pisos y zócalos' },
  cladding: { en: 'Wall finishes', es: 'Revestimientos' },
  ceilings: { en: 'Ceilings', es: 'Cielorrasos' },
  roofing: { en: 'Roofing', es: 'Cubiertas' },
  openings: { en: 'Doors and windows', es: 'Carpinterías' },
  glazing: { en: 'Glazing', es: 'Vidrios' },
  metalwork: { en: 'Metalwork and timber', es: 'Herrería y maderas' },
  pools: { en: 'Pools', es: 'Piletas' },
  fixtures: { en: 'Fixtures', es: 'Artefactos y equipamiento' },
  garden: { en: 'Garden', es: 'Parquización' },
  basic: { en: 'Basic materials', es: 'Materiales básicos' },
}

export const unitText = (unit: Unit, lang: Lang): string => (unit === 'bags' && lang === 'es' ? 'bolsas' : unit)

/** The catalogue's materials in Spanish (see materials.ts for the English titles). */
const MATERIAL_ES: Record<string, string> = {
  'plaster-white': 'Revoque fino blanco',
  'plaster-grey': 'Revoque de cemento gris',
  'plaster-sand': 'Revoque texturado color arena',
  'brick-red': 'Ladrillo visto rojo',
  'brick-white': 'Ladrillo pintado',
  'stone-cladding': 'Revestimiento de piedra',
  'marble-white': 'Mármol blanco',
  'granite-grey': 'Granito gris',
  'stone-slab': 'Lajas de piedra grandes',
  'concrete-exposed': 'Hormigón visto',
  'concrete-polished': 'Cemento alisado',
  'paving-concrete': 'Adoquines de hormigón',
  'wood-oak': 'Roble',
  'wood-walnut': 'Nogal',
  teak: 'Teca',
  'oak-solid': 'Roble macizo recuperado',
  'wood-deck': 'Deck de madera dura',
  'tile-light': 'Porcelanato claro',
  'tile-dark': 'Porcelanato oscuro',
  'tile-terracotta': 'Baldosa de terracota',
  'tile-checkered': 'Calcáreo damero blanco y negro',
  'aluminium-black': 'Aluminio negro',
  'aluminium-white': 'Aluminio blanco',
  'aluminium-natural': 'Aluminio anodizado',
  'steel-black': 'Acero negro',
  'steel-galvanized': 'Acero galvanizado',
  'metal-standing-seam': 'Chapa de junta alzada',
  'metal-sheet': 'Chapa acanalada',
  glass: 'Vidrio',
  polycarbonate: 'Policarbonato translúcido',
  'roof-membrane': 'Membrana blanca',
  'roof-green': 'Techo verde',
  gravel: 'Canto rodado',
  mulch: 'Cantero con corteza (mulch)',
  dirt: 'Camino de tierra',
  grass: 'Césped',
  water: 'Agua de pileta',
  'pool-stone': 'Piedra verde para pileta',
}

export const materialTitle = (id: string | undefined, lang: Lang): string => (lang === 'es' && id && MATERIAL_ES[id]) || findMaterial(id)?.title || id || ''

/** Door, window and gate styles, and fixtures and plants, in Spanish. */
const STYLE_ES: Record<string, string> = {
  'door:single': 'simple',
  'door:double': 'doble',
  'door:sliding': 'corrediza',
  'window:fixed': 'paño fijo',
  'window:sliding': 'corrediza',
  'window:double-hung': 'guillotina',
  'window:awning': 'banderola',
  'window:casement': 'de abrir',
  'gate:single': 'de una hoja',
  'gate:double': 'de dos hojas',
  'gate:sliding': 'corredizo',
}

const FURNITURE_ES: Record<string, string> = {
  counter: 'Mesada',
  'counter:island': 'Isla de cocina',
  'sink:outdoor': 'Pileta de lavar exterior',
  'sink:kitchen': 'Pileta de cocina',
  'sink:bathroom': 'Bacha de baño',
  'bathtub:alcove': 'Bañera empotrada',
  'bathtub:clawfoot': 'Bañera exenta con patas',
  'bathtub:drop-in': 'Bañera encastrada',
  'bathtub:corner': 'Bañera de esquina',
  shower: 'Ducha (receptáculo y mampara)',
  toilet: 'Inodoro con mochila',
  bidet: 'Bidet',
  'plant:olive': 'Olivo en maceta',
  'plant:shrub': 'Arbusto en maceta',
  'plant:bush': 'Arbusto',
  'plant:agapanthus': 'Agapanto',
  'plant:lavender': 'Lavanda',
  'plant:climber': 'Enredadera',
  'tree:shade': 'Árbol de sombra',
  'tree:slender': 'Árbol alto',
}

function furnitureTitle(kind: string, style: string | undefined, lang: Lang): string {
  const key = style ? `${kind}:${style}` : kind
  if (lang === 'es' && FURNITURE_ES[key]) return FURNITURE_ES[key]
  const title = furnitureInfo(kind as FurnitureKind, style).title
  return kind === 'bathtub' ? `Bathtub, ${title.toLowerCase()}` : title
}

const BUILD: Record<WallBuild, Record<Lang, string>> = {
  double: { en: 'Insulated double wall: 12 cm solid brick, cavity, 5 cm EPS, 8 cm hollow brick', es: 'Muro doble aislado: ladrillo común 12 cm, cámara, EPS 5 cm, ladrillo hueco 8 cm' },
  exterior18: { en: 'Exterior wall of 18 cm hollow brick', es: 'Muro exterior de ladrillo hueco 18 cm' },
  exterior12: { en: 'Exterior wall of 12 cm hollow brick', es: 'Muro exterior de ladrillo hueco 12 cm' },
  partition18: { en: 'Partition of 18 cm hollow brick', es: 'Tabique de ladrillo hueco 18 cm' },
  partition12: { en: 'Partition of 12 cm hollow brick', es: 'Tabique de ladrillo hueco 12 cm' },
  partition8: { en: 'Partition of 8 cm hollow brick', es: 'Tabique de ladrillo hueco 8 cm' },
  solid24: { en: 'Solid brick wall, 24 cm', es: 'Muro de ladrillo común 24 cm' },
  solid12: { en: 'Solid brick wall, 12 cm', es: 'Muro de ladrillo común 12 cm' },
}

const MIX_TITLES: Record<Mix, Record<Lang, string>> = {
  concrete: { en: 'Concrete H-21', es: 'Hormigón H-21' },
  lean: { en: 'Lean concrete with brick rubble (1/4:1:4:8)', es: 'Hormigón pobre con cascote (1/4:1:4:8)' },
  masonry: { en: 'Masonry mortar and base coat (1/4:1:4)', es: 'Mezcla para mampostería y revoque grueso (1/4:1:4)' },
  finish: { en: 'Finish coat (1/8:1:3)', es: 'Revoque fino (1/8:1:3)' },
  screed: { en: 'Cement mortar (1:3), screeds and damp-proofing', es: 'Mortero de cemento (1:3), carpetas y capa aisladora' },
}

/** Words of a row: from its parameters and a number formatter for its language. */
type Words = string | ((p: RowParams, n: (x: number, digits?: number) => string, lang: Lang) => string)

/** For each key: what it is and how it was worked out, in English and in Spanish. */
const TEXT: Record<string, Record<Lang, [item: Words, basis: Words]>> = {
  'excavation.footing': {
    en: ['Excavation for strip footings', (_, n) => `The wall's thickness + ${n(FOOTING.extra)} m wide (at least ${n(FOOTING.min)} m), ${n(FOOTING.deep)} m deep under walls of 25 cm or more and ${n(FOOTING.shallow)} m under the rest (assumed)`],
    es: ['Excavación para cimientos', (_, n) => `Ancho: espesor del muro + ${n(FOOTING.extra)} m (mínimo ${n(FOOTING.min)} m); profundidad ${n(FOOTING.deep)} m bajo muros de 25 cm o más y ${n(FOOTING.shallow)} m bajo el resto (supuesto)`],
  },
  footing: {
    en: ['Strip footing, lean concrete with brick rubble', 'The same trench, filled (assumed until the Foundation tab)'],
    es: ['Cimiento corrido de hormigón pobre con cascote', 'La misma zanja, llena (supuesto hasta la pestaña Fundaciones)'],
  },
  'beam.foundation': {
    en: ['Foundation ring beam', (_, n) => `The wall's thickness × ${n(RING_BEAM * 100, 0)} cm, on the footing of each load-bearing wall; H-21 with ${REBAR} kg/m³ of rebar`],
    es: ['Viga de fundación (encadenado inferior)', (_, n) => `Espesor del muro × ${n(RING_BEAM * 100, 0)} cm sobre el cimiento de cada muro portante; H-21 con ${REBAR} kg/m³ de acero`],
  },
  fill: {
    en: ['Compacted fill under the raised floor', 'Under its rooms and galleries, out to the walls'],
    es: ['Relleno de tosca compactada bajo el piso elevado', 'Bajo locales y galerías, hasta los muros'],
  },
  'beam.ring': {
    en: ['Ring beam on top of walls (encadenado)', (_, n) => `The wall's thickness × ${n(RING_BEAM * 100, 0)} cm, on each load-bearing wall; H-21 with ${REBAR} kg/m³ of rebar`],
    es: ['Viga de encadenado superior', (_, n) => `Espesor del muro × ${n(RING_BEAM * 100, 0)} cm sobre cada muro portante; H-21 con ${REBAR} kg/m³ de acero`],
  },
  'column.tie.count': {
    en: ['Tie column (columna de encadenado)', `At the ends of load-bearing walls and at most ${TIE_COLUMN.spacing} m apart`],
    es: ['Columna de encadenado', `En los extremos de los muros portantes y cada ${TIE_COLUMN.spacing} m como máximo`],
  },
  'column.tie': {
    en: ['Tie columns', (_, n) => `${n(TIE_COLUMN.side * 100, 0)} × ${n(TIE_COLUMN.side * 100, 0)} cm, as tall as their walls; H-21 with ${REBAR} kg/m³ of rebar`],
    es: ['Columnas de encadenado (hormigón)', (_, n) => `${n(TIE_COLUMN.side * 100, 0)} × ${n(TIE_COLUMN.side * 100, 0)} cm, de la altura del muro; H-21 con ${REBAR} kg/m³ de acero`],
  },
  'slab.roof': {
    en: ['Roof slab (flat roof)', 'Joist and block slab: prestressed joists 0.50 m apart, ceramic blocks, 5 cm topping on a mesh'],
    es: ['Losa de cubierta (techo plano)', 'Losa de viguetas pretensadas cada 0,50 m, ladrillos cerámicos y capa de compresión de 5 cm con malla'],
  },
  'slab.floor': {
    en: ['Floor slab (upper floor)', 'Joist and block slab: prestressed joists 0.50 m apart, ceramic blocks, 5 cm topping on a mesh'],
    es: ['Losa de entrepiso', 'Losa de viguetas pretensadas cada 0,50 m, ladrillos cerámicos y capa de compresión de 5 cm con malla'],
  },
  'slab.joists': { en: ['Prestressed concrete joists', `${JOIST_SLAB.joists} m per m² of slab`], es: ['Viguetas pretensadas', `${JOIST_SLAB.joists} m por m² de losa`] },
  'slab.blocks': { en: ['Ceramic slab blocks 12 × 42 × 25 cm', `${JOIST_SLAB.blocks} per m² of slab`], es: ['Ladrillo cerámico para losa 12 × 42 × 25 cm', `${JOIST_SLAB.blocks} por m² de losa`] },
  'slab.mesh': { en: ['Welded mesh 15 × 15 cm, Ø 4.2 mm', 'Slab area, laps included'], es: ['Malla electrosoldada 15 × 15 cm, Ø 4,2 mm', 'Superficie de losa, con solapes'] },
  'slab.topping': {
    en: ['Slab topping and ribs (H-21)', (_, n) => `${n(JOIST_SLAB.concrete, 3)} m³ per m² of slab`],
    es: ['Capa de compresión y nervios (H-21)', (_, n) => `${n(JOIST_SLAB.concrete, 3)} m³ por m² de losa`],
  },
  'beam.open': {
    en: ['Beams along open edges', `15 × 30 cm under the roof; H-21 with ${REBAR} kg/m³ of rebar`],
    es: ['Vigas sobre bordes abiertos', `15 × 30 cm bajo el techo; H-21 con ${REBAR} kg/m³ de acero`],
  },
  'column.open': {
    en: ['Columns under open-edge beams', `Where no wall holds a beam end; H-21 with ${REBAR} kg/m³ of rebar`],
    es: ['Columnas bajo vigas de bordes abiertos', `Donde ningún muro sostiene el extremo de la viga; H-21 con ${REBAR} kg/m³ de acero`],
  },
  'glazed.base': {
    en: ['Concrete base of glazed sides', '15 cm wide, 40 cm tall, doors left out'],
    es: ['Zócalo de hormigón de los cerramientos vidriados', '15 cm de ancho, 40 cm de alto, sin las puertas'],
  },
  wall: {
    en: [(p) => `${BUILD[p.build!].en} (drawn ${Math.round(p.thickness! * 100)} cm)`, 'Both sides, net of openings, up to the roof over it, averaged'],
    es: [(p) => `${BUILD[p.build!].es} (dibujado de ${Math.round(p.thickness! * 100)} cm)`, 'Promedio de ambas caras, descontando vanos, hasta el techo'],
  },
  'brick.solid': {
    en: ['Solid common brick 5.5 × 12 × 25 cm', `${BRICKS.solid12.units} per m² of a 12 cm leaf, ${BRICKS.solid24.units} of a 24 cm wall, breakage included`],
    es: ['Ladrillo común 5,5 × 12 × 25 cm', `${BRICKS.solid12.units} por m² en muro de 12 cm, ${BRICKS.solid24.units} en muro de 24 cm, con roturas`],
  },
  'brick.facing': {
    en: ['Facing brick 5.5 × 12 × 25 cm (ladrillo visto)', `${BRICKS.facing12.units} per m² of a 12 cm leaf, ${BRICKS.facing24.units} of a 24 cm wall, breakage included`],
    es: ['Ladrillo visto 5,5 × 12 × 25 cm', `${BRICKS.facing12.units} por m² en muro de 12 cm, ${BRICKS.facing24.units} en muro de 24 cm, con roturas`],
  },
  'brick.hollow8': { en: ['Hollow ceramic brick 8 × 18 × 33 cm', `${BRICKS.hollow8.units} per m² of wall, breakage included`], es: ['Ladrillo cerámico hueco 8 × 18 × 33 cm', `${BRICKS.hollow8.units} por m² de muro, con roturas`] },
  'brick.hollow12': { en: ['Hollow ceramic brick 12 × 18 × 33 cm', `${BRICKS.hollow12.units} per m² of wall, breakage included`], es: ['Ladrillo cerámico hueco 12 × 18 × 33 cm', `${BRICKS.hollow12.units} por m² de muro, con roturas`] },
  'brick.hollow18': { en: ['Hollow ceramic brick 18 × 18 × 33 cm', `${BRICKS.hollow18.units} per m² of wall, breakage included`], es: ['Ladrillo cerámico hueco 18 × 18 × 33 cm', `${BRICKS.hollow18.units} por m² de muro, con roturas`] },
  'mortar.masonry': { en: ['Masonry mortar (1/4:1:4)', 'Per brick type, joints of 1–1.5 cm'], es: ['Mezcla para mampostería (1/4:1:4)', 'Según el ladrillo, juntas de 1 a 1,5 cm'] },
  lintel: { en: ['Precast concrete lintel', 'Opening width + 0.20 m bearing each side'], es: ['Dintel premoldeado de hormigón', 'Ancho del vano + 0,20 m de apoyo a cada lado'] },
  parapet: { en: ['Parapet of 12 cm hollow brick', 'Round the slab'], es: ['Carga de ladrillo hueco 12 cm', 'Perímetro de la losa'] },
  dpc: {
    en: ['Damp-proof course (capa aisladora, cajón)', 'Two horizontal layers and their sides: (2 × thickness + 0.30) per m of wall'],
    es: ['Capa aisladora horizontal (cajón)', 'Dos capas horizontales y sus laterales: (2 × espesor + 0,30) por m de muro'],
  },
  'eps.wall': { en: ['EPS board 50 mm (wall cavity)', 'Envelope walls 25 cm or more, 5% for cuts'], es: ['Placa de EPS 50 mm (cámara del muro)', 'Muros exteriores de 25 cm o más, 5 % de recortes'] },
  'barrier.wall': { en: ['Polyethylene vapour barrier 200 µm', 'Wall cavity, 10% for laps'], es: ['Barrera de vapor de polietileno 200 µm', 'Cámara del muro, 10 % de solapes'] },
  'barrier.floor': { en: ['Polyethylene under the sub-floor 200 µm', '10% for laps'], es: ['Film de polietileno 200 µm bajo el contrapiso', '10 % de solapes'] },
  'glasswool.roof': { en: ['Glass wool 50 mm with aluminium foil (roof)', 'Its slopes, 5% for laps'], es: ['Lana de vidrio 50 mm con aluminio (techo)', 'Faldones, 5 % de solapes'] },
  'eps.roof': { en: ['EPS board 50 mm (flat roof)', '5% for cuts'], es: ['Placa de EPS 50 mm (techo plano)', '5 % de recortes'] },
  'plaster.unchosen': {
    en: [(p) => `Plaster, ${p.side} (finish not chosen)`, 'Not finished in the plan: assumed plastered and painted'],
    es: [(p) => `Revoque ${p.side === 'exterior' ? 'exterior' : 'interior'} (terminación sin elegir)`, 'Sin terminación en el plano: se supone revocado y pintado'],
  },
  'plaster.material': {
    en: [(p) => `${materialTitle(p.material, 'en')}, ${p.side}`, 'Base and finish coats'],
    es: [(p) => `${materialTitle(p.material, 'es')}, ${p.side === 'exterior' ? 'exterior' : 'interior'}`, 'Revoque grueso y fino'],
  },
  'plaster.base': { en: ['Base coat under claddings', 'Under a tile, stone, wood or brick cladding'], es: ['Revoque grueso bajo revestimientos', 'Bajo revestimiento cerámico, de piedra, madera o ladrillo'] },
  'plaster.ceiling': { en: ['Plaster ceiling (applied or suspended)', 'Its floor area'], es: ['Cielorraso de yeso (aplicado o suspendido)', 'Superficie del local'] },
  'plaster.parapet': { en: ['Plaster, exterior (parapets)', 'Both sides'], es: ['Revoque exterior (cargas)', 'Ambas caras'] },
  paint: {
    en: [(p) => `Latex paint, ${p.side}`, 'Two coats, over plaster or painted brick (assumed where a wall side is not finished)'],
    es: [(p) => `Pintura látex ${p.side === 'exterior' ? 'exterior' : 'interior'}`, 'Dos manos sobre revoque o ladrillo pintado (supuesta donde la cara no tiene terminación)'],
  },
  'brick.pointing': {
    en: [(p) => `${materialTitle(p.material, 'en')}: pointing and sealer`, 'Facing brick left exposed'],
    es: [(p) => `${materialTitle(p.material, 'es')}: tomado de juntas e hidrorrepelente`, 'Ladrillo visto a la vista'],
  },
  'coating.textured': { en: ['Textured coating (revestimiento plástico)', 'Over the base coat'], es: ['Revestimiento plástico texturado', 'Sobre revoque grueso'] },
  cladding: {
    en: [(p) => materialTitle(p.material, 'en'), (p) => `${Math.round(p.waste! * 100)}% for cuts`],
    es: [(p) => materialTitle(p.material, 'es'), (p) => `${Math.round(p.waste! * 100)} % de recortes`],
  },
  subfloor: { en: ['Sub-floor, lean concrete 12 cm', 'Inside its walls, on compacted ground'], es: ['Contrapiso de hormigón pobre 12 cm', 'Dentro de los muros, sobre terreno compactado'] },
  'paving.base': { en: ['Paving base, lean concrete 10 cm', 'Inside its walls, on compacted ground'], es: ['Contrapiso exterior de hormigón pobre 10 cm', 'Dentro de los muros, sobre terreno compactado'] },
  screed: { en: ['Cement screed 3 cm (carpeta)', 'Under its floor finish'], es: ['Carpeta de cemento 3 cm', 'Bajo el piso'] },
  floor: {
    en: [(p) => materialTitle(p.material, 'en'), (p) => `Inside its walls, ${Math.round(p.waste! * 100)}% for cuts`],
    es: [(p) => materialTitle(p.material, 'es'), (p) => `Dentro de los muros, ${Math.round(p.waste! * 100)} % de recortes`],
  },
  'floor.unchosen': {
    en: [(p) => `Floor finish not chosen (${p.outdoor ? 'outdoor' : 'covered'})`, 'Inside its walls'],
    es: [(p) => `Piso sin elegir (${p.outdoor ? 'exterior' : 'cubierto'})`, 'Dentro de los muros'],
  },
  skirting: { en: ['Skirting', 'Along its walls (centrelines), doors not deducted'], es: ['Zócalo', 'Por el perímetro de los muros (ejes), sin descontar puertas'] },
  ceiling: {
    en: [(p) => materialTitle(p.material, 'en'), 'The soffit of the roof over it, 5% for cuts'],
    es: [(p) => materialTitle(p.material, 'es'), 'El cielorraso del techo que lo cubre, 5 % de recortes'],
  },
  'soffit.eaves': {
    en: [(p) => `${materialTitle(p.material, 'en')} (eaves soffit)`, 'Under its overhang'],
    es: [(p) => `${materialTitle(p.material, 'es')} (alero)`, 'Bajo el alero'],
  },
  'roof.fill': {
    en: ['Sloping fill, lean concrete (average 8 cm)', 'Over the slab, down to its drains'],
    es: ['Contrapiso con pendiente de hormigón pobre (promedio 8 cm)', 'Sobre la losa, hacia los desagües'],
  },
  'roof.membrane': {
    en: ['Asphalt membrane 4 mm with aluminium foil', (_, n) => `Laps and upturns: ${n((FLAT_ROOF.membrane - 1) * 100, 0)}%`],
    es: ['Membrana asfáltica 4 mm con aluminio', (_, n) => `Solapes y babetas: ${n((FLAT_ROOF.membrane - 1) * 100, 0)} %`],
  },
  'roof.cover': {
    en: [(p) => materialTitle(p.material, 'en'), (p) => `Its surface, ${Math.round(p.waste! * 100)}% for laps and cuts`],
    es: [(p) => materialTitle(p.material, 'es'), (p) => `Su superficie, ${Math.round(p.waste! * 100)} % de solapes y recortes`],
  },
  'roof.cover.unchosen': { en: ['Roof covering not chosen', 'Its slopes'], es: ['Cubierta sin elegir', 'Faldones'] },
  'roof.drain': { en: ['Roof drain', `One per ${FLAT_ROOF.drainArea} m²`], es: ['Embudo de desagüe pluvial', `Uno cada ${FLAT_ROOF.drainArea} m²`] },
  coping: { en: ['Parapet coping', 'Round the slab'], es: ['Cupertina de carga', 'Perímetro de la losa'] },
  'purlin.c100': { en: ['Steel C purlin 100 mm, 1 m apart', '1 m per m² of slope'], es: ['Correa de perfil C 100 mm cada 1 m', '1 m por m² de faldón'] },
  'rafter.timber': { en: ['Timber rafter 2 × 6 in, 0.50 m apart', '2 m per m² of slope'], es: ['Tirante de madera 2 × 6" cada 0,50 m', '2 m por m² de faldón'] },
  'batten.timber': { en: ['Timber batten 1 × 2 in', '3 m per m² of slope'], es: ['Listón de madera 1 × 2"', '3 m por m² de faldón'] },
  gutter: { en: ['Gutter, galvanized sheet', 'Along its low eaves'], es: ['Canaleta de chapa galvanizada', 'En el borde más bajo'] },
  downpipe: { en: ['Downpipe Ø 100 mm', `One per ${PER_DOWNPIPE} m of gutter`], es: ['Caño de lluvia Ø 100 mm', `Uno cada ${PER_DOWNPIPE} m de canaleta`] },
  'glass.roof': { en: ['Laminated glass 3+3 (glass roof)', 'Its slope'], es: ['Vidrio laminado 3+3 (techo vidriado)', 'Superficie del faldón'] },
  growlight: {
    en: [(_, n) => `LED grow light, ${n(GROW_BAR, 1)} m bar`, (_, n) => `Rows of bars, ${n(GROW_BAR, 1)} m each`],
    es: [(_, n) => `Luminaria LED de cultivo, barra de ${n(GROW_BAR, 1)} m`, (_, n) => `Filas de barras de ${n(GROW_BAR, 1)} m`],
  },
  'growlight.rods': { en: ['Grow light hanging rods and cable tray', 'Along each row'], es: ['Varillas de suspensión y bandeja portacables', 'A lo largo de cada fila'] },
  door: {
    en: [(p, n) => `Door, ${p.style}, ${n(p.w!, 2)} × ${n(p.h!, 2)} m`, 'Width × height, frame included'],
    es: [(p, n) => `Puerta ${STYLE_ES[`door:${p.style}`] ?? p.style}, ${n(p.w!, 2)} × ${n(p.h!, 2)} m`, 'Ancho × alto, con marco'],
  },
  window: {
    en: [(p, n) => `Window, ${p.style}, ${n(p.w!, 2)} × ${n(p.h!, 2)} m`, 'Width × height of its frame'],
    es: [(p, n) => `Ventana ${STYLE_ES[`window:${p.style}`] ?? p.style}, ${n(p.w!, 2)} × ${n(p.h!, 2)} m`, 'Ancho × alto del marco'],
  },
  gate: {
    en: [(p, n) => `Gate, ${p.style}, ${n(p.w!, 2)} × ${n(p.h!, 2)} m`, 'Width × height'],
    es: [(p, n) => `Portón ${STYLE_ES[`gate:${p.style}`] ?? p.style}, ${n(p.w!, 2)} × ${n(p.h!, 2)} m`, 'Ancho × alto'],
  },
  'glass.openings': {
    en: ['Glass in windows and doors (double glazing advised)', 'Each pane; priced with the windows and doors'],
    es: ['Vidrio de ventanas y puertas (se recomienda DVH)', 'Cada paño; su precio está en las aberturas'],
  },
  'glass.railing': { en: ['Laminated safety glass 5+5 (railings)', 'Each panel'], es: ['Vidrio laminado de seguridad 5+5 (barandas)', 'Cada paño'] },
  'glass.glazed': { en: ['Tempered glass 5 mm (glazed sides)', 'Each run, between base and rail'], es: ['Vidrio templado 5 mm (cerramientos vidriados)', 'Cada tramo, entre zócalo y travesaño'] },
  'glass.skylight': { en: ['Laminated glass 4+4 (skylights)', 'Each skylight'], es: ['Vidrio laminado 4+4 (lucernarios)', 'Cada lucernario'] },
  'column.roman': { en: ['Roman stone column', 'Counted'], es: ['Columna romana premoldeada', 'Por unidad'] },
  'tube.glazed.post': { en: ['Galvanized steel tube 50 × 50 mm (glazed sides, posts)', 'Post heights'], es: ['Caño galvanizado 50 × 50 mm (parantes de cerramientos vidriados)', 'Altura de los parantes'] },
  'post.steel100': { en: ['Steel post Ø 100 mm', 'Post heights'], es: ['Columna de caño de acero Ø 100 mm', 'Altura de las columnas'] },
  'post.teak': { en: ['Teak post 14 × 14 cm', 'Post heights'], es: ['Poste de teca 14 × 14 cm', 'Altura de los postes'] },
  'post.shoe': { en: ['Steel post shoe with two knee braces', 'One per timber post'], es: ['Base metálica de poste con dos cartelas', 'Una por poste'] },
  'beam.stone': { en: ['Stone beam over Roman columns', 'Its edge'], es: ['Viga de piedra sobre columnas romanas', 'Largo del borde'] },
  'tube.glazed.rail': { en: ['Galvanized steel tube 60 × 80 mm (glazed sides, top rail)', 'Its edge'], es: ['Caño galvanizado 60 × 80 mm (travesaño superior)', 'Largo del borde'] },
  'beam.steel': { en: ['Steel beam 120 × 200 mm', 'Its edge'], es: ['Viga de acero 120 × 200 mm', 'Largo del borde'] },
  'beam.teak': { en: ['Teak beam 14 × 22 cm', 'Its edge'], es: ['Viga de teca 14 × 22 cm', 'Largo del borde'] },
  railing: {
    en: ['Glass railing: steel posts every 1.5 m and a handrail', 'Along open edges with a floor on one side'],
    es: ['Baranda de vidrio: parantes de acero cada 1,5 m y pasamanos', 'En bordes abiertos con piso de un solo lado'],
  },
  'rafter.teak': { en: ['Teak rafter 7 × 20 cm (pergola)', 'Every 0.60 m, eaves to eaves'], es: ['Cabio de teca 7 × 20 cm (pérgola)', 'Cada 0,60 m, de borde a borde'] },
  'bar.glazing': { en: ['Galvanized steel glazing bar 40 × 60 mm (glass roof)', 'Every 0.75 m, eaves to eaves'], es: ['Perfil galvanizado 40 × 60 mm (techo vidriado)', 'Cada 0,75 m, de borde a borde'] },
  'pool.dig': {
    en: ['Excavation', (_, n) => `Its area × (depth + ${n(POOL_DIG)} m)`],
    es: ['Excavación', (_, n) => `Superficie × (profundidad + ${n(POOL_DIG)} m)`],
  },
  'pool.shell': {
    en: ['Reinforced concrete shell', (_, n) => `${n(POOL_SHELL * 100, 0)} cm under its floor and walls; H-21 with ${REBAR} kg/m³ of rebar`],
    es: ['Vaso de hormigón armado', (_, n) => `${n(POOL_SHELL * 100, 0)} cm bajo fondo y paredes; H-21 con ${REBAR} kg/m³ de acero`],
  },
  'pool.waterproofing': { en: ['Waterproofing (cementitious, two coats)', 'Its floor and walls'], es: ['Impermeabilización cementicia (dos manos)', 'Fondo y paredes'] },
  'pool.lining': {
    en: [(p) => (p.material ? materialTitle(p.material, 'en') : 'Pool tile (lining not chosen)'), 'Its floor and walls, 10% for cuts'],
    es: [(p) => (p.material ? materialTitle(p.material, 'es') : 'Revestimiento de pileta (sin elegir)'), 'Fondo y paredes, 10 % de recortes'],
  },
  fireplace: {
    en: [(p) => (p.style === 'parrilla' ? 'Parrilla (built-in grill), brick' : 'Masonry fireplace'), 'Counted'],
    es: [(p) => (p.style === 'parrilla' ? 'Parrilla de ladrillo' : 'Hogar a leña de mampostería'), 'Por unidad'],
  },
  counter: {
    en: [(p) => furnitureTitle('counter', p.style, 'en'), 'Its length'],
    es: [(p) => furnitureTitle('counter', p.style, 'es'), 'Largo'],
  },
  fixture: {
    en: [(p) => furnitureTitle(p.kind!, p.style, 'en'), 'Counted'],
    es: [(p) => furnitureTitle(p.kind!, p.style, 'es'), 'Por unidad'],
  },
  stair: {
    en: [(p, n) => `Straight stair, ${n(p.w!, 2)} × ${n(p.h!, 2)} m`, 'Width × run'],
    es: [(p, n) => `Escalera recta, ${n(p.w!, 2)} × ${n(p.h!, 2)} m`, 'Ancho × desarrollo'],
  },
  chimney: { en: ['Chimney flue, brick', 'From the fireplace to above the roof'], es: ['Conducto de chimenea de ladrillo', 'Desde el hogar hasta sobre el techo'] },
  'garden.cover': {
    en: [(p) => materialTitle(p.material, 'en'), 'Its area'],
    es: [(p) => materialTitle(p.material, 'es'), 'Su superficie'],
  },
  plant: {
    en: [(p) => furnitureTitle(p.kind!, p.style, 'en'), 'Counted'],
    es: [(p) => furnitureTitle(p.kind!, p.style, 'es'), 'Por unidad'],
  },
  mix: {
    en: [(p) => MIX_TITLES[p.mix!].en, 'All the work above'],
    es: [(p) => MIX_TITLES[p.mix!].es, 'Todos los trabajos anteriores'],
  },
  cement: { en: [`Portland cement, ${BAG.cement} kg bags`, 'From the mixes'], es: [`Cemento portland, bolsas de ${BAG.cement} kg`, 'Según las dosificaciones'] },
  lime: { en: [`Hydrated lime, ${BAG.lime} kg bags`, 'From the mixes'], es: [`Cal hidratada, bolsas de ${BAG.lime} kg`, 'Según las dosificaciones'] },
  sand: { en: ['Sand', 'From the mixes'], es: ['Arena', 'Según las dosificaciones'] },
  gravel: { en: ['Gravel and brick rubble', 'From the mixes'], es: ['Piedra partida y cascote', 'Según las dosificaciones'] },
  rebar: { en: ['Rebar (ADN 420)', `${REBAR} kg per m³ of reinforced concrete`], es: ['Acero en barras (ADN 420)', `${REBAR} kg por m³ de hormigón armado`] },
  hydrofuge: {
    en: ['Hydrofuge', `${HYDROFUGE * 100}% of the cement in the damp-proofing`],
    es: ['Hidrófugo', `${HYDROFUGE * 100} % del cemento de la capa aisladora`],
  },
}

/** What a row is and how it was worked out, in a language. */
export function rowText(row: TakeoffRow, lang: Lang): { item: string; basis: string } {
  const words = TEXT[row.key]?.[lang]
  if (!words) return { item: row.key, basis: '' }
  const n = (x: number, digits = 2) => formatNumber(x, digits, lang)
  const say = (w: Words) => (typeof w === 'string' ? w : w(row.params, n, lang))
  return { item: say(words[0]), basis: say(words[1]) }
}

/**
 * The list as CSV for a spreadsheet: chapter, item, quantity, unit, unit price and cost in ARS, where, and how. In
 * Spanish with semicolons and decimal commas, as spreadsheets set to Argentina read it.
 */
export function takeoffCsv(rows: readonly TakeoffRow[], lang: Lang): string {
  const sep = lang === 'es' ? ';' : ','
  const num = (x: number | null, digits: number) => (x === null ? '' : x.toFixed(digits).replace('.', lang === 'es' ? ',' : '.'))
  const cell = (v: string) => (v.includes(sep) || /["\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)
  const head = lang === 'es' ? ['Rubro', 'Ítem', 'Cantidad', 'Unidad', 'Precio unitario (ARS)', 'Total (ARS)', 'Dónde', 'Cómo'] : ['Chapter', 'Item', 'Quantity', 'Unit', 'Unit price (ARS)', 'Cost (ARS)', 'Where', 'How']
  const lines = [head.join(sep)]
  for (const r of rows) {
    const { item, basis } = rowText(r, lang)
    const whole = r.unit === 'u' || r.unit === 'bags'
    const u = unitPrice(r)
    lines.push([CHAPTER_TITLES[r.chapter][lang], item, num(bought(r), whole ? 0 : 2), unitText(r.unit, lang), num(u?.ars ?? null, 0), num(rowCost(r), 0), r.where.join(', '), basis].map(cell).join(sep))
  }
  return `${lines.join('\n')}\n`
}
