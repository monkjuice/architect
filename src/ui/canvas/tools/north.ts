import { updateSite } from '../../../model/edit'
import { constrainAngle, dist, toDeg, type Vec } from '../../../model/geometry'
import type { PointerInfo, Tool, ToolContext } from './types'

/** Degrees clockwise from straight up on the plan (+y is down) for the vector a→b. */
const bearing = (a: Vec, b: Vec) => (toDeg(Math.atan2(b.x - a.x, a.y - b.y)) + 360) % 360

/** Click the tail of the survey's north arrow, then its tip: the site's north follows it. */
export function createNorthTool(ctx: ToolContext): Tool {
  const { store } = ctx
  let first: Vec | null = null
  let cursor: Vec | null = null
  const at = (e: PointerInfo) => (first && e.shift ? constrainAngle(first, e.p).point : e.p)

  return {
    cursor: () => 'crosshair',
    reset() {
      first = cursor = null
    },
    cancel() {
      first = null
      ctx.redraw()
    },
    down(e) {
      const p = at(e)
      if (!first) {
        first = p
        return ctx.redraw()
      }
      if (dist(first, p) < 5 * e.px) return
      const north = Math.round(bearing(first, p) * 10) / 10
      first = null
      store.edit((plan) => updateSite(plan, { north }))
      store.notify({ kind: 'info', text: `North set to ${north.toFixed(1)}° clockwise from straight up.` })
      store.setTool('select')
    },
    move(e) {
      cursor = at(e)
      if (first) ctx.redraw()
    },
    overlay() {
      if (!first || !cursor) return {}
      return {
        lines: [{ a: first, b: cursor, style: 'level' }],
        points: [{ p: first, style: 'anchor' }],
        tag: { p: cursor, text: `north ${bearing(first, cursor).toFixed(1)}°`, style: 'accent' },
      }
    },
  }
}
