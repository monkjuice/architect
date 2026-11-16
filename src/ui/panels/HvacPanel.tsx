import { setHeatingMaterial } from '../../model/edit'
import { HEATING_CHOICES, KCAL_PER_KW, LOAD, RADIANT, USUAL_HEATING, type HvacPlan } from '../../model/hvac'
import type { HeatingMaterial } from '../../model/plan'
import { PIPE_TITLES } from '../../model/plumbing'
import { rowCost } from '../../model/prices'
import { hvacRows } from '../../model/takeoff'
import { formatNumber, rowText } from '../../model/takeoffText'
import { getHvac } from '../../state/derived'
import { setPrefs, usePrefs } from '../../state/prefs'
import { getStore, useEditor } from '../../state/store'
import { Box, CheckField, SelectField } from '../fields'

const round = (x: number) => formatNumber(Math.round(x / 10) * 10, 0, 'en')

/** What the Plumbing tab does for the HVAC, in words; null when nothing. */
function plumbingText(h: HvacPlan): string | null {
  const { dhw, fill, condensate } = h.summary.plumbing
  const parts = [
    dhw.length && 'the boiler makes the hot water it pipes',
    fill.length && `it fills ${fill.map((p) => p.info.title.toLowerCase()).join(', ')}`,
    condensate.length && `it drains ${condensate.length} split unit${condensate.length > 1 ? 's' : ''}' condensate`,
  ].filter(Boolean)
  return parts.length ? parts.join('; ') : null
}

/**
 * The HVAC tab's sections: what heats, cools and ventilates the house and whether it is enough, room by room; what
 * is missing or wrong; what it takes from the Plumbing tab and the Electricity tab; the heating's material; what it
 * all takes with its price; and what the plan shows.
 */
export function HvacPanel() {
  const store = getStore()
  const plan = useEditor((s) => s.plan)
  const h = getHvac(plan)
  const { summary: s } = h
  // from the HVAC plan alone: the whole materials list would rebuild the house in 3-D on every step of a drag
  const rows = hvacRows(h)
  const cost = rows.reduce((sum, r) => sum + (rowCost(r) ?? 0), 0)
  const plumbing = plumbingText(h)
  return (
    <>
      <Box id="hvac" title="HVAC">
        <p className="hint">
          Heating, cooling and ventilation, worked out from what is put down here and the rooms given a radiant floor.
          Each room wants about {LOAD.heat} kcal/h of heat and {LOAD.cool} frig/h of cooling per m³: usual values, not a
          heat-loss calculation.
        </p>
        <dl className="plumbing-summary">
          <dt>Heating</dt>
          <dd>
            {s.sources.length
              ? `${s.sources.map((p) => `${p.info.title.toLowerCase()} ${p.specText}`).join(', ')} (${round(s.sourceOutput)} kcal/h) → ${round(s.emitterOutput)} kcal/h of radiators and radiant floors`
              : s.emitters.length || h.radiant.floor
                ? 'Nothing feeds the radiators and radiant floors yet'
                : 'None'}
          </dd>
          {h.radiant.floor > 0 && (
            <>
              <dt>Radiant</dt>
              <dd>
                {formatNumber(h.radiant.floor, 1, 'en')} m² in {h.radiant.loops} loops, {round(h.radiant.floor * RADIANT.output)} kcal/h
              </dd>
            </>
          )}
          <dt>Rooms</dt>
          <dd>
            {round(h.rooms.reduce((sum, r) => sum + r.heat, 0))} of {round(s.heatNeed)} kcal/h of heat, {round(s.cool)} of {round(s.coolNeed)} frig/h of cooling
          </dd>
          <dt>Cooling</dt>
          <dd>{s.indoor.length ? `${s.indoor.length} split unit${s.indoor.length > 1 ? 's' : ''}, ${s.outdoor.length} outdoor` : 'None'}</dd>
          <dt>Ventilation</dt>
          <dd>{s.extractors.length ? s.extractors.map((e) => `${e.info.title.toLowerCase()}${e.room ? ` (${e.room})` : ''}`).join(', ') : 'None'}</dd>
          {plumbing && (
            <>
              <dt>Plumbing</dt>
              <dd title="What the Plumbing tab does for these pieces; its own pieces show faded here">{plumbing}</dd>
            </>
          )}
          {s.power > 0 && (
            <>
              <dt>Power</dt>
              <dd>
                {s.power} piece{s.power > 1 ? 's need' : ' needs'} an electrical point
              </dd>
            </>
          )}
        </dl>
        {h.problems.map((text) => (
          <p key={text} className="hint warning">
            {text}
          </p>
        ))}
        {h.notes.map((text) => (
          <p key={text} className="hint">
            {text}
          </p>
        ))}
        {h.rooms.length > 0 && (
          <table className="foundation-rows hvac-rooms">
            <thead>
              <tr>
                <th>Room</th>
                <th className="number">Heat, kcal/h</th>
                <th className="number">Cool, frig/h</th>
              </tr>
            </thead>
            <tbody>
              {h.rooms.map((r) => (
                <tr
                  key={`${r.ref.layer}:${r.ref.id}`}
                  onClick={() => store.select([r.ref])}
                  title={`${r.name}: ${r.floor.toFixed(1)} m², ${r.volume.toFixed(1)} m³${r.radiant ? ', radiant floor' : ''}. Click to select it`}
                >
                  <td>
                    {r.name}
                    {r.radiant ? ' ▦' : ''}
                  </td>
                  <td className={r.heat > 0 && r.heat < r.heatNeed * 0.9 ? 'number warning' : r.heat <= 0 ? 'number muted' : 'number'}>
                    {round(r.heat)} / {round(r.heatNeed)}
                  </td>
                  <td className={r.cool > 0 && r.cool < r.coolNeed * 0.9 ? 'number warning' : r.cool <= 0 ? 'number muted' : 'number'}>
                    {round(r.cool)} / {round(r.coolNeed)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <h3 className="plumbing-heading">Pipes</h3>
        <div className="fields">
          <SelectField<HeatingMaterial>
            label="Heating"
            value={h.materials.heating}
            options={HEATING_CHOICES.map((m) => [m, PIPE_TITLES[m]] as const)}
            onChange={(m) => store.edit((p) => setHeatingMaterial(p, m === USUAL_HEATING ? undefined : m))}
          />
          <p className="hint field-wide">Flow and return to the radiators and manifolds, and the radiant loops. A heat pump's {KCAL_PER_KW} kcal/h per kW count in its output.</p>
        </div>
        <h3 className="plumbing-heading">What it takes</h3>
        <table className="foundation-rows">
          <tbody>
            {rows.map((r) => (
              <tr key={`${r.key}|${JSON.stringify(r.params)}`}>
                <td>{rowText(r, 'en').item}</td>
                <td className="number">{formatNumber(r.unit === 'u' ? Math.ceil(r.quantity - 1e-9) : r.quantity, r.unit === 'u' ? 0 : 2, 'en')}</td>
                <td>{r.unit}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {cost > 0 && <p className="hint">Priced materials: $ {formatNumber(cost, 0, 'en')}. Outdoor units, extractors, hoods, ducts and refrigerant lines are priced on site.</p>}
      </Box>
      <HvacView />
    </>
  )
}

/** What the HVAC plan shows. Per browser. */
function HvacView() {
  const prefs = usePrefs()
  const set = (patch: Partial<typeof prefs.hvac>) => setPrefs({ hvac: { ...prefs.hvac, ...patch } })
  return (
    <Box id="hvac-view" title="Show">
      <div className="view-list">
        <CheckField label="Heating" checked={prefs.hvac.heating} onChange={(heating) => set({ heating })} title="Flow and return pipes, radiant floors" />
        <CheckField label="Cooling" checked={prefs.hvac.cooling} onChange={(cooling) => set({ cooling })} title="Refrigerant lines" />
        <CheckField label="Ventilation" checked={prefs.hvac.ventilation} onChange={(ventilation) => set({ ventilation })} title="Ducts" />
        <CheckField label="Room loads" checked={prefs.hvac.loads} onChange={(loads) => set({ loads })} title="Each room's heat and cooling against what it needs" />
        <CheckField label="Sizes" checked={prefs.hvac.sizes} onChange={(sizes) => set({ sizes })} />
        <CheckField label="Labels" checked={prefs.hvac.labels} onChange={(labels) => set({ labels })} />
        <CheckField label="Plumbing pieces" checked={prefs.hvac.linked} onChange={(linked) => set({ linked })} title="The Plumbing tab's equipment, faded, with the pipes that join it to the HVAC" />
      </div>
      <ul className="pipe-legend">
        <li>
          <svg viewBox="0 0 28 8" aria-hidden="true"><path className="heating" d="M0 2H28M0 6H28" /></svg>Heating flow and return
        </li>
        <li>
          <svg viewBox="0 0 28 8" aria-hidden="true"><path className="radiant" d="M0 4H28" /></svg>A radiant floor's lead to its manifold
        </li>
        <li>
          <svg viewBox="0 0 28 8" aria-hidden="true"><path className="refrigerant" d="M0 4H28" /></svg>Refrigerant lines
        </li>
        <li>
          <svg viewBox="0 0 28 8" aria-hidden="true"><path className="duct" d="M0 4H28" /></svg>Ducts
        </li>
        <li>
          <svg viewBox="0 0 28 8" aria-hidden="true"><path className="linked" d="M0 4H28" /></svg>The plumbing that joins them (faded)
        </li>
      </ul>
    </Box>
  )
}
