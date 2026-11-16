import { boundsOf, dist, len, sub, type Vec } from '../../../model/geometry'
import { FURNITURE_REACH_M } from '../../../model/furniture'
import { deleteItems, moveServices, turnServices, updateService } from '../../../model/edit'
import type { HvacPlan } from '../../../model/hvac'
import { findLayer, isEditable, sameRef, storeyOf, type Plan, type Ref } from '../../../model/plan'
import { DRAIN, type PlumbingPlan } from '../../../model/plumbing'
import { pointInPolygon } from '../../../model/regions'
import { runAt } from '../../../model/routing'
import { serviceAt, servicesInBox, serviceTarget, type ServiceTab } from '../../../model/services'
import { getHvac, getPlacedAreas, getPlumbing, hostThickness, storeyView } from '../../../state/derived'
import { DRAG_PX, HIT_VERTEX_PX, type PointerInfo, type Tool, type ToolContext } from './types'

const PLUMBING_RUNS = { feed: 'supply', cold: 'cold water', hot: 'hot water', drain: 'drain', condensate: 'condensate drain' } as const
const HVAC_RUNS = { heating: 'heating flow and return', radiant: 'radiant floor lead', refrigerant: 'refrigerant line set', duct: 'duct' } as const

/** The words for a run under the cursor, with its size and length. */
function runWords(title: string, r: { size: number; length: number; rise: number; outdoor?: number }) {
  const rise = r.rise > 0 ? ` + ${r.rise.toFixed(2)} m up` : ''
  return `Ø${r.size} ${title}: ${r.length.toFixed(2)} m${rise}${r.outdoor && r.outdoor > 0.05 ? `, ${r.outdoor.toFixed(2)} m buried outside` : ''}`
}

/**
 * What is under the cursor on the plumbing plan, in words: a piece of equipment (or one of the HVAC's, faded), a
 * fixture's water or drain point, a floor trap, an inspection chamber, or a pipe with its size and length.
 */
export function describePlumbing(p: PlumbingPlan, storey: number, at: Vec, reach: number): string | null {
  for (const e of [...p.equipment, ...p.linked]) {
    if (e.storey !== storey) continue
    const q = sub(at, e.at)
    if (Math.abs(q.x) > e.placed.width / 2 + reach || Math.abs(q.y) > e.placed.depth / 2 + reach) continue
    const links = e.info.links
    const other = p.linked.includes(e)
      ? ` — the HVAC tab's${links?.dhw ? ': it makes the hot water, fed cold water here' : links?.fill ? ': filled from the cold water here' : links?.condensate ? ': its condensate drains here' : ''}`
      : ''
    return `${e.info.title}${e.specText ? `, ${e.specText}` : ''}${e.room ? ` (${e.room})` : ''}${other}`
  }
  for (const w of p.points) {
    if (w.storey !== storey || w.ref.kind !== 'furniture') continue
    const spots = [w.cold, w.hot, w.drain].filter((v): v is Vec => !!v)
    if (!spots.some((v) => dist(v, at) <= reach)) continue
    const water = w.hot ? 'cold and hot water' : 'cold water'
    const drain = w.drainTo === 'main' ? `Ø${DRAIN.main} into the main` : `Ø${DRAIN.fixture} to its trap`
    return `${w.title}${w.room ? ` (${w.room})` : ''}: ${water}, drain ${drain}`
  }
  for (const t of p.traps) {
    if (t.storey === storey && !t.grease && dist(t.at, at) <= reach * 1.5) {
      return `${t.kitchen ? "Kitchen's own floor trap" : 'Floor trap'}${t.room ? ` (${t.room})` : ''}: ${t.fixtures} fixture${t.fixtures > 1 ? 's' : ''} drain into it; Ø${DRAIN.trap} to the main`
    }
  }
  if (!storey) for (const c of p.chambers) if (!c.own && dist(c.at, at) <= 0.5) return 'Inspection chamber: where the main leaves the building (put one down to place it yourself)'
  for (const r of p.risers) {
    if ((r.to === storey || r.from === storey) && dist(r.at, at) <= reach) return `${r.kind === 'drain' ? 'Drain stack' : `${r.kind === 'hot' ? 'Hot' : 'Cold'} water riser`} between the ground floor and floor ${r.to}`
  }
  const i = runAt(p.runs, storey, at, reach)
  return i >= 0 ? runWords(PLUMBING_RUNS[p.runs[i].kind], p.runs[i]) : null
}

/** What is under the cursor on the HVAC plan: a piece with its rating and room, a pipe, duct or line, or a room's loads. */
export function describeHvac(h: HvacPlan, storey: number, at: Vec, reach: number): string | null {
  for (const e of h.pieces) {
    if (e.storey !== storey) continue
    const q = sub(at, e.at)
    if (Math.abs(q.x) > e.placed.width / 2 + reach || Math.abs(q.y) > e.placed.depth / 2 + reach) continue
    return `${e.info.title}${e.specText ? `, ${e.specText}` : ''}${e.room ? ` (${e.room})` : ''}`
  }
  const i = runAt(h.runs, storey, at, reach)
  if (i >= 0) return runWords(HVAC_RUNS[h.runs[i].kind], h.runs[i])
  for (const room of h.rooms) {
    if (room.storey !== storey || !pointInPolygon(at, room.outer) || room.holes.some((hole) => pointInPolygon(at, hole))) continue
    const round = (x: number) => Math.round(x / 10) * 10
    return `${room.name}: heat ${round(room.heat)} of ${round(room.heatNeed)} kcal/h, cooling ${round(room.cool)} of ${round(room.coolNeed)} frig/h${room.radiant ? ', radiant floor' : ''}`
  }
  return null
}

/** The named indoor room under `p` on an editable layer of the floor shown, as an area ref. */
function roomAt(view: Plan, p: Vec): Ref | null {
  for (const layer of [...view.layers].reverse()) {
    if (!isEditable(layer)) continue
    const a = getPlacedAreas(layer).find((x) => x.region && !x.area.lot && x.region.indoor && pointInPolygon(p, x.region.outer) && !x.region.holes.some((h) => pointInPolygon(p, h)))
    if (a) return { layer: layer.id, kind: 'area', id: a.id }
  }
  return null
}

/**
 * The Select tool of the Plumbing and HVAC tabs: click a piece of the tab's equipment (Shift adds, or drag a box round
 * several), drag it to move it (it backs up to a wall where that suits it), `R` turns it, Delete removes it; click a
 * pipe to pick it (its material, a fixture's fittings); on HVAC, click inside a room to see its loads. The other tab's
 * pieces show faded and are not picked here. Hovering anything says what it is.
 */
export function createServicesSelectTool(ctx: ToolContext, tab: ServiceTab): Tool {
  const { store } = ctx
  let drag: { refs: Ref[]; start: Vec; moved: boolean; single?: Ref } | null = null
  let marquee: { from: Vec; to: Vec } | null = null
  let hover: Ref | null = null
  let info: { at: Vec; text: string } | null = null

  const onFloor = () => {
    const { plan, activeLayer } = store.getState()
    return storeyView(plan, activeLayer)
  }
  const storeyNow = () => {
    const { plan, activeLayer } = store.getState()
    return storeyOf(findLayer(plan, activeLayer))
  }
  const pick = (e: PointerInfo): Ref | null => {
    const hit = serviceAt(onFloor(), e.p, tab, HIT_VERTEX_PX * e.px)
    return hit ? { layer: hit.layer, kind: 'service', id: hit.id } : null
  }
  const runsOf = () => {
    const { plan } = store.getState()
    return tab === 'plumbing' ? getPlumbing(plan).runs : getHvac(plan).runs
  }
  const inspect = (e: PointerInfo) => {
    const { plan } = store.getState()
    const reach = HIT_VERTEX_PX * e.px
    const text = tab === 'plumbing' ? describePlumbing(getPlumbing(plan), storeyNow(), e.p, reach) : describeHvac(getHvac(plan), storeyNow(), e.p, reach)
    const next = text ? { at: e.p, text } : null
    if (next?.text !== info?.text || (next && info && dist(next.at, info.at) > 0)) {
      info = next
      ctx.redraw()
    }
  }

  return {
    cursor: () => (drag?.moved ? 'grabbing' : hover ? 'move' : 'default'),

    reset() {
      if (drag) store.cancelGesture()
      drag = null
      marquee = null
      hover = null
      info = null
    },

    down(e) {
      const target = pick(e)
      let refs = store.getState().selection.filter((r) => r.kind === 'service')
      if (!target) {
        // a pipe: it is worked out, so it is picked by its place in the tab's runs, not as a ref
        const runs = runsOf()
        const index = runAt(runs, storeyNow(), e.p, HIT_VERTEX_PX * e.px)
        if (index >= 0) {
          const run = runs[index]
          store.update({ selection: [], pipePick: { tab, kind: run.kind, index, to: run.to } })
          return
        }
        // on HVAC, a room: its loads and its radiant floor in the Selection section
        const room = tab === 'hvac' && !e.shift ? roomAt(onFloor(), e.p) : null
        if (room) {
          store.update({ selection: [room], pipePick: undefined })
          return
        }
        if (!e.shift) store.update({ selection: [], pipePick: undefined })
        marquee = { from: e.p, to: e.p }
        return
      }
      if (e.shift) {
        refs = refs.some((r) => sameRef(r, target)) ? refs.filter((r) => !sameRef(r, target)) : [...refs, target]
        store.select(refs)
        if (!refs.some((r) => sameRef(r, target))) return
      } else if (!refs.some((r) => sameRef(r, target))) {
        refs = [target]
        store.select(refs)
      }
      store.setActiveLayer(target.layer)
      drag = { refs, start: e.p, moved: false, single: refs.length === 1 ? refs[0] : undefined }
    },

    move(e) {
      if (marquee) {
        marquee.to = e.p
        ctx.redraw()
        return
      }
      if (!drag) {
        const h = pick(e)
        if (!sameRef(h, hover)) {
          hover = h
          ctx.redraw()
        }
        if (h) {
          if (info) ctx.redraw()
          info = null
        } else inspect(e)
        return
      }
      const delta = sub(e.p, drag.start)
      if (!drag.moved && len(delta) < DRAG_PX * e.px) return
      drag.moved = true
      info = null
      const { refs, single } = drag
      const snap = !e.alt && ctx.prefs().snap
      store.preview((base) => {
        // one piece on its own is re-targeted as when it was put down, so it backs up to the wall it is dragged to
        const s = single ? base.layers.find((l) => l.id === single.layer)?.services[single.id] : undefined
        if (single && s) {
          const at = { x: s.at.x + delta.x, y: s.at.y + delta.y }
          const target = serviceTarget(base, at, { kind: s.kind, width: s.width, depth: s.depth, angle: s.angle, layer: single.layer, reach: FURNITURE_REACH_M, snap, thickness: hostThickness })
          if (target) return updateService(base, single.layer, single.id, { ...s, at: target.at, angle: target.angle })
        }
        return moveServices(base, base, refs, delta)
      })
    },

    up() {
      if (marquee) {
        const box = boundsOf([marquee.from, marquee.to])
        if (box && (box.x1 - box.x0 > 0.01 || box.y1 - box.y0 > 0.01)) {
          store.select(servicesInBox(onFloor(), box, tab).map((s) => ({ layer: s.layer, kind: 'service' as const, id: s.id })))
        }
        marquee = null
        ctx.redraw()
        return
      }
      if (drag) store.endGesture()
      drag = null
    },

    cancel() {
      if (drag) store.cancelGesture()
      drag = null
      marquee = null
    },

    key(e) {
      const pieces = store.getState().selection.filter((r) => r.kind === 'service')
      if (e.key === 'Escape') {
        if (drag) store.cancelGesture()
        drag = null
        marquee = null
        store.update({ selection: [], pipePick: undefined })
        return true
      }
      // only the tab's own pieces are deleted here: a room picked on HVAC is the Floor tab's to delete
      if ((e.key === 'Delete' || e.key === 'Backspace') && !drag && pieces.length) {
        store.edit((plan) => deleteItems(plan, pieces))
        store.select([])
        return true
      }
      if (e.key.toLowerCase() === 'r' && pieces.length && !drag) {
        store.edit((plan) => turnServices(plan, pieces))
        return true
      }
      return false
    },

    overlay() {
      const selected = store.getState().selection
      return {
        hover: !drag && hover && !selected.some((r) => sameRef(r, hover)) ? hover : undefined,
        marquee: marquee ? (boundsOf([marquee.from, marquee.to]) ?? undefined) : undefined,
        tag: info && !drag ? { p: info.at, text: info.text } : undefined,
      }
    },
  }
}
