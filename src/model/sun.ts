import type { Vec } from './geometry'
import type { Site } from './plan'

/**
 * Where the sun is, for a site, a day of the year and a clock time: Spencer's series for the declination and
 * the equation of time (good to about 0.05° and half a minute), with refraction at the horizon for sunrise and
 * sunset; plenty for orienting a house. Angles in degrees; azimuths clockwise from true north.
 */

const rad = (d: number) => (d * Math.PI) / 180
const deg = (r: number) => (r * 180) / Math.PI

/** The four days that frame the year: the solstices and equinoxes. */
export type Season = 'dec' | 'mar' | 'jun' | 'sep'

export const SEASONS: readonly Season[] = ['dec', 'mar', 'jun', 'sep']

/** Day of the year of each. */
export const SEASON_DAY: Record<Season, number> = { dec: 355, mar: 79, jun: 172, sep: 265 }

/** "Summer solstice (21 Dec)": the names follow the hemisphere, so December is summer south of the equator. */
export function seasonTitle(season: Season, latitude: number): string {
  const south = latitude < 0
  const names: Record<Season, string> = {
    dec: `${south ? 'Summer' : 'Winter'} solstice (21 Dec)`,
    mar: `${south ? 'Autumn' : 'Spring'} equinox (20 Mar)`,
    jun: `${south ? 'Winter' : 'Summer'} solstice (21 Jun)`,
    sep: `${south ? 'Spring' : 'Autumn'} equinox (22 Sep)`,
  }
  return names[season]
}

/** The fraction of the year as an angle (Spencer's γ). */
const yearAngle = (day: number) => ((2 * Math.PI) / 365) * (day - 1)

/** The sun's declination on a day of the year. (A plain cosine fit was almost a degree off at the equinoxes.) */
export function declination(day: number): number {
  const g = yearAngle(day)
  return deg(
    0.006918 -
      0.399912 * Math.cos(g) +
      0.070257 * Math.sin(g) -
      0.006758 * Math.cos(2 * g) +
      0.000907 * Math.sin(2 * g) -
      0.002697 * Math.cos(3 * g) +
      0.00148 * Math.sin(3 * g),
  )
}

/** Apparent minus mean solar time, in minutes. */
export function equationOfTime(day: number): number {
  const g = yearAngle(day)
  return 229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g) - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g))
}

/** Clock hours minus solar hours at a site on a day (longitude east-positive, against the time zone's meridian). */
const clockShift = (site: Site, day: number) => (15 * site.utcOffset - site.longitude) / 15 - equationOfTime(day) / 60

export const solarToClock = (site: Site, day: number, solar: number): number => solar + clockShift(site, day)

export const clockToSolar = (site: Site, day: number, clock: number): number => clock - clockShift(site, day)

export interface SunPosition {
  /** Height above the horizon; negative below it. */
  altitude: number
  /** Clockwise from true north. */
  azimuth: number
}

export function sunPosition(site: Site, day: number, clock: number): SunPosition {
  const phi = rad(site.latitude)
  const delta = rad(declination(day))
  const h = rad(15 * (clockToSolar(site, day, clock) - 12))
  const sinAlt = Math.sin(phi) * Math.sin(delta) + Math.cos(phi) * Math.cos(delta) * Math.cos(h)
  const altitude = Math.asin(Math.max(-1, Math.min(1, sinAlt)))
  const azimuth = Math.atan2(-Math.cos(delta) * Math.sin(h), (Math.sin(delta) - sinAlt * Math.sin(phi)) / Math.cos(phi))
  return { altitude: deg(altitude), azimuth: (deg(azimuth) + 360) % 360 }
}

export interface SunTimes {
  /** Clock hours. */
  sunrise: number
  noon: number
  sunset: number
}

/** Sunrise, solar noon and sunset in clock hours; null when the sun does not rise or does not set that day. */
export function sunTimes(site: Site, day: number): SunTimes | null {
  const phi = rad(site.latitude)
  const delta = rad(declination(day))
  // the sun's centre is 0.833° below the horizon at sunrise: refraction and the size of its disc
  const cosH = (Math.sin(rad(-0.833)) - Math.sin(phi) * Math.sin(delta)) / (Math.cos(phi) * Math.cos(delta))
  if (cosH < -1 || cosH > 1) return null
  const h = deg(Math.acos(cosH)) / 15
  return { sunrise: solarToClock(site, day, 12 - h), noon: solarToClock(site, day, 12), sunset: solarToClock(site, day, 12 + h) }
}

/** An azimuth as an angle on the plan, clockwise from straight up, given where the site's north points. */
export const planAngle = (site: Site, azimuth: number): number => (((azimuth + site.north) % 360) + 360) % 360

/** Unit vector on the plan for an angle clockwise from straight up (+y is down). */
export const planDirection = (angle: number): Vec => ({ x: Math.sin(rad(angle)), y: -Math.cos(rad(angle)) })

/** The shadow a point `height` m tall casts on flat ground, as an offset on the plan; null at night. */
export function shadowOffset(site: Site, sun: SunPosition, height: number, longest = 80): Vec | null {
  if (sun.altitude <= 0.5) return null
  const length = Math.min(longest, height / Math.tan(rad(sun.altitude)))
  const d = planDirection(planAngle(site, sun.azimuth))
  return { x: -d.x * length, y: -d.y * length }
}

const POINTS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']

/** "NW": an azimuth to the nearest of eight compass points. */
export const compassPoint = (azimuth: number): string => POINTS[Math.round((((azimuth % 360) + 360) % 360) / 45) % 8]

/** "07:05" for clock hours (wrapping past midnight). */
export function formatClock(hours: number): string {
  const minutes = Math.round((((hours % 24) + 24) % 24) * 60) % (24 * 60)
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`
}
