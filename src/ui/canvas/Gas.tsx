import { memo, type ReactNode } from 'react'
import { add, dist, rotate, type Vec } from '../../model/geometry'
import { gasSizeLabel, outlineOf, type GasPlan, type GasRun } from '../../model/gas'
import type { GasPrefs } from '../../state/prefs'
import { SegmentLabel } from './Scene'

/**
 * The gas installation over the floor shown: the pipe yellow, heavier as it gets bigger, the picked one highlighted,
 * each stretch with its size (Ø for multilayer, inches for steel); every appliance that burns gas outlined in yellow
 * with its gas point and the valve at it (a cooker made electric dashed grey, without one); where the pipe goes
 * through a building's wall (its entry, in a sleeve); each room's permanent vents where its outline is nearest the
 * appliance; the flues of the open-flue heaters; and the risers to the floors above. The meter, cylinders, valves and
 * outlets and the other tabs' appliances are drawn by Services.tsx. `GasLinks` draws, faded, the gas branch to the
 * Plumbing and HVAC tabs' pieces on those tabs.
 */

const path = (pts: readonly Vec[]) => `M${pts.map((p) => `${p.x} ${p.y}`).join('L')}`

/** The longest straight stretch of a run, where its size is written. */
function longest(r: GasRun): [Vec, Vec] {
  let [a, b] = [r.path[0], r.path[1]]
  for (let i = 1; i < r.path.length; i++) if (dist(r.path[i - 1], r.path[i]) > dist(a, b)) [a, b] = [r.path[i - 1], r.path[i]]
  return [a, b]
}

/** A valve as drawings show one: two triangles tip to tip across the pipe, `side` wide, turned with the walls. */
function valve(p: Vec, side: number, frame: number): string {
  const h = side / 2
  const at = (x: number, y: number) => add(p, rotate({ x, y }, frame))
  const [a, b, c, d] = [at(-h, -h / 2), at(h, h / 2), at(h, -h / 2), at(-h, h / 2)]
  return `M${a.x} ${a.y}L${b.x} ${b.y}L${c.x} ${c.y}L${d.x} ${d.y}Z`
}

/** A vent grille: a small square turned with the walls, with its slats. */
function grille(p: Vec, side: number, frame: number): string {
  const h = side / 2
  const at = (x: number, y: number) => add(p, rotate({ x, y }, frame))
  const box = [at(-h, -h), at(h, -h), at(h, h), at(-h, h)]
  const slats = [-h / 2, 0, h / 2].map((y) => `M${at(-h * 0.7, y).x} ${at(-h * 0.7, y).y}L${at(h * 0.7, y).x} ${at(h * 0.7, y).y}`)
  return `${path(box)}Z${slats.join('')}`
}

export const GasLayer = memo(function GasLayer({
  gas: g,
  storey,
  zoom,
  show,
  picked,
  selected,
}: {
  gas: GasPlan
  storey: number
  zoom: number
  show: GasPrefs
  /** The run picked with the select tool, by its place in `gas.runs`. */
  picked?: number
  /** The appliance selected, "layer:id" (a cooker). */
  selected?: string
}) {
  const px = 1 / zoom
  const runs = show.pipes ? g.runs.map((r, index) => ({ r, index })).filter(({ r }) => r.storey === storey) : []
  const marks: ReactNode[] = []
  for (const a of g.appliances) {
    if (a.storey !== storey) continue
    const key = `${a.ref.layer}:${a.ref.id}`
    const className = ['gas-appliance', a.electric && 'electric', selected === key && 'selected'].filter(Boolean).join(' ')
    // the other tabs' pieces are drawn by their own symbols; a cooker is outlined here, over its faded furniture
    if (a.ref.kind === 'furniture') marks.push(<path key={`${key}o`} className={className} d={`${path(outlineOf(a.placed))}Z`} />)
    if (!a.electric) marks.push(<circle key={`${key}p`} className="gas-point" cx={a.at.x} cy={a.at.y} r={3.5 * px} />)
    // the valve at each appliance piped, beside its point
    if (!a.electric && show.pipes && g.runs.some((r) => r.to && r.to.layer === a.ref.layer && r.to.id === a.ref.id)) {
      marks.push(<path key={`${key}v`} className="gas-valve-mark" d={valve(add(a.at, rotate({ x: 0, y: 9 * px }, g.frame)), 9 * px, g.frame)} />)
    }
  }
  // the main valve after each meter or cylinders, where the pipe leaves it
  if (show.pipes && g.runs.length) {
    for (const p of g.supply) if (p.storey === storey) marks.push(<path key={`main${p.ref.id}`} className="gas-valve-mark main" d={valve(add(p.at, rotate({ x: 0, y: -(p.placed.depth / 2 + 7 * px) }, g.frame)), 11 * px, g.frame)} />)
  }
  return (
    <g className="gas-plan" fontSize={10 * px}>
      {runs.map(({ r, index }) => (
        <path key={`run${index}`} className={`pipe gas size-${r.size}${picked === index ? ' selected' : ''}`} d={path(r.path)} />
      ))}
      {marks}
      {show.pipes &&
        !storey &&
        g.entries.map((e, i) => (
          <g key={`entry${i}`} className="gas-entry">
            <path d={path([e.out, e.at])} />
            <circle cx={e.at.x} cy={e.at.y} r={5 * px} />
          </g>
        ))}
      {show.vents &&
        g.vents
          .filter((v) => v.storey === storey)
          .map((v, i) => <path key={`vent${i}`} className="gas-vent" d={grille(v.at, Math.max(0.2, 10 * px), g.frame)} />)}
      {show.vents &&
        g.flues
          .filter((f) => f.storey === storey)
          .map((f, i) => (
            <g key={`flue${i}`} className="gas-flue">
              <circle cx={f.at.x} cy={f.at.y} r={7 * px} />
              <circle cx={f.at.x} cy={f.at.y} r={3 * px} />
            </g>
          ))}
      {show.pipes &&
        g.risers
          .filter((r) => r.from === storey || r.to === storey)
          .map((r, i) => (
            <g key={`riser${i}`} className="riser gas">
              <circle cx={r.at.x} cy={r.at.y} r={6 * px} />
              <path d={`M${r.at.x - 4.2 * px} ${r.at.y + 4.2 * px}L${r.at.x + 4.2 * px} ${r.at.y - 4.2 * px}`} />
            </g>
          ))}
      {show.sizes &&
        runs.map(({ r, index }) => {
          const [a, b] = longest(r)
          return <SegmentLabel key={`size${index}`} a={a} b={b} text={gasSizeLabel(r.size, r.material)} px={px} className="pipe-label gas" />
        })}
    </g>
  )
})

/** The gas branches to the Plumbing or HVAC tab's pieces, faded, on that tab: where their gas comes from. */
export const GasLinks = memo(function GasLinks({ runs }: { runs: readonly GasRun[] }) {
  return (
    <g className="gas-plan linked">
      {runs.map((r, i) => (
        <path key={i} className="pipe gas linked" d={path(r.path)} />
      ))}
    </g>
  )
})

