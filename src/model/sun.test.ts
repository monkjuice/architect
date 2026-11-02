import { describe, expect, it } from 'vitest'
import { updateSite } from './edit'
import { createPlan, DEFAULT_SITE } from './plan'
import { parsePlan, serializePlan } from './planFile'
import {
  compassPoint,
  formatClock,
  planAngle,
  planDirection,
  SEASON_DAY,
  seasonTitle,
  shadowOffset,
  solarToClock,
  sunPosition,
  sunTimes,
} from './sun'

const ba = { ...DEFAULT_SITE } // Buenos Aires, 34.6°S 58.4°W, UTC−3
const noon = (day: number) => solarToClock(ba, day, 12)

describe('sun position', () => {
  it('stands in the north at noon south of the equator, as high as 90° minus latitude plus declination', () => {
    const equinox = sunPosition(ba, SEASON_DAY.mar, noon(SEASON_DAY.mar))
    // on 20 March the declination is still a few tenths of a degree south
    expect(Math.abs(equinox.altitude - 55.4)).toBeLessThan(1)
    expect(Math.min(equinox.azimuth, 360 - equinox.azimuth)).toBeLessThan(1)
    expect(sunPosition(ba, SEASON_DAY.dec, noon(SEASON_DAY.dec)).altitude).toBeCloseTo(78.8, 0)
    expect(sunPosition(ba, SEASON_DAY.jun, noon(SEASON_DAY.jun)).altitude).toBeCloseTo(32, 0)
  })

  it('stands in the south at noon in a northern summer', () => {
    const madrid = { north: 0, latitude: 40.4, longitude: -3.7, utcOffset: 2 }
    const summer = sunPosition(madrid, SEASON_DAY.jun, solarToClock(madrid, SEASON_DAY.jun, 12))
    expect(summer.azimuth).toBeCloseTo(180, 0)
    expect(summer.altitude).toBeCloseTo(73, 0)
  })

  it('rises about 29° from east at the solstices, due east at the equinoxes, in the morning half', () => {
    const at = (day: number, which: 'sunrise' | 'sunset') => sunPosition(ba, day, sunTimes(ba, day)![which]).azimuth
    expect(at(SEASON_DAY.dec, 'sunrise')).toBeGreaterThan(117)
    expect(at(SEASON_DAY.dec, 'sunrise')).toBeLessThan(122)
    expect(at(SEASON_DAY.jun, 'sunrise')).toBeGreaterThan(58)
    expect(at(SEASON_DAY.jun, 'sunrise')).toBeLessThan(63)
    expect(at(SEASON_DAY.mar, 'sunrise')).toBeCloseTo(90, -1)
    expect(at(SEASON_DAY.dec, 'sunset')).toBeCloseTo(360 - at(SEASON_DAY.dec, 'sunrise'), 0)
  })
})

describe('sun times', () => {
  it('gives Buenos Aires long summer days and short winter ones, noon near 13:00 on the clock', () => {
    const summer = sunTimes(ba, SEASON_DAY.dec)!
    const winter = sunTimes(ba, SEASON_DAY.jun)!
    expect(summer.sunset - summer.sunrise).toBeCloseTo(14.5, 0)
    expect(winter.sunset - winter.sunrise).toBeCloseTo(9.9, 0)
    expect(summer.noon).toBeGreaterThan(12.7)
    expect(summer.noon).toBeLessThan(13.1)
    // published times for Buenos Aires: about 05:40 and 20:05 on 21 Dec, 08:00 and 17:50 on 21 Jun
    expect(Math.abs(summer.sunrise - 5.67)).toBeLessThan(0.15)
    expect(Math.abs(summer.sunset - 20.1)).toBeLessThan(0.15)
    expect(Math.abs(winter.sunrise - 8.0)).toBeLessThan(0.15)
    expect(Math.abs(winter.sunset - 17.85)).toBeLessThan(0.15)
  })

  it('has no sunrise in a polar night', () => {
    expect(sunTimes({ north: 0, latitude: 78, longitude: 15, utcOffset: 1 }, SEASON_DAY.dec)).toBeNull()
  })
})

describe('on the plan', () => {
  it('turns azimuths by where north points', () => {
    const site = { ...ba, north: 39 }
    expect(planAngle(site, 0)).toBe(39)
    expect(planAngle(site, 330)).toBe(9)
    const up = planDirection(0)
    expect(up.x).toBeCloseTo(0, 12)
    expect(up.y).toBeCloseTo(-1, 12)
  })

  it('casts shadows away from the sun, as long as height over tan(altitude)', () => {
    const s = shadowOffset(ba, { altitude: 45, azimuth: 0 }, 3)!
    expect(s.x).toBeCloseTo(0, 9)
    expect(s.y).toBeCloseTo(3, 9) // sun due north (up): shadow 3 m straight down
    expect(shadowOffset(ba, { altitude: -2, azimuth: 0 }, 3)).toBeNull()
  })

  it('names seasons by hemisphere and formats times', () => {
    expect(seasonTitle('dec', -34)).toBe('Summer solstice (21 Dec)')
    expect(seasonTitle('dec', 40)).toBe('Winter solstice (21 Dec)')
    expect(compassPoint(316)).toBe('NW')
    expect(formatClock(5.67)).toBe('05:40')
    expect(formatClock(24.5)).toBe('00:30')
  })
})

describe('site', () => {
  it('defaults for older plans and round-trips edits', () => {
    const raw = JSON.parse(serializePlan(createPlan()))
    delete raw.site
    const parsed = parsePlan(raw)
    expect(parsed.ok && parsed.plan.site).toEqual(DEFAULT_SITE)
    const plan = createPlan()
    expect(updateSite(plan, { north: 0 })).toBe(plan)
    const turned = updateSite(plan, { north: 39 })
    const again = parsePlan(JSON.parse(serializePlan(turned)))
    expect(again.ok && again.plan.site.north).toBe(39)
  })
})
