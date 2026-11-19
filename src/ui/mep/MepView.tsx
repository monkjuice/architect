import { useEffect, useMemo, useRef } from 'react'
import type { MepSystem } from '../../model/mep'
import { createExteriorEngine, type CameraPose, type ExteriorEngine } from '../../render/engine'
import { buildMep } from '../../render/mep'
import { getMep, getSolids } from '../../state/derived'
import { usePrefs } from '../../state/prefs'
import { getStore, useEditor } from '../../state/store'

/** The camera when the view was last left, so that coming back shows the same view. */
let lastPose: CameraPose | undefined

/** What the ghosted house keeps solid: the equipment the lines go to. */
const KEEP = ['service', 'electrical']

/**
 * The MEP tab's 3-D view: the house as a ghost over a see-through ground (engine.ts, `xray`), its roofs left off, the
 * equipment solid, and every installation as lines at the heights they run at (render/mep.ts), with their sleeves,
 * trenches and clashes. `focus` flies the camera to a point (a clash, a construction detail's example).
 */
export default function MepView({ focus }: { focus: { at: { x: number; y: number; z: number }; n: number } | null }) {
  const store = getStore()
  const plan = useEditor((s) => s.plan)
  const { mep: show, sun } = usePrefs()
  const hostRef = useRef<HTMLDivElement>(null)
  const engineRef = useRef<ExteriorEngine | null>(null)
  const solids = getSolids(plan)
  const mep = getMep(plan)
  // the house without its roofs and its garden's trees and plants, the equipment when asked for
  const shown = useMemo(() => {
    const garden = (ref: { layer: string; kind: string; id: string }) => {
      if (ref.kind !== 'furniture') return false
      const kind = plan.layers.find((l) => l.id === ref.layer)?.furniture[ref.id]?.kind
      return kind === 'tree' || kind === 'plant'
    }
    return solids.filter((s) => s.kind !== 'roof' && s.kind !== 'parapet' && !s.onRoof && !garden(s.ref) && (show.equipment || (s.kind !== 'service' && s.kind !== 'electrical')))
  }, [solids, show.equipment, plan.layers])

  useEffect(() => {
    try {
      engineRef.current = createExteriorEngine(hostRef.current!, lastPose, { ghost: 0.12, ground: 0.45, keep: KEEP, groundColor: '#5c4d3c', background: '#1c1f24' })
    } catch (error) {
      store.notify({ kind: 'error', text: `The 3-D view could not start: ${(error as Error).message}` })
    }
    return () => {
      lastPose = engineRef.current?.pose() ?? lastPose
      engineRef.current?.dispose()
      engineRef.current = null
    }
  }, [store])

  useEffect(() => {
    engineRef.current?.show(shown)
  }, [shown])

  useEffect(() => {
    // a bright day from high up, so nothing is lost in shadow
    engineRef.current?.light(plan.site, { ...sun, time: 12, cloudiness: 0.6 })
  }, [plan.site, sun])

  useEffect(() => {
    const model = buildMep(mep, (s: MepSystem) => show[s], { trenches: show.trenches, clashes: show.clashes })
    engineRef.current?.overlay(model.root)
    return () => {
      engineRef.current?.overlay(null)
      model.dispose()
    }
  }, [mep, show])

  useEffect(() => {
    if (focus) engineRef.current?.focus(focus.at, 5)
  }, [focus])

  // the first time, the view frames the installations (not the lots round the house)
  const framed = useRef(!!lastPose)
  useEffect(() => {
    if (framed.current || focus || !mep.lines.length) return
    framed.current = true
    const pts = mep.lines.flatMap((l) => l.pts)
    const [x0, x1] = [Math.min(...pts.map((p) => p.x)), Math.max(...pts.map((p) => p.x))]
    const [y0, y1] = [Math.min(...pts.map((p) => p.y)), Math.max(...pts.map((p) => p.y))]
    engineRef.current?.focus({ x: (x0 + x1) / 2, y: (y0 + y1) / 2, z: 0 }, Math.max(8, Math.hypot(x1 - x0, y1 - y0) * 0.8))
  }, [mep, focus])

  return <div className="exterior-host" ref={hostRef} />
}

