import type { Vec } from '../../../model/geometry'
import { isEditable } from '../../../model/plan'
import { pointInPolygon } from '../../../model/regions'
import { toggleRadiant } from '../../../state/actions'
import { getPlacedAreas, storeyView } from '../../../state/derived'
import type { Tool, ToolContext } from './types'

/**
 * The HVAC tab's Radiant floor: hover a named indoor room to see it, click to give it a radiant floor (its loops fed
 * from the nearest underfloor manifold) or to take it off.
 */
export function createRadiantTool(ctx: ToolContext): Tool {
  const { store } = ctx
  let at: Vec | null = null

  /** The named indoor room under the cursor, with its region, on the floor shown. */
  const roomAt = (p: Vec) => {
    const { plan, activeLayer } = store.getState()
    for (const layer of [...storeyView(plan, activeLayer).layers].reverse()) {
      if (!isEditable(layer)) continue
      const a = getPlacedAreas(layer).find((x) => x.region && !x.area.lot && x.region.indoor && pointInPolygon(p, x.region.outer) && !x.region.holes.some((h) => pointInPolygon(p, h)))
      if (a) return a
    }
    return null
  }

  return {
    cursor: () => (at && roomAt(at) ? 'pointer' : 'default'),

    reset() {
      at = null
    },

    move(e) {
      at = e.p
      ctx.redraw()
    },

    down(e) {
      toggleRadiant(e.p)
    },

    overlay() {
      const room = at && roomAt(at)
      if (!at || !room) return {}
      return {
        region: { outer: room.region!.outer, holes: room.region!.holes },
        tag: { p: at, text: `${room.area.name}: ${room.area.radiant ? 'click to take its radiant floor off' : 'click to give it a radiant floor'}` },
      }
    },
  }
}
