import { boundsOf, type Vec } from '../../model/geometry'
import { segmentKind, type Plan, type Site } from '../../model/plan'
import { formatClock, planAngle, planDirection, SEASON_DAY, shadowOffset, sunPosition, sunTimes } from '../../model/sun'
import { wallHeight } from '../../model/walls'
import type { SunPrefs } from '../../state/prefs'

/**
 * The sun over the plan: a dotted circle around the drawing that the sun (a dotted disc) travels along by its
 * azimuth, with the day's arc between sunrise and sunset brighter; and, optionally, the walls' shadows. Where
 * north points on the plan comes from the plan's site.
 */

/** The circle the sun travels along: around everything drawn on visible layers (or the base image, or a default). */
function dial(plan: Plan): { c: Vec; r: number } {
  const pts = plan.layers.flatMap((l) => (l.visible ? Object.values(l.vertices) : []))
  const b = boundsOf(pts) ?? { x0: 0, y0: 0, x1: 30, y1: 20 }
  const c = { x: (b.x0 + b.x1) / 2, y: (b.y0 + b.y1) / 2 }
  return { c, r: Math.max(5, (Math.hypot(b.x1 - b.x0, b.y1 - b.y0) / 2) * 1.12) }
}

const onCircle = (c: Vec, r: number, site: Site, azimuth: number): Vec => {
  const d = planDirection(planAngle(site, azimuth))
  return { x: c.x + d.x * r, y: c.y + d.y * r }
}

/** Shadows of the walls on visible layers, each as tall as its top above the ground (its floor's level and its height); fainter as clouds thicken. */
export function SunShadows({ plan, sun }: { plan: Plan; sun: SunPrefs }) {
  if (!sun.visible || !sun.shadows) return null
  const pos = sunPosition(plan.site, SEASON_DAY[sun.season], sun.time)
  if (!shadowOffset(plan.site, pos, 1)) return null
  let d = ''
  for (const layer of plan.layers) {
    if (!layer.visible) continue
    for (const s of Object.values(layer.segments)) {
      if (segmentKind(s) !== 'wall') continue
      const off = shadowOffset(plan.site, pos, (layer.level ?? 0) + wallHeight(s))!
      const a = layer.vertices[s.a]
      const b = layer.vertices[s.b]
      d += `M${a.x} ${a.y}L${b.x} ${b.y}L${b.x + off.x} ${b.y + off.y}L${a.x + off.x} ${a.y + off.y}Z`
    }
  }
  // one path with the nonzero rule paints overlapping shadows once, so they do not darken each other
  return <path className="sun-shadows" d={d} fillRule="nonzero" opacity={0.42 * (1 - sun.cloudiness)} />
}

export function SunDial({ plan, sun, zoom }: { plan: Plan; sun: SunPrefs; zoom: number }) {
  if (!sun.visible) return null
  const px = 1 / zoom
  const { site } = plan
  const day = SEASON_DAY[sun.season]
  const { c, r } = dial(plan)
  const times = sunTimes(site, day)
  const pos = sunPosition(site, day, sun.time)
  const up = pos.altitude > 0

  // the day's arc: the sun's own azimuths from sunrise to sunset, so it bends the right way through noon
  let arc = ''
  if (times) {
    const steps = 64
    for (let i = 0; i <= steps; i++) {
      const t = times.sunrise + ((times.sunset - times.sunrise) * i) / steps
      const p = onCircle(c, r, site, sunPosition(site, day, t).azimuth)
      arc += `${i ? 'L' : 'M'}${p.x} ${p.y}`
    }
  }
  const tick = (clock: number, label: string) => {
    const az = sunPosition(site, day, clock).azimuth
    const inner = onCircle(c, r - 8 * px, site, az)
    const outer = onCircle(c, r + 8 * px, site, az)
    const text = onCircle(c, r + 26 * px, site, az)
    return (
      <g key={label}>
        <line className="sun-tick" x1={inner.x} y1={inner.y} x2={outer.x} y2={outer.y} />
        <SunTag p={text} text={`${label} ${formatClock(clock)}`} px={px} />
      </g>
    )
  }
  const sunAt = onCircle(c, r, site, pos.azimuth)
  const north = onCircle(c, r + 20 * px, site, 0)
  const northIn = onCircle(c, r + 4 * px, site, 0)
  const opacity = 1 - 0.75 * sun.cloudiness

  return (
    <g className="sun-dial" fontSize={11 * px}>
      <circle className="sun-path" cx={c.x} cy={c.y} r={r} />
      {arc && <path className="sun-day" d={arc} />}
      {times && [tick(times.sunrise, 'sunrise'), tick(times.sunset, 'sunset')]}
      <line className="sun-north" x1={northIn.x} y1={northIn.y} x2={north.x} y2={north.y} />
      <text className="sun-north-label" x={onCircle(c, r + 32 * px, site, 0).x} y={onCircle(c, r + 32 * px, site, 0).y} textAnchor="middle" dominantBaseline="central">
        N
      </text>
      {up && <line className="sun-ray" x1={sunAt.x} y1={sunAt.y} x2={c.x} y2={c.y} opacity={opacity} />}
      <circle className={up ? 'sun-disc' : 'sun-disc below'} cx={sunAt.x} cy={sunAt.y} r={13 * px} opacity={up ? opacity : 0.8} />
      <SunTag
        p={onCircle(c, r - 34 * px, site, pos.azimuth)}
        text={up ? `${formatClock(sun.time)} · ${pos.altitude.toFixed(0)}° up` : `${formatClock(sun.time)} · below the horizon`}
        px={px}
      />
    </g>
  )
}

/** A small label on a dark pill, centred on `p`; its width is estimated from the text. */
function SunTag({ p, text, px }: { p: Vec; text: string; px: number }) {
  const w = (text.length * 6.3 + 12) * px
  const h = 17 * px
  return (
    <g className="sun-tag">
      <rect x={p.x - w / 2} y={p.y - h / 2} width={w} height={h} rx={4 * px} />
      <text x={p.x} y={p.y} textAnchor="middle" dominantBaseline="central">
        {text}
      </text>
    </g>
  )
}
