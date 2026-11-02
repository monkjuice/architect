import { updateSite } from '../../model/edit'
import type { Site } from '../../model/plan'
import { compassPoint, formatClock, SEASON_DAY, SEASONS, seasonTitle, sunPosition, sunTimes, type Season } from '../../model/sun'
import { chooseTool } from '../../state/actions'
import { setSun, usePrefs } from '../../state/prefs'
import { getStore, useEditor } from '../../state/store'
import { Box, CheckField, NumberField, SelectField, SliderField } from '../fields'

const latitudeText = (v: number) => `${Math.abs(v).toFixed(1)}°${v < 0 ? 'S' : 'N'}`
const longitudeText = (v: number) => `${Math.abs(v).toFixed(1)}°${v < 0 ? 'W' : 'E'}`
const offsetText = (v: number) => `UTC${v < 0 ? '−' : '+'}${Math.abs(v)}`

/**
 * The sun to play with: season, time of day and cloudiness are view settings (per browser); north and the
 * location belong to the plan, so they are saved with it and undoable.
 */
export function SunPanel() {
  const store = getStore()
  const site = useEditor((s) => s.plan.site)
  const tool = useEditor((s) => s.tool)
  const { sun } = usePrefs()
  const day = SEASON_DAY[sun.season]
  const times = sunTimes(site, day)
  const pos = sunPosition(site, day, sun.time)
  const editSite = (patch: Partial<Site>) => store.edit((plan) => updateSite(plan, patch))

  return (
    <Box id="sun" title="Sun" actions={<CheckField label="Show" checked={sun.visible} onChange={(visible) => setSun({ visible })} />}>
      <div className="fields">
        <div className="field-wide">
          <SelectField<Season>
            label="Season"
            value={sun.season}
            options={SEASONS.map((s) => [s, seasonTitle(s, site.latitude)] as const)}
            onChange={(season) => setSun({ season })}
          />
        </div>
        <div className="field-wide">
          <SliderField label="Time" value={sun.time} min={0} max={24} step={1 / 12} display={formatClock(sun.time)} onPreview={(time) => setSun({ time })} onEnd={() => {}} />
        </div>
        <p className="hint field-wide sun-readout">
          {times ? `Sunrise ${formatClock(times.sunrise)} · noon ${formatClock(times.noon)} · sunset ${formatClock(times.sunset)}` : 'No sunrise or sunset that day.'}
          <br />
          {pos.altitude > 0 ? `The sun is ${pos.altitude.toFixed(0)}° up, in the ${compassPoint(pos.azimuth)}.` : 'The sun is below the horizon.'}
        </p>
        <div className="field-wide">
          <SliderField
            label="Cloudiness"
            value={sun.cloudiness}
            min={0}
            max={1}
            step={0.05}
            display={`${Math.round(sun.cloudiness * 100)}%`}
            onPreview={(cloudiness) => setSun({ cloudiness })}
            onEnd={() => {}}
          />
        </div>
        <CheckField label="Wall shadows" checked={sun.shadows} onChange={(shadows) => setSun({ shadows })} />
        <p className="hint field-wide">Each wall casts a shadow as tall as it is (its height is in the Selection panel).</p>
      </div>
      <details className="site-details">
        <summary>
          Site: north {site.north.toFixed(1)}° · {latitudeText(site.latitude)} {longitudeText(site.longitude)} · {offsetText(site.utcOffset)}
        </summary>
        <div className="fields">
          <NumberField label="North (° clockwise from up)" unit="°" digits={1} value={site.north} onCommit={(north) => editSite({ north: ((north % 360) + 360) % 360 })} />
          <div className="field">
            <label>&nbsp;</label>
            <button className={tool === 'north' ? 'active' : ''} onClick={() => chooseTool(tool === 'north' ? 'select' : 'north')} title="Click the tail of the plan's north arrow, then its tip">
              From the plan's arrow
            </button>
          </div>
          <NumberField label="Latitude (south −)" unit="°" digits={2} value={site.latitude} onCommit={(latitude) => editSite({ latitude: Math.max(-89.9, Math.min(89.9, latitude)) })} />
          <NumberField label="Longitude (west −)" unit="°" digits={2} value={site.longitude} onCommit={(longitude) => editSite({ longitude: Math.max(-180, Math.min(180, longitude)) })} />
          <NumberField label="Clock (UTC offset)" unit="h" digits={1} value={site.utcOffset} onCommit={(utcOffset) => editSite({ utcOffset: Math.max(-12, Math.min(14, utcOffset)) })} />
        </div>
      </details>
    </Box>
  )
}
