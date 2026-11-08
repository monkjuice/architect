import { closestOnSegment, type Vec } from '../../../model/geometry'
import { isEditable, sameRef, type Ref } from '../../../model/plan'
import { getFoundation } from '../../../state/derived'
import { HIT_SEGMENT_PX, type Tool, type ToolContext } from './types'

/**
 * Picks walls' footings on the foundation plan: click one (Shift adds) to set its width and depth in the Foundation
 * section. A footing is picked anywhere on its band, or near its line when it is narrow on screen.
 */
export function createFoundationSelectTool(ctx: ToolContext): Tool {
  const { store } = ctx
  let hover: Ref | null = null
  let at: Vec | null = null

  /** The footing under `p` on an editable layer: the nearest whose band is around it. */
  const footingAt = (p: Vec, px: number): Ref | null => {
    const { plan } = store.getState()
    let best: { ref: Ref; d: number } | null = null
    for (const f of getFoundation(plan).walls) {
      if (!isEditable(plan.layers.find((l) => l.id === f.layer))) continue
      const d = closestOnSegment(p, f.a, f.b).dist
      if (d > Math.max(f.width / 2, HIT_SEGMENT_PX * px)) continue
      if (!best || d < best.d) best = { ref: { layer: f.layer, kind: 'segment', id: f.segment }, d }
    }
    return best?.ref ?? null
  }

  return {
    cursor: () => (hover ? 'pointer' : 'default'),

    reset() {
      hover = null
    },

    down(e) {
      const target = footingAt(e.p, e.px)
      const selection = store.getState().selection.filter((r) => r.kind === 'segment')
      if (!target) {
        if (!e.shift) store.select([])
        return
      }
      if (e.shift) store.select(selection.some((r) => sameRef(r, target)) ? selection.filter((r) => !sameRef(r, target)) : [...selection, target])
      else store.select([target])
      store.setActiveLayer(target.layer)
    },

    move(e) {
      at = e.p
      const h = footingAt(e.p, e.px)
      if (!sameRef(h, hover)) {
        hover = h
        ctx.redraw()
      }
    },

    key(e) {
      if (e.key !== 'Escape') return false
      store.select([])
      return true
    },

    overlay() {
      const { plan } = store.getState()
      const f = hover && getFoundation(plan).walls.find((w) => w.layer === hover!.layer && w.segment === hover!.id)
      if (!f || !at) return {}
      const what = f.kind === 'strip' ? 'strip footing' : plan.foundation?.system === 'raft' ? 'raft beam' : 'ground beam'
      return { hover: hover!, tag: { p: at, text: `${f.width.toFixed(2)} × ${f.depth.toFixed(2)} m ${what}${f.custom ? ' (set by hand)' : ''}` } }
    },
  }
}
