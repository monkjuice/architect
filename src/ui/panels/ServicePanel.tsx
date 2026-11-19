import { resetRoutes, type RoutedTab } from '../../model/edit'
import { deleteItems, setApplianceFuel, setAreaRadiant, setFixturePlumbing, setGasMaterial, setGasRouting, setHeatingMaterial, setPipeMaterial, turnServices, updateService } from '../../model/edit'
import { applianceOf, GAS_PIPE_TITLES, GAS_ROUTING_TITLES, gasSizeLabel, GASES, USUAL_GAS_PIPE, USUAL_GAS_ROUTING } from '../../model/gas'
import { GAS_ROUTE } from '../../model/gasRouting'
import { dist } from '../../model/geometry'
import { HEATING_CHOICES, LOAD, RADIANT, USUAL_HEATING } from '../../model/hvac'
import { findLayer, GAS_INSIDE_MATERIALS, GAS_MATERIALS, GAS_ROUTING_CHOICES, type FittingMaterial, type GasInsideMaterial, type GasMaterial, type GasRoutingChoice, type HeatingMaterial, type PipeMaterial, type Ref, type Service, type ServiceKind } from '../../model/plan'
import { networkOf, PIPE_CHOICES, PIPE_TITLES, USUAL_PIPE, WELL_CLEARANCE } from '../../model/plumbing'
import { findRun, routeKey, TREE_KINDS } from '../../model/routing'
import { editableOn, isRound, SERVICES, serviceInfo, sizeForSpec, specLabel, specOf, tabOf, type ServiceTab } from '../../model/services'
import { getGas, getHvac, getPlumbing } from '../../state/derived'
import { getStore, useEditor } from '../../state/store'
import { Box, CheckField, NumberField, SelectField } from '../fields'

const MEASURE_LABELS = { capacity: 'Capacity', power: 'Output', flow: 'Flow', circuits: 'Circuits' } as const

/** Whether a ref is a piece of this tab's equipment. */
const isOf = (plan: Parameters<typeof findLayer>[0], r: Ref, tab: ServiceTab): boolean => {
  const s = findLayer(plan, r.layer)?.services[r.id]
  return !!s && editableOn(serviceInfo(s.kind), tab)
}

/**
 * What is selected on the Plumbing, HVAC or Gas tab, the way the Floor tab's Selection section works: a piece's type,
 * its size, how it is turned and what it is rated at (resizing changes the rating, and typing a rating resizes it),
 * what it needs from the other tabs, and where it stands; a picked pipe, line or duct; on HVAC, a room's loads; on
 * Gas, a cooker's fuel.
 */
export function ServicePanel({ tab }: { tab: ServiceTab }) {
  const store = getStore()
  const plan = useEditor((s) => s.plan)
  const selection = useEditor((s) => s.selection)
  const pipePick = useEditor((s) => s.pipePick)
  const picked = selection.filter((r) => r.kind === 'service' && isOf(plan, r, tab))
  const room = tab === 'hvac' && selection.length === 1 && selection[0].kind === 'area' ? selection[0] : null
  const cooker = tab === 'gas' && selection.length === 1 && selection[0].kind === 'furniture' ? selection[0] : null

  if (!picked.length && pipePick?.tab === tab) return tab === 'plumbing' ? <PipeDetails /> : tab === 'hvac' ? <HvacRunDetails /> : <GasRunDetails />
  if (room) return <RoomDetails room={room} />
  if (cooker) return <CookerDetails cooker={cooker} />
  if (!picked.length) {
    return (
      <Box id="service-selection" title="Selection">
        <p className="muted">
          Nothing selected. With Select (V), click a piece of equipment or a {tab === 'plumbing' ? 'pipe' : tab === 'hvac' ? 'pipe, a line or a duct, or a room' : 'pipe, or a cooker'}, or drag a box round several pieces.
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
  // the kinds it can be swapped for: those of its tab that play the same part (a gas water heater for an electric one,
  // a septic tank for a biodigestor, gas cylinders for a meter)
  const alike = SERVICES.filter((i) => i.role === info.role && tabOf(i) === tabOf(info))
  const set = (next: Service) => store.edit((p) => updateService(p, layerId, id, next))
  const plumbing = getPlumbing(plan)
  const gas = getGas(plan)
  const mine = (r: Ref) => r.layer === layerId && r.id === id
  const here = [...plumbing.equipment, ...plumbing.linked, ...gas.pieces].find((e) => mine(e.ref))
  const burns = gas.appliances.find((a) => a.ref.kind === 'service' && mine(a.ref))
  const isSupply = tabOf(info) === 'gas' && info.role === 'gas-source'
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
        {s.kind === 'gas-valve' && (
          <NumberField
            label="Reserve"
            unit="kcal/h"
            digits={0}
            value={s.reserve ?? 0}
            min={0}
            onCommit={(reserve) => set(reserve > 0 ? { ...s, reserve } : { ...s, reserve: undefined })}
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
              info.links.gas && `burns gas the Gas tab pipes to it${burns ? ` (about ${Math.round(burns.burns / 100) * 100} kcal/h)` : ''}`,
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
        {isSupply && gas.supply.some((p) => mine(p.ref)) && (
          <p className={gas.flow > gas.capacity + 1e-9 ? 'hint field-wide warning' : 'hint field-wide'}>
            The appliances burn {gas.flow.toFixed(2)} m³/h of {GASES[gas.gas!].title.toLowerCase()} at once; the supply gives{' '}
            {gas.gas === 'natural' ? `${gas.capacity} m³/h` : `about ${gas.capacity.toFixed(2)} m³/h in winter`}.
          </p>
        )}
        {isSupply && !gas.supply.some((p) => mine(p.ref)) && <p className="hint field-wide warning">Left out: there is a natural gas meter, and an installation runs on one gas.</p>}
        {s.kind === 'gas-valve' && <ValveNote id={id} layerId={layerId} />}
        {info.links?.gas && <GasStatus id={id} layerId={layerId} />}
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
        <RouteControls tab="plumbing" run={run} />
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
        <RouteControls tab="hvac" run={run} />
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
/**
 * Whether a picked run has been routed by hand, and how to move it: drag a stretch across, or the arrow keys; Reset
 * gives it (and what it leads to) back to the automatic route. Drain mains are routed automatically.
 */
function RouteControls({ tab, run }: { tab: RoutedTab; run: { kind: string; to?: Ref; ends?: Ref[] } }) {
  const store = getStore()
  const plan = useEditor((s) => s.plan)
  const routes = (tab === 'plumbing' ? plan.plumbing?.routes : tab === 'hvac' ? plan.hvac?.routes : plan.gas?.routes) ?? {}
  const ends = TREE_KINDS.includes(run.kind) ? (run.ends?.length ? run.ends : run.to ? [run.to] : []) : run.to ? [run.to] : []
  if (!ends.length) return <p className="hint field-wide">A drain main: routed from the traps to the chamber and on automatically.</p>
  const keys = ends.map((r) => routeKey(run.kind, r)).filter((k) => routes[k])
  return (
    <>
      <p className="hint field-wide">
        {keys.length ? `Routed by hand${ends.length > 1 ? ` (${keys.length} of the ${ends.length} it leads to)` : ''}. ` : ''}
        Drag a stretch of it across to move it, or use the arrow keys (Shift: 25 cm){ends.length > 1 ? `; a main moves the way to all ${ends.length} it leads to` : ''}.
      </p>
      {keys.length > 0 && (
        <div className="button-row field-wide">
          <button onClick={() => store.edit((p) => resetRoutes(p, tab, keys))} title="Back to the route worked out for it">
            Reset route
          </button>
        </div>
      )}
    </>
  )
}
/** How many of a tab's routes were set by hand, with a way to give them all back to the automatic ones. */
export function RoutesSummary({ tab }: { tab: RoutedTab }) {
  const store = getStore()
  const plan = useEditor((s) => s.plan)
  const n = Object.keys((tab === 'plumbing' ? plan.plumbing?.routes : tab === 'hvac' ? plan.hvac?.routes : plan.gas?.routes) ?? {}).length
  return (
    <p className="hint field-wide">
      {n ? `${n} route${n > 1 ? 's' : ''} set by hand. ` : ''}Click a pipe and drag a stretch of it across, or nudge it with the arrow keys, to route it by hand; it keeps that route as the plan changes.{' '}
      {n > 0 && (
        <button className="ghost small" onClick={() => store.edit((p) => resetRoutes(p, tab))}>
          Reset all
        </button>
      )}
    </p>
  )
}

/** How the gas pipe is routed and what it is made of outside the buildings and inside them: the whole installation's. */
export function GasPipeFields() {
  const store = getStore()
  const plan = useEditor((s) => s.plan)
  const inside = plan.gas?.material ?? USUAL_GAS_PIPE
  return (
    <>
      <SelectField<GasRoutingChoice>
        label="Routing"
        value={plan.gas?.routing ?? USUAL_GAS_ROUTING}
        options={GAS_ROUTING_CHOICES.map((r) => [r, GAS_ROUTING_TITLES[r]] as const)}
        onChange={(r) => store.edit((p) => setGasRouting(p, r === USUAL_GAS_ROUTING ? undefined : r))}
      />
      <SelectField<GasMaterial>
        label="Outside"
        value={plan.gas?.outdoor ?? inside}
        options={GAS_MATERIALS.map((m) => [m, GAS_PIPE_TITLES[m]] as const)}
        onChange={(m) => store.edit((p) => setGasMaterial(p, 'outside', m === inside ? undefined : m))}
      />
      <SelectField<GasInsideMaterial>
        label="Inside"
        value={inside}
        options={GAS_INSIDE_MATERIALS.map((m) => [m, GAS_PIPE_TITLES[m]] as const)}
        onChange={(m) => store.edit((p) => setGasMaterial(p, 'inside', m === USUAL_GAS_PIPE ? undefined : m))}
      />
      <p className="hint field-wide">
        Outside, the pipe runs along the walls {`(${GAS_ROUTE.out.toFixed(2)} m out)`} and across the open ground, and goes in through a sleeve where it is marked;
        under the house is only the shortest way. The whole installation takes these; PE-Al-PE 20 mm is the only size priced.
      </p>
    </>
  )
}

/** What a shut-off valve closes off, and how the pipe to it is sized. */
function ValveNote({ layerId, id }: { layerId: string; id: string }) {
  const plan = useEditor((s) => s.plan)
  const gas = getGas(plan)
  const run = gas.runs.find((r) => r.to?.kind === 'service' && r.to.layer === layerId && r.to.id === id)
  if (!gas.supply.length) return <p className="hint field-wide warning">Nothing supplies gas yet: put a meter or cylinders down.</p>
  if (!run) return null
  return (
    <p className="hint field-wide">
      The pipe to it is {gasSizeLabel(run.size, run.material)}, for {run.flow.toFixed(2)} m³/h: what it closes off{' '}
      {run.flow > 0 ? 'and its reserve' : '(nothing yet; give it a reserve to size the pipe for what is to come)'}.
    </p>
  )
}

/** Whether a piece that burns gas is piped yet (on any tab), and with what. */
function GasStatus({ layerId, id }: { layerId: string; id: string }) {
  const plan = useEditor((s) => s.plan)
  const gas = getGas(plan)
  const run = gas.runs.find((r) => r.to?.kind === 'service' && r.to.layer === layerId && r.to.id === id)
  if (run) return <p className="hint field-wide linked-note">Gas: piped by the Gas tab, {gasSizeLabel(run.size, run.material)} to it.</p>
  return <p className="hint field-wide warning">Gas: not piped yet. Put a natural gas meter or gas cylinders down on the Gas tab; the pipe to it is worked out there.</p>
}

/** A picked stretch of gas pipe: its size, the gas through it, where it runs and what it ends at; the pipe's material. */
function GasRunDetails() {
  const plan = useEditor((s) => s.plan)
  const pipePick = useEditor((s) => s.pipePick)!
  const gas = getGas(plan)
  const run = gas.runs[findRun(gas.runs, pipePick)]
  if (!run) {
    return (
      <Box id="service-selection" title="Selection">
        <p className="muted">The picked pipe is gone: the plan changed under it.</p>
      </Box>
    )
  }
  const appliance = run.to ? applianceOf(gas, run.to) : undefined
  const size = gasSizeLabel(run.size, run.material)
  return (
    <Box id="service-selection" title={`Selection · Gas pipe ${size}`}>
      <div className="fields">
        <p className="hint field-wide">
          Gas pipe {size}, {appliance ? `to the ${appliance.title.toLowerCase()}${appliance.room ? ` (${appliance.room})` : ''}` : 'a main'}: {run.length.toFixed(2)} m
          {run.rise ? ` + ${run.rise.toFixed(2)} m up` : ''}
          {run.outdoor > 0.05 ? `, ${run.outdoor.toFixed(2)} m buried outside` : ''}. {run.flow.toFixed(2)} m³/h through it, sized over the {gas.longest.toFixed(1)} m to the farthest appliance.
        </p>
        <RouteControls tab="gas" run={run} />
        <GasPipeFields />
        {appliance?.ref.kind === 'furniture' && <FuelField cooker={appliance.ref} />}
      </div>
    </Box>
  )
}
/** Whether a cooker burns gas or is electric. */
function FuelField({ cooker }: { cooker: Ref }) {
  const store = getStore()
  const plan = useEditor((s) => s.plan)
  const electric = plan.gas?.appliances?.[`${cooker.layer}:${cooker.id}`]?.fuel === 'electric'
  return (
    <SelectField<'gas' | 'electric'>
      label="Fuel"
      value={electric ? 'electric' : 'gas'}
      options={[
        ['gas', 'Gas'],
        ['electric', 'Electric (induction or resistive)'],
      ]}
      onChange={(fuel) => store.edit((p) => setApplianceFuel(p, cooker, fuel))}
    />
  )
}

/** A cooker picked on the Gas tab: whether it burns gas, what it burns, and what its room needs for it. */
function CookerDetails({ cooker: ref }: { cooker: Ref }) {
  const plan = useEditor((s) => s.plan)
  const gas = getGas(plan)
  const cooker = applianceOf(gas, ref)
  if (!cooker) {
    return (
      <Box id="service-selection" title="Selection">
        <p className="muted">That is not a cooker: only an oven (with its hob) burns gas among the furniture.</p>
      </Box>
    )
  }
  const vent = gas.vents.find((v) => v.roomKey === cooker.roomKey)
  return (
    <Box id="service-selection" title={`Selection · Cooker${cooker.room ? ` · ${cooker.room}` : ''}`}>
      <div className="fields">
        <FuelField cooker={ref} />
        <p className="hint field-wide">
          {cooker.electric
            ? 'Electric: it is not piped, and its room needs no vents for it. It wants a special socket on the Electricity tab.'
            : `It burns about ${Math.round(cooker.burns / 100) * 100} kcal/h and takes its air from the room${vent ? `, which gets ${vent.count} permanent vents, one low and one high` : ''}.`}
        </p>
        <p className="hint field-wide">It is the Floor tab's oven: move or delete it there.</p>
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
