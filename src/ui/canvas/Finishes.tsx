import { memo } from 'react'
import { add, dist, lerp, mul, type Vec } from '../../model/geometry'
import { sideNormal, type WallSide } from '../../model/finishes'
import { findMaterial, MATERIALS, mosaicColor } from '../../model/materials'
import { openingSpans } from '../../model/openings'
import { segmentKind, type Layer } from '../../model/plan'
import { getThickness } from '../../state/derived'

/** A pattern (`finish-<id>`, in plan units: m) for each checkered or mosaic material laid on a floor. */
export function FinishPatterns() {
  return (
    <defs>
      {MATERIALS.map(({ id, checker, mosaic }) => {
        if (mosaic) {
          const [n, t, grout] = [4, mosaic.tile, mosaic.tile * 0.08]
          return (
            <pattern key={id} id={`finish-${id}`} patternUnits="userSpaceOnUse" width={n * t} height={n * t}>
              <rect width={n * t} height={n * t} fill="#c8c4bb" />
              {Array.from({ length: n * n }, (_, i) => {
                const [row, col] = [Math.floor(i / n), i % n]
                return <rect key={i} x={col * t + grout / 2} y={row * t + grout / 2} width={t - grout} height={t - grout} fill={mosaicColor(mosaic, row, col)} />
              })}
            </pattern>
          )
        }
        if (!checker) return null
        const t = checker.tile
        return (
          <pattern key={id} id={`finish-${id}`} patternUnits="userSpaceOnUse" width={2 * t} height={2 * t}>
            <rect width={2 * t} height={2 * t} fill={checker.colors[1]} />
            <path d={`M0 0H${t}V${t}H0ZM${t} ${t}H${2 * t}V${2 * t}H${t}Z`} fill={checker.colors[0]} />
          </pattern>
        )
      })}
    </defs>
  )
}

/**
 * Wall finishes in plan: a line in each finished side's material colour, just inside that face, broken where
 * doors and windows cut the wall. Floors in their material are drawn by AreaFills.
 */
export const FinishLayer = memo(function FinishLayer({ layer, zoom, thick }: { layer: Layer; zoom: number; thick: boolean }) {
  const px = 1 / zoom
  const thickness = getThickness(layer)
  const lines: { d: string; color: string; key: string }[] = []
  for (const [id, s] of Object.entries(layer.segments)) {
    if (segmentKind(s) !== 'wall' || !s.finish) continue
    const [a, b] = [layer.vertices[s.a], layer.vertices[s.b]]
    const length = dist(a, b)
    if (length < 1e-9) continue
    const half = (thickness.get(id) ?? 0) / 2
    // inside the face when walls are drawn thick, a little off the line when they are thin
    const inset = thick ? Math.max(half - 2.5 * px, half / 2) : 2.5 * px
    for (const side of ['left', 'right'] as WallSide[]) {
      const material = findMaterial(s.finish[side])
      if (!material) continue
      const n = mul(sideNormal(a, b, side), inset)
      let d = ''
      let from = 0
      for (const [start, end] of [...openingSpans(layer, id), [length, length] as [number, number]]) {
        if (start - from > 1e-9) {
          const [p, q]: Vec[] = [add(lerp(a, b, from / length), n), add(lerp(a, b, start / length), n)]
          d += `M${p.x} ${p.y}L${q.x} ${q.y}`
        }
        from = Math.max(from, end)
      }
      lines.push({ d, color: material.color, key: `${id}:${side}` })
    }
  }
  if (!lines.length) return null
  return (
    <g className="finishes">
      {lines.map((l) => (
        <path key={l.key} className="wall-finish" d={l.d} stroke={l.color} />
      ))}
    </g>
  )
})
