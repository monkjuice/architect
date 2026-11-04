import type { Vec } from '../../../model/geometry'
import { findMaterial } from '../../../model/materials'
import { applyFinish, finishTarget, finishTargetProblem, type FinishTarget } from '../../../state/actions'
import { WALL_REACH_PX, type Tool, type ToolContext } from './types'

/**
 * Finishes walls and floors with the material picked in the library: picked under Walls, it goes on the side of
 * the wall the cursor is on; under Floors, on the floor of the named area the cursor is in. Hovering shows that
 * side or floor, and says when the material does not suit it (an indoor finish outside, lawn in a room).
 */
export function createMaterialTool(ctx: ToolContext): Tool {
  const { store } = ctx
  let target: FinishTarget | null = null
  let cursor: Vec | null = null

  return {
    cursor: () => 'crosshair',
    reset() {
      target = null
      cursor = null
    },
    move(e) {
      cursor = e.p
      target = finishTarget(store.getState().materialPick.surface, e.p, WALL_REACH_PX * e.px)
      ctx.redraw()
    },
    down(e) {
      const { surface, id } = store.getState().materialPick
      const t = finishTarget(surface, e.p, WALL_REACH_PX * e.px)
      if (!t) {
        store.notify({ kind: 'error', text: surface === 'wall' ? 'Click the side of a wall to finish it.' : 'Click inside a named area to finish its floor (name it with Area first).' })
        return
      }
      applyFinish(t, id)
      ctx.redraw()
    },
    overlay() {
      if (!cursor) return {}
      const { surface, id } = store.getState().materialPick
      const title = findMaterial(id)?.title ?? id
      if (!target) return { tag: { p: cursor, text: surface === 'wall' ? `${title}: hover the side of a wall` : `${title}: hover inside a named area`, style: 'accent' } }
      const problem = finishTargetProblem(target, id)
      const text = problem ?? (target.surface === 'wall' ? `${title} on the side facing ${target.facing}` : `${title} floor in ${target.name}`)
      const tag = { p: cursor, text, style: problem ? ('warning' as const) : ('accent' as const) }
      return target.surface === 'wall'
        ? { lines: [{ a: target.face[0], b: target.face[1], style: 'face' as const }], tag }
        : { region: { outer: target.region.outer, holes: target.region.holes }, tag }
    },
  }
}
