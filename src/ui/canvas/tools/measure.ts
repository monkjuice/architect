import { dist, EPS, polygonArea, polylineLength, type Vec } from '../../../model/geometry'
import { findSnap, type Snap } from '../../../model/snap'
import { SNAP_PX, type OverlayData, type PointerInfo, type Tool, type ToolContext } from './types'

/**
 * Measures without drawing: click points for a running total; click the first point again to close the
 * outline and get its area. A second click on the last point (or Enter, or a right click) ends the
 * measurement; the next click starts a new one. Points snap like lines do.
 */
export function createMeasureTool(ctx: ToolContext): Tool {
  let points: Vec[] = []
  let closed = false
  let done = false
  let snap: Snap | null = null

  const update = (e: PointerInfo) => {
    const last = !done ? points.at(-1) : undefined
    snap = findSnap(ctx.store.getState().plan, e.p, {
      reach: SNAP_PX * e.px,
      from: last,
      constrain: e.shift && !!last,
      enabled: !e.alt && ctx.prefs().snap,
      extraPoints: !done && points.length >= 3 ? [points[0]] : [],
    })
  }

  const clear = () => {
    points = []
    closed = false
    done = false
  }

  return {
    cursor: () => 'crosshair',

    reset() {
      clear()
      snap = null
    },

    down(e) {
      if (done) clear()
      update(e)
      const p = snap!.point
      const last = points.at(-1)
      if (last && dist(last, p) < EPS) done = true
      else if (points.length >= 3 && dist(points[0], p) < EPS) closed = done = true
      else points.push(p)
      ctx.redraw()
    },

    move(e) {
      update(e)
      ctx.redraw()
    },

    cancel() {
      if (points.length) done = true
      ctx.redraw()
    },

    key(e) {
      if (!points.length) return false
      if (e.key === 'Escape') clear()
      else if (e.key === 'Enter') done = true
      else if (e.key === 'Backspace' && !done) points.pop()
      else return false
      ctx.redraw()
      return true
    },

    overlay() {
      const out: OverlayData = { snap: !done && snap && snap.kind !== 'free' ? snap : undefined }
      const pts = !done && snap && points.length ? [...points, snap.point] : points
      if (!pts.length) return out
      const pairs: [Vec, Vec][] = []
      for (let i = 1; i < pts.length; i++) pairs.push([pts[i - 1], pts[i]])
      if (closed) pairs.push([pts[pts.length - 1], pts[0]])
      out.lines = pairs.map(([a, b]) => ({ a, b, style: 'measure' }))
      out.labels = pairs.map(([a, b]) => ({ a, b, text: dist(a, b).toFixed(2), style: 'measure' }))
      out.points = points.map((p) => ({ p, style: 'measure' }))
      if (closed) out.area = pts
      const total = polylineLength(pts, closed)
      const text = closed ? `${polygonArea(pts).toFixed(2)} m²   perimeter ${total.toFixed(2)} m` : `total ${total.toFixed(2)} m`
      if (pairs.length > 1 || closed) out.tag = { p: pts[pts.length - 1], text, style: 'measure' }
      return out
    },
  }
}
