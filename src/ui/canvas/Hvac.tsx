import { memo, useId } from 'react'
import { boundsOf, dist, rotate, type Vec } from '../../model/geometry'
import { RADIANT, type HvacPlan, type HvacRun, type RoomLoad } from '../../model/hvac'
import type { Ref } from '../../model/plan'
import type { PlumbingPlan } from '../../model/plumbing'
import type { HvacPrefs } from '../../state/prefs'
import { SegmentLabel } from './Scene'

/**
 * The HVAC plan over the floor shown: heating flow and return amber (two lines side by side), radiant floors hatched
 * in their rooms with the lead to their manifold, refrigerant lines violet, ducts grey, each with its size; each
 * room's heat and cooling against what it needs; and, faded, the plumbing that joins it (a boiler's or heat pump's
 * fill, a split's condensate). The equipment itself is drawn by Services.tsx.
 */

const path = (pts: readonly Vec[]) => `M${pts.map((p) => `${p.x} ${p.y}`).join('L')}`
const ring = (pts: readonly Vec[]) => `${path(pts)}Z`

/** Which Show toggle a run follows. */
const shownBy = (r: HvacRun): keyof HvacPrefs => (r.kind === 'refrigerant' ? 'cooling' : r.kind === 'duct' ? 'ventilation' : 'heating')

/** The longest straight stretch of a run, where its size is written. */
function longest(r: { path: Vec[] }): [Vec, Vec] {
  let [a, b] = [r.path[0], r.path[1]]
  for (let i = 1; i < r.path.length; i++) if (dist(r.path[i - 1], r.path[i]) > dist(a, b)) [a, b] = [r.path[i - 1], r.path[i]]
  return [a, b]
}

/** How wide and tall a room's badge is on screen, px. */
const BADGE = { w: 120, h: 40 }

/** Whether a room is big enough on screen for its badge. */
function fits(r: RoomLoad, zoom: number): boolean {
  const box = boundsOf(r.outer)!
  return (box.x1 - box.x0) * zoom >= BADGE.w && (box.y1 - box.y0) * zoom >= BADGE.h
}

/** A room's radiant floor: its loops as lines across it at their spacing, turned with the walls, cut to the room. */
function RadiantFloor({ room, frame, selected }: { room: RoomLoad; frame: number; selected: boolean }) {
  const id = useId()
  const box = boundsOf(room.outer)!
  const c = { x: (box.x0 + box.x1) / 2, y: (box.y0 + box.y1) / 2 }
  const half = Math.hypot(box.x1 - box.x0, box.y1 - box.y0) / 2
  // drawn at twice the loops' spacing: the real spacing would be a grey wash on screen
  const step = RADIANT.spacing * 2
  const lines: string[] = []
  for (let d = -half; d <= half; d += step) {
    const [a, b] = [rotate({ x: -half, y: d }, frame), rotate({ x: half, y: d }, frame)]
    lines.push(`M${c.x + a.x} ${c.y + a.y}L${c.x + b.x} ${c.y + b.y}`)
  }
  const clip = `radiant-${id.replace(/:/g, '')}`
  return (
    <g className={selected ? 'radiant-floor selected' : 'radiant-floor'}>
      <clipPath id={clip}>
        <path d={[room.outer, ...room.holes].map(ring).join('')} clipRule="evenodd" fillRule="evenodd" />
      </clipPath>
      <path className="radiant-fill" d={[room.outer, ...room.holes].map(ring).join('')} fillRule="evenodd" />
      <path className="radiant-loops" d={lines.join('')} clipPath={`url(#${clip})`} />
    </g>
  )
}

export const HvacLayer = memo(function HvacLayer({
  hvac: h,
  plumbing,
  storey,
  zoom,
  show,
  picked,
  room,
}: {
  hvac: HvacPlan
  /** The plumbing plan, for the pipes that join the HVAC to it (drawn faded). */
  plumbing: PlumbingPlan
  storey: number
  zoom: number
  show: HvacPrefs
  /** The run picked with the select tool, by its place in `hvac.runs`. */
  picked?: number
  /** The room selected, "layer:id". */
  room?: string
}) {
  const px = 1 / zoom
  const runs = h.runs.map((r, index) => ({ r, index })).filter(({ r }) => r.storey === storey && show[shownBy(r)])
  // a heating circuit is a flow and a return: the return is drawn beside the flow
  const beside = rotate({ x: 3 * px, y: 3 * px }, h.frame)
  const pieces = new Set(h.pieces.map((p) => `${p.ref.layer}:${p.ref.id}`))
  const joins = (to?: Ref) => !!to && to.kind === 'service' && pieces.has(`${to.layer}:${to.id}`)
  const links = show.linked ? plumbing.runs.filter((r) => r.storey === storey && (r.kind === 'condensate' || joins(r.to))) : []
  const round = (x: number) => (x >= 1000 ? `${(x / 1000).toFixed(1)}k` : `${Math.round(x)}`)
  return (
    <g className="hvac" fontSize={10 * px}>
      {show.heating &&
        h.rooms
          .filter((r) => r.storey === storey && r.radiant)
          .map((r) => <RadiantFloor key={`${r.ref.layer}:${r.ref.id}`} room={r} frame={h.frame} selected={room === `${r.ref.layer}:${r.ref.id}`} />)}
      {links.map((r, i) => (
        <path key={`link${i}`} className={`pipe linked ${r.kind}`} d={path(r.path)} />
      ))}
      {runs.map(({ r, index }) => (
        <g key={`run${index}`} className={`duct-run ${r.kind}${picked === index ? ' selected' : ''}`}>
          <path className={`pipe ${r.kind}`} d={path(r.path)} />
          {r.kind === 'heating' && <path className={`pipe ${r.kind} return`} d={path(r.path)} transform={`translate(${beside.x} ${beside.y})`} />}
        </g>
      ))}
      {show.sizes &&
        runs.map(({ r, index }) => {
          const [a, b] = longest(r)
          return <SegmentLabel key={`size${index}`} a={a} b={b} text={`Ø${r.size}`} px={px} className={`pipe-label ${r.kind}`} />
        })}
      {show.loads &&
        h.rooms
          // a room carries its badge only when it is big enough on screen to hold it: the HVAC section lists them all
          .filter((r) => r.storey === storey && fits(r, zoom))
          .map((r) => {
            const heat = r.heat <= 0 ? 'none' : r.heat < r.heatNeed * 0.9 ? 'short' : 'met'
            const cool = r.cool <= 0 ? 'none' : r.cool < r.coolNeed * 0.9 ? 'short' : 'met'
            return (
              <g key={`load${r.ref.layer}:${r.ref.id}`} className="room-load">
                <text x={r.at.x} y={r.at.y - 7 * px} textAnchor="middle" className="room-name">
                  {r.name}
                </text>
                <text x={r.at.x} y={r.at.y + 5 * px} textAnchor="middle" className={`heat ${heat}`}>
                  {`heat ${round(r.heat)} / ${round(r.heatNeed)} kcal/h`}
                </text>
                <text x={r.at.x} y={r.at.y + 17 * px} textAnchor="middle" className={`cool ${cool}`}>
                  {`cool ${round(r.cool)} / ${round(r.coolNeed)} frig/h`}
                </text>
                {(r.wet && !r.window && !r.extractor) && (
                  <text x={r.at.x} y={r.at.y + 29 * px} textAnchor="middle" className="stuffy">
                    no window: needs an extractor
                  </text>
                )}
              </g>
            )
          })}
    </g>
  )
})
