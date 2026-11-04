import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { formatClock, SEASONS, seasonTitle, type Season } from '../../model/sun'
import { createExteriorEngine, type CameraPose, type CameraPreset, type ExteriorEngine } from '../../render/engine'
import { getSolids } from '../../state/derived'
import { downloadBlob } from '../../state/files'
import { setPrefs, setSun, usePrefs } from '../../state/prefs'
import { getStore, useEditor } from '../../state/store'
import { CheckField, Segmented } from '../fields'
import { NoticeBar } from '../NoticeBar'

const PRESETS: readonly (readonly [CameraPreset, string])[] = [
  ['aerial', 'Aerial'],
  ['top', 'Top'],
  ['north', 'North'],
  ['east', 'East'],
  ['south', 'South'],
  ['west', 'West'],
]

/** The camera when the tab was last left, so that coming back shows the same view. */
let lastPose: CameraPose | undefined

/**
 * The house in 3-D, built from the floor plan's visible layers on every change, under the plan's sun (its site,
 * and the season, time and clouds of the Floor tab's Sun section). Loaded on demand with three.js.
 */
export default function ExteriorTab() {
  const store = getStore()
  const plan = useEditor((s) => s.plan)
  const fileName = useEditor((s) => s.file.name)
  const { sun, roofs } = usePrefs()
  const solids = getSolids(plan)
  const shown = useMemo(() => (roofs ? solids : solids.filter((s) => s.kind !== 'roof' && s.kind !== 'parapet')), [solids, roofs])
  const [preset, setPreset] = useState<CameraPreset | undefined>(lastPose ? undefined : 'aerial')
  const supported = useMemo(() => webglAvailable(), [])
  const hostRef = useRef<HTMLDivElement>(null)
  const engineRef = useRef<ExteriorEngine | null>(null)
  const timeId = useId()

  useEffect(() => {
    if (!supported) return
    try {
      engineRef.current = createExteriorEngine(hostRef.current!, lastPose)
    } catch (error) {
      store.notify({ kind: 'error', text: `The 3-D view could not start: ${(error as Error).message}` })
    }
    return () => {
      lastPose = engineRef.current?.pose() ?? lastPose
      engineRef.current?.dispose()
      engineRef.current = null
    }
  }, [supported, store])

  useEffect(() => {
    engineRef.current?.show(shown)
  }, [shown])

  useEffect(() => {
    engineRef.current?.light(plan.site, sun)
  }, [plan.site, sun])

  const look = (id: CameraPreset) => {
    setPreset(id)
    engineRef.current?.view(id, plan.site)
  }

  const saveImage = async () => {
    const blob = await engineRef.current?.snapshot(2)
    if (blob) downloadBlob(blob, `${fileName.replace(/\.json$/i, '')}-exterior.png`)
    else store.notify({ kind: 'error', text: 'Could not capture the image.' })
  }

  return (
    <>
      <div className="tab-actions">
        <Segmented<CameraPreset> value={preset} options={PRESETS} onChange={look} title="Camera: from above, straight down, or facing each side of the house" />
        <CheckField label="Roof" title="The roofs drawn on the Roof tab; off, you look into the rooms" checked={roofs} onChange={(on) => setPrefs({ roofs: on })} />
        <label className="inline-field" title="The day of the sun (also in the Floor tab's Sun section)">
          Sun
          <select value={sun.season} onChange={(e) => setSun({ season: e.target.value as Season })}>
            {SEASONS.map((s) => (
              <option key={s} value={s}>
                {seasonTitle(s, plan.site.latitude)}
              </option>
            ))}
          </select>
        </label>
        <label className="inline-field" htmlFor={timeId}>
          <input id={timeId} type="range" min={0} max={24} step={1 / 12} value={sun.time} onChange={(e) => setSun({ time: Number(e.target.value) })} />
          <span className="field-value">{formatClock(sun.time)}</span>
        </label>
        <button className="tab-actions-end" onClick={() => void saveImage()} disabled={!supported}>
          Save image
        </button>
      </div>
      <main className="app-main exterior-main">
        <div className="exterior-host" ref={hostRef} />
        {!supported && <p className="exterior-message">This browser has no WebGL, so the 3-D view is unavailable.</p>}
        {supported && !solids.length && <p className="exterior-message">Nothing to show yet: draw walls and name areas on the Floor tab.</p>}
        <p className="exterior-hint">
          Drag to orbit, right-drag to pan, wheel to zoom. Built from the visible layers: walls and openings from the Floor tab, roofs from the Roof
          tab.
        </p>
        <NoticeBar />
      </main>
    </>
  )
}

function webglAvailable(): boolean {
  try {
    const canvas = document.createElement('canvas')
    return !!(canvas.getContext('webgl2') ?? canvas.getContext('webgl'))
  } catch {
    return false
  }
}
