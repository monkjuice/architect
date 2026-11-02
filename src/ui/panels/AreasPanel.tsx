import type { CSSProperties } from 'react'
import { sameRef } from '../../model/plan'
import { chooseTool } from '../../state/actions'
import { coveredArea, visibleAreas } from '../../state/derived'
import { getStore, useEditor } from '../../state/store'
import { Box } from '../fields'

/**
 * Every area on the visible layers with its floor area inside the walls, their total, and the covered area to
 * the walls' outside faces; click one to select it.
 */
export function AreasPanel() {
  const store = getStore()
  const plan = useEditor((s) => s.plan)
  const selection = useEditor((s) => s.selection)
  const areas = visibleAreas(plan)
  const total = areas.reduce((sum, a) => sum + (a.region?.floor ?? 0), 0)

  return (
    <Box
      id="areas"
      title="Areas"
      actions={
        <button className="ghost small" onClick={() => chooseTool('area')} title="Name a closed outline (A)">
          + Area
        </button>
      }
    >
      {areas.length === 0 ? (
        <p className="muted">No areas yet. With Area (A), click inside a closed outline to name it and get its size.</p>
      ) : (
        <>
          <ul className="area-list">
            {areas.map((a) => {
              const ref = { layer: a.layer.id, kind: 'area' as const, id: a.id }
              return (
                <li
                  key={`${a.layer.id}:${a.id}`}
                  className={selection.some((r) => sameRef(r, ref)) ? 'selected' : ''}
                  style={{ '--layer': a.layer.color } as CSSProperties}
                  onClick={() => {
                    store.select([ref])
                    store.setActiveLayer(a.layer.id)
                  }}
                >
                  <span className="area-swatch" />
                  <span className="area-list-name">{a.area.name}</span>
                  <span className={a.region ? 'area-list-size' : 'area-list-size warning'}>{a.region ? `${a.region.floor.toFixed(2)} m²` : 'not enclosed'}</span>
                </li>
              )
            })}
          </ul>
          <div className="area-total" title="The areas' floor inside their walls">
            <span>Total floor</span>
            <b>{total.toFixed(2)} m²</b>
          </div>
          <div
            className="area-total covered"
            title="Indoor rooms with their walls, to the walls' outside faces. Areas open to the outside across open edges (galleries, porches) or outlines (pools, paving) are left out."
          >
            <span>Covered, with walls</span>
            <b>{coveredArea(plan).toFixed(2)} m²</b>
          </div>
        </>
      )}
    </Box>
  )
}
