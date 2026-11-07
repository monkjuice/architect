import { parseLength, type Vec } from '../../../model/geometry'
import { hasHinge, openingFor, openingTarget, placeOpening, styleInfo, styleKey, type OpeningTarget } from '../../../model/openings'
import { findLayer, type Opening, type OpeningKind, type Plan } from '../../../model/plan'
import { placeOpeningAt } from '../../../state/actions'
import { drawnHalfWidth, hostThickness, storeyView } from '../../../state/derived'
import { getPrefs, openingWidth, setPrefs } from '../../../state/prefs'
import { SNAP_PX, WALL_REACH_PX, type OverlayData, type PointerInfo, type Tool, type ToolContext } from './types'


/** What a placement or drag shows: the opening, and the free wall on either side of it. */
export function openingOverlay(plan: Plan, opening: Opening, target: OpeningTarget, cursor: Vec, tag: string): OverlayData {
  const layer = findLayer(plan, target.layer)!
  const placed = placeOpening(layer, opening)
  if (!placed) return {}
  const s = layer.segments[target.segment]
  const [a, b] = [layer.vertices[s.a], layer.vertices[s.b]]
  const labels: OverlayData['labels'] = []
  if (target.gaps[0] > 0.005) labels.push({ a, b: placed.start, text: target.gaps[0].toFixed(2), style: 'accent' })
  if (target.gaps[1] > 0.005) labels.push({ a: placed.end, b, text: target.gaps[1].toFixed(2), style: 'accent' })
  return {
    opening: { opening, placed, problem: !!target.problem, wall: hostThickness(layer, target.segment) },
    labels,
    tag: { p: cursor, text: target.problem ?? tag, style: target.problem ? 'warning' : 'accent' },
  }
}

/**
 * Places doors or windows of the style picked in the library (the store's `openingStyle`): hover a wall to see
 * where it would go and the free wall either side of it, click to place. What opens to a side opens to the
 * side of the wall the cursor is on (into the room for a door, outside for a casement or an awning); a single
 * leaf hangs from the end nearer the wall's closer corner, and X swaps it. Typing a number sets the width,
 * remembered for that style.
 */
export function createOpeningTool(ctx: ToolContext, kind: OpeningKind): Tool {
  const { store } = ctx
  let target: OpeningTarget | null = null
  let cursor: Vec | null = null
  let typed = ''
  let otherHinge = false
  let pointer: PointerInfo | null = null

  const style = () => store.getState().openingStyle[kind]
  const width = () => {
    const w = parseLength(typed)
    return w > 0 ? w : openingWidth(ctx.prefs(), kind, style())
  }
  const build = (t: OpeningTarget) => openingFor(kind, style(), t, width(), otherHinge)

  const update = (e: PointerInfo) => {
    pointer = e
    cursor = e.p
    const { plan, activeLayer } = store.getState()
    target = openingTarget(storeyView(plan, activeLayer), e.p, {
      reach: WALL_REACH_PX * e.px,
      snapReach: SNAP_PX * e.px,
      width: width(),
      activeLayer,
      snap: !e.alt && ctx.prefs().snap,
      halfWidth: drawnHalfWidth,
      kind,
    })
  }

  return {
    cursor: () => 'crosshair',
    reset() {
      target = null
      cursor = null
      typed = ''
      otherHinge = false
    },
    move(e) {
      update(e)
      ctx.redraw()
    },
    down(e) {
      update(e)
      if (!target) {
        store.notify({ kind: 'error', text: kind === 'fireplace' ? 'Click on a wall to put the fireplace against it.' : `Click on a wall to put the ${kind} in it.` })
        return
      }
      const w = width()
      if (placeOpeningAt(build(target), target)) {
        if (typed) setPrefs({ widths: { ...getPrefs().widths, [styleKey(kind, style())]: w } })
        typed = ''
      }
      update(e)
      ctx.redraw()
    },
    key(e) {
      if (/^[0-9.,]$/.test(e.key)) typed += e.key
      else if (e.key === 'Backspace' && typed) typed = typed.slice(0, -1)
      else if (e.key === 'Escape' && typed) typed = ''
      else if (e.key.toLowerCase() === 'x' && !e.ctrlKey && !e.metaKey) otherHinge = !otherHinge
      else return false
      if (pointer) update(pointer)
      ctx.redraw()
      return true
    },
    overlay() {
      if (!cursor) return {}
      const title = `${styleInfo(kind, style()).title.toLowerCase()} ${kind}`
      if (!target) return { tag: { p: cursor, text: `hover a wall to place a ${title}`, style: 'accent' } }
      const opening = build(target)
      const text = typed ? `${typed}▏ m wide` : `${title} ${opening.width.toFixed(2)} m${hasHinge(opening) ? ' · X: hinge' : ''}`
      return openingOverlay(store.getState().plan, opening, target, cursor, text)
    },
  }
}
