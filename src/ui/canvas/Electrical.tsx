import { memo } from 'react'
import { frontOf } from '../../model/electrical'
import { add, dist, mul, type Vec } from '../../model/geometry'
import type { Electrical, Layer } from '../../model/plan'
import { circuitsOn, pointKey, type Circuit, type Wiring } from '../../model/wiring'
import { electricSize } from './symbols'

/**
 * The electrical plan in the usual notation, at a size readable at any zoom: a board as a half-filled box against its
 * wall, a switch as a small circle with its lever, a light outlet as a crossed circle (on a bracket on a wall, in a
 * square on the floor, with a dot on a post), a
 * socket as a cup on a wall, in a square on the floor (filled on a special circuit). Cable runs are drawn in their
 * circuit's colour: solid in the ceiling, dashed in the floor, dotted where buried; a riser marks where a circuit
 * comes up or down from its board's floor.
 */

/** One colour per circuit of a board, in turn. */
const CIRCUIT_COLORS = ['#f59e0b', '#22d3ee', '#a78bfa', '#34d399', '#f472b6', '#fb923c', '#60a5fa', '#facc15', '#4ade80', '#e879f9']

const pts = (list: readonly Vec[]) => list.map((p) => `${p.x},${p.y}`).join(' ')

/** An arc of `r` round `c` from direction `a` to `b` (unit vectors), as points. */
function arc(c: Vec, r: number, from: number, to: number, n = 10): Vec[] {
  return Array.from({ length: n + 1 }, (_, i) => {
    const t = from + ((to - from) * i) / n
    return { x: c.x + Math.cos(t) * r, y: c.y + Math.sin(t) * r }
  })
}

/** One board or point, `s` its size in m. */
export function ElectricSymbol({ item, s, className = '', label }: { item: Electrical; s: number; className?: string; label?: string }) {
  const f = frontOf(item.angle)
  const t = { x: -f.y, y: f.x }
  // u along the wall, v out of it
  const at = (u: number, v: number) => add(item.at, add(mul(t, u), mul(f, v)))
  const facing = Math.atan2(f.y, f.x)
  const classes = `electric ${item.kind} ${item.mount} ${item.kind === 'socket' ? item.use : ''} ${className}`

  if (item.kind === 'board') {
    const [a, b, c, d] = [at(-2 * s, 0), at(2 * s, 0), at(2 * s, 1.4 * s), at(-2 * s, 1.4 * s)]
    const text = at(0, 1.4 * s + 1.1 * s)
    return (
      <g className={classes}>
        <polygon className="electric-fill" points={pts([a, b, c])} />
        <polygon className="electric-outline" points={pts([a, b, c, d])} />
        {label && (
          <text className="electric-label" x={text.x} y={text.y} fontSize={s * 1.1} textAnchor="middle" dominantBaseline="middle">
            {label}
          </text>
        )}
      </g>
    )
  }
  if (item.kind === 'switch') {
    const r = 0.35 * s
    const c = at(0, 0.9 * s)
    const lever = mul(add(f, t), Math.SQRT1_2)
    const [l0, l1] = [add(c, mul(lever, r)), add(c, mul(lever, r + 1.1 * s))]
    const tick = add(l1, mul({ x: -lever.y, y: lever.x }, -0.4 * s))
    return (
      <g className={classes}>
        <line className="electric-line" x1={item.at.x} y1={item.at.y} x2={c.x - f.x * r} y2={c.y - f.y * r} />
        <circle className="electric-outline" cx={c.x} cy={c.y} r={r} />
        <polyline className="electric-line" points={pts([l0, l1, tick])} />
      </g>
    )
  }
  if (item.kind === 'light') {
    const r = item.mount === 'wall' ? 0.8 * s : s
    const c = item.mount === 'wall' ? at(0, 1.1 * s) : item.at
    const k = r * Math.SQRT1_2
    return (
      <g className={classes}>
        {item.mount === 'wall' && <line className="electric-line" x1={item.at.x} y1={item.at.y} x2={c.x - f.x * r} y2={c.y - f.y * r} />}
        {item.mount === 'floor' && <rect className="electric-outline" x={c.x - 1.1 * r} y={c.y - 1.1 * r} width={2.2 * r} height={2.2 * r} />}
        <circle className="electric-outline" cx={c.x} cy={c.y} r={r} />
        {item.mount === 'floor' && !!item.post && <circle className="electric-fill" cx={c.x} cy={c.y} r={0.3 * r} />}
        <path className="electric-line" d={`M${c.x - k} ${c.y - k}L${c.x + k} ${c.y + k}M${c.x - k} ${c.y + k}L${c.x + k} ${c.y - k}`} />
      </g>
    )
  }
  // a socket: a cup away from the wall (in the floor, up the sheet inside its square)
  if (item.mount === 'floor') {
    const h = 1.1 * s
    const c = add(item.at, { x: 0, y: 0.3 * s })
    const cup = arc(c, 0.7 * s, Math.PI, 2 * Math.PI)
    return (
      <g className={classes}>
        <rect className="electric-outline" x={item.at.x - h} y={item.at.y - h} width={2 * h} height={2 * h} />
        <polygon className="electric-cup" points={pts(cup)} />
      </g>
    )
  }
  const c = at(0, 0.5 * s)
  const cup = arc(c, 0.8 * s, facing - Math.PI / 2, facing + Math.PI / 2)
  return (
    <g className={classes}>
      <line className="electric-line" x1={item.at.x} y1={item.at.y} x2={c.x} y2={c.y} />
      <polygon className="electric-cup" points={pts(cup)} />
    </g>
  )
}

/**
 * A layer's boards and points; `selected` holds the selected ids separated by spaces. `dim` fades them (another
 * layer's plan), `unfed` marks them as fed by no board.
 */
export const ElectricalLayer = memo(function ElectricalLayer({
  layer,
  zoom,
  selected,
  hovered,
  dim,
  unfed,
}: {
  layer: Layer
  zoom: number
  selected: string
  hovered?: string
  dim: boolean
  unfed: boolean
}) {
  const ids = new Set(selected.split(' '))
  const entries = Object.entries(layer.electrical)
  if (!entries.length) return null
  const s = electricSize(zoom)
  return (
    <g className={['electrical', dim && 'dim', unfed && 'unfed', layer.locked && 'locked'].filter(Boolean).join(' ')}>
      {entries.map(([id, e]) => {
        // a sub-board in its parent's enclosure is drawn as part of its parent, named after it
        if (e.kind === 'board' && e.integrated) return null
        const inside = entries.flatMap(([, c]) => (c.kind === 'board' && c.integrated && c.parent?.layer === layer.id && c.parent.board === id ? [c.name] : []))
        const label = e.kind === 'board' ? [e.name, ...inside].join(' + ') : undefined
        const selectedInside = entries.some(([cid, c]) => c.kind === 'board' && c.integrated && c.parent?.board === id && ids.has(cid))
        return <ElectricSymbol key={id} item={e} s={s} label={label} className={ids.has(id) || selectedInside ? 'selected' : id === hovered ? 'hovered' : ''} />
      })}
    </g>
  )
})

/** A run's way cut where it goes into or comes out of the ground. */
function pieces(path: readonly Vec[], buried: readonly boolean[]): { pts: Vec[]; buried: boolean }[] {
  const out: { pts: Vec[]; buried: boolean }[] = []
  for (let i = 1; i < path.length; i++) {
    const last = out[out.length - 1]
    if (last && last.buried === buried[i - 1]) last.pts.push(path[i])
    else out.push({ pts: [path[i - 1], path[i]], buried: buried[i - 1] })
  }
  return out
}

/** Where a circuit's name goes: the middle of the longest stretch of its runs. */
function labelAt(c: Circuit): { p: Vec; d: number } | null {
  let best: { p: Vec; d: number } | null = null
  for (const r of c.runs) {
    for (let i = 1; i < r.path.length; i++) {
      const d = dist(r.path[i - 1], r.path[i])
      if (!best || d > best.d) best = { p: { x: (r.path[i - 1].x + r.path[i].x) / 2, y: (r.path[i - 1].y + r.path[i].y) / 2 }, d }
    }
  }
  return best
}

/**
 * The cable runs on floor `storey` (only layer `layer`'s, when set), coloured by circuit. `focus` holds the circuits to
 * stand out ("<board key>:C3", space separated; the others fade), `selected` and `hovered` the points whose runs are
 * picked.
 */
export const WiringLayer = memo(function WiringLayer({
  wiring,
  storey,
  layer,
  focus,
  selected,
  hovered,
  zoom,
}: {
  wiring: Wiring
  storey: number
  layer: string | null
  focus: string
  selected: string
  hovered?: string
  zoom: number
}) {
  const px = 1 / zoom
  const focused = new Set(focus.split(' ').filter(Boolean))
  const picked = new Set(selected.split(' '))
  const circuits = circuitsOn(wiring, storey, layer)
  // risers: circuits that come up (or down) here from a board on another floor, and those that leave this floor's boards
  const risers = new Map<string, { at: Vec; text: string[] }>()
  for (const bw of wiring.boards) {
    for (const c of bw.circuits) {
      if (!c.riser || (layer !== null && c.layer !== layer && bw.ref.layer !== layer)) continue
      if (c.storey === storey) {
        const key = `in:${pointKey(bw.ref)}`
        const m = risers.get(key) ?? { at: c.origin, text: [`from ${bw.board.name}`] }
        risers.set(key, m)
      } else if (bw.storey === storey) {
        // beside the board, clear of its name
        const key = `out:${pointKey(bw.ref)}`
        const f = frontOf(bw.board.angle)
        const s = electricSize(zoom)
        const m = risers.get(key) ?? { at: add(c.origin, add(mul({ x: -f.y, y: f.x }, -3.2 * s), mul(f, 0.7 * s))), text: [] }
        m.text.push(c.name)
        risers.set(key, m)
      }
    }
  }
  return (
    <g className="wiring" fontSize={10 * px}>
      {circuits.map((c) => {
        const bw = wiring.boards.find((b) => pointKey(b.ref) === pointKey(c.board))!
        const color = CIRCUIT_COLORS[bw.circuits.indexOf(c) % CIRCUIT_COLORS.length]
        const id = `${pointKey(c.board)}:${c.name}`
        const state = focused.size ? (focused.has(id) ? 'focus' : 'faded') : ''
        const label = labelAt(c)
        return (
          <g key={id} className={`circuit ${c.plane} ${state}`} style={{ stroke: color, fill: color }}>
            {c.runs.map((r) => {
              const key = pointKey(r.to)
              const cls = picked.has(key) ? 'selected' : hovered === key ? 'hovered' : ''
              return pieces(r.path, r.buried).map((piece, i) => (
                <polyline key={`${key}:${i}`} className={`run ${piece.buried ? 'buried' : ''} ${r.manual ? 'manual' : ''} ${cls}`} points={pts(piece.pts)} />
              ))
            })}
            {label && label.d * zoom > 40 && (
              <text className="circuit-label" x={label.p.x} y={label.p.y - 4 * px} textAnchor="middle">
                {c.name}
              </text>
            )}
          </g>
        )
      })}
      {[...risers].map(([key, m]) => (
        <g key={key} className="riser">
          <circle cx={m.at.x} cy={m.at.y} r={7 * px} />
          <path d={`M${m.at.x} ${m.at.y + 4 * px}V${m.at.y - 4 * px}M${m.at.x - 3 * px} ${m.at.y - 1 * px}L${m.at.x} ${m.at.y - 4 * px}L${m.at.x + 3 * px} ${m.at.y - 1 * px}`} />
          <text x={m.at.x + 10 * px} y={m.at.y - 8 * px}>
            {key.startsWith('in:') ? m.text[0] : `to another floor: ${m.text.join(', ')}`}
          </text>
        </g>
      ))}
    </g>
  )
})
