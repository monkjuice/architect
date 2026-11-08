import type { TakeoffRow } from './takeoff'

/**
 * Local prices for the materials list: retail in the Buenos Aires area (AMBA), in Argentine pesos with VAT, as seen
 * on PRICES_SEEN, materials only (no labour). Each is per the unit of the row it prices, except doors, windows and
 * gates, which are per m² of opening, and a row is priced only when it is bought as it is (bricks, cement, a door):
 * work rows (a wall's m², a footing's m³, plaster) take their materials from the rows that are, so they have none.
 * Glass in windows and doors is in their price. Prices go stale fast with inflation: each says where it came from.
 */

export interface Price {
  /** ARS per the row's unit (per m² of opening for doors, windows and gates). */
  ars: number
  /** How it is sold, and where it was seen. */
  sold?: string
  source?: string
  /** Not found as such: worked out from something near it. */
  estimate?: boolean
}

export const PRICES_SEEN = ''

export const PRICES: Record<string, Price> = {}

/** Rows priced by another row's price: the same thing used in two places. */
const SAME: Record<string, string> = {
  'eps.wall': 'eps',
  'eps.roof': 'eps',
  'barrier.wall': 'polyethylene',
  'barrier.floor': 'polyethylene',
  'glasswool.roof': 'glasswool',
  'roof.membrane': 'membrane',
  'glass.railing': 'glass.laminated55',
  'glass.glazed': 'glass.tempered5',
  'glass.skylight': 'glass.laminated44',
  'glass.roof': 'glass.laminated33',
  'tube.glazed.post': 'tube.galv.50x50',
  'tube.glazed.rail': 'tube.galv.60x80',
}

/** The key a row is priced by, from its key and parameters; null for rows that are work, not bought. */
export function priceKey(row: TakeoffRow): string | null {
  const { key, params: p } = row
  if (['floor', 'cladding', 'ceiling', 'soffit.eaves', 'roof.cover', 'garden.cover'].includes(key)) return p.material ? `material:${p.material}` : null
  if (key === 'pool.lining') return p.material ? `material:${p.material}` : 'pool.lining'
  if (key === 'door' || key === 'window' || key === 'gate') return `${key}:${p.style}`
  if (key === 'paint') return `paint.${p.side}`
  if (key === 'fireplace') return `fireplace:${p.style}`
  if (key === 'counter') return p.style ? `counter:${p.style}` : 'counter'
  if (key === 'fixture' || key === 'plant') return p.style ? `${p.kind}:${p.style}` : p.kind!
  return SAME[key] ?? key
}

/** What one unit of a row costs (one door of its size), and the price it comes from; null when it has none. */
export function unitPrice(row: TakeoffRow): { ars: number; price: Price } | null {
  const k = priceKey(row)
  const price = k ? PRICES[k] : undefined
  if (!price) return null
  const perOpening = row.key === 'door' || row.key === 'window' || row.key === 'gate'
  return { ars: perOpening ? price.ars * row.params.w! * row.params.h! : price.ars, price }
}

/** How many of a row are bought: counts and bags whole. */
export const bought = (row: TakeoffRow): number => (row.unit === 'u' || row.unit === 'bags' ? Math.ceil(row.quantity - 1e-9) : row.quantity)

/** What a row costs: its unit price times what is bought; null when it has no price. */
export function rowCost(row: TakeoffRow): number | null {
  const u = unitPrice(row)
  return u ? u.ars * bought(row) : null
}
