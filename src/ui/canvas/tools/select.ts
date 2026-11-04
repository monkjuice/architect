import { connectVertex, moveFurniture, segmentsAt, setAreaAnchors, setVertices, turnFurniture, updateFurniture, updateOpening } from '../../../model/edit'
import {
  FURNITURE_REACH_M,
  furnitureAt,
  furnitureInBox,
  furnitureTarget,
  hasShower,
  infoOf,
  isCorner,
  placeFurniture,
  showerAt,
  showerPoint,
  type FurnitureTarget,
} from '../../../model/furniture'
import { openingAt, openingTarget, type OpeningTarget } from '../../../model/openings'
import { add, constrainAngle, dist, len, sub, type Box, type Vec } from '../../../model/geometry'
import { areasInBox, hitTest, segmentsInBox, selectedVertices } from '../../../model/pick'
import { findLayer, isEditable, sameRef, type Plan, type Ref } from '../../../model/plan'
import { pointInPolygon } from '../../../model/regions'
import { findSnap, type Snap } from '../../../model/snap'
import { deleteSelection, selectAll } from '../../../state/actions'
import { drawnHalfWidth, getPlacedAreas, hostThickness, type PlacedArea } from '../../../state/derived'
import { areaLabelAt } from '../areas'
import { openingOverlay } from './opening'
import { DRAG_PX, HIT_SEGMENT_PX, HIT_VERTEX_PX, SNAP_PX, WALL_REACH_PX, type PointerInfo, type Tool, type ToolContext } from './types'

type Positions = Map<string, Map<string, Vec>>

type Drag =
  | {
      kind: 'box'
      start: Vec
      end: Vec
      additive: boolean
      /** The named area the press was inside: a click without dragging selects it. */
      inside?: Ref
    }
  | {
      kind: 'move'
      start: Vec
      moved: boolean
      /** Start positions of every vertex and area point that moves, by layer. */
      vertices: Positions
      anchors: Positions
      /** A lone vertex being dragged: it snaps, and connects where it is dropped. */
      single?: { layer: string; id: string; origin: Vec }
      snap?: Snap
      /** A lone area label being dragged: it settles in whichever region it is dropped in. */
      label?: { layer: string; id: string }
      /** Furniture that moves along with the rest (a kitchen sink goes with its counter). */
      furniture: Ref[]
    }
  | {
      /** A lone piece of furniture: it snaps as it does when put down (to a wall, into a counter, to a table). */
      kind: 'furniture'
      layer: string
      id: string
      /** Where it was grabbed, from its centre. */
      grab: Vec
      start: Vec
      moved: boolean
      target?: FurnitureTarget
    }
  | {
      /** A bathtub's or a shower's head, moved round its rim. */
      kind: 'shower'
      layer: string
      id: string
      moved: boolean
    }
  | {
      /** A door or window sliding along its wall, or onto another wall of its layer. */
      kind: 'opening'
      layer: string
      id: string
      start: Vec
      moved: boolean
      target?: OpeningTarget
      cursor?: Vec
    }

const boxOf = (a: Vec, b: Vec): Box => ({ x0: Math.min(a.x, b.x), y0: Math.min(a.y, b.y), x1: Math.max(a.x, b.x), y1: Math.max(a.y, b.y) })

const editableAreas = (plan: Plan): PlacedArea[] => plan.layers.filter(isEditable).flatMap(getPlacedAreas)

const areaRef = (a: PlacedArea): Ref => ({ layer: a.layer.id, kind: 'area', id: a.id })

const moved = (origins: Positions, delta: Vec): Positions =>
  new Map([...origins].map(([layer, items]) => [layer, new Map([...items].map(([id, o]) => [id, add(o, delta)]))]))

/**
 * Click or drag a box to select; drag to move what is selected. A single point snaps while dragged and,
 * dropped on a point or line of its own layer, connects to it. An area is picked by its label, or by
 * clicking inside it; its label always sits at the middle of the region its point is in, so dragging the label
 * into another room moves the area there. Shift adds to the selection or keeps a move at 45° steps; Alt turns
 * snapping off.
 */
export function createSelectTool(ctx: ToolContext): Tool {
  const { store } = ctx
  let drag: Drag | null = null
  let hover: Ref | null = null

  /** A selected bathtub or shower whose shower head is under the cursor. */
  const showerHandle = (e: PointerInfo): { layer: string; id: string } | null => {
    const { plan, selection } = store.getState()
    for (const r of selection) {
      const layer = r.kind === 'furniture' ? findLayer(plan, r.layer) : undefined
      const f = isEditable(layer) ? layer.furniture[r.id] : undefined
      const pl = f && hasShower(f) ? placeFurniture(layer!, f) : null
      if (f && hasShower(f) && pl && dist(showerPoint(pl, f.shower, isCorner(f)), e.p) <= Math.max(HIT_VERTEX_PX * e.px, 0.08)) return { layer: r.layer, id: r.id }
    }
    return null
  }

  /** Area labels sit on top, so they win; then points, doors and windows, furniture, and lines. */
  const hit = (e: PointerInfo): Ref | null => {
    const { plan, activeLayer } = store.getState()
    const { areaNames, areaSizes } = ctx.prefs()
    const label = areaLabelAt(editableAreas(plan), e.p, e.px, { name: areaNames, size: areaSizes })
    if (label) return areaRef(label)
    const vertex = hitTest(plan, e.p, activeLayer, HIT_VERTEX_PX * e.px, 0)
    if (vertex) return vertex
    const opening = openingAt(plan, e.p, HIT_SEGMENT_PX * e.px, (layer, segment) => hostThickness(layer, segment) / 2)
    if (opening) return { layer: opening.layer, kind: 'opening', id: opening.id }
    const piece = furnitureAt(plan, e.p)
    if (piece) return { layer: piece.layer, kind: 'furniture', id: piece.id }
    return hitTest(plan, e.p, activeLayer, 0, HIT_SEGMENT_PX * e.px, drawnHalfWidth)
  }

  /** The smallest named area whose region contains `p`. */
  const areaAround = (p: Vec): Ref | undefined => {
    let best: PlacedArea | undefined
    for (const a of editableAreas(store.getState().plan)) {
      const r = a.region
      if (!r || !pointInPolygon(p, r.outer) || r.holes.some((h) => pointInPolygon(p, h))) continue
      if (!best || r.area < best.region!.area) best = a
    }
    return best && areaRef(best)
  }

  return {
    cursor: () => (drag?.kind === 'move' ? 'grabbing' : hover ? 'move' : 'default'),

    reset() {
      if (drag && drag.kind !== 'box') store.cancelGesture()
      drag = null
      hover = null
    },

    down(e) {
      const { plan, selection } = store.getState()
      const shower = showerHandle(e)
      if (shower) {
        drag = { kind: 'shower', ...shower, moved: false }
        return
      }
      const target = hit(e)
      if (!target) {
        if (!e.shift) store.select([])
        drag = { kind: 'box', start: e.p, end: e.p, additive: e.shift, inside: areaAround(e.p) }
        return
      }
      let refs = selection
      if (e.shift) {
        refs = selection.some((r) => sameRef(r, target)) ? selection.filter((r) => !sameRef(r, target)) : [...selection, target]
        store.select(refs)
        if (!refs.some((r) => sameRef(r, target))) return
      } else if (!selection.some((r) => sameRef(r, target))) {
        refs = [target]
        store.select(refs)
      }
      store.setActiveLayer(target.layer)
      if (target.kind === 'opening' && refs.length === 1) {
        drag = { kind: 'opening', layer: target.layer, id: target.id, start: e.p, moved: false }
        return
      }
      if (target.kind === 'furniture' && refs.length === 1) {
        const layer = findLayer(plan, target.layer)!
        const at = placeFurniture(layer, layer.furniture[target.id])!.at
        drag = { kind: 'furniture', layer: target.layer, id: target.id, grab: sub(e.p, at), start: e.p, moved: false }
        return
      }
      const vertices: Positions = new Map()
      for (const [layerId, ids] of selectedVertices(plan, refs)) {
        const layer = findLayer(plan, layerId)!
        vertices.set(layerId, new Map([...ids].map((id) => [id, layer.vertices[id]])))
      }
      const anchors: Positions = new Map()
      for (const r of refs) {
        const layer = findLayer(plan, r.layer)
        if (r.kind !== 'area' || !isEditable(layer)) continue
        if (!anchors.has(r.layer)) anchors.set(r.layer, new Map())
        anchors.get(r.layer)!.set(r.id, layer.areas[r.id].at)
      }
      const lone = refs.length === 1
      drag = {
        kind: 'move',
        start: e.p,
        moved: false,
        vertices,
        anchors,
        single: lone && target.kind === 'vertex' ? { layer: target.layer, id: target.id, origin: findLayer(plan, target.layer)!.vertices[target.id] } : undefined,
        label: lone && target.kind === 'area' ? { layer: target.layer, id: target.id } : undefined,
        furniture: refs.filter((r) => r.kind === 'furniture'),
      }
    },

    move(e) {
      if (!drag) {
        const h = hit(e)
        if (!sameRef(h, hover)) {
          hover = h
          ctx.redraw()
        }
        return
      }
      if (drag.kind === 'box') {
        drag.end = e.p
        ctx.redraw()
        return
      }
      if (drag.kind === 'shower') {
        const { layer, id } = drag
        drag.moved = true
        store.preview((base) => {
          const l = findLayer(base, layer)!
          const f = l.furniture[id]
          const pl = f && hasShower(f) ? placeFurniture(l, f) : null
          return f && hasShower(f) && pl ? updateFurniture(base, layer, id, { ...f, shower: showerAt(pl, e.p, isCorner(f)) }) : base
        })
        return
      }
      let delta = sub(e.p, drag.start)
      if (!drag.moved && len(delta) < DRAG_PX * e.px) return
      drag.moved = true
      if (drag.kind === 'furniture') {
        const { layer, id, grab } = drag
        const f = findLayer(store.getState().plan, layer)?.furniture[id]
        if (!f) return
        const info = infoOf(f)
        // a kitchen sink follows the cursor along its counter; everything else is carried by where it was grabbed
        const p = 'at' in f ? sub(e.p, grab) : e.p
        const target = furnitureTarget(store.getState().plan, p, {
          kind: f.kind,
          style: info.style,
          width: f.width,
          depth: f.depth,
          angle: 'angle' in f ? f.angle : 0,
          layer,
          reach: FURNITURE_REACH_M,
          snap: !e.alt && ctx.prefs().snap,
          thickness: hostThickness,
          ignore: id,
        })
        drag.target = target ?? undefined
        if (!target || target.problem) {
          ctx.redraw()
          return
        }
        store.preview((base) => {
          const g = findLayer(base, layer)?.furniture[id]
          if (!g) return base
          return updateFurniture(base, layer, id, 'at' in g ? { ...g, at: target.at, angle: target.angle } : { ...g, counter: target.counter!, offset: target.offset! })
        })
        return
      }
      if (drag.kind === 'opening') {
        const { layer, id } = drag
        const { plan, activeLayer } = store.getState()
        const o = findLayer(plan, layer)?.openings[id]
        if (!o) return
        const target = openingTarget(plan, e.p, {
          reach: WALL_REACH_PX * e.px,
          snapReach: SNAP_PX * e.px,
          width: o.width,
          activeLayer,
          layer,
          snap: !e.alt && ctx.prefs().snap,
          ignore: id,
          halfWidth: drawnHalfWidth,
          kind: o.kind,
        })
        drag.target = target ?? undefined
        drag.cursor = e.p
        if (target && !target.problem) store.preview((base) => updateOpening(base, layer, id, { segment: target.segment, offset: target.offset }))
        ctx.redraw()
        return
      }
      const { single, vertices, anchors, furniture } = drag
      if (single) {
        const layer = findLayer(store.getState().plan, single.layer)!
        const snap = findSnap(store.getState().plan, add(single.origin, delta), {
          reach: SNAP_PX * e.px,
          from: single.origin,
          constrain: e.shift,
          enabled: !e.alt && ctx.prefs().snap,
          skipVertices: new Set([`${single.layer}:${single.id}`]),
          skipSegments: new Set(segmentsAt(layer, single.id).map((id) => `${single.layer}:${id}`)),
        })
        drag.snap = snap
        store.preview((base) => setVertices(base, new Map([[single.layer, new Map([[single.id, snap.point]])]])))
        return
      }
      if (e.shift) delta = constrainAngle({ x: 0, y: 0 }, delta).point
      const d = delta
      store.preview((base) => moveFurniture(setAreaAnchors(setVertices(base, moved(vertices, d)), moved(anchors, d)), base, furniture, d))
    },

    up(e) {
      const d = drag
      drag = null
      if (!d) return
      if (d.kind === 'box') {
        const box = boxOf(d.start, d.end)
        if (Math.max(box.x1 - box.x0, box.y1 - box.y0) >= DRAG_PX * e.px) {
          const { plan, selection } = store.getState()
          const inside = [...segmentsInBox(plan, box), ...areasInBox(plan, box), ...furnitureInBox(plan, box).map((f) => ({ ...f, kind: 'furniture' as const }))]
          store.select(d.additive ? [...selection, ...inside.filter((r) => !selection.some((c) => sameRef(c, r)))] : inside)
        } else if (d.inside) {
          store.select(d.additive ? [...store.getState().selection, d.inside] : [d.inside])
          store.setActiveLayer(d.inside.layer)
        }
        ctx.redraw()
        return
      }
      if (!d.moved) return
      if (d.kind === 'opening' || d.kind === 'furniture' || d.kind === 'shower') {
        store.endGesture()
        ctx.redraw()
        return
      }
      if (d.single && d.snap) {
        const { single, snap } = d
        const result = connectVertex(store.getState().plan, single.layer, single.id, snap)
        if (result.vertex !== single.id) {
          store.preview(() => result.plan)
          store.select([{ layer: single.layer, kind: 'vertex', id: result.vertex }])
        }
      }
      if (d.label) {
        // settle the point where the label shows, the middle of the region it was dropped in
        const { layer, id } = d.label
        const all = getPlacedAreas(findLayer(store.getState().plan, layer)!)
        const placed = all.find((a) => a.id === id)
        const taken = placed?.region && all.find((a) => a.id !== id && a.region === placed.region)
        if (taken) {
          store.cancelGesture()
          store.notify({ kind: 'error', text: `That region is already "${taken.area.name}": one area per region.` })
          return
        }
        if (placed?.region) {
          const at = placed.label
          store.preview((base) => setAreaAnchors(base, new Map([[layer, new Map([[id, at]])]])))
        }
      }
      store.endGesture()
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
      const pieces = store.getState().selection.filter((r) => r.kind === 'furniture')
      if (e.key.toLowerCase() === 'r' && !mod && !drag && pieces.length) {
        store.edit((plan) => turnFurniture(plan, pieces))
        return true
      }
      if (mod && e.key.toLowerCase() === 'a') {
        selectAll()
        return true
      }
      return false
    },

    overlay() {
      const selected = store.getState().selection
      if (drag?.kind === 'opening' && drag.target && drag.cursor) {
        // the gaps either side; where it cannot go, the would-be position in red (it stays at its last good one)
        const { plan } = store.getState()
        const o = findLayer(plan, drag.layer)?.openings[drag.id]
        if (!o) return {}
        const shown = { ...o, segment: drag.target.segment, offset: drag.target.offset }
        const data = openingOverlay(plan, shown, drag.target, drag.cursor, `${drag.target.gaps[0].toFixed(2)}  |  ${drag.target.gaps[1].toFixed(2)}`)
        return drag.target.problem ? data : { ...data, opening: undefined }
      }
      if (drag?.kind === 'furniture' && drag.target?.problem) return { tag: { p: drag.target.at, text: drag.target.problem, style: 'warning' } }
      return {
        hover: !drag && hover && !selected.some((r) => sameRef(r, hover)) ? hover : undefined,
        marquee: drag?.kind === 'box' ? boxOf(drag.start, drag.end) : undefined,
        snap: drag?.kind === 'move' && drag.snap?.kind !== 'free' ? drag.snap : undefined,
      }
    },
  }
}
