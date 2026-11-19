import { boundsOf, closestOnSegment, dist, len, sub, type Vec } from '../../../model/geometry'
import { FURNITURE_REACH_M } from '../../../model/furniture'
import { deleteItems, moveServices, setRoutes, turnServices, updateService } from '../../../model/edit'
import { applianceAt, gasSizeLabel, type GasPlan } from '../../../model/gas'
import type { HvacPlan } from '../../../model/hvac'
import { findLayer, isEditable, sameRef, storeyOf, type Plan, type Ref } from '../../../model/plan'
import { DRAIN, type PlumbingPlan } from '../../../model/plumbing'
import { pointInPolygon } from '../../../model/regions'
import { findRun, movedRoutes, runAt, TREE_KINDS } from '../../../model/routing'
import { serviceAt, servicesInBox, serviceTarget, type ServiceTab } from '../../../model/services'
import { getGas, getHvac, getPlacedAreas, getPlumbing, hostThickness, storeyView } from '../../../state/derived'
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

/**
 * What is under the cursor on the gas plan: a piece of the tab's own (a meter, cylinders, an outlet), an appliance
 * with what it burns (the other tabs' faded), a room's vents, a flue, a riser, or a pipe with its size and the gas
 * through it.
 */
export function describeGas(g: GasPlan, storey: number, at: Vec, reach: number): string | null {
  for (const e of g.pieces) {
    if (e.storey !== storey) continue
    const q = sub(at, e.at)
    if (Math.abs(q.x) > e.placed.width / 2 + reach || Math.abs(q.y) > e.placed.depth / 2 + reach) continue
    if (e.kind === 'gas-outlet') break
    if (e.kind === 'gas-valve') {
      const run = g.runs.find((r) => r.to && r.to.layer === e.ref.layer && r.to.id === e.ref.id)
      return `Shut-off valve${e.room ? ` (${e.room})` : ''}${e.service.reserve ? `, ${e.service.reserve} kcal/h kept for later` : ''}${run ? `: ${gasSizeLabel(run.size, run.material)} to it, ${run.flow.toFixed(2)} m³/h` : ''}`
    }
    return `${e.info.title}${e.specText ? `, ${e.specText}` : ''}${e.room ? ` (${e.room})` : ''}`
  }
  const a = applianceAt(g, storey, at, reach)
  if (a) {
    const tab = a.from === 'floor' ? 'the Floor tab' : a.from === 'gas' ? '' : a.from === 'hvac' ? 'the HVAC tab' : 'the Plumbing tab'
    if (a.electric) return `${a.title}${a.room ? ` (${a.room})` : ''}: electric, not piped · click to put it back on gas`
    const how = [a.open && 'takes its air from the room', a.flue && 'its flue rises past the roof'].filter(Boolean).join('; ')
    return `${a.title}${a.room ? ` (${a.room})` : ''}: burns ${Math.round(a.burns / 100) * 100} kcal/h${how ? `; ${how}` : ''}${tab ? ` — put down on ${tab}` : ''}`
  }
  if (!storey) for (const e of g.entries) if (dist(e.at, at) <= reach * 1.5) return `Entry: the pipe goes in here through the wall, in a sleeve, for ${e.feeds.join(', ').toLowerCase()}${e.rooms.length ? ` (${e.rooms.join(', ')})` : ''}`
  for (const v of g.vents) if (v.storey === storey && dist(v.at, at) <= reach * 1.5) return `${v.count} permanent vents${v.room ? ` in ${v.room}` : ''}, one low and one high, for the ${v.for.join(' and ')}`
  for (const f of g.flues) {
    if (f.storey !== storey || dist(f.at, at) > reach * 1.5) continue
    return f.kind === 'balanced-wall' ? 'Balanced-flue terminal through the wall; final clearances require professional verification' : `Indicative open flue: ${f.length.toFixed(2)} m to its terminal`
  }
  for (const r of g.risers) if ((r.to === storey || r.from === storey) && dist(r.at, at) <= reach) return `Gas riser between the ground floor and floor ${r.to}`
  const i = runAt(g.runs, storey, at, reach)
  if (i < 0) return null
  const r = g.runs[i]
  return `${gasSizeLabel(r.size, r.material)} gas pipe: ${r.length.toFixed(2)} m${r.rise > 0 ? ` + ${r.rise.toFixed(2)} m up` : ''}, ${r.flow.toFixed(2)} m³/h through it${r.outdoor > 0.05 ? `, ${r.outdoor.toFixed(2)} m buried outside` : ''}`
}

/** The stretch of a path nearest `p`, by index. */
function stretchAt(path: readonly Vec[], p: Vec): number {
  let best = { i: 0, d: Infinity }
  for (let i = 0; i + 1 < path.length; i++) {
    const d = closestOnSegment(p, path[i], path[i + 1]).dist
    if (d < best.d) best = { i, d }
  }
  return best.i
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
 * The Select tool of the Plumbing, HVAC and Gas tabs: click a piece of the tab's equipment (Shift adds, or drag a box
 * round several), drag it to move it (it backs up to a wall where that suits it), `R` turns it, Delete removes it;
 * click a pipe to pick it (its material, a fixture's fittings); on HVAC, click inside a room to see its loads; on Gas,
 * click a cooker to choose its fuel, or another tab's appliance to pick the pipe to it. The other tabs' pieces show
 * faded and are not picked here. Hovering anything says what it is.
 */
export function createServicesSelectTool(ctx: ToolContext, tab: ServiceTab): Tool {
  const { store } = ctx
  let drag: { refs: Ref[]; start: Vec; moved: boolean; single?: Ref } | null = null
  /** A pipe's stretch being dragged across: the run and stretch, where the drag started, and the stretch's direction. */
  let pipeDrag: { index: number; stretch: number; start: Vec; along: Vec; moved: boolean } | null = null
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
  const runsOf = (plan = store.getState().plan) => (tab === 'plumbing' ? getPlumbing(plan).runs : tab === 'hvac' ? getHvac(plan).runs : getGas(plan).runs)
  /** A plan with run `index`'s stretch moved across by `delta`: the routes that makes, set by hand (routing.ts, movedRoutes). */
  const moveStretch = (plan: Plan, index: number, stretch: number, delta: Vec): Plan => {
    const runs = runsOf(plan)
    const run = runs[index]
    if (!run) return plan
    return setRoutes(plan, tab, movedRoutes(runs, index, stretch, delta, TREE_KINDS.includes(run.kind)))
  }
  /** Whether a run can be moved by hand: not a drain main (routed from the traps to the chamber and on, automatically). */
  const movable = (run: { kind: string; to?: Ref; ends?: Ref[] }) => TREE_KINDS.includes(run.kind) ? !!(run.to || run.ends?.length) : !!run.to
  const inspect = (e: PointerInfo) => {
    const { plan } = store.getState()
    const reach = HIT_VERTEX_PX * e.px
    const text =
      tab === 'plumbing'
        ? describePlumbing(getPlumbing(plan), storeyNow(), e.p, reach)
        : tab === 'hvac'
          ? describeHvac(getHvac(plan), storeyNow(), e.p, reach)
          : describeGas(getGas(plan), storeyNow(), e.p, reach)
    const next = text ? { at: e.p, text } : null
    if (next?.text !== info?.text || (next && info && dist(next.at, info.at) > 0)) {
      info = next
      ctx.redraw()
    }
  }

  return {
    cursor: () => (drag?.moved || pipeDrag?.moved ? 'grabbing' : hover ? 'move' : 'default'),

    reset() {
      if (drag || pipeDrag?.moved) store.cancelGesture()
      drag = null
      pipeDrag = null
      marquee = null
      hover = null
      info = null
    },

    down(e) {
      const target = pick(e)
      let refs = store.getState().selection.filter((r) => r.kind === 'service')
      if (!target) {
        const runs = runsOf()
        // on Gas, an appliance clicked inside its footprint, before the pipe that ends in it: a cooker's fuel in the
        // Selection section; another tab's piece, the pipe to it
        const appliance = tab === 'gas' && !e.shift ? applianceAt(getGas(store.getState().plan), storeyNow(), e.p, 0) : undefined
        if (appliance?.ref.kind === 'furniture') {
          store.update({ selection: [appliance.ref], pipePick: undefined })
          return
        }
        const toAppliance = appliance ? runs.findIndex((r) => r.to && sameRef(r.to, appliance.ref)) : -1
        if (appliance && toAppliance >= 0) {
          store.update({ selection: [], pipePick: { tab, kind: runs[toAppliance].kind, index: toAppliance, to: appliance.ref } })
          return
        }
        // a pipe: it is worked out, so it is picked by its place in the tab's runs, not as a ref; the stretch under the
        // pointer can be dragged across (a route set by hand)
        const index = runAt(runs, storeyNow(), e.p, HIT_VERTEX_PX * e.px)
        if (index >= 0) {
          const run = runs[index]
          const stretch = stretchAt(run.path, e.p)
          store.update({ selection: [], pipePick: { tab, kind: run.kind, index, to: run.to, stretch } })
          const [a, b] = [run.path[stretch], run.path[stretch + 1]]
          const l = Math.hypot(b.x - a.x, b.y - a.y) || 1
          if (movable(run)) pipeDrag = { index, stretch, start: e.p, along: { x: (b.x - a.x) / l, y: (b.y - a.y) / l }, moved: false }
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
      if (pipeDrag) {
        // across the stretch only, by 5 cm steps (Alt: freely)
        const d = sub(e.p, pipeDrag.start)
        const n = { x: -pipeDrag.along.y, y: pipeDrag.along.x }
        let across = d.x * n.x + d.y * n.y
        if (!e.alt) across = Math.round(across / 0.05) * 0.05
        if (!pipeDrag.moved && Math.abs(across) < 1e-9) return
        pipeDrag.moved = true
        const { index, stretch } = pipeDrag
        store.preview((base) => moveStretch(base, index, stretch, { x: n.x * across, y: n.y * across }))
        return
      }
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
      if (pipeDrag) {
        if (pipeDrag.moved) store.endGesture()
        pipeDrag = null
        return
      }
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
      if (drag || pipeDrag?.moved) store.cancelGesture()
      drag = null
      pipeDrag = null
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
      // a picked pipe's stretch nudged across with the arrow keys: 5 cm, 25 cm with Shift
      const pick = store.getState().pipePick
      if (e.key.startsWith('Arrow') && pick?.tab === tab && pick.stretch !== undefined && !drag) {
        const runs = runsOf()
        const index = findRun(runs, pick)
        const run = runs[index]
        if (!run || !movable(run) || pick.stretch + 1 >= run.path.length) return false
        const [a, b] = [run.path[pick.stretch], run.path[pick.stretch + 1]]
        const across = Math.abs(b.x - a.x) >= Math.abs(b.y - a.y) ? 'y' : 'x'
        const step = e.shiftKey ? 0.25 : 0.05
        const delta =
          across === 'y'
            ? e.key === 'ArrowUp' ? { x: 0, y: -step } : e.key === 'ArrowDown' ? { x: 0, y: step } : null
            : e.key === 'ArrowLeft' ? { x: -step, y: 0 } : e.key === 'ArrowRight' ? { x: step, y: 0 } : null
        if (!delta) return true
        const l = Math.hypot(b.x - a.x, b.y - a.y) || 1
        const n = { x: -(b.y - a.y) / l, y: (b.x - a.x) / l }
        const k = delta.x * n.x + delta.y * n.y
        store.edit((plan) => moveStretch(plan, index, pick.stretch!, { x: n.x * k, y: n.y * k }))
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
