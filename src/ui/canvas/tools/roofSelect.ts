import { dist, len, polygonArea, sub, type Vec } from '../../../model/geometry'
import { isEditable, sameRef, type Plan, type Ref } from '../../../model/plan'
import { pointInPolygon } from '../../../model/regions'
import { eavesOf } from '../../../model/roofs'
import { moveRoofs, updateRoof } from '../../../model/edit'
import { findSnap, type Snap } from '../../../model/snap'
import { deleteSelection } from '../../../state/actions'
import { DRAG_PX, HIT_VERTEX_PX, SNAP_PX, type PointerInfo, type Tool, type ToolContext } from './types'

type Drag =
  | { kind: 'corner'; layer: string; id: string; index: number; snap?: Snap }
  | { kind: 'move'; refs: Ref[]; start: Vec; moved: boolean }

/**
 * Picks roofs on the roof plan: click inside one (Shift adds), drag it to move it, drag a corner of a selected
 * one to reshape it (corners snap to the plan's points and lines). Delete removes the selected roofs.
 */
export function createRoofSelectTool(ctx: ToolContext): Tool {
  const { store } = ctx
  let drag: Drag | null = null
  let hover: Ref | null = null

  /** The smallest roof on an editable layer whose eaves are around `p`, top layer first. */
  const roofAt = (plan: Plan, p: Vec): Ref | null => {
    let best: { ref: Ref; area: number } | null = null
    for (const layer of [...plan.layers].reverse()) {
      if (!isEditable(layer)) continue
      for (const [id, roof] of Object.entries(layer.roofs)) {
        const eaves = eavesOf(roof)
        if (!pointInPolygon(p, eaves) && !pointInPolygon(p, roof.outline)) continue
        const area = polygonArea(eaves)
        if (!best || area < best.area) best = { ref: { layer: layer.id, kind: 'roof', id }, area }
      }
      if (best) return best.ref
    }
    return null
  }

  /** A corner of a selected roof under `p`. */
  const cornerAt = (plan: Plan, e: PointerInfo) => {
    for (const r of store.getState().selection) {
      const layer = plan.layers.find((l) => l.id === r.layer)
      const roof = r.kind === 'roof' && isEditable(layer) ? layer.roofs[r.id] : undefined
      const index = roof?.outline.findIndex((q) => dist(q, e.p) <= HIT_VERTEX_PX * e.px) ?? -1
      if (index >= 0) return { layer: r.layer, id: r.id, index }
    }
    return null
  }

  return {
    cursor: () => (drag?.kind === 'move' && drag.moved ? 'grabbing' : hover ? 'move' : 'default'),

    reset() {
      if (drag) store.cancelGesture()
      drag = null
      hover = null
    },

    down(e) {
      const { plan, selection } = store.getState()
      const corner = cornerAt(plan, e)
      if (corner) {
        drag = { kind: 'corner', ...corner }
        return
      }
      const target = roofAt(plan, e.p)
      if (!target) {
        if (!e.shift) store.select([])
        return
      }
      let refs = selection.filter((r) => r.kind === 'roof')
      if (e.shift) {
        refs = refs.some((r) => sameRef(r, target)) ? refs.filter((r) => !sameRef(r, target)) : [...refs, target]
        store.select(refs)
        if (!refs.some((r) => sameRef(r, target))) return
      } else if (!refs.some((r) => sameRef(r, target))) {
        refs = [target]
        store.select(refs)
      }
      store.setActiveLayer(target.layer)
      drag = { kind: 'move', refs, start: e.p, moved: false }
    },

    move(e) {
      if (!drag) {
        const h = roofAt(store.getState().plan, e.p)
        if (!sameRef(h, hover)) {
          hover = h
          ctx.redraw()
        }
        return
      }
      if (drag.kind === 'corner') {
        const { layer, id, index } = drag
        const snap = findSnap(store.getState().plan, e.p, { reach: SNAP_PX * e.px, enabled: !e.alt && ctx.prefs().snap })
        drag.snap = snap
        store.preview((base) => {
          const roof = base.layers.find((l) => l.id === layer)?.roofs[id]
          return roof ? updateRoof(base, layer, id, { outline: roof.outline.map((q, i) => (i === index ? snap.point : q)) }) : base
        })
        return
      }
      const delta = sub(e.p, drag.start)
      if (!drag.moved && len(delta) < DRAG_PX * e.px) return
      drag.moved = true
      const { refs } = drag
      store.preview((base) => moveRoofs(base, base, refs, delta))
    },

    up() {
      if (drag) store.endGesture()
      drag = null
    },

    cancel() {
      if (drag) store.cancelGesture()
      drag = null
    },

    key(e) {
      if (e.key === 'Escape') {
        if (drag) store.cancelGesture()
        drag = null
        store.select([])
        return true
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && !drag) {
        deleteSelection()
        return true
      }
      return false
    },

    overlay() {
      const selected = store.getState().selection
      return {
        hover: !drag && hover && !selected.some((r) => sameRef(r, hover)) ? hover : undefined,
        snap: drag?.kind === 'corner' && drag.snap?.kind !== 'free' ? drag.snap : undefined,
      }
    },
  }
}
