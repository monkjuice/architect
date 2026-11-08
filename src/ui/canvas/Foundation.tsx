import { memo } from 'react'
import { add, mul, sub, type Vec } from '../../model/geometry'
import { footingBand, PAD, PILE, TIE_COLUMN, type FoundationPlan } from '../../model/foundations'

/**
 * The foundation plan over the faded ground floor: each wall's strip footing (lean concrete, with its ring beam's
 * width dashed down the middle) or reinforced beam as a band of its width, piles as circles, pad footings and tie
 * columns as squares, and a raft as a hatched outline. Footings set by hand are drawn with a heavier edge.
 */

const ring = (pts: readonly Vec[]) => `M${pts.map((p) => `${p.x} ${p.y}`).join('L')}Z`

/** A square of `side` centred on `p`, squared to the plan. */
const square = (p: Vec, side: number) => ring([add(p, { x: -side / 2, y: -side / 2 }), add(p, { x: side / 2, y: -side / 2 }), add(p, { x: side / 2, y: side / 2 }), add(p, { x: -side / 2, y: side / 2 })])

export const FoundationLayer = memo(function FoundationLayer({ foundation, selected, hovered }: { foundation: FoundationPlan; selected: string; hovered?: string }) {
  const ids = new Set(selected.split(' '))
  return (
    <g className="foundation">
      {foundation.rafts.map((r, i) => (
        <path key={`raft${i}`} className="raft" d={ring(r.outline)} />
      ))}
      {foundation.walls.map((f) => {
        const key = `${f.layer}:${f.segment}`
        const className = ['footing', f.kind, f.custom && 'custom', ids.has(key) && 'selected', hovered === key && 'hovered'].filter(Boolean).join(' ')
        const d = sub(f.b, f.a)
        const len = Math.hypot(d.x, d.y)
        const n = mul({ x: d.y / len, y: -d.x / len }, f.thickness / 2)
        return (
          <g key={key} className={className}>
            <path d={ring(footingBand(f))} />
            {f.ringBeam && <path className="ring-beam" d={`M${f.a.x + n.x} ${f.a.y + n.y}L${f.b.x + n.x} ${f.b.y + n.y}M${f.a.x - n.x} ${f.a.y - n.y}L${f.b.x - n.x} ${f.b.y - n.y}`} />}
          </g>
        )
      })}
      {foundation.pads.map((p, i) => (
        <path key={`pad${i}`} className="pad" d={square(p.at, PAD.side)} />
      ))}
      {foundation.piles.map((p, i) => (
        <circle key={`pile${i}`} className="pile" cx={p.at.x} cy={p.at.y} r={PILE.diameter / 2} />
      ))}
      {foundation.ties.map((t, i) => (
        <path key={`tie${i}`} className="tie-column" d={square(t.at, TIE_COLUMN.side)} />
      ))}
    </g>
  )
})
