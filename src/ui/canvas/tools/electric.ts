import { electricFor, electricTitle, type ElectricTarget } from '../../../model/electrical'
import type { Vec } from '../../../model/geometry'
import type { ElectricKind } from '../../../model/plan'
import { electricTargetAt, pickedMount, placeElectricAt } from '../../../state/actions'
import { SNAP_PX, type Tool, type ToolContext } from './types'

/**
 * Puts down a board, switch, light outlet or socket (`kind`): it follows the cursor, on the face of the nearest wall for
 * a wall mount (facing out of it), inside a room for a ceiling light (snapping to the room's middle) or a floor socket.
 * A ceiling light or floor socket snaps to the room's centre lines and into line with others like it (the guides show
 * which). A click puts it down; a board first asks its name and what it feeds, a point goes on the circuit picked in
 * the bar or a new one. Alt turns snapping off.
 */
export function createElectricTool(ctx: ToolContext, kind: ElectricKind): Tool {
  const { store } = ctx
  let cursor: Vec | null = null
  let target: ElectricTarget | null = null
  let alt = false
  let px = 0.01

  const update = () => {
    target = cursor ? electricTargetAt(kind, cursor, !alt && ctx.prefs().snap, undefined, { snapReach: SNAP_PX * px }) : null
  }

  return {
    cursor: () => 'crosshair',
    reset() {
      cursor = null
      target = null
    },
    move(e) {
      cursor = e.p
      alt = e.alt
      px = e.px
      update()
      ctx.redraw()
    },
    down(e) {
      cursor = e.p
      alt = e.alt
      px = e.px
      update()
      if (!target) return store.notify({ kind: 'error', text: 'The active layer is hidden or locked: pick another one in the Layers section.' })
      void placeElectricAt(kind, target)
      ctx.redraw()
    },
    overlay() {
      if (!cursor) return {}
      const { electricPick } = store.getState()
      const mount = pickedMount(kind, electricPick)
      const title = electricTitle({ kind, mount, use: electricPick.use }).toLowerCase()
      if (!target) return { tag: { p: cursor, text: `${title}: the active layer is hidden or locked`, style: 'warning' } }
      const item = electricFor(kind, mount, target, { use: electricPick.use })
      return {
        electrical: { item, problem: !!target.problem },
        lines: (target.guides ?? []).map(([a, b]) => ({ a, b, style: 'guide' as const })),
        tag: { p: cursor, text: target.problem ?? title, style: target.problem ? 'warning' : 'accent' },
      }
    },
  }
}
