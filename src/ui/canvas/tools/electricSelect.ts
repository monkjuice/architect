import { setRoute, updateElectrical } from '../../../model/edit'
import { electricAt, electricTitle } from '../../../model/electrical'
import { add, closestOnSegment, cross, dist, dot, len, mul, sub, type Box, type Vec } from '../../../model/geometry'
import { findLayer, isEditable, sameRef, storeyOf, type Ref } from '../../../model/plan'
import { findSnap, type Snap } from '../../../model/snap'
import { circuitsOn, CIRCUIT_RULES, pointKey, type Circuit, type PointRef, type Run } from '../../../model/wiring'
import { deleteSelection, electricTargetAt, followCircuitOf, selectAllElectrical } from '../../../state/actions'
import { getWiring, storeyView } from '../../../state/derived'
import { DRAG_PX, HIT_SEGMENT_PX, HIT_VERTEX_PX, SNAP_PX, type PointerInfo, type Tool, type ToolContext } from './types'

type Drag =
  | { kind: 'box'; start: Vec; end: Vec; additive: boolean }
  | {
      /** A board or point: it snaps to a wall's face (or stays in a room) as it does when put down. */
      kind: 'item'
      layer: string
      id: string
      /** Where it was grabbed, from its position. */
      grab: Vec
      start: Vec
      moved: boolean
      problem?: string
      cursor?: Vec
      guides?: [Vec, Vec][]
    }
  | {
      /** A bend of a cable run, moved (it snaps to the plan's points and lines). */
      kind: 'bend'
      to: PointRef
      index: number
      base: Vec[]
      snap?: Snap
    }
  | {
      /** A stretch of a cable run, slid sideways; its ends at the boxes stay put. */
      kind: 'stretch'
      to: PointRef
      index: number
      base: Vec[]
      start: Vec
      moved: boolean
    }

const boxOf = (a: Vec, b: Vec): Box => ({ x0: Math.min(a.x, b.x), y0: Math.min(a.y, b.y), x1: Math.max(a.x, b.x), y1: Math.max(a.y, b.y) })

/** A run's way without repeated points or bends that do not turn; its ends stay. */
function simplify(pts: readonly Vec[]): Vec[] {
  const out: Vec[] = []
  for (const p of pts) {
    if (out.length && dist(out[out.length - 1], p) < 1e-4) continue
    const n = out.length
    if (n >= 2) {
      const [a, b] = [out[n - 2], out[n - 1]]
      if (Math.abs(cross(sub(b, a), sub(p, b))) < 1e-6 && dot(sub(b, a), sub(p, b)) > 0) {
        out[n - 1] = p
        continue
      }
    }
    out.push(p)
  }
  return out
}

/**
 * The Electricity tab's Select: click a board or point (Shift adds, or drag a box) to set it in the Electricity
 * section, drag it along its wall or to another; click a cable run to select the point it feeds, then drag a stretch of
 * it sideways or a bend of it anywhere to run it another way (its way is then kept as drawn). Delete removes.
 */
export function createElectricSelectTool(ctx: ToolContext): Tool {
  const { store } = ctx
  let drag: Drag | null = null
  let hover: Ref | null = null
  let hoverRun: { run: Run; circuit: Circuit } | null = null
  let cursor: Vec | null = null

  const floor = () => {
    const { plan, activeLayer } = store.getState()
    return storeyView(plan, activeLayer)
  }
  const editable = (layer: string) => isEditable(findLayer(store.getState().plan, layer))

  /** The circuits drawn on the canvas: the active layer's, or with All layers every one on its floor. */
  const shown = (): Circuit[] => {
    const { plan, activeLayer } = store.getState()
    return circuitsOn(getWiring(plan), storeyOf(findLayer(plan, activeLayer)), ctx.prefs().wiringAll ? null : activeLayer)
  }

  const itemAt = (e: PointerInfo): Ref | null => {
    const hit = electricAt(floor(), e.p, Math.max(HIT_VERTEX_PX * e.px, 0.12))
    return hit && { layer: hit.layer, kind: 'electrical', id: hit.id }
  }

  /** The runs into the selected points, on editable layers. */
  const selectedRuns = (): Run[] => {
    const keys = new Set(store.getState().selection.filter((r) => r.kind === 'electrical').map((r) => pointKey(r)))
    return shown().flatMap((c) => c.runs.filter((r) => keys.has(pointKey(r.to)) && editable(r.to.layer)))
  }

  const bendAt = (e: PointerInfo): { run: Run; index: number } | null => {
    for (const run of selectedRuns()) {
      for (let i = 1; i < run.path.length - 1; i++) if (dist(run.path[i], e.p) <= HIT_VERTEX_PX * e.px) return { run, index: i }
    }
    return null
  }

  const runAt = (e: PointerInfo): { run: Run; circuit: Circuit; index: number } | null => {
    let best: { run: Run; circuit: Circuit; index: number; d: number } | null = null
    for (const circuit of shown()) {
      for (const run of circuit.runs) {
        for (let i = 1; i < run.path.length; i++) {
          const d = closestOnSegment(e.p, run.path[i - 1], run.path[i]).dist
          if (d <= HIT_SEGMENT_PX * e.px && (!best || d < best.d)) best = { run, circuit, index: i - 1, d }
        }
      }
    }
    return best
  }

  /** Selects `target`, or with Shift adds it or takes it out; true when it ends up selected. */
  const pick = (target: Ref, shift: boolean): boolean => {
    const selection = store.getState().selection.filter((r) => r.kind === 'electrical')
    if (shift) {
      const next = selection.some((r) => sameRef(r, target)) ? selection.filter((r) => !sameRef(r, target)) : [...selection, target]
      store.select(next)
      if (!next.some((r) => sameRef(r, target))) return false
    } else if (!selection.some((r) => sameRef(r, target))) store.select([target])
    store.setActiveLayer(target.layer)
    // a point's circuit becomes the one new points of its kind go on
    if (store.getState().selection.length === 1) followCircuitOf(target)
    return true
  }

  /** The run's way with stretch `index` slid by `delta` across it; a stretch ending at a box gets a bend there first. */
  const stretched = (base: readonly Vec[], index: number, delta: Vec): Vec[] => {
    const pts = base.map((p) => ({ ...p }))
    const along = sub(base[index + 1], base[index])
    const l = len(along)
    const move = l < 1e-9 ? delta : mul({ x: -along.y / l, y: along.x / l }, dot(delta, { x: -along.y / l, y: along.x / l }))
    let [a, b] = [index, index + 1]
    if (a === 0) {
      pts.splice(1, 0, { ...pts[0] })
      ;[a, b] = [1, 2]
    }
    if (b === pts.length - 1) pts.splice(b, 0, { ...pts[b] })
    pts[a] = add(pts[a], move)
    pts[b] = add(pts[b], move)
    return pts
  }

  const reroute = (to: PointRef, pts: readonly Vec[]) => {
    const way = simplify(pts)
    store.preview((base) => setRoute(base, to.layer, to.id, way.slice(1, -1)))
  }

  return {
    cursor: () => (drag?.kind === 'item' && drag.moved ? 'grabbing' : hover || hoverRun ? 'move' : 'default'),

    reset() {
      if (drag && drag.kind !== 'box') store.cancelGesture()
      drag = null
      hover = null
      hoverRun = null
    },

    down(e) {
      cursor = e.p
      const bend = bendAt(e)
      if (bend) {
        drag = { kind: 'bend', to: bend.run.to, index: bend.index, base: bend.run.path }
        return
      }
      const item = itemAt(e)
      if (item) {
        if (!pick(item, e.shift)) return
        const e0 = findLayer(store.getState().plan, item.layer)?.electrical[item.id]
        if (e0 && store.getState().selection.length === 1) drag = { kind: 'item', layer: item.layer, id: item.id, grab: sub(e.p, e0.at), start: e.p, moved: false }
        return
      }
      const run = runAt(e)
      if (run) {
        const target: Ref = { layer: run.run.to.layer, kind: 'electrical', id: run.run.to.id }
        if (pick(target, e.shift) && editable(target.layer)) drag = { kind: 'stretch', to: run.run.to, index: run.index, base: run.run.path, start: e.p, moved: false }
        return
      }
      if (!e.shift) store.select([])
      drag = { kind: 'box', start: e.p, end: e.p, additive: e.shift }
    },

    move(e) {
      cursor = e.p
      if (!drag) {
        const h = itemAt(e)
        const r = h ? null : runAt(e)
        const runChanged = (r?.run ?? null) !== (hoverRun?.run ?? null)
        hoverRun = r && { run: r.run, circuit: r.circuit }
        const next: Ref | null = h ?? (r ? { layer: r.run.to.layer, kind: 'electrical', id: r.run.to.id } : null)
        if (!sameRef(next, hover) || runChanged || r) {
          hover = next
          ctx.redraw()
        }
        return
      }
      if (drag.kind === 'box') {
        drag.end = e.p
        ctx.redraw()
        return
      }
      if (drag.kind === 'bend') {
        const snap = findSnap(storeyView(store.getState().plan, store.getState().activeLayer), e.p, { reach: SNAP_PX * e.px, enabled: !e.alt && ctx.prefs().snap })
        drag.snap = snap
        const { index } = drag
        reroute(drag.to, drag.base.map((p, i) => (i === index ? snap.point : p)))
        return
      }
      const delta = sub(e.p, drag.start)
      if (!drag.moved && len(delta) < DRAG_PX * e.px) return
      drag.moved = true
      if (drag.kind === 'stretch') {
        reroute(drag.to, stretched(drag.base, drag.index, delta))
        return
      }
      const { layer, id, grab } = drag
      const item = findLayer(store.getState().plan, layer)?.electrical[id]
      if (!item) return
      const target = electricTargetAt(item.kind, sub(e.p, grab), !e.alt && ctx.prefs().snap, item.mount, { snapReach: SNAP_PX * e.px, ignore: { layer, id } })
      drag.cursor = e.p
      drag.problem = target?.problem
      drag.guides = target?.guides
      if (!target || target.problem) {
        ctx.redraw()
        return
      }
      store.preview((base) => {
        const now = findLayer(base, layer)?.electrical[id]
        return now ? updateElectrical(base, layer, id, { ...now, at: target.at, angle: item.mount === 'wall' ? target.angle : now.angle }) : base
      })
    },

    up(e) {
      const d = drag
      drag = null
      if (!d) return
      if (d.kind === 'box') {
        const box = boxOf(d.start, d.end)
        if (Math.max(box.x1 - box.x0, box.y1 - box.y0) < DRAG_PX * e.px) return ctx.redraw()
        const inside = floor().layers.flatMap((layer) =>
          isEditable(layer)
            ? Object.entries(layer.electrical).flatMap(([id, x]) =>
                x.at.x >= box.x0 && x.at.x <= box.x1 && x.at.y >= box.y0 && x.at.y <= box.y1 ? [{ layer: layer.id, kind: 'electrical' as const, id }] : [],
              )
            : [],
        )
        const { selection } = store.getState()
        store.select(d.additive ? [...selection, ...inside.filter((r) => !selection.some((c) => sameRef(c, r)))] : inside)
        ctx.redraw()
        return
      }
      if (d.kind === 'bend' || d.moved) store.endGesture()
      ctx.redraw()
    },

    cancel() {
      if (drag && drag.kind !== 'box') store.cancelGesture()
      drag = null
    },

    key(e) {
      const mod = e.ctrlKey || e.metaKey
      if (e.key === 'Escape') {
        if (drag && drag.kind !== 'box') store.cancelGesture()
        drag = null
        store.select([])
        return true
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && !drag) {
        deleteSelection()
        return true
      }
      if (mod && e.key.toLowerCase() === 'a') {
        selectAllElectrical()
        return true
      }
      return false
    },

    overlay() {
      const { plan, selection } = store.getState()
      if (drag?.kind === 'item' && drag.problem && drag.cursor) return { tag: { p: drag.cursor, text: drag.problem, style: 'warning' } }
      if (drag?.kind === 'item' && drag.moved) return { lines: (drag.guides ?? []).map(([a, b]) => ({ a, b, style: 'guide' as const })) }
      const handles = drag && drag.kind !== 'bend' && drag.kind !== 'stretch' ? [] : selectedRuns().flatMap((r) => r.path.slice(1, -1).map((p) => ({ p, style: 'handle' as const })))
      let tag: { p: Vec; text: string } | undefined
      if (!drag && cursor && hoverRun) {
        const { run, circuit: c } = hoverRun
        const to = findLayer(plan, run.to.layer)?.electrical[run.to.id]
        const what = to?.kind === 'board' ? to.name : to ? electricTitle(to).toLowerCase() : 'a point'
        tag = {
          p: cursor,
          text: `${c.name}${c.label ? ` ${c.label}` : ''} · ${CIRCUIT_RULES[c.type].title.toLowerCase()} · ${c.section} mm² · to ${what}: ${run.length.toFixed(1)} m${run.manual ? ' (drawn)' : ''}`,
        }
      }
      return {
        hover: !drag && hover && !selection.some((r) => sameRef(r, hover)) ? hover : undefined,
        marquee: drag?.kind === 'box' ? boxOf(drag.start, drag.end) : undefined,
        snap: drag?.kind === 'bend' && drag.snap?.kind !== 'free' ? drag.snap : undefined,
        points: handles,
        tag,
      }
    },
  }
}
