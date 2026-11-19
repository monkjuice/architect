import { closestOnSegment, dist, type Vec } from '../../../model/geometry'
import { SYSTEM_TITLES, type MepPlan } from '../../../model/mep'
import { findLayer, storeyOf } from '../../../model/plan'
import { levelOf } from '../../../model/storeys'
import { getMep } from '../../../state/derived'
import { HIT_VERTEX_PX, type Tool, type ToolContext } from './types'

/** A height in words: where a line at it runs. */
export function heightWords(z: number, level: number): string {
  const h = z - level
  if (z < -0.05) return `buried ${(-z).toFixed(2)} m deep`
  if (h < 0.1) return `in the floor's screed (${h.toFixed(2)} m)`
  if (h > 2.4) return `in the slab over the room (${h.toFixed(2)} m)`
  return `${h.toFixed(2)} m up the wall`
}

/**
 * What is under the cursor on the MEP plan, in words: a clash, a sleeve through a wall or under a foundation, or the
 * nearest line with where it runs (its height). Lines of the floor shown, with what is buried under the ground floor.
 */
export function describeMep(mep: MepPlan, level: number, ground: boolean, at: Vec, reach: number, shown: (system: string) => boolean): string | null {
  const onFloor = (z: number) => z <= level + 3.2 && z >= level - 0.2 - (ground ? 5 : 0)
  for (const c of mep.clashes) {
    if (!onFloor(c.at.z) || !shown(c.systems[0]) || !shown(c.systems[1]) || dist(c.at, at) > reach * 1.5) continue
    return c.how === 'together'
      ? `Too close: ${c.titles[0]} and ${c.titles[1]} side by side over ${c.length.toFixed(2)} m, ${Math.round(c.gap * 100)} cm apart`
      : `Too close: ${c.titles[0]} crosses ${c.titles[1]}, ${Math.round(c.gap * 100)} cm apart`
  }
  for (const c of mep.crossings) {
    if (!onFloor(c.at.z) || !shown(c.system) || dist(c.at, at) > reach) continue
    return `${c.title}: ${c.way === 'wall' ? `through the wall in a sleeve, ${c.at.z.toFixed(2)} m up` : 'under the foundation, in a sleeve'}`
  }
  let best: { d: number; text: string } | null = null
  for (const line of mep.lines) {
    if (!shown(line.system)) continue
    for (let i = 1; i < line.pts.length; i++) {
      const [a, b] = [line.pts[i - 1], line.pts[i]]
      const z = Math.min(a.z, b.z)
      // the floor shown, and on the ground floor what is buried under it
      if (!onFloor(z)) continue
      const c = closestOnSegment(at, a, b)
      if (c.dist > reach || (best && c.dist >= best.d)) continue
      const vertical = Math.abs(a.x - b.x) + Math.abs(a.y - b.y) < 1e-6
      best = { d: c.dist, text: `${line.title} (${SYSTEM_TITLES[line.system]}): ${vertical ? `up from ${heightWords(Math.min(a.z, b.z), level)} to ${(Math.max(a.z, b.z) - level).toFixed(2)} m` : heightWords(a.z, level)}` }
    }
  }
  return best?.text ?? null
}

/** The MEP plan's Select: it picks nothing (each tab edits its own), it says what is under the cursor. */
export function createMepSelectTool(ctx: ToolContext): Tool {
  const { store } = ctx
  let info: { at: Vec; text: string } | null = null
  return {
    cursor: () => 'default',
    reset() {
      info = null
    },
    move(e) {
      const { plan, activeLayer } = store.getState()
      const layer = findLayer(plan, activeLayer)
      const prefs = ctx.prefs().mep
      const text = describeMep(getMep(plan), layer && storeyOf(layer) ? levelOf(layer) : 0, !storeyOf(layer), e.p, HIT_VERTEX_PX * e.px, (s) => !!prefs[s as keyof typeof prefs])
      const next = text ? { at: e.p, text } : null
      if (next?.text !== info?.text || (next && info && dist(next.at, info.at) > 0)) {
        info = next
        ctx.redraw()
      }
    },
    overlay() {
      return info ? { tag: { p: info.at, text: info.text } } : {}
    },
  }
}

