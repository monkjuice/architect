import { memo, type ReactNode } from 'react'
import { add, dist, rotate, type Vec } from '../../model/geometry'
import { CHAMBER, DRAIN, type PlumbingPlan, type Run } from '../../model/plumbing'
import type { PipePrefs } from '../../state/prefs'
import { SegmentLabel } from './Scene'

/**
 * The pipes worked out for the plan, over the floor shown: cold water blue, hot water red (drawn beside the cold),
 * the stages of the supply dashed blue and drains brown (the main heavier; an HVAC unit's condensate thin), the picked one highlighted,
 * each with its size along it; each fixture's water and drain points; the floor traps and the inspection chambers
 * worked out; and the risers where pipes go up to another floor. The equipment itself is drawn by Services.tsx.
 */

const path = (pts: readonly Vec[]) => `M${pts.map((p) => `${p.x} ${p.y}`).join('L')}`

/** A square of `side` round `p`, turned with the walls by `frame`. */
const square = (p: Vec, side: number, frame: number) => {
  const h = side / 2
  return `${path([{ x: -h, y: -h }, { x: h, y: -h }, { x: h, y: h }, { x: -h, y: h }].map((q) => add(p, rotate(q, frame))))}Z`
}

/** A square's two diagonals. */
const cross = (p: Vec, side: number, frame: number) => {
  const h = side / 2
  const [a, b, c, d] = [{ x: -h, y: -h }, { x: h, y: h }, { x: h, y: -h }, { x: -h, y: h }].map((q) => add(p, rotate(q, frame)))
  return `M${a.x} ${a.y}L${b.x} ${b.y}M${c.x} ${c.y}L${d.x} ${d.y}`
}

/**
 * Where a run's size is written: along its longest straight stretch, cold water's on its first half and hot water's
 * on its second, so the two do not cover each other where they run side by side.
 */
function labelSpan(r: Run): [Vec, Vec] {
  let [a, b] = [r.path[0], r.path[1]]
  for (let i = 1; i < r.path.length; i++) if (dist(r.path[i - 1], r.path[i]) > dist(a, b)) [a, b] = [r.path[i - 1], r.path[i]]
  const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
  return r.kind === 'cold' ? [a, mid] : r.kind === 'hot' ? [mid, b] : [a, b]
}

/** Which of the Show toggles a run follows. */
const shownBy = (kind: Run['kind']): keyof PipePrefs => (kind === 'drain' || kind === 'condensate' ? 'drains' : kind === 'hot' ? 'hot' : 'cold')

export const PlumbingLayer = memo(function PlumbingLayer({
  plumbing: p,
  storey,
  zoom,
  show,
  picked,
}: {
  plumbing: PlumbingPlan
  storey: number
  zoom: number
  show: PipePrefs
  /** The run picked with the select tool, by its place in `plumbing.runs`. */
  picked?: number
}) {
  const px = 1 / zoom
  const runs = p.runs.map((r, index) => ({ r, index })).filter(({ r }) => r.storey === storey && show[shownBy(r.kind)])
  // hot water is drawn beside cold water, as plans draw the two pipes, where they run together
  const beside = rotate({ x: 3 * px, y: 3 * px }, p.frame)
  const shift = (kind: Run['kind']) => (kind === 'hot' ? `translate(${beside.x} ${beside.y})` : undefined)
  const marks: ReactNode[] = []
  for (const w of p.points) {
    if (w.storey !== storey || w.ref.kind !== 'furniture') continue
    const key = `${w.ref.layer}:${w.ref.id}`
    if (w.cold && show.cold) marks.push(<circle key={`${key}c`} className="water-point cold" cx={w.cold.x} cy={w.cold.y} r={3 * px} />)
    if (w.hot && show.hot) marks.push(<circle key={`${key}h`} className="water-point hot" cx={w.hot.x + beside.x} cy={w.hot.y + beside.y} r={3 * px} />)
    if (w.drain && show.drains) marks.push(<circle key={`${key}d`} className={w.toilet ? 'drain-point main' : 'drain-point'} cx={w.drain.x} cy={w.drain.y} r={(w.toilet ? 5 : 3.5) * px} />)
  }
  return (
    <g className="plumbing" fontSize={10 * px}>
      {runs.map(({ r, index }) => (
        <path key={`run${index}`} className={`pipe ${r.kind} size-${r.size}${picked === index ? ' selected' : ''}`} d={path(r.path)} transform={shift(r.kind)} />
      ))}
      {show.drains &&
        p.traps
          .filter((t) => t.storey === storey && !t.grease)
          .map((t, i) => <path key={`trap${i}`} className="trap" d={`${square(t.at, Math.max(0.2, 10 * px), p.frame)}${cross(t.at, Math.max(0.2, 10 * px) * 0.6, p.frame)}`} />)}
      {show.drains &&
        !storey &&
        p.chambers
          .filter((c) => !c.own)
          .map((c, i) => <path key={`chamber${i}`} className="chamber" d={`${square(c.at, CHAMBER.out, p.frame)}${cross(c.at, CHAMBER.out, p.frame)}`} />)}
      {show.drains && !storey && p.vents.map((v, i) => <circle key={`vent${i}`} className="vent" cx={v.at.x} cy={v.at.y} r={7 * px} />)}
      {marks}
      {p.risers
        .filter((r) => (r.from === storey || r.to === storey) && show[shownBy(r.kind)])
        .map((r, i) => (
          <g key={`riser${i}`} className={`riser ${r.kind}`} transform={shift(r.kind)}>
            <circle cx={r.at.x} cy={r.at.y} r={6 * px} />
            <path d={`M${r.at.x - 4.2 * px} ${r.at.y + 4.2 * px}L${r.at.x + 4.2 * px} ${r.at.y - 4.2 * px}`} />
          </g>
        ))}
      {show.sizes &&
        runs.map(({ r, index }) => {
          if (r.kind === 'drain' && r.size === DRAIN.fixture) return null
          const [a, b] = labelSpan(r)
          return (
            <g key={`size${index}`} transform={shift(r.kind)}>
              <SegmentLabel a={a} b={b} text={`Ø${r.size}`} px={px} className={`pipe-label ${r.kind}`} />
            </g>
          )
        })}
      {p.fall && !storey && show.drains && p.summary.waste.length > 0 && (
        <text className="fall-note" x={p.summary.waste[0].at.x} y={p.summary.waste[0].at.y + p.summary.waste[0].placed.depth / 2 + 24 * px} textAnchor="middle">
          {`inlet ≈ ${p.fall.depth.toFixed(2)} m deep`}
        </text>
      )}
    </g>
  )
})
