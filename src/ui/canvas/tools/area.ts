import type { Vec } from '../../../model/geometry'
import { addArea } from '../../../model/edit'
import { isEditable, type Layer } from '../../../model/plan'
import { regionAt, regionLabel, type Region } from '../../../model/regions'
import { getPlacedAreas, getRegions, storeyView } from '../../../state/derived'
import type { Tool, ToolContext } from './types'

interface Target {
  layer: Layer
  region: Region
  /** The area already naming this region, if any. */
  existing?: string
}

/**
 * Click inside a closed region to name it as an area (a room, a porch). The region is whatever the lines of
 * one layer enclose, walls, open edges and outlines alike; the active layer is tried first, then the others from the
 * top. Hovering shows the region and its size before clicking.
 */
export function createAreaTool(ctx: ToolContext): Tool {
  const { store } = ctx
  let target: Target | null = null
  let cursor: Vec | null = null

  const find = (p: Vec): Target | null => {
    const { plan, activeLayer } = store.getState()
    const layers = storeyView(plan, activeLayer).layers.filter(isEditable).reverse()
    layers.sort((a, b) => Number(b.id === activeLayer) - Number(a.id === activeLayer))
    for (const layer of layers) {
      const region = regionAt(getRegions(layer), p)
      if (!region) continue
      const existing = getPlacedAreas(layer).find((a) => a.region === region)?.id
      return { layer, region, existing }
    }
    return null
  }

  return {
    cursor: () => 'cell',
    reset() {
      target = null
      cursor = null
    },
    move(e) {
      cursor = e.p
      target = find(e.p)
      ctx.redraw()
    },
    down(e) {
      const t = find(e.p)
      if (!t) {
        store.notify({ kind: 'error', text: 'That spot is not enclosed. Close it first with walls, open edges or outlines: lines must meet or cross.' })
        return
      }
      if (t.existing) {
        store.select([{ layer: t.layer.id, kind: 'area', id: t.existing }])
        return
      }
      const n = Object.keys(t.layer.areas).length + 1
      void store.askText('Name this area', `${t.region.floor.toFixed(2)} m² inside the walls, on ${t.layer.name}.`, `Room ${n}`).then((name) => {
        if (name === null) return
        const { plan } = store.getState()
        const result = addArea(plan, t.layer.id, regionLabel(t.region), name.trim() || `Room ${n}`)
        store.edit(() => result.plan)
        store.select([{ layer: t.layer.id, kind: 'area', id: result.id }])
        store.setActiveLayer(t.layer.id)
        target = find(cursor ?? regionLabel(t.region))
        ctx.redraw()
      })
    },
    overlay() {
      if (!cursor) return {}
      if (!target) return { tag: { p: cursor, text: 'not enclosed', style: 'warning' } }
      const { region, existing, layer } = target
      const name = existing ? layer.areas[existing].name : undefined
      return {
        region: { outer: region.outer, holes: region.holes },
        tag: { p: cursor, text: name ? `${name} · ${region.floor.toFixed(2)} m²` : `${region.floor.toFixed(2)} m² · click to name`, style: 'accent' },
      }
    },
  }
}
