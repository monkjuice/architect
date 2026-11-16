import { FURNITURE_REACH_M } from '../../../model/furniture'
import type { Vec } from '../../../model/geometry'
import { placeService, serviceInfo, serviceTarget, specText } from '../../../model/services'
import { placeService as putService } from '../../../state/actions'
import { hostThickness, storeyView } from '../../../state/derived'
import type { Tool, ToolContext } from './types'

/**
 * Puts the equipment picked in the Plumbing tab's library down where it is clicked, on the active layer: it shows
 * as a ghost under the cursor, backed up to the nearest wall where that suits it (Alt turns that off), with its
 * title and rating.
 */
export function createServiceTool(ctx: ToolContext): Tool {
  const { store } = ctx
  let at: Vec | null = null
  let alt = false

  const target = (p: Vec, noSnap: boolean) => {
    const { plan, activeLayer, servicePick } = store.getState()
    const info = serviceInfo(servicePick)
    const t = serviceTarget(storeyView(plan, activeLayer), p, {
      kind: servicePick,
      width: info.width,
      depth: info.depth,
      angle: 0,
      layer: activeLayer,
      reach: FURNITURE_REACH_M,
      snap: !noSnap && ctx.prefs().snap,
      thickness: hostThickness,
    })
    return { info, at: t?.at ?? p, angle: t?.angle ?? 0 }
  }

  return {
    cursor: () => 'crosshair',

    reset() {
      at = null
    },

    move(e) {
      at = e.p
      alt = e.alt
      ctx.redraw()
    },

    down(e) {
      putService(store.getState().servicePick, e.p, !e.alt)
    },

    overlay() {
      if (!at) return {}
      const { info, at: p, angle } = target(at, alt)
      const rating = specText(info, info.width, info.depth)
      return {
        service: { kind: info.kind, placed: placeService({ kind: info.kind, at: p, angle, width: info.width, depth: info.depth }) },
        tag: { p: at, text: rating ? `${info.title} · ${rating}` : info.title },
      }
    },
  }
}
