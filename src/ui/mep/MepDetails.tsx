import { useId, type ReactNode } from 'react'
import { GAS_PIPE_TITLES, GAS_TRENCH, gasSizeLabel } from '../../model/gas'
import { GAS_ROUTE } from '../../model/gasRouting'
import { KIND_COLORS, MEP, type MepDetail, type MepSpot } from '../../model/mep'
import { CHAMBER, DRAIN, PIPE_TITLES } from '../../model/plumbing'
import { BURIED_DEPTH } from '../../model/wiring'
import { getGas, getMep, getPlumbing, getWiring } from '../../state/derived'
import { useEditor } from '../../state/store'

/**
 * Construction details of how the installations go through the walls and under the ground, drawn as sections with the
 * plan's own values (depths, heights, materials, sizes): the gas coming into the house, a drain leaving it for its
 * chamber, a buried cable between buildings, and water pipes in a wall chase. Each says where on the plan it happens
 * (the MEP plan's `spots`), to look at it there in 3-D or on the plan. They are usual practice drawn to scale, a guide
 * for the site, not the installers' own drawings.
 */

const C = {
  earth: '#cdb48c',
  backfill: '#e0cfab',
  earthLine: '#9c8057',
  concrete: '#cfccc5',
  concreteLine: '#8f8b83',
  brick: '#cf8a6a',
  brickLine: '#9a5a3e',
  screed: '#e2ddd3',
  sand: '#efe3bd',
  mortar: '#dcd6ca',
  ink: '#2b2a28',
  muted: '#6a665f',
  tape: '#e2b007',
}

/** A note with a leader from the point it is about. */
function Note({ at, to, text, anchor = 'start' }: { at: [number, number]; to: [number, number]; text: string | string[]; anchor?: 'start' | 'end' | 'middle' }) {
  const lines = Array.isArray(text) ? text : [text]
  return (
    <g className="detail-note">
      <path d={`M${at[0]} ${at[1]}L${to[0]} ${to[1]}`} stroke={C.muted} strokeWidth={0.8} fill="none" />
      <circle cx={at[0]} cy={at[1]} r={1.8} fill={C.muted} />
      {lines.map((l, i) => (
        <text key={i} x={to[0] + (anchor === 'start' ? 3 : anchor === 'end' ? -3 : 0)} y={to[1] + 3.5 + i * 12} fontSize={10.5} fill={C.ink} textAnchor={anchor}>
          {l}
        </text>
      ))}
    </g>
  )
}

/** A dimension line between two points with its value. */
function Dim({ a, b, text, side = 1 }: { a: [number, number]; b: [number, number]; text: string; side?: number }) {
  const vertical = Math.abs(a[0] - b[0]) < 1e-6
  const [mx, my] = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]
  const tick = (p: [number, number]) => (vertical ? `M${p[0] - 4} ${p[1]}L${p[0] + 4} ${p[1]}` : `M${p[0]} ${p[1] - 4}L${p[0]} ${p[1] + 4}`)
  return (
    <g>
      <path d={`M${a[0]} ${a[1]}L${b[0]} ${b[1]}${tick(a)}${tick(b)}`} stroke={C.ink} strokeWidth={0.8} fill="none" />
      <text
        x={vertical ? mx + 6 * side : mx}
        y={vertical ? my + 3.5 : my - 5}
        fontSize={10}
        fill={C.ink}
        textAnchor={vertical ? (side > 0 ? 'start' : 'end') : 'middle'}
      >
        {text}
      </text>
    </g>
  )
}

/** Hatches for earth, concrete, sand and brick, with ids unique to one drawing. */
function Patterns({ id }: { id: string }) {
  return (
    <defs>
      <pattern id={`${id}-earth`} width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <rect width="10" height="10" fill={C.earth} />
        <path d="M0 0V10" stroke={C.earthLine} strokeWidth="0.7" />
      </pattern>
      <pattern id={`${id}-concrete`} width="12" height="12" patternUnits="userSpaceOnUse">
        <rect width="12" height="12" fill={C.concrete} />
        <circle cx="3" cy="4" r="0.9" fill={C.concreteLine} />
        <circle cx="9" cy="9" r="0.7" fill={C.concreteLine} />
        <path d="M7 2l1.5 1.5-2 .5z" fill={C.concreteLine} />
      </pattern>
      <pattern id={`${id}-sand`} width="6" height="6" patternUnits="userSpaceOnUse">
        <rect width="6" height="6" fill={C.sand} />
        <circle cx="2" cy="2" r="0.6" fill={C.earthLine} />
      </pattern>
      <pattern id={`${id}-brick`} width="24" height="12" patternUnits="userSpaceOnUse">
        <rect width="24" height="12" fill={C.brick} />
        <path d="M0 0H24M0 6H24M12 0V6M0 6V12M24 6V12" stroke={C.brickLine} strokeWidth="0.7" />
      </pattern>
    </defs>
  )
}

const fmt = (x: number) => x.toFixed(2)

/**
 * The gas coming into the house: buried, up out of the ground beside the wall, through it in a sleeve above the floor
 * inside, down into the sub-floor under the screed, and up to the appliance. The floor stands on its plinth as the
 * plan's example entry does.
 */
function GasEntry() {
  const plan = useEditor((s) => s.plan)
  const gas = getGas(plan)
  const spot = getMep(plan).spots.find((x) => x.detail === 'gas-entry')
  // the floor inside, m over the ground: the example entry's
  const F = Math.max(0, Math.min(0.6, spot ? spot.at.z - MEP.gasEntry : 0))
  const id = useId().replace(/:/g, '')
  const S = 160
  const ground = 175
  const y = (z: number) => ground - z * S
  const face = 300
  const wall = 0.3 * S
  const riser = face - GAS_ROUTE.out * S
  const pipe = KIND_COLORS.gas
  const r = 5
  const APP = 470
  const run = gas.runs.find((x) => x.outdoor > 0)
  const size = run ? gasSizeLabel(run.size, gas.materials.outside) : ''
  const way = `M20 ${y(-GAS_TRENCH.depth)}H${riser}V${y(F + MEP.gasEntry)}H${face + wall + 40}V${y(F + MEP.gasFloor)}H${APP}V${y(F + MEP.point)}`
  return (
    <svg viewBox="0 0 560 300" role="img" aria-label="Gas pipe coming into the house">
      <Patterns id={id} />
      {/* earth, the trench in it, the wall on its footing, the floor inside on its plinth */}
      <rect x={0} y={ground} width={face} height={200} fill={`url(#${id}-earth)`} />
      <rect x={face + wall} y={y(F - 0.17)} width={560} height={300} fill={`url(#${id}-earth)`} />
      <rect x={40} y={ground} width={riser + 30 - 40} height={GAS_TRENCH.depth * S + 14} fill={C.backfill} stroke={C.earthLine} strokeDasharray="4 3" />
      <rect x={40} y={y(-GAS_TRENCH.depth) - 12} width={riser + 30 - 40} height={26} fill={`url(#${id}-sand)`} />
      <rect x={face - 20} y={Math.min(ground, y(F - 0.17))} width={wall + 40} height={0.4 * S} fill={`url(#${id}-concrete)`} stroke={C.concreteLine} />
      <rect x={face} y={0} width={wall} height={Math.min(ground, y(F - 0.17))} fill={`url(#${id}-brick)`} stroke={C.brickLine} />
      <rect x={face + wall} y={y(F - 0.05)} width={560} height={0.12 * S} fill={`url(#${id}-concrete)`} stroke={C.concreteLine} />
      <rect x={face + wall} y={y(F)} width={560} height={0.05 * S} fill={C.screed} stroke={C.concreteLine} />
      <path d={`M0 ${ground}H${face}`} stroke={C.ink} strokeWidth={1.2} />
      <path d={`M50 ${y(-GAS_TRENCH.depth + 0.2)}H${riser - 12}`} stroke={C.tape} strokeWidth={3} strokeDasharray="8 4" />
      {/* the sleeve through the wall */}
      <rect x={face - 6} y={y(F + MEP.gasEntry) - 11} width={wall + 12} height={22} fill="#f1efe9" stroke={C.ink} strokeWidth={0.8} />
      <path d={way} stroke={pipe} strokeWidth={2 * r} fill="none" strokeLinejoin="round" />
      <path d={way} stroke="#8a6d00" strokeWidth={0.8} fill="none" />
      {/* the valve at the appliance */}
      <path d={`M${APP - 8} ${y(F + MEP.point) + 22}L${APP + 8} ${y(F + MEP.point) + 32}V${y(F + MEP.point) + 22}L${APP - 8} ${y(F + MEP.point) + 32}Z`} fill={C.ink} />
      <rect x={APP - 35} y={y(F + MEP.point) - 14} width={70} height={14} fill="#fff" stroke={C.ink} strokeWidth={0.8} />
      <text x={APP} y={y(F + MEP.point) - 4} fontSize={9} textAnchor="middle" fill={C.ink}>
        appliance
      </text>
      <Dim a={[riser - 22, ground]} b={[riser - 22, y(-GAS_TRENCH.depth)]} text={`${fmt(GAS_TRENCH.depth)} m`} side={-1} />
      <Dim a={[riser, ground - 12]} b={[face, ground - 12]} text={`${fmt(GAS_ROUTE.out)}`} />
      <Dim a={[face + wall + 16, y(F)]} b={[face + wall + 16, y(F + MEP.gasEntry)]} text={`+${fmt(MEP.gasEntry)}`} />
      {F > 0.05 && <Dim a={[face - 40, ground]} b={[face - 40, y(F)]} text={`floor +${fmt(F)}`} side={-1} />}
      <Note at={[120, y(-GAS_TRENCH.depth)]} to={[70, 292]} text={`Outside: ${GAS_PIPE_TITLES[gas.materials.outside]}${size ? ` ${size}` : ''}, on sand in a ${fmt(GAS_TRENCH.width)} m trench`} />
      <Note at={[riser, y(0.15)]} to={[232, 110]} text={['Comes up out of the ground', 'beside the wall']} anchor="end" />
      <Note at={[face + 10, y(F + MEP.gasEntry) - 11]} to={[214, 22]} text={['Through the wall in a sleeve,', `${fmt(MEP.gasEntry)} m over the floor inside`]} anchor="end" />
      <Note at={[430, y(F + MEP.gasFloor)]} to={[372, 250]} text={[`Inside: ${GAS_PIPE_TITLES[gas.materials.inside]},`, 'in the sub-floor, under the screed']} />
      <Note at={[APP + 8, y(F + MEP.point) + 27]} to={[486, 84]} text={['Valve at', 'the appliance']} />
    </svg>
  )
}

/** A drain leaving the building: under the floor at its cover, falling, through the footing in a sleeve, into its chamber. */
function DrainExit() {
  const plan = useEditor((s) => s.plan)
  const p = getPlumbing(plan)
  const id = useId().replace(/:/g, '')
  const S = 100
  const floor = 80
  const y = (z: number) => floor - z * S
  const face = 300
  const wall = 0.3 * S
  const trapX = 70
  const inner = 0.6 * S
  const chamberX = face + wall + CHAMBER.out * S - inner / 2
  const run = (chamberX - trapX) / S
  // the fall drawn five times steeper than it is, to be seen
  const drop = run * DRAIN.slope
  const EX = 5
  const zAt = (x: number) => -(DRAIN.cover + ((x - trapX) / S) * DRAIN.slope * EX)
  const pipe = KIND_COLORS.drain
  const depth = DRAIN.cover + drop
  const bottom = y(-(DRAIN.cover + drop * EX) - 0.12)
  return (
    <svg viewBox="0 0 560 300" role="img" aria-label="A drain leaving the building for its chamber">
      <Patterns id={id} />
      <rect x={0} y={y(-0.15)} width={560} height={300} fill={`url(#${id}-earth)`} />
      <rect x={face + wall} y={floor} width={560} height={y(-0.15) - floor} fill={`url(#${id}-earth)`} />
      <rect x={0} y={floor} width={face} height={0.05 * S} fill={C.screed} stroke={C.concreteLine} />
      <rect x={0} y={y(-0.05)} width={face} height={0.1 * S} fill={`url(#${id}-concrete)`} stroke={C.concreteLine} />
      <rect x={face} y={0} width={wall} height={floor} fill={`url(#${id}-brick)`} stroke={C.brickLine} />
      <rect x={face - 15} y={floor} width={wall + 30} height={0.8 * S} fill={`url(#${id}-concrete)`} stroke={C.concreteLine} />
      <path d={`M${face + wall} ${floor}H560`} stroke={C.ink} strokeWidth={1.2} />
      {/* the floor trap and the chamber */}
      <rect x={trapX - 12} y={floor - 2} width={24} height={y(-DRAIN.cover) - floor + 8} fill="#f1efe9" stroke={C.ink} strokeWidth={0.8} />
      <rect x={chamberX - 8} y={floor - 4} width={inner + 16} height={bottom - floor + 12} fill={`url(#${id}-concrete)`} stroke={C.concreteLine} />
      <rect x={chamberX} y={floor + 4} width={inner} height={bottom - floor} fill="#f1efe9" stroke={C.concreteLine} />
      <rect x={chamberX - 10} y={floor - 8} width={inner + 20} height={6} fill={C.concreteLine} />
      {/* the sleeve through the footing, and the pipe falling to the chamber */}
      <rect x={face - 18} y={y(zAt(face)) - 10} width={wall + 36} height={20} fill="#f1efe9" stroke={C.ink} strokeWidth={0.8} />
      <path d={`M${trapX} ${y(zAt(trapX))}L${chamberX + 20} ${y(zAt(chamberX + 20))}`} stroke={pipe} strokeWidth={11} fill="none" />
      <path d={`M${trapX} ${y(zAt(trapX))}L${chamberX + 20} ${y(zAt(chamberX + 20))}`} stroke="#7a5a36" strokeWidth={0.8} fill="none" />
      <Dim a={[trapX + 30, floor]} b={[trapX + 30, y(-DRAIN.cover)]} text={`${fmt(DRAIN.cover)} m`} />
      <Dim a={[chamberX + inner + 22, floor]} b={[chamberX + inner + 22, y(zAt(chamberX))]} text={`≈ ${fmt(p.fall?.depth ?? depth)} m deep`} />
      <Note at={[trapX, floor + 4]} to={[40, 20]} text="Floor trap" />
      <Note at={[190, y(zAt(190))]} to={[130, 250]} text={[`Ø${DRAIN.main} ${PIPE_TITLES[p.materials.drain]}, under the floor`, `falling ${DRAIN.slope * 100} % (drawn ${EX}× steeper)`]} />
      <Note at={[face + wall / 2, y(zAt(face)) + 10]} to={[face + 40, 285]} text="Through the footing in a sleeve" />
      <Note at={[chamberX + inner / 2, floor - 5]} to={[556, 20]} text={[`Inspection chamber 60 × 60 cm,`, `its centre ${fmt(CHAMBER.out)} m out from the wall`]} anchor="end" />
    </svg>
  )
}

/** A buried cable between buildings: the trench in section, and where it comes up the wall. */
function BuriedCable() {
  const plan = useEditor((s) => s.plan)
  const w = getWiring(plan)
  const id = useId().replace(/:/g, '')
  const S = 220
  const ground = 100
  const y = (z: number) => ground - z * S
  const x0 = 150
  const width = 0.3 * S
  const pipeName = w.boards.flatMap((b) => b.circuits).find((c) => c.buriedPipe)?.buriedPipe
  const cable = KIND_COLORS.cable
  const wallX = 420
  return (
    <svg viewBox="0 0 560 300" role="img" aria-label="A buried cable between buildings">
      <Patterns id={id} />
      <rect x={0} y={ground} width={wallX} height={300} fill={`url(#${id}-earth)`} />
      <rect x={x0} y={ground} width={width} height={BURIED_DEPTH * S + 20} fill={C.backfill} stroke={C.earthLine} strokeDasharray="4 3" />
      <rect x={x0} y={y(-BURIED_DEPTH) - 8} width={width} height={28} fill={`url(#${id}-sand)`} />
      <path d={`M0 ${ground}H${wallX}`} stroke={C.ink} strokeWidth={1.2} />
      <path d={`M${x0 + 6} ${y(-BURIED_DEPTH + 0.2)}H${x0 + width - 6}`} stroke={C.tape} strokeWidth={3} strokeDasharray="6 3" />
      <circle cx={x0 + width / 2} cy={y(-BURIED_DEPTH)} r={9} fill="#f1efe9" stroke={C.ink} strokeWidth={1} />
      <circle cx={x0 + width / 2} cy={y(-BURIED_DEPTH)} r={5} fill={cable} />
      {/* where it comes up: along the wall in the conduit, into the building */}
      <rect x={wallX} y={0} width={0.3 * S} height={300} fill={`url(#${id}-brick)`} stroke={C.brickLine} />
      <path d={`M${x0 + width} ${y(-BURIED_DEPTH)}H${wallX - 14}V${y(0.35)}H${wallX + 40}`} stroke={cable} strokeWidth={8} fill="none" strokeLinejoin="round" />
      <rect x={wallX + 40} y={y(0.35) - 12} width={18} height={24} fill="#fff" stroke={C.ink} strokeWidth={0.8} />
      <Dim a={[x0 - 20, ground]} b={[x0 - 20, y(-BURIED_DEPTH)]} text={`${fmt(BURIED_DEPTH)} m`} side={-1} />
      <Dim a={[x0, ground + BURIED_DEPTH * S + 30]} b={[x0 + width, ground + BURIED_DEPTH * S + 30]} text="0.30" />
      <Note at={[x0 + width / 2 + 6, y(-BURIED_DEPTH)]} to={[250, 205]} text={[`Rigid PVC pipe${pipeName ? ` ${pipeName}` : ''} with the`, 'subterranean 3-core cable, on sand']} />
      <Note at={[x0 + width - 10, y(-BURIED_DEPTH + 0.2)]} to={[250, 165]} text="Warning tape 0.20 m over it" />
      <Note at={[wallX - 14, y(0.1)]} to={[390, 40]} text={['Up the wall', 'in the conduit']} anchor="end" />
      <Note at={[wallX + 58, y(0.35)]} to={[490, 60]} text="Box inside" />
    </svg>
  )
}

/** Water pipes in the floor's screed, turning up a chase in the wall to the fixture's points; and the chase in plan. */
function WallChase() {
  const plan = useEditor((s) => s.plan)
  const p = getPlumbing(plan)
  const id = useId().replace(/:/g, '')
  const S = 200
  const floor = 230
  const y = (z: number) => floor - z * S
  const chase = 250
  const cold = KIND_COLORS.cold
  const hot = KIND_COLORS.hot
  return (
    <svg viewBox="0 0 560 300" role="img" aria-label="Water pipes in a wall chase">
      <Patterns id={id} />
      {/* the wall's face, the chase in it, the floor's build-up */}
      <rect x={60} y={10} width={300} height={floor - 10} fill={`url(#${id}-brick)`} stroke={C.brickLine} />
      <rect x={chase - 8} y={y(MEP.point) - 12} width={44} height={floor - y(MEP.point) + 12} fill={C.mortar} stroke={C.ink} strokeWidth={0.6} strokeDasharray="3 2" />
      <rect x={0} y={floor} width={380} height={0.06 * S} fill={C.screed} stroke={C.concreteLine} />
      <rect x={0} y={floor + 0.06 * S} width={380} height={0.12 * S} fill={`url(#${id}-concrete)`} stroke={C.concreteLine} />
      <path d={`M20 ${y(-MEP.screed)}H${chase}V${y(MEP.point)}`} stroke={cold} strokeWidth={6} fill="none" strokeLinejoin="round" />
      <path d={`M20 ${y(-MEP.screed) + 8}H${chase + 20}V${y(MEP.point)}`} stroke={hot} strokeWidth={6} fill="none" strokeLinejoin="round" />
      <circle cx={chase} cy={y(MEP.point)} r={4} fill={C.ink} />
      <circle cx={chase + 20} cy={y(MEP.point)} r={4} fill={C.ink} />
      <Dim a={[90, floor]} b={[90, y(MEP.point)]} text={`${fmt(MEP.point)} m`} />
      <Note at={[chase + 10, y(0.3)]} to={[120, 40]} text={['Chase cut in the brick, the pipes', 'fixed in it, filled with mortar']} />
      <Note at={[150, y(-MEP.screed) + 4]} to={[20, 290]} text={`In the screed: ${PIPE_TITLES[p.materials.cold]}, cold and hot`} />
      <Note at={[chase + 20, y(MEP.point)]} to={[300, 60]} text={['Points for the fixture,', 'cold and hot side by side']} />
      {/* the chase in plan: the wall cut, two pipes in it, the mortar and plaster over them */}
      <g transform="translate(410 150)">
        <rect x={0} y={0} width={130} height={0.15 * S * 1.6} fill={`url(#${id}-brick)`} stroke={C.brickLine} />
        <rect x={40} y={0} width={50} height={0.06 * S * 1.6} fill={C.mortar} stroke={C.ink} strokeWidth={0.6} />
        <circle cx={55} cy={9} r={5} fill={cold} />
        <circle cx={75} cy={9} r={5} fill={hot} />
        <rect x={0} y={-4} width={130} height={4} fill="#ece9e2" stroke={C.concreteLine} strokeWidth={0.5} />
        <text x={65} y={-12} fontSize={10} textAnchor="middle" fill={C.ink}>
          the chase in plan
        </text>
        <text x={65} y={0.15 * S * 1.6 + 14} fontSize={9.5} textAnchor="middle" fill={C.muted}>
          plaster on the room side
        </text>
      </g>
    </svg>
  )
}

const DETAILS: Record<MepDetail, { title: string; drawing: () => ReactNode; says: string[] }> = {
  'gas-entry': {
    title: 'Gas into the house',
    drawing: () => <GasEntry />,
    says: [
      `Buried ${GAS_TRENCH.depth.toFixed(2)} m deep outside, it comes up beside the wall and goes through it ${MEP.gasEntry.toFixed(2)} m over the floor inside, above the damp course, in a sleeve sealed round the pipe.`,
      `Inside it runs low in the sub-floor, ${(-MEP.gasFloor).toFixed(2)} m under the floor, below the water, the heating and the floor's conduits in the screed, so it crosses them apart; a valve at each appliance.`,
    ],
  },
  'drain-exit': {
    title: 'A drain leaving the building',
    drawing: () => <DrainExit />,
    says: [
      `Under the floor at ${DRAIN.cover.toFixed(2)} m, falling ${DRAIN.slope * 100} %, through the footing in a sleeve to the inspection chamber outside; the chamber's depth follows the fall.`,
    ],
  },
  'buried-cable': {
    title: 'A cable between buildings',
    drawing: () => <BuriedCable />,
    says: [`Subterranean cable in a rigid PVC pipe ${BURIED_DEPTH.toFixed(2)} m deep, on sand, a warning tape over it; it comes up the wall in its conduit to a box inside.`],
  },
  'wall-chase': {
    title: 'Water pipes in a wall',
    drawing: () => <WallChase />,
    says: [`Cold and hot water in the screed, turning up a chase in the wall to the fixture's points at ${MEP.point.toFixed(2)} m; the chase is filled with mortar and plastered over.`],
  },
}

/** The details, each with where on the plan it happens, to look at there. */
export function MepDetails({ onShow }: { onShow: (spot: MepSpot, where: 'plan' | '3d') => void }) {
  const plan = useEditor((s) => s.plan)
  const spots = getMep(plan).spots
  return (
    <div className="mep-details">
      {(Object.keys(DETAILS) as MepDetail[]).map((key) => {
        const d = DETAILS[key]
        const spot = spots.find((s) => s.detail === key)
        return (
          <section key={key} className="mep-detail" data-detail={key}>
            <h3>{d.title}</h3>
            {d.drawing()}
            <ul>
              {d.says.map((t) => (
                <li key={t}>{t}</li>
              ))}
              <li>{spot ? `On this plan: ${spot.label}.` : 'Not on this plan yet.'}</li>
            </ul>
            {spot && (
              <div className="button-row">
                <button onClick={() => onShow(spot, '3d')}>Show in 3-D</button>
                <button onClick={() => onShow(spot, 'plan')}>Show on the plan</button>
              </div>
            )}
          </section>
        )
      })}
      <p className="hint">
        Usual practice, drawn to scale with this plan's depths, heights and materials: a guide for the site. The installers' own drawings,
        and the gas and electricity companies' rules, come first.
      </p>
    </div>
  )
}

