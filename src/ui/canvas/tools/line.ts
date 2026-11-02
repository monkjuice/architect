import { drawSegment } from '../../../model/edit'
import { add, dist, EPS, len, mul, parseLength, screenAngleDeg, sub, type Vec } from '../../../model/geometry'
import { findLayer, isEditable, SEGMENT_KINDS } from '../../../model/plan'
import { findSnap, type Snap } from '../../../model/snap'
import { SNAP_PX, type OverlayData, type PointerInfo, type Tool, type ToolContext } from './types'

/**
 * Draws connected walls, open edges or outlines (the store's `lineKind`; O goes to the next): each click adds
 * a point joined to the previous one. Points snap to existing points
 * and lines (landing on a line splits it, so the new line is connected there). Shift keeps 45° steps; typing a
 * number and Enter places the next point at that distance along the current direction. A second click on the
 * same spot, closing the chain on its first point, Esc or a right click ends the chain.
 */
export function createLineTool(ctx: ToolContext): Tool {
  const { store } = ctx
  /** The chain in progress: its first point stays a snap until the first segment exists, then `last` is a vertex. */
  let chain: { layer: string; start: Snap; last?: string } | null = null
  let snap: Snap | null = null
  let typed = ''
  let pointer: PointerInfo | null = null

  const origin = (): Vec | null => {
    if (!chain) return null
    if (!chain.last) return chain.start.point
    const v = findLayer(store.getState().plan, chain.layer)?.vertices[chain.last]
    if (!v) chain = null // undone from under us
    return v ?? null
  }

  const update = (e: PointerInfo) => {
    pointer = e
    const from = origin() ?? undefined
    snap = findSnap(store.getState().plan, e.p, {
      reach: SNAP_PX * e.px,
      from,
      constrain: e.shift && !!from,
      enabled: !e.alt && ctx.prefs().snap,
    })
  }

  const finish = () => {
    chain = null
    typed = ''
    ctx.redraw()
  }

  const place = (target: Snap) => {
    const { plan, activeLayer } = store.getState()
    const layer = findLayer(plan, activeLayer)
    if (!isEditable(layer)) {
      store.notify({ kind: 'error', text: `The layer "${layer?.name ?? activeLayer}" is hidden or locked: choose another one in Layers.` })
      return
    }
    const from = chain?.layer === layer.id ? origin() : null
    if (!chain || !from) {
      chain = { layer: layer.id, start: target }
      return
    }
    if (dist(from, target.point) < EPS) return finish()
    const closes = dist(target.point, chain.start.point) < EPS
    const result = drawSegment(plan, layer.id, chain.last ?? chain.start, target, store.getState().lineKind)
    if (result) {
      store.edit(() => result.plan)
      chain.last = result.b
    } else if (target.layer === layer.id && target.vertex) {
      chain.last = target.vertex // retraced an existing line: carry on from its end
    }
    if (closes) finish()
  }

  const placeTyped = () => {
    const length = parseLength(typed)
    const from = origin()
    const text = typed
    typed = ''
    if (!from || !(length > 0)) {
      store.notify({ kind: 'error', text: `"${text}" is not a length in meters.` })
      return ctx.redraw()
    }
    const toward = snap ? sub(snap.point, from) : { x: 1, y: 0 }
    const dir = len(toward) < EPS ? { x: 1, y: 0 } : mul(toward, 1 / len(toward))
    place({ point: add(from, mul(dir, length)), kind: 'free' })
    if (pointer) update(pointer)
    ctx.redraw()
  }

  return {
    cursor: () => 'crosshair',

    reset() {
      chain = null
      snap = null
      typed = ''
    },

    down(e) {
      update(e)
      if (snap) place(snap)
      update(e)
      ctx.redraw()
    },

    move(e) {
      update(e)
      ctx.redraw()
    },

    cancel: finish,

    key(e) {
      if (e.key.toLowerCase() === 'o' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const kinds = SEGMENT_KINDS
        store.update({ lineKind: kinds[(kinds.indexOf(store.getState().lineKind) + 1) % kinds.length] })
        return true
      }
      if (!chain) return false
      if (/^[0-9.,]$/.test(e.key)) typed += e.key
      else if (e.key === 'Backspace' && typed) typed = typed.slice(0, -1)
      else if (e.key === 'Enter') {
        if (typed) placeTyped()
        else finish()
      } else if (e.key === 'Escape') {
        if (typed) typed = ''
        else finish()
      } else return false
      ctx.redraw()
      return true
    },

    overlay() {
      const out: OverlayData = { snap: snap && snap.kind !== 'free' ? snap : undefined }
      const from = origin()
      if (from && snap) {
        out.lines = [{ a: from, b: snap.point, style: store.getState().lineKind === 'open' ? 'preview-open' : 'preview' }]
        out.tag = typed
          ? { p: snap.point, text: `${typed}▏ m  ↵`, style: 'accent' }
          : { p: snap.point, text: `${dist(from, snap.point).toFixed(2)} m   ${screenAngleDeg(from, snap.point).toFixed(1)}°` }
        if (!chain?.last) out.points = [{ p: from, style: 'anchor' }]
      }
      return out
    },
  }
}
