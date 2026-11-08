import { memo, type CSSProperties } from 'react'
import { COLUMNS, layerColonnades } from '../../model/colonnades'
import { add, mul, sub, type Vec } from '../../model/geometry'
import { openingSpans } from '../../model/openings'
import type { Layer } from '../../model/plan'
import { getThickness } from '../../state/derived'

/**
 * Colonnades in plan: each column at its real size, as a plan's cut shows it. Roman columns are a round shaft on
 * a square plinth, metal ones a small round post. A glazed edge is its glass, a thin line broken by its doors,
 * between small square steel posts.
 */

/** A glazed edge's glass: from `a` along `dir`, its `length` less the openings' spans. */
function glassPath(a: Vec, dir: Vec, length: number, spans: readonly [number, number][]): string {
  const at = (u: number) => add(a, mul(dir, u))
  let d = ''
  let from = 0
  for (const [u0, u1] of [...spans, [length, length] as [number, number]]) {
    if (u0 > from) d += `M${at(from).x} ${at(from).y}L${at(u0).x} ${at(u0).y}`
    from = Math.max(from, u1)
  }
  return d
}

/** A square of side `side` centred on `p`, squared to `dir`. */
function square(p: Vec, dir: Vec, side: number): string {
  const u = mul(dir, side / 2)
  const v = { x: -u.y, y: u.x }
  return [add(add(p, u), v), add(sub(p, u), v), sub(sub(p, u), v), sub(add(p, u), v)].map((q) => `${q.x},${q.y}`).join(' ')
}

export const ColonnadeLayer = memo(function ColonnadeLayer({ layer }: { layer: Layer }) {
  const placed = layerColonnades(layer, getThickness(layer))
  if (!placed.length) return null
  return (
    <g className={layer.locked ? 'columns locked' : 'columns'} style={{ '--layer': layer.color } as CSSProperties}>
      {placed.map((c) => {
        const { diameter } = COLUMNS[c.colonnade.style]
        const length = Math.hypot(c.b.x - c.a.x, c.b.y - c.a.y)
        const dir = mul(sub(c.b, c.a), 1 / length)
        return (
          <g key={c.segment} className={`colonnade ${c.colonnade.style}`}>
            {c.colonnade.style === 'glazed' && <path className="column-glass" d={glassPath(c.a, dir, length, openingSpans(layer, c.segment))} />}
            {c.columns.map(({ p }, i) => (
              <g key={i}>
                {c.colonnade.style === 'roman' && <polygon className="column-plinth" points={square(p, dir, 1.3 * diameter)} />}
                {c.colonnade.style === 'timber' || c.colonnade.style === 'glazed' ? (
                  <polygon className="column-shaft" points={square(p, dir, diameter)} />
                ) : (
                  <circle className="column-shaft" cx={p.x} cy={p.y} r={diameter / 2} />
                )}
              </g>
            ))}
          </g>
        )
      })}
    </g>
  )
})
