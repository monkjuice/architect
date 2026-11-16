import { deleteItems, setAreaRadiant, setFixturePlumbing, setHeatingMaterial, setPipeMaterial, turnServices, updateService } from '../../model/edit'
import { dist } from '../../model/geometry'
import { HEATING_CHOICES, LOAD, RADIANT, USUAL_HEATING } from '../../model/hvac'
import { findLayer, type FittingMaterial, type HeatingMaterial, type PipeMaterial, type Ref, type Service, type ServiceKind } from '../../model/plan'
import { networkOf, PIPE_CHOICES, PIPE_TITLES, USUAL_PIPE, WELL_CLEARANCE } from '../../model/plumbing'
import { findRun } from '../../model/routing'
import { isRound, SERVICES, serviceInfo, sizeForSpec, specLabel, specOf, tabOf, type ServiceTab } from '../../model/services'
import { getHvac, getPlumbing } from '../../state/derived'
import { getStore, useEditor } from '../../state/store'
import { Box, CheckField, NumberField, SelectField } from '../fields'

const MEASURE_LABELS = { capacity: 'Capacity', power: 'Output', flow: 'Flow', circuits: 'Circuits' } as const

/** Whether a ref is a piece of this tab's equipment. */
const isOf = (plan: Parameters<typeof findLayer>[0], r: Ref, tab: ServiceTab): boolean => {
  const s = findLayer(plan, r.layer)?.services[r.id]
  return !!s && tabOf(serviceInfo(s.kind)) === tab
}

/**
 * What is selected on the Plumbing or HVAC tab, the way the Floor tab's Selection section works: a piece's type, its
 * size, how it is turned and what it is rated at (resizing changes the rating, and typing a rating resizes it), what
 * it needs from the other tabs, and where it stands; a picked pipe, line or duct; on HVAC, a room's loads.
 */
export function ServicePanel({ tab }: { tab: ServiceTab }) {
  const store = getStore()
  const plan = useEditor((s) => s.plan)
  const selection = useEditor((s) => s.selection)
  const pipePick = useEditor((s) => s.pipePick)
  const picked = selection.filter((r) => r.kind === 'service' && isOf(plan, r, tab))
  const room = tab === 'hvac' && selection.length === 1 && selection[0].kind === 'area' ? selection[0] : null

  if (!picked.length && pipePick?.tab === tab) return tab === 'plumbing' ? <PipeDetails /> : <HvacRunDetails />
  if (room) return <RoomDetails room={room} />
  if (!picked.length) {
    return (
      <Box id="service-selection" title="Selection">
        <p className="muted">
          Nothing selected. With Select (V), click a piece of equipment or a {tab === 'plumbing' ? 'pipe' : 'pipe, a line or a duct, or a room'}, or drag a box round several pieces.
          Hover anything to see what it is.
        </p>
      </Box>
    )
  }
  const remove = () => {
    store.edit((p) => deleteItems(p, picked))
    store.select([])
  }
  const title = picked.length === 1 ? serviceInfo(findLayer(plan, picked[0].layer)!.services[picked[0].id].kind).title : `${picked.length} pieces`
  return (
    <Box
      id="service-selection"
      title={`Selection · ${title}`}
      actions={
        <button className="ghost small danger" onClick={remove} title="Delete (Del)">
          Delete
        </button>
      }
    >
      {picked.length === 1 && <ServiceDetails layerId={picked[0].layer} id={picked[0].id} />}
      {picked.length > 1 && (
        <div className="button-row">
          <button onClick={() => store.edit((p) => turnServices(p, picked))} title="Turn every selected piece a quarter turn (R)">
            Turn
          </button>
        </div>
      )}
    </Box>
  )
}

function ServiceDetails({ layerId, id }: { layerId: string; id: string }) {
  const store = getStore()
  const plan = useEditor((s) => s.plan)
  const layer = findLayer(plan, layerId)
  const s = layer?.services[id]
  if (!layer || !s) return null
  const info = serviceInfo(s.kind)
  const round = isRound(s.kind)
  const spec = specOf(info, s.width, s.depth)
  // the kinds it can be swapped for: those that play the same part (a gas heater for an electric one, a septic tank for a biodigestor)
  const alike = SERVICES.filter((i) => i.role === info.role)
  const set = (next: Service) => store.edit((p) => updateService(p, layerId, id, next))
  const plumbing = getPlumbing(plan)
  const here = plumbing.equipment.find((e) => e.ref.layer === layerId && e.ref.id === id)
  const wells = s.kind === 'septic' || s.kind === 'biodigestor' || s.kind === 'soakaway' ? plumbing.equipment.filter((e) => e.kind === 'well') : []
  const gap = wells.length ? Math.min(...wells.map((w) => dist(w.at, s.at))) : null

  return (
    <>
      <div className="fields">
        <div className="field-wide">
          <b>{info.title}</b>
          {here?.room ? <span className="muted"> · {here.room}</span> : null}
        </div>
        {alike.length > 1 && (
          <SelectField<ServiceKind>
            label="Type"
            value={s.kind}
            options={alike.map((i) => [i.kind, i.title] as const)}
            // a new type comes at its own size and rating
            onChange={(kind) => {
              const to = serviceInfo(kind)
              set({ ...s, kind, width: to.width, depth: to.depth })
            }}
          />
        )}
        <NumberField
          label={round ? 'Diameter' : 'Width'}
          value={s.width}
          min={0.05}
          onCommit={(width) => set({ ...s, width, ...(round ? { depth: width } : {}) })}
        />
        {!round && <NumberField label="Depth" value={s.depth} min={0.05} onCommit={(depth) => set({ ...s, depth })} />}
        <NumberField label="Turned" unit="°" digits={0} value={s.angle} onCommit={(angle) => set({ ...s, angle: ((angle % 360) + 360) % 360 })} />
        {info.spec && spec !== null && (
          <NumberField
            label={MEASURE_LABELS[info.spec.measure]}
            unit={info.spec.unit}
            digits={0}
            value={spec}
            min={1}
            // the rating and the size are one and the same: typing one resizes the piece
            onCommit={(value) => set({ ...s, ...sizeForSpec(info, value) })}
          />
        )}
        {s.kind === 'tap' && (
          <CheckField label="Hot water too" checked={!!s.hot} onChange={(on) => set(on ? { ...s, hot: true } : { ...s, hot: undefined })} title="A mixer with hot and cold water; a garden tap is cold only" />
        )}
        <p className="hint field-wide">{info.note}</p>
        {info.links && (
          <p className="hint field-wide linked-note">
            {[
              info.links.dhw && 'makes the hot water: the Plumbing tab feeds it and takes its hot water',
              info.links.fill && !info.links.dhw && 'filled from the Plumbing tab’s cold water',
              info.links.condensate && 'its condensate drains into the Plumbing tab’s traps',
              info.links.power && 'needs an electrical point (the Electricity tab)',
            ]
              .filter(Boolean)
              .join('; ')
              .replace(/^./, (c) => c.toUpperCase())}
            .
          </p>
        )}
        {info.spec && spec !== null && (
          <p className="hint field-wide">
            {specLabel(info, spec)} at {s.width.toFixed(2)} × {s.depth.toFixed(2)} m: {info.spec.scale === 'width' ? 'its length sets it' : 'its footprint sets it'}
            {info.spec.steps ? ', rounded to the sizes it is sold in' : ''}.
          </p>
        )}
        {gap !== null && (
          <p className={gap < WELL_CLEARANCE ? 'hint field-wide warning' : 'hint field-wide'}>
            {gap.toFixed(1)} m from the nearest well (keep at least {WELL_CLEARANCE} m).
          </p>
        )}
        {here?.inside && info.outdoor && <p className="hint field-wide warning">It stands inside a building: put it outside, on the lot.</p>}
      </div>
      <div className="button-row">
        <button onClick={() => store.edit((p) => turnServices(p, [{ layer: layerId, kind: 'service', id }]))} title="A quarter turn where it stands (R)">
          Turn
        </button>
      </div>
    </>
  )
}

const NETWORK_TITLES = { cold: 'Cold water', hot: 'Hot water', drain: 'Drains' } as const
const RUN_TITLES = { feed: 'Supply', cold: 'Cold water', hot: 'Hot water', drain: 'Drain', condensate: 'Condensate drain' } as const
const FITTING_OPTIONS: readonly (readonly [FittingMaterial, string])[] = [
  ['metal', 'Metal'],
  ['plastic', 'Plastic'],
]

/**
 * A picked pipe: what it is, where it runs, what its whole network is made of (pipes are not chosen one by one: a
 * house runs one material per network), and, for the branch to a fixture, the fixture's own connections and trap.
 */
function PipeDetails() {
  const store = getStore()
  const plan = useEditor((s) => s.plan)
  const pipePick = useEditor((s) => s.pipePick)!
  const plumbing = getPlumbing(plan)
  const index = findRun(plumbing.runs, pipePick)
  const run = plumbing.runs[index]
  if (!run) {
    return (
      <Box id="service-selection" title="Selection">
        <p className="muted">The picked pipe is gone: the plan changed under it.</p>
      </Box>
    )
  }
  const network = networkOf(run.kind)
  const material = plan.plumbing?.materials?.[network] ?? USUAL_PIPE[network]
  const fixture = run.to?.kind === 'furniture' ? plumbing.fixtures.find((f) => f.ref.layer === run.to!.layer && f.ref.id === run.to!.id) : undefined
  const piece = run.to?.kind === 'service' ? [...plumbing.equipment, ...plumbing.linked].find((e) => e.ref.layer === run.to!.layer && e.ref.id === run.to!.id) : undefined
  const ends = fixture ? `to ${fixture.title.toLowerCase()}${fixture.room ? ` (${fixture.room})` : ''}` : piece ? `to the ${piece.info.title.toLowerCase()}` : run.kind === 'drain' ? 'a main or a trap line' : 'a main'
  return (
    <Box id="service-selection" title={`Selection · ${RUN_TITLES[run.kind]} Ø${run.size}`}>
      <div className="fields">
        <p className="hint field-wide">
          {RUN_TITLES[run.kind]} Ø{run.size} mm, {ends}: {run.length.toFixed(2)} m{run.rise ? ` + ${run.rise.toFixed(2)} m up` : ''}
          {run.outdoor > 0.05 ? `, ${run.outdoor.toFixed(2)} m buried outside` : ''}.
        </p>
        <SelectField<PipeMaterial>
          label={`${NETWORK_TITLES[network]} pipes`}
          value={material}
          options={PIPE_CHOICES[network].map((m) => [m, PIPE_TITLES[m]] as const)}
          onChange={(m) => store.edit((p) => setPipeMaterial(p, network, m === USUAL_PIPE[network] ? undefined : m))}
        />
        <p className="hint field-wide">A house runs one material per network, so this sets every {NETWORK_TITLES[network].toLowerCase()} pipe. Prices were seen for polypropylene water pipe and PVC drains; the others are priced on site.</p>
        {fixture && (
          <>
            <SelectField<FittingMaterial>
              label="Connections"
              value={fixture.connection}
              options={FITTING_OPTIONS}
              onChange={(m) => store.edit((p) => setFixturePlumbing(p, fixture.ref, { connection: m }))}
            />
            {fixture.trap && (
              <SelectField<FittingMaterial> label="Trap" value={fixture.trapMaterial} options={FITTING_OPTIONS} onChange={(m) => store.edit((p) => setFixturePlumbing(p, fixture.ref, { trap: m }))} />
            )}
            <p className="hint field-wide">
              The {fixture.title.toLowerCase()}'s own plumbing, where it is worked on: {fixture.supplies} flexible connection{fixture.supplies > 1 ? 's' : ''} with angle valves
              {fixture.trap ? ', and its trap (siphon)' : ''}, braided metal or plastic.
            </p>
          </>
        )}
      </div>
    </Box>
  )
}

const HVAC_RUN_TITLES = { heating: 'Heating', radiant: 'Radiant floor lead', refrigerant: 'Refrigerant lines', duct: 'Duct' } as const

/** A picked heating pipe, radiant lead, refrigerant line set or duct: what it is, where it runs, and the heating's material. */
function HvacRunDetails() {
  const store = getStore()
  const plan = useEditor((s) => s.plan)
  const pipePick = useEditor((s) => s.pipePick)!
  const hvac = getHvac(plan)
  const run = hvac.runs[findRun(hvac.runs, pipePick)]
  if (!run) {
    return (
      <Box id="service-selection" title="Selection">
        <p className="muted">The picked run is gone: the plan changed under it.</p>
      </Box>
    )
  }
  const piece = run.to?.kind === 'service' ? hvac.pieces.find((p) => p.ref.layer === run.to!.layer && p.ref.id === run.to!.id) : undefined
  const room = run.to?.kind === 'area' ? hvac.rooms.find((r) => r.ref.layer === run.to!.layer && r.ref.id === run.to!.id) : undefined
  const ends = piece ? `to the ${piece.info.title.toLowerCase()}${piece.room ? ` (${piece.room})` : ''}` : room ? `to ${room.name}'s ${room.loops} loop${room.loops > 1 ? 's' : ''}` : 'a main'
  const heating = run.kind === 'heating' || run.kind === 'radiant'
  return (
    <Box id="service-selection" title={`Selection · ${HVAC_RUN_TITLES[run.kind]} Ø${run.size}`}>
      <div className="fields">
        <p className="hint field-wide">
          {HVAC_RUN_TITLES[run.kind]} Ø{run.size} mm, {ends}: {run.length.toFixed(2)} m{run.rise ? ` + ${run.rise.toFixed(2)} m up` : ''}
          {run.kind === 'heating' ? ', a flow and a return side by side' : ''}.
        </p>
        {heating && (
          <>
            <SelectField<HeatingMaterial>
              label="Heating pipes"
              value={hvac.materials.heating}
              options={HEATING_CHOICES.map((m) => [m, PIPE_TITLES[m]] as const)}
              onChange={(m) => store.edit((p) => setHeatingMaterial(p, m === USUAL_HEATING ? undefined : m))}
            />
            <p className="hint field-wide">One material for every heating pipe and radiant loop.</p>
          </>
        )}
        {run.kind === 'refrigerant' && <p className="hint field-wide">Insulated copper, a liquid and a gas line together, from the indoor unit to its outdoor unit.</p>}
        {run.kind === 'duct' && <p className="hint field-wide">Out through the nearest outside wall, to a grille.</p>}
      </div>
    </Box>
  )
}

/** A room on the HVAC tab: what it needs and what heats and cools it, its radiant floor, its ventilation. */
function RoomDetails({ room: ref }: { room: Ref }) {
  const store = getStore()
  const plan = useEditor((s) => s.plan)
  const room = getHvac(plan).rooms.find((r) => r.ref.layer === ref.layer && r.ref.id === ref.id)
  if (!room) {
    return (
      <Box id="service-selection" title="Selection">
        <p className="muted">That area is not an indoor room: it has no loads.</p>
      </Box>
    )
  }
  const round = (x: number) => Math.round(x / 10) * 10
  const state = (have: number, need: number) => (have <= 0 ? 'hint field-wide' : have < need * 0.9 ? 'hint field-wide warning' : 'hint field-wide')
  return (
    <Box id="service-selection" title={`Selection · ${room.name}`}>
      <div className="fields">
        <p className="hint field-wide">
          {room.floor.toFixed(2)} m² × {room.height.toFixed(2)} m = {room.volume.toFixed(1)} m³. It wants about {LOAD.heat} kcal/h and {LOAD.cool} frig/h per m³.
        </p>
        <p className={state(room.heat, room.heatNeed)}>
          Heat: {round(room.heat)} of {round(room.heatNeed)} kcal/h{room.emitters.length ? ` — ${room.emitters.join(', ')}` : ' — nothing heats it'}.
        </p>
        <p className={state(room.cool, room.coolNeed)}>
          Cooling: {round(room.cool)} of {round(room.coolNeed)} frig/h{room.cool <= 0 ? ' — no split unit' : ''}.
        </p>
        <CheckField
          label="Radiant floor"
          checked={room.radiant}
          onChange={(on) => store.edit((p) => setAreaRadiant(p, [ref], on))}
          title="Loops of pipe in its screed, fed from the nearest underfloor manifold on its floor"
        />
        {room.radiant && (
          <p className="hint field-wide">
            {room.loops} loop{room.loops > 1 ? 's' : ''} every {RADIANT.spacing.toFixed(2)} m, {round(room.floor * RADIANT.output)} kcal/h ({RADIANT.output} kcal/h per m²).
          </p>
        )}
        {room.wet && (
          <p className={!room.window && !room.extractor ? 'hint field-wide warning' : 'hint field-wide'}>
            A wet room: {room.window ? 'it has a window' : room.extractor ? 'no window, but an extractor' : 'no window and no extractor: put an extractor fan in it'}.
          </p>
        )}
      </div>
    </Box>
  )
}
