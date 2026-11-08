import { Fragment } from 'react'
import { updateLayer } from '../model/edit'
import { CHAPTERS, takeoffCsv, type TakeoffRow } from '../model/takeoff'
import { getTakeoff } from '../state/derived'
import { downloadBlob } from '../state/files'
import { getStore, useEditor } from '../state/store'
import { CheckField } from './fields'
import { NoticeBar } from './NoticeBar'

/** Digits after the point by unit; counts are rounded up. Thousands are grouped with a thin space, not a comma or a point. */
function quantity(row: TakeoffRow): string {
  const whole = row.unit === 'u' || row.unit === 'bags' || row.unit === 'kg'
  const text = whole ? String(Math.ceil(row.quantity - 1e-9)) : row.quantity.toFixed(row.unit === 'm³' ? 2 : 1)
  const [int, dec] = text.split('.')
  return int.replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + (dec ? `.${dec}` : '')
}

/**
 * The Materials tab: what the house needs to be built, worked out from the visible layers (see takeoff.ts), chapter
 * by chapter, with where each item is used and how it was measured or assumed; saved as CSV for costing.
 */
export function MaterialsTab() {
  const store = getStore()
  const plan = useEditor((s) => s.plan)
  const fileName = useEditor((s) => s.file.name)
  const rows = getTakeoff(plan)

  const save = () => downloadBlob(new Blob([takeoffCsv(rows)], { type: 'text/csv' }), `${fileName.replace(/\.json$/i, '')}-materials.csv`)

  return (
    <>
      <div className="tab-actions">
        <div className="inline-field" title="The layers counted (also hides them on the other tabs): leave out the street or a neighbour's lot">
          Layers
          {plan.layers.map((l) => (
            <CheckField key={l.id} label={l.name} checked={l.visible} onChange={(visible) => store.edit((p) => updateLayer(p, l.id, { visible }))} />
          ))}
        </div>
        <button className="tab-actions-end" onClick={save} disabled={!rows.length} title="Download the list as a spreadsheet (CSV)">
          Save CSV
        </button>
      </div>
      <main className="app-main materials-main">
        <div className="materials-scroll">
          <p className="hint materials-intro">
            Measured on the visible layers: wall sides net of their openings and up to the roofs, floors inside the walls, roof slopes, openings by
            size. What is behind them is assumed from usual Argentine practice (brick walls on strip footings with ring beams and tie columns, joist
            and block slabs) by what each wall separates and how thick it is; each row says how. Foundations are assumed until the Foundation tab
            exists, and a structural design will change the concrete. Quantities include the waste stated, not prices.
          </p>
          {rows.length === 0 ? (
            <p className="muted">Nothing to count yet: draw walls on the Floor tab.</p>
          ) : (
            <table className="materials-table">
              <thead>
                <tr>
                  <th>Item</th>
                  <th className="number">Quantity</th>
                  <th>Unit</th>
                  <th>Where</th>
                  <th>How</th>
                </tr>
              </thead>
              <tbody>
                {CHAPTERS.map((chapter) => {
                  const list = rows.filter((r) => r.chapter === chapter)
                  return (
                    list.length > 0 && (
                      <Fragment key={chapter}>
                        <tr className="materials-chapter">
                          <th colSpan={5}>{chapter}</th>
                        </tr>
                        {list.map((r) => (
                          <tr key={`${r.item}|${r.unit}`}>
                            <td>{r.item}</td>
                            <td className="number">{quantity(r)}</td>
                            <td>{r.unit}</td>
                            <td className="materials-where" title={r.where.join(', ')}>
                              {r.where.join(', ')}
                            </td>
                            <td className="materials-basis">{r.basis}</td>
                          </tr>
                        ))}
                      </Fragment>
                    )
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
        <NoticeBar />
      </main>
    </>
  )
}
