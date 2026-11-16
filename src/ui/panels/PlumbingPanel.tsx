import { setPipeMaterial } from '../../model/edit'
import type { PipeMaterial, PipeNetwork } from '../../model/plan'
import { PIPE_CHOICES, PIPE_TITLES, USUAL_PIPE, WATER, type SystemSummary } from '../../model/plumbing'
import { rowCost } from '../../model/prices'
import { formatNumber, rowText } from '../../model/takeoffText'
import { plumbingRows } from '../../model/takeoff'
import { getPlumbing } from '../../state/derived'
import { setPrefs, usePrefs } from '../../state/prefs'
import { getStore, useEditor } from '../../state/store'
import { Box, CheckField, SelectField } from '../fields'

const NETWORK_TITLES: Record<PipeNetwork, string> = { cold: 'Cold water', hot: 'Hot water', drain: 'Drains' }

/** What the plumbing does for the HVAC tab's pieces, in words; null when there is none. */
function hvacText(s: SystemSummary): string | null {
  const { dhw, fill, condensate } = s.linked
  const parts = [
    dhw.length && `hot water from ${dhw.length > 1 ? `${dhw.length} boilers` : 'the boiler'}`,
    fill.length && `fills ${fill.map((e) => e.info.title.toLowerCase()).join(', ')}`,
    condensate.length && `condensate of ${condensate.length} split unit${condensate.length > 1 ? 's' : ''}`,
  ].filter(Boolean)
  return parts.length ? parts.join('; ') : null
}

/**
 * The Plumbing tab's sections: what the installation comes to (the water's way through whatever is on the plan, the
 * hot water, the waste, and what it does for the HVAC tab's pieces), what is missing or wrong, each room's fixtures,
 * what it all takes with its price; and what the plan shows.
 */
export function PlumbingPanel() {
  const store = getStore()
  const plan = useEditor((s) => s.plan)
  const p = getPlumbing(plan)
  // from the plumbing plan alone: the whole materials list would rebuild the house in 3-D on every step of a drag
  const rows = plumbingRows(p)
  const cost = rows.reduce((sum, r) => sum + (rowCost(r) ?? 0), 0)
  const { summary } = p
  const beds = plan.layers.some((l) => l.visible && Object.values(l.furniture).some((f) => f.kind === 'bed'))
  const chain = summary.chain.map((stage) => `${stage.length > 1 ? `${stage.length} × ` : ''}${stage[0].info.title.toLowerCase()}`)
  const rooms = new Map<string, { name: string; items: string[] }>()
  for (const w of p.points) {
    const room = rooms.get(w.roomKey) ?? { name: w.room || 'Outside', items: [] }
    room.items.push(w.title)
    rooms.set(w.roomKey, room)
  }
  const supply = p.points.filter((w) => w.cold).length
  const hot = p.points.filter((w) => w.hot).length

  return (
    <>
      <Box id="plumbing" title="Plumbing">
        <p className="hint">
          The pipes are worked out from the fixtures on the floor plan and the equipment put down here: there is no
          house style assumed. What is on the plan is what the water runs through.
        </p>
        <dl className="plumbing-summary">
          <dt>People</dt>
          <dd>
            {p.occupants} {beds ? '(from the beds)' : '(no beds drawn: a usual family)'}
          </dd>
          <dt>Water</dt>
          <dd>{chain.length ? chain.join(' → ') + ' → the fixtures' : 'Nothing supplies it yet'}</dd>
          {summary.reserve > 0 && (
            <>
              <dt>Reserve</dt>
              <dd className={summary.reserve < summary.reserveNeed ? 'warning' : undefined}>
                {summary.reserve} l for a day of {summary.reserveNeed} l ({WATER.perPerson} l a person)
              </dd>
            </>
          )}
          <dt>Hot water</dt>
          <dd>
            {summary.heaters.length
              ? `${summary.heaters.map((h) => `${h.info.title.toLowerCase()}${h.specText ? ` ${h.specText}` : ''}`).join(', ')} · ${hot} fixtures take it`
              : hot
                ? 'Nothing heats it yet'
                : 'No fixture takes it'}
          </dd>
          {hvacText(summary) && (
            <>
              <dt>HVAC</dt>
              <dd title="The HVAC tab's pieces the plumbing serves; they show faded here">{hvacText(summary)}</dd>
            </>
          )}
          <dt>Points</dt>
          <dd>
            {supply} cold, {hot} hot; {p.traps.filter((t) => !t.grease).length} floor traps ({p.traps.filter((t) => t.kitchen).length} the kitchens' own), {p.chambers.length} chamber
            {p.chambers.length === 1 ? '' : 's'}
          </dd>
          <dt>Waste</dt>
          <dd>
            {summary.waste.length
              ? `${summary.waste.map((w) => w.info.title.toLowerCase()).join(', ')}${summary.sewer ? '' : ` · ${summary.wasteLitres} l of ${summary.wasteNeed} l wanted`}`
              : 'Nothing takes it yet'}
            {p.fall && `; the longest drain runs ${p.fall.run.toFixed(1)} m and arrives ${p.fall.depth.toFixed(2)} m deep`}
          </dd>
        </dl>
        {p.problems.map((text) => (
          <p key={text} className="hint warning">
            {text}
          </p>
        ))}
        {p.notes.map((text) => (
          <p key={text} className="hint">
            {text}
          </p>
        ))}
        {rooms.size > 0 && (
          <table className="foundation-rows plumbing-rooms">
            <tbody>
              {[...rooms.entries()].map(([key, r]) => (
                <tr key={key}>
                  <td>{r.name}</td>
                  <td>{r.items.join(', ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <h3 className="plumbing-heading">Pipes</h3>
        <div className="fields">
          {(['cold', 'hot', 'drain'] as PipeNetwork[]).map((network) => (
            <SelectField<PipeMaterial>
              key={network}
              label={NETWORK_TITLES[network]}
              value={p.materials[network]}
              options={PIPE_CHOICES[network].map((m) => [m, PIPE_TITLES[m]] as const)}
              onChange={(m) => store.edit((pl) => setPipeMaterial(pl, network, m === USUAL_PIPE[network] ? undefined : m))}
            />
          ))}
          <p className="hint field-wide">One material per network; click a pipe on the plan to see it, and for the branch to a fixture, the fixture's connections and trap.</p>
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
        {cost > 0 && (
          <p className="hint">
            Priced materials: $ {formatNumber(cost, 0, 'en')}. A well's drilling, a cistern, a soakaway and the mains
            or sewer connections are priced on site; the fixtures themselves are in the Materials tab.
          </p>
        )}
      </Box>
      <PipesView />
    </>
  )
}

/** What the plumbing plan shows: each kind of pipe, the sizes and the equipment's labels. Per browser. */
function PipesView() {
  const prefs = usePrefs()
  const set = (patch: Partial<typeof prefs.pipes>) => setPrefs({ pipes: { ...prefs.pipes, ...patch } })
  return (
    <Box id="pipes" title="Show">
      <div className="view-list">
        <CheckField label="Cold water" checked={prefs.pipes.cold} onChange={(cold) => set({ cold })} />
        <CheckField label="Hot water" checked={prefs.pipes.hot} onChange={(hot) => set({ hot })} />
        <CheckField label="Drains" checked={prefs.pipes.drains} onChange={(drains) => set({ drains })} />
        <CheckField label="HVAC pieces" checked={prefs.pipes.linked} onChange={(linked) => set({ linked })} title="The HVAC tab's equipment, faded, with what joins it to the plumbing" />
        <CheckField label="Sizes" checked={prefs.pipes.sizes} onChange={(sizes) => set({ sizes })} title="Each pipe's diameter along it" />
        <CheckField label="Labels" checked={prefs.pipes.labels} onChange={(labels) => set({ labels })} title="Each piece of equipment's name and rating" />
      </div>
      <ul className="pipe-legend">
        <li>
          <svg viewBox="0 0 28 8" aria-hidden="true"><path className="feed" d="M0 4H28" /></svg>The supply: source to tanks, pumps and heaters
        </li>
        <li>
          <svg viewBox="0 0 28 8" aria-hidden="true"><path className="cold" d="M0 4H28" /></svg>Cold water
        </li>
        <li>
          <svg viewBox="0 0 28 8" aria-hidden="true"><path className="hot" d="M0 4H28" /></svg>Hot water
        </li>
        <li>
          <svg viewBox="0 0 28 8" aria-hidden="true"><path className="condensate" d="M0 4H28" /></svg>An HVAC unit's condensate
        </li>
        <li>
          <svg viewBox="0 0 28 8" aria-hidden="true"><path className="drain" d="M0 4H28" /></svg>Drains to traps and the main (dashed)
        </li>
        <li>
          <svg viewBox="0 0 28 8" aria-hidden="true"><path className="main" d="M0 4H28" /></svg>The main, Ø110, to the chambers and the waste
        </li>
      </ul>
    </Box>
  )
}
