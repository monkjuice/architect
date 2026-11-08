import { Fragment } from 'react'
import { updateLayer } from '../model/edit'
import { PRICES_SEEN, rowCost, unitPrice, USD_MEP } from '../model/prices'
import { CHAPTERS, type TakeoffRow } from '../model/takeoff'
import { CHAPTER_TITLES, formatNumber, LANGUAGE_NAMES, LANGUAGES, rowText, takeoffCsv, unitText, type Lang } from '../model/takeoffText'
import { getTakeoff } from '../state/derived'
import { downloadBlob } from '../state/files'
import { setPrefs, usePrefs } from '../state/prefs'
import { getStore, useEditor } from '../state/store'
import { CheckField } from './fields'
import { NoticeBar } from './NoticeBar'

/** The tab's own words. */
const WORDS: Record<Lang, Record<'language' | 'layers' | 'layersTitle' | 'save' | 'saveTitle' | 'intro' | 'prices' | 'noPrices' | 'empty' | 'total' | 'estimate', string>> & {
  head: Record<Lang, readonly string[]>
} = {
  en: {
    language: 'Language',
    layers: 'Layers',
    layersTitle: "The layers counted (also hides them on the other tabs): leave out the street or a neighbour's lot",
    save: 'Save CSV',
    saveTitle: 'Download the list as a spreadsheet (CSV)',
    intro:
      'Measured on the visible layers: wall sides net of their openings and up to the roofs, floors inside the walls, roof slopes, openings by size. What is behind them is assumed from usual Argentine practice (brick walls on strip footings with ring beams and tie columns, joist and block slabs) by what each wall separates and how thick it is; each row says how. Foundations are assumed until the Foundation tab exists, and a structural design will change the concrete. Quantities include the waste stated.',
    prices:
      'Prices: retail in the Buenos Aires area, in pesos with VAT, materials only (no labour), seen on {date}. Rows that are work (a wall, a footing, plaster) take their materials from the rows that are bought; glass in windows and doors is in their price. Estimates are marked ≈.',
    noPrices: 'No prices yet.',
    empty: 'Nothing to count yet: draw walls on the Floor tab.',
    total: 'Materials total',
    estimate: 'Estimate: worked out from something near it',
  },
  es: {
    language: 'Idioma',
    layers: 'Capas',
    layersTitle: 'Las capas que se computan (también se ocultan en las otras pestañas): dejá afuera la calle o el lote vecino',
    save: 'Guardar CSV',
    saveTitle: 'Descargar el cómputo como planilla (CSV)',
    intro:
      'Medido sobre las capas visibles: caras de muros descontando vanos y hasta los techos, pisos dentro de los muros, faldones, aberturas por medida. Lo que hay detrás se supone según la práctica habitual en Argentina (mampostería sobre cimientos corridos con encadenados y columnas, losas de viguetas) según lo que separa cada muro y su espesor; cada fila dice cómo. Las fundaciones son supuestas hasta que exista la pestaña Fundaciones, y un cálculo estructural cambiará el hormigón. Las cantidades incluyen los desperdicios indicados.',
    prices:
      'Precios: minoristas en el AMBA, en pesos con IVA, solo materiales (sin mano de obra), relevados el {date}. Las filas que son trabajos (un muro, un cimiento, revoques) toman sus materiales de las filas que se compran; el vidrio de ventanas y puertas está en su precio. Los estimados llevan ≈.',
    noPrices: 'Todavía no hay precios.',
    empty: 'Nada para computar todavía: dibujá muros en la pestaña Floor.',
    total: 'Total de materiales',
    estimate: 'Estimado a partir de un producto similar',
  },
  head: {
    en: ['Item', 'Quantity', 'Unit', 'Unit price', 'Cost', 'Where', 'How'],
    es: ['Ítem', 'Cantidad', 'Unidad', 'Precio unitario', 'Total', 'Dónde', 'Cómo'],
  },
}

/** A quantity to the digits its unit wants; counts rounded up. */
function quantity(row: TakeoffRow, lang: Lang): string {
  const whole = row.unit === 'u' || row.unit === 'bags' || row.unit === 'kg'
  return formatNumber(whole ? Math.ceil(row.quantity - 1e-9) : row.quantity, whole ? 0 : row.unit === 'm³' ? 2 : 1, lang)
}

const pesos = (x: number, lang: Lang) => `$ ${formatNumber(x, 0, lang)}`

/**
 * The Materials tab: what the house needs to be built, worked out from the visible layers (see takeoff.ts), chapter
 * by chapter, in English or Spanish, with where each item is used, how it was measured or assumed, and what it costs
 * at local prices (see prices.ts); saved as CSV for a spreadsheet.
 */
export function MaterialsTab() {
  const store = getStore()
  const plan = useEditor((s) => s.plan)
  const fileName = useEditor((s) => s.file.name)
  const { language: lang } = usePrefs()
  const rows = getTakeoff(plan)
  const w = WORDS[lang]
  const total = rows.reduce((sum, r) => sum + (rowCost(r) ?? 0), 0)

  const save = () => downloadBlob(new Blob([takeoffCsv(rows, lang)], { type: 'text/csv' }), `${fileName.replace(/\.json$/i, '')}-${lang === 'es' ? 'materiales' : 'materials'}.csv`)

  return (
    <>
      <div className="tab-actions">
        <label className="inline-field">
          {w.language}
          <select value={lang} onChange={(event) => setPrefs({ language: event.target.value as Lang })}>
            {LANGUAGES.map((l) => (
              <option key={l} value={l}>
                {LANGUAGE_NAMES[l]}
              </option>
            ))}
          </select>
        </label>
        <div className="inline-field" title={w.layersTitle}>
          {w.layers}
          {plan.layers.map((l) => (
            <CheckField key={l.id} label={l.name} checked={l.visible} onChange={(visible) => store.edit((p) => updateLayer(p, l.id, { visible }))} />
          ))}
        </div>
        <button className="tab-actions-end" onClick={save} disabled={!rows.length} title={w.saveTitle}>
          {w.save}
        </button>
      </div>
      <main className="app-main materials-main">
        <div className="materials-scroll">
          <p className="hint materials-intro">{w.intro}</p>
          <p className="hint materials-intro">{PRICES_SEEN ? w.prices.replace('{date}', PRICES_SEEN) : w.noPrices}</p>
          {rows.length === 0 ? (
            <p className="muted">{w.empty}</p>
          ) : (
            <table className="materials-table">
              <thead>
                <tr>
                  {WORDS.head[lang].map((h, i) => (
                    <th key={h} className={i === 1 || i === 3 || i === 4 ? 'number' : undefined}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {CHAPTERS.map((chapter) => {
                  const list = rows.filter((r) => r.chapter === chapter)
                  const subtotal = list.reduce((sum, r) => sum + (rowCost(r) ?? 0), 0)
                  return (
                    list.length > 0 && (
                      <Fragment key={chapter}>
                        <tr className="materials-chapter">
                          <th colSpan={4}>{CHAPTER_TITLES[chapter][lang]}</th>
                          <th className="number">{subtotal > 0 ? pesos(subtotal, lang) : ''}</th>
                          <th colSpan={2} />
                        </tr>
                        {list.map((r) => {
                          const { item, basis } = rowText(r, lang)
                          const u = unitPrice(r)
                          const cost = rowCost(r)
                          const source = u && [u.price.estimate && w.estimate, u.price.sold, u.price.source].filter(Boolean).join(' · ')
                          return (
                            <tr key={`${r.key}|${r.unit}|${JSON.stringify(r.params)}`}>
                              <td>{item}</td>
                              <td className="number">{quantity(r, lang)}</td>
                              <td>{unitText(r.unit, lang)}</td>
                              <td className="number" title={source || undefined}>
                                {u ? `${u.price.estimate ? '≈ ' : ''}${pesos(u.ars, lang)}` : ''}
                              </td>
                              <td className="number">{cost === null ? '' : pesos(cost, lang)}</td>
                              <td className="materials-where" title={r.where.join(', ')}>
                                {r.where.join(', ')}
                              </td>
                              <td className="materials-basis">{basis}</td>
                            </tr>
                          )
                        })}
                      </Fragment>
                    )
                  )
                })}
                {total > 0 && (
                  <tr className="materials-chapter materials-total">
                    <th colSpan={4}>{w.total}</th>
                    <th className="number">{pesos(total, lang)}</th>
                    <th colSpan={2}>{`≈ US$ ${formatNumber(total / USD_MEP, 0, lang)} (MEP ${formatNumber(USD_MEP, 1, lang)})`}</th>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>
        <NoticeBar />
      </main>
    </>
  )
}
