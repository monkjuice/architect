import { setApplianceFuel, switchToGas } from '../../model/edit'
import type { HvacPlan } from '../../model/hvac'
import { serviceInfo } from '../../model/services'
import { BURNS, CYLINDER, DROP, GASES, STORAGE_HEATER_LOADS, type GasAppliance, type GasPlan } from '../../model/gas'
import { rowCost } from '../../model/prices'
import { gasRows } from '../../model/takeoff'
import { formatNumber, rowText } from '../../model/takeoffText'
import { getGas, getHvac } from '../../state/derived'
import { setPrefs, usePrefs } from '../../state/prefs'
import { getStore, useEditor } from '../../state/store'
import { Box, CheckField } from '../fields'
import { GasPipeFields, RoutesSummary } from './ServicePanel'

const kcal = (x: number) => formatNumber(Math.round(x / 100) * 100, 0, 'en')

/** Where an appliance was put down, in words. */
const FROM_TITLES: Record<GasAppliance['from'], string> = { floor: 'Floor', plumbing: 'Plumbing', hvac: 'HVAC', gas: 'Gas' }

/** Where the heating takes its heat from and what feeds it, in words, with each source's fuel; null with no heating. */
function heatingText(h: HvacPlan, g: GasPlan): string | null {
  const { sources, emitters } = h.summary
  const radiant = h.rooms.filter((r) => r.radiant).length
  const fed = [
    radiant && `radiant floors in ${radiant} room${radiant > 1 ? 's' : ''}`,
    emitters.filter((e) => e.kind === 'radiator').length && `${emitters.filter((e) => e.kind === 'radiator').length} radiators`,
  ].filter(Boolean)
  const heaters = h.pieces.filter((p) => p.kind === 'gas-heater').length
  if (!sources.length && !heaters) return fed.length ? `${fed.join(', ')}, with nothing to feed them` : null
  const piped = (ref: { layer: string; id: string }) => g.runs.some((r) => r.to?.kind === 'service' && r.to.layer === ref.layer && r.to.id === ref.id)
  const fuel = (p: (typeof sources)[number]) => (p.kind === 'boiler' ? (piped(p.ref) ? 'gas, piped' : 'gas, not piped yet') : 'electric')
  const from = sources.map((s) => `${s.info.title.toLowerCase()} ${s.specText} (${fuel(s)})`).join(', ')
  return [from && `${from}${fed.length ? ` → ${fed.join(', ')}` : ''}`, heaters && `${heaters} gas heater${heaters > 1 ? 's' : ''}`].filter(Boolean).join('; ')
}

/** What the supply is and gives, in words. */
function supplyText(g: GasPlan): string {
  if (!g.gas) return 'Nothing supplies it yet'
  const pieces = g.supply.map((p) => `${p.info.title.toLowerCase()} ${p.specText}`).join(', ')
  return g.gas === 'natural' ? (g.supply.length > 1 ? `${pieces}: ${g.capacity} m³/h` : pieces) : `${pieces}: about ${kcal(g.capacity * GASES.lpg.heat)} kcal/h in winter`
}

/**
 * The Gas tab's sections: what supplies the gas and what burns it, whether the supply is enough, what is missing or
 * wrong, every appliance wherever it was put down (a cooker's fuel chosen here), the pipe's material, what it all
 * takes with its price; and what the plan shows.
 */
export function GasPanel() {
  const store = getStore()
  const plan = useEditor((s) => s.plan)
  const g = getGas(plan)
  // from the gas plan alone: the whole materials list would rebuild the house in 3-D on every step of a drag
  const rows = gasRows(g)
  const cost = rows.reduce((sum, r) => sum + (rowCost(r) ?? 0), 0)
  const fed = g.appliances.filter((a) => !a.electric)
  const over = g.gas !== null && g.flow > g.capacity + 1e-9
  const heating = heatingText(getHvac(plan), g)
  return (
    <>
      <Box id="gas" title="Gas">
        <p className="warning">
          Preliminary coordination and quantity estimate. A gasista matriculado must design, submit and sign the installation; the distributor must approve it.
        </p>
        <p className="hint">
          The pipe is worked out from the meter or cylinders put down here to everything that burns gas, wherever it
          was put down: a cooker on the Floor tab, a gas water heater on Plumbing, a boiler or gas heater on HVAC, an
          outlet here. Usual values for a registered gas fitter to design and sign.
        </p>
        <dl className="plumbing-summary">
          <dt>Supply</dt>
          <dd className={over ? 'warning' : undefined}>{supplyText(g)}</dd>
          <dt>Burns</dt>
          <dd className={over ? 'warning' : undefined}>
            {fed.length
              ? `${kcal(g.load)} kcal/h at once${g.reserve ? ` (+ ${kcal(g.reserve)} reserved)` : ''}${g.gas ? `, ${formatNumber(g.flow, 2, 'en')} m³/h of ${GASES[g.gas].title.toLowerCase()}` : ''} (${fed.length} appliance${fed.length > 1 ? 's' : ''})`
              : 'Nothing yet'}
          </dd>
          {g.runs.length > 0 && (
            <>
              <dt>Pipe</dt>
              <dd>
                {formatNumber(g.runs.reduce((sum, r) => sum + r.length + r.rise, 0), 1, 'en')} m, {formatNumber(g.runs.reduce((sum, r) => sum + r.outdoor, 0), 1, 'en')} m of it outside;{' '}
                {formatNumber(g.longest, 1, 'en')} m to the farthest appliance, for a {DROP} mm drop
              </dd>
            </>
          )}
          {heating && (
            <>
              <dt>Heating</dt>
              <dd title="Where the radiators and radiant floors take their heat from (the HVAC tab)">{heating}</dd>
            </>
          )}
          {g.entries.length > 0 && (
            <>
              <dt>Entries</dt>
              <dd title="Where the pipe goes through an outside wall, in a sleeve (marked on the plan)">
                {g.entries.length}: {g.entries.map((e) => e.rooms.join(' + ') || e.feeds.join(', ')).join('; ')}
              </dd>
            </>
          )}
          {g.pieces.some((p) => p.kind === 'gas-valve') && (
            <>
              <dt>Valves</dt>
              <dd>
                {g.pieces.filter((p) => p.kind === 'gas-valve').length} shut-off
                {g.reserve > 0 ? `, ${kcal(g.reserve)} kcal/h kept for later` : ''}
              </dd>
            </>
          )}
          {(g.vents.length > 0 || g.flues.length > 0) && (
            <>
              <dt>Vents</dt>
              <dd>
                {g.vents.reduce((sum, v) => sum + v.count, 0)} grilles in {g.vents.length} room{g.vents.length === 1 ? '' : 's'}
                {g.flues.length ? `; ${g.flues.length} flue${g.flues.length > 1 ? 's' : ''}` : ''}
              </dd>
            </>
          )}
        </dl>
        {g.problems.map((text) => (
          <p key={text} className="hint warning">
            {text}
          </p>
        ))}
        {g.notes.map((text) => (
          <p key={text} className="hint">
            {text}
          </p>
        ))}
        {g.electric.length > 0 && (
          <>
            <h3 className="plumbing-heading">Could run on gas</h3>
            <ul className="gas-switch">
              {g.electric.map((e) => (
                <li key={`${e.ref.layer}:${e.ref.id}`}>
                  <span>
                    {e.title} <span className="muted">· {e.from === 'hvac' ? 'HVAC' : 'Plumbing'} · electric</span>
                  </span>
                  <button className="small" onClick={() => store.edit((p) => switchToGas(p, [e.ref]))} title={`Make it a ${serviceInfo(e.to).title.toLowerCase()} of about the same rating, where it stands`}>
                    Switch to gas
                  </button>
                </li>
              ))}
            </ul>
            {g.electric.length > 1 && (
              <button className="small" onClick={() => store.edit((p) => switchToGas(p, g.electric.map((e) => e.ref)))}>
                Switch all {g.electric.length} to gas
              </button>
            )}
            <p className="hint">A heat pump becomes a boiler hung on the inside of the wall it stood against; a water heater stays where it is. Their gas is then piped automatically.</p>
          </>
        )}
        {g.appliances.length > 0 && (
          <table className="foundation-rows gas-appliances">
            <thead>
              <tr>
                <th>Appliance</th>
                <th className="number">kcal/h</th>
                <th>Fuel</th>
              </tr>
            </thead>
            <tbody>
              {g.appliances.map((a) => (
                <tr
                  key={`${a.ref.kind}:${a.ref.layer}:${a.ref.id}`}
                  className={a.electric ? 'muted' : undefined}
                  onClick={() => (a.ref.kind === 'furniture' || a.from === 'gas' ? store.update({ selection: [a.ref], pipePick: undefined }) : undefined)}
                  title={`${a.title}${a.room ? ` in ${a.room}` : ''}: put down on the ${FROM_TITLES[a.from]} tab${a.open ? '; takes its air from the room' : ''}${a.flue ? '; open flue' : ''}`}
                >
                  <td>
                    {a.title}
                    {a.room ? <span className="muted"> · {a.room}</span> : null}
                  </td>
                  <td className="number">{a.electric ? '—' : kcal(a.burns)}</td>
                  <td>
                    {a.ref.kind === 'furniture' ? (
                      <select
                        aria-label={`Fuel of the cooker${a.room ? ` in ${a.room}` : ''}`}
                        value={a.electric ? 'electric' : 'gas'}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => store.edit((p) => setApplianceFuel(p, a.ref, e.target.value as 'gas' | 'electric'))}
                      >
                        <option value="gas">Gas</option>
                        <option value="electric">Electric</option>
                      </select>
                    ) : (
                      'Gas'
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <h3 className="plumbing-heading">Pipe</h3>
        <div className="fields">
          <GasPipeFields />
          <RoutesSummary tab="gas" />
          <p className="hint field-wide">
            A cooker assumes about {kcal(BURNS.cooker)} kcal/h. Storage heaters use published planning loads from {STORAGE_HEATER_LOADS[0].kcal} to {STORAGE_HEATER_LOADS.at(-1)!.kcal} kcal/h;
            an LPG battery assumes {CYLINDER.coldKcalPerHour} kcal/h per active {CYLINDER.kg} kg cylinder, with half held in reserve. Confirm every appliance nameplate and local climate.
          </p>
        </div>
        <h3 className="plumbing-heading">What it takes</h3>
        {rows.length ? (
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
        ) : (
          <p className="muted">Nothing until there is a supply and something that burns gas.</p>
        )}
        {cost > 0 && (
          <p className="hint">
            Priced materials: $ {formatNumber(cost, 0, 'en')}. Pipe is priced only as PE-Al-PE 20 mm, the size it was
            seen in; the appliances are in their own chapters, the gas company's connection on site.
          </p>
        )}
      </Box>
      <GasView />
    </>
  )
}

/** What the gas plan shows. Per browser. */
function GasView() {
  const prefs = usePrefs()
  const set = (patch: Partial<typeof prefs.gas>) => setPrefs({ gas: { ...prefs.gas, ...patch } })
  return (
    <Box id="gas-view" title="Show">
      <div className="view-list">
        <CheckField label="Pipe" checked={prefs.gas.pipes} onChange={(pipes) => set({ pipes })} title="The gas pipe and its risers" />
        <CheckField label="Sizes" checked={prefs.gas.sizes} onChange={(sizes) => set({ sizes })} title="Each stretch's size along it" />
        <CheckField label="Vents and flues" checked={prefs.gas.vents} onChange={(vents) => set({ vents })} title="The rooms' permanent vents, the open-flue heaters' flues" />
        <CheckField label="Labels" checked={prefs.gas.labels} onChange={(labels) => set({ labels })} title="The meter's or cylinders' name and rating" />
      </div>
      <ul className="pipe-legend">
        <li>
          <svg viewBox="0 0 28 8" aria-hidden="true"><path className="gas" d="M0 4H28" /></svg>Gas pipe (heavier as it gets bigger)
        </li>
        <li>
          <svg viewBox="0 0 28 8" aria-hidden="true"><path className="gas-outline" d="M2 1H26V7H2Z" /></svg>What burns gas, its point on it
        </li>
        <li>
          <svg viewBox="0 0 28 8" aria-hidden="true"><path className="gas" d="M0 4H12" /><path className="gas-entry" d="M18 4m-3 0a3 3 0 1 0 6 0a3 3 0 1 0 -6 0" /></svg>Where it goes in through a wall (a sleeve)
        </li>
        <li>
          <svg viewBox="0 0 28 8" aria-hidden="true"><path className="gas-valve-mark" d="M8 1L20 7V1L8 7Z" /></svg>A valve: at each appliance, after the meter
        </li>
        <li>
          <svg viewBox="0 0 28 8" aria-hidden="true"><path className="gas-electric" d="M2 1H26V7H2Z" /></svg>A cooker made electric
        </li>
        <li>
          <svg viewBox="0 0 28 8" aria-hidden="true"><path className="gas-vent" d="M10 0H18V8H10ZM11 2.5H17M11 5.5H17" /></svg>Permanent vents, low and high
        </li>
      </ul>
    </Box>
  )
}

