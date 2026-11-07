import { Fragment, type CSSProperties } from 'react'
import { sameRef, storeyOf } from '../../model/plan'
import { storeyName } from '../../model/storeys'
import { chooseTool } from '../../state/actions'
import { areaSize, coveredArea, visibleAreas } from '../../state/derived'
import { getStore, useEditor } from '../../state/store'
import { Box } from '../fields'

/**
 * Every area on the visible layers with its size (a room's floor inside the walls, a lot's to its boundary lines),
 * by floor when there are several, the rooms' total, the covered area to the walls' outside faces (every floor's),
 * and the lots' total with how much of it the ground floor covers (FOS) and how much is built on every floor (FOT);
 * click one to select it.
 */
export function AreasPanel() {
  const store = getStore()
  const plan = useEditor((s) => s.plan)
  const selection = useEditor((s) => s.selection)
  // by floor, from the ground up
  const areas = visibleAreas(plan).toSorted((a, b) => storeyOf(a.layer) - storeyOf(b.layer))
  const sum = (lots: boolean) => areas.reduce((total, a) => total + (!!a.area.lot === lots ? (areaSize(a) ?? 0) : 0), 0)
  const [total, lots] = [sum(false), sum(true)]
  const covered = coveredArea(plan)
  const ground = coveredArea(plan, 0)
  const floors = new Set(areas.map((a) => storeyOf(a.layer))).size > 1

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
            {areas.map((a, i) => {
              const ref = { layer: a.layer.id, kind: 'area' as const, id: a.id }
              const storey = storeyOf(a.layer)
              return (
                <Fragment key={`${a.layer.id}:${a.id}`}>
                  {floors && (i === 0 || storey !== storeyOf(areas[i - 1].layer)) && <li className="area-list-floor">{storeyName(storey)}</li>}
                  <li
                    className={selection.some((r) => sameRef(r, ref)) ? 'selected' : ''}
                    style={{ '--layer': a.layer.color } as CSSProperties}
                    onClick={() => {
                      store.setActiveLayer(a.layer.id)
                      store.select([ref])
                    }}
                  >
                    <span className="area-swatch" />
                    <span className="area-list-name">{a.area.name}</span>
                    <span className={a.region ? 'area-list-size' : 'area-list-size warning'}>{a.region ? `${areaSize(a)!.toFixed(2)} m²` : 'not enclosed'}</span>
                  </li>
                </Fragment>
              )
            })}
          </ul>
          <div className="area-total" title="The areas' floor inside their walls (lots are left out)">
            <span>Total floor</span>
            <b>{total.toFixed(2)} m²</b>
          </div>
          <div
            className="area-total covered"
            title="Indoor rooms with their walls, to the walls' outside faces, on every floor. Areas open to the outside across open edges (galleries, porches) or outlines (pools, paving) are left out, and so are lots."
          >
            <span>Covered, with walls</span>
            <b>{covered.toFixed(2)} m²</b>
          </div>
          {lots > 0 && (
            <>
              <div className="area-total covered" title="The areas marked as lots, each to its boundary lines (the lot lines)">
                <span>Lots</span>
                <b>{lots.toFixed(2)} m²</b>
              </div>
              <div className="area-total covered" title="The ground floor's covered area, with walls, as a share of the lots (FOS)">
                <span>Lot covered</span>
                <b>{((100 * ground) / lots).toFixed(1)} %</b>
              </div>
              {covered > ground + 1e-6 && (
                <div className="area-total covered" title="The covered area of every floor, with walls, as a share of the lots (FOT)">
                  <span>Lot built</span>
                  <b>{((100 * covered) / lots).toFixed(1)} %</b>
                </div>
              )}
            </>
          )}
        </>
      )}
    </Box>
  )
}
