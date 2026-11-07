import { dist, EPS, polygonArea, type Vec } from '../../../model/geometry'
import { findSnap, type Snap } from '../../../model/snap'
import { addRoofOutline } from '../../../state/actions'
import { storeyView } from '../../../state/derived'
import { SNAP_PX, type OverlayData, type PointerInfo, type Tool, type ToolContext } from './types'

/**
 * Draws a roof's outline: click its corners (they snap to the plan's points and lines, Shift keeps 45° steps),
 * then click the first one again, or press Enter, to close it. The roof gets the type picked in the toolbar.
 */
export function createRoofTool(ctx: ToolContext): Tool {
  let points: Vec[] = []
  let snap: Snap | null = null

  const update = (e: PointerInfo) => {
    const last = points.at(-1)
    const { plan, activeLayer } = ctx.store.getState()
    snap = findSnap(storeyView(plan, activeLayer, true), e.p, {
      reach: SNAP_PX * e.px,
      from: last,
      constrain: e.shift && !!last,
      enabled: !e.alt && ctx.prefs().snap,
      extraPoints: points.length >= 3 ? [points[0]] : [],
    })
  }

  const finish = () => {
    if (points.length >= 3) addRoofOutline(points)
    points = []
    ctx.redraw()
  }

  return {
    cursor: () => 'crosshair',

    reset() {
      points = []
      snap = null
    },

    down(e) {
      update(e)
      const p = snap!.point
      if (points.length >= 3 && dist(points[0], p) < EPS) return finish()
      if (!points.length || dist(points[points.length - 1], p) > EPS) points.push(p)
      ctx.redraw()
    },

    move(e) {
      update(e)
      ctx.redraw()
    },

    cancel: finish,

    key(e) {
      if (!points.length) return false
      if (e.key === 'Escape') points = []
      else if (e.key === 'Enter') finish()
      else if (e.key === 'Backspace') points.pop()
      else return false
      ctx.redraw()
      return true
    },

    overlay() {
      const out: OverlayData = { snap: snap && snap.kind !== 'free' ? snap : undefined }
      if (!points.length) return out
      const pts = snap ? [...points, snap.point] : points
      const pairs: [Vec, Vec][] = pts.slice(1).map((p, i) => [pts[i], p])
      out.lines = pairs.map(([a, b]) => ({ a, b, style: 'preview' }))
      if (pts.length >= 3) out.lines.push({ a: pts[pts.length - 1], b: pts[0], style: 'guide' })
      out.labels = pairs.map(([a, b]) => ({ a, b, text: dist(a, b).toFixed(2), style: 'accent' }))
      out.points = points.map((p) => ({ p, style: 'anchor' }))
      if (pts.length >= 3) out.tag = { p: pts[pts.length - 1], text: `${polygonArea(pts).toFixed(2)} m² · Enter or click the first corner to close`, style: 'accent' }
      return out
    },
  }
}
