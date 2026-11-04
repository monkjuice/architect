import type { Vec } from '../../../model/geometry'
import { COLUMNS } from '../../../model/colonnades'
import { findLayer, sameRef, segmentKind, type Ref } from '../../../model/plan'
import { applyColonnade, colonnadeTarget } from '../../../state/actions'
import { WALL_REACH_PX, type PointerInfo, type Tool, type ToolContext } from './types'

/**
 * Stands columns along open edges: hover one (a gallery's front, a porch) and click to give it a colonnade of
 * the style picked in the library. Walls and outlines are refused: columns hold up what open edges bound.
 */
export function createColonnadeTool(ctx: ToolContext): Tool {
  const { store } = ctx
  let hover: Ref | null = null
  let cursor: Vec | null = null

  const find = (e: PointerInfo) => colonnadeTarget(e.p, WALL_REACH_PX * e.px)
  const isOpen = (ref: Ref) => {
    const s = findLayer(store.getState().plan, ref.layer)?.segments[ref.id]
    return !!s && segmentKind(s) === 'open'
  }

  return {
    cursor: () => 'crosshair',
    reset() {
      hover = null
      cursor = null
    },
    move(e) {
      cursor = e.p
      const h = find(e)
      if (!sameRef(h, hover)) hover = h
      ctx.redraw()
    },
    down(e) {
      const target = find(e)
      if (!target) {
        store.notify({ kind: 'error', text: "Click an open edge (a gallery's front) to stand columns along it." })
        return
      }
      applyColonnade(target, store.getState().columnStyle)
    },
    overlay() {
      if (!cursor) return {}
      const title = `${COLUMNS[store.getState().columnStyle].title.toLowerCase()} colonnade`
      if (!hover) return { tag: { p: cursor, text: `hover an open edge for a ${title}`, style: 'accent' } }
      return isOpen(hover)
        ? { hover, tag: { p: cursor, text: `click: a ${title} along this edge`, style: 'accent' } }
        : { hover, tag: { p: cursor, text: 'columns go on open edges, not walls or outlines', style: 'warning' } }
    },
  }
}
