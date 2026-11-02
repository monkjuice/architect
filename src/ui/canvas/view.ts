import { clamp, type Box } from '../../model/geometry'
import type { Viewport } from '../../state/store'

export const MIN_ZOOM = 0.5
export const MAX_ZOOM = 20000

/** What an empty plan shows: a 30 × 20 m area. */
const EMPTY: Box = { x0: 0, y0: 0, x1: 30, y1: 20 }

/** A view that frames `box` in a w × h pixel canvas, with some padding. */
export function frame(box: Box | null, w: number, h: number): Viewport | null {
  if (!w || !h) return null
  const b = box ?? EMPTY
  const pad = 40
  const bw = Math.max(b.x1 - b.x0, 1)
  const bh = Math.max(b.y1 - b.y0, 1)
  const zoom = clamp(Math.min((w - 2 * pad) / bw, (h - 2 * pad) / bh), MIN_ZOOM, MAX_ZOOM)
  return { zoom, x0: (b.x0 + b.x1) / 2 - w / zoom / 2, y0: (b.y0 + b.y1) / 2 - h / zoom / 2 }
}

/** The smallest of lead·10ⁿ (lead from `leads`) that is at least `min`. */
export function niceStep(min: number, leads: readonly number[] = [1, 2, 5]): { step: number; lead: number } {
  const p = 10 ** Math.floor(Math.log10(min))
  for (const lead of leads) if (lead * p >= min * (1 - 1e-9)) return { step: lead * p, lead }
  return { step: 10 * p, lead: 1 }
}

/** Grid spacing for a zoom: minor lines at least 12 px apart, major lines on round values (0.5, 1, 5, 10 m…). */
export function gridSteps(zoom: number): { minor: number; major: number } {
  const { step, lead } = niceStep(12 / zoom, [1, 5])
  return { minor: step, major: lead === 1 ? step * 5 : step * 2 }
}

/** "2 cm", "50 cm", "1 m", "250 m". */
export function formatMeters(m: number): string {
  if (m < 1) return `${+(m * 100).toPrecision(3)} cm`
  return `${+m.toPrecision(4)} m`
}
