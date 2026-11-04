import type { Vec } from '../../../model/geometry'
import { FURNITURE_REACH_M, furnitureFor, furnitureInfo, furnitureTarget, placeFurniture, placement, type FurnitureTarget } from '../../../model/furniture'
import type { Furniture } from '../../../model/plan'
import { placeFurnitureAt } from '../../../state/actions'
import { hostThickness } from '../../../state/derived'
import type { Tool, ToolContext } from './types'

/**
 * Puts down the piece picked in the library (the store's `furniturePick`): it follows the cursor, backing up to a
 * wall, sitting in a counter or facing a table as it comes near one; R turns it a quarter, a click puts it down.
 * Alt keeps it from snapping.
 */
export function createFurnitureTool(ctx: ToolContext): Tool {
  const { store } = ctx
  let angle = 0
  let target: FurnitureTarget | null = null
  let cursor: Vec | null = null
  let alt = false

  const update = () => {
    const { plan, activeLayer, furniturePick } = store.getState()
    if (!cursor) return
    const info = furnitureInfo(furniturePick.kind, furniturePick.style)
    target = furnitureTarget(plan, cursor, {
      kind: info.kind,
      style: info.style,
      width: info.width,
      depth: info.depth,
      angle,
      layer: activeLayer,
      reach: FURNITURE_REACH_M,
      snap: !alt && ctx.prefs().snap,
      thickness: hostThickness,
    })
  }
  const item = (t: FurnitureTarget): Furniture => {
    const info = furnitureInfo(store.getState().furniturePick.kind, store.getState().furniturePick.style)
    return furnitureFor(info.kind, info.style, t, info.width, info.depth)
  }

  return {
    cursor: () => 'crosshair',
    reset() {
      target = null
      cursor = null
    },
    move(e) {
      cursor = e.p
      alt = e.alt
      update()
      ctx.redraw()
    },
    down(e) {
      cursor = e.p
      alt = e.alt
      update()
      if (!target) return store.notify({ kind: 'error', text: 'The active layer is hidden or locked: pick another one in the Layers section.' })
      placeFurnitureAt(item(target), target)
      ctx.redraw()
    },
    key(e) {
      if (e.key.toLowerCase() !== 'r' || e.ctrlKey || e.metaKey) return false
      angle = (angle + 90) % 360
      update()
      ctx.redraw()
      return true
    },
    overlay() {
      if (!cursor) return {}
      const { plan, furniturePick } = store.getState()
      const info = furnitureInfo(furniturePick.kind, furniturePick.style)
      if (!target) return { tag: { p: cursor, text: `${info.title.toLowerCase()}: the active layer is hidden or locked`, style: 'warning' } }
      const piece = item(target)
      const layer = plan.layers.find((l) => l.id === target!.layer)!
      // a kitchen sink is laid out in its counter; anything else where the target puts it
      const placed = (target.counter && placeFurniture(layer, piece)) || placement(target.at, target.angle, info.width, info.depth)
      return {
        furniture: { item: piece, placed, problem: !!target.problem },
        tag: { p: cursor, text: target.problem ?? `${info.title.toLowerCase()} · R: turn`, style: target.problem ? 'warning' : 'accent' },
      }
    },
  }
}
