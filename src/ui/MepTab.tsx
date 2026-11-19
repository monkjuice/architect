import { lazy, Suspense, useRef, useState } from 'react'
import { MEP_SYSTEMS, SYSTEM_TITLES, type MepSpot } from '../model/mep'
import { storeyOf } from '../model/plan'
import { levelOf } from '../model/storeys'
import { chooseTool } from '../state/actions'
import { setPrefs, usePrefs, type MepPrefs } from '../state/prefs'
import { getStore, useEditor, type ToolId } from '../state/store'
import { Canvas } from './canvas/Canvas'
import { TOOL_INFO } from './canvas/tools'
import { CheckField, Segmented } from './fields'
import { MepDetails } from './mep/MepDetails'
import { NoticeBar } from './NoticeBar'
import { LayersPanel } from './panels/LayersPanel'
import { MepPanel } from './panels/MepPanel'
import { StoreyPicker } from './StoreyPicker'

/** three.js is large: the 3-D view loads only when it is first shown. */
const MepView = lazy(() => import('./mep/MepView'))

const MEP_TAB_TOOLS: ToolId[] = ['mep-select', 'measure', 'pan']
const VIEWS: readonly (readonly [MepPrefs['view'], string])[] = [
  ['plan', 'Plan'],
  ['3d', '3-D'],
  ['details', 'Details'],
]

/**
 * MEP coordination: every installation together, to check them against each other and against the building. Three
 * views: the plan (each tab's drawing over the floor, with the sleeves and the clashes), 3-D (the house as a ghost,
 * the lines at the heights they run at, under the see-through ground what is buried), and the construction details
 * (sections with this plan's values). Nothing is edited here: each installation is edited on its own tab.
 */
export function MepTab() {
  const store = getStore()
  const plan = useEditor((s) => s.plan)
  const tool = useEditor((s) => s.tool)
  const { mep } = usePrefs()
  const [focus, setFocus] = useState<{ at: { x: number; y: number; z: number }; n: number } | null>(null)
  const hostRef = useRef<HTMLDivElement>(null)
  const set = (patch: Partial<MepPrefs>) => setPrefs({ mep: { ...mep, ...patch } })

  /** Looks at a point: flies the 3-D camera to it, or centres the plan on it, on its floor. */
  const show = (at: { x: number; y: number; z: number }, where: 'plan' | '3d') => {
    if (where === '3d') {
      set({ view: '3d' })
      setFocus({ at, n: (focus?.n ?? 0) + 1 })
      return
    }
    set({ view: 'plan' })
    // the floor it is on: the highest whose level it reaches (what is buried is the ground floor's)
    const layers = plan.layers.filter((l) => l.visible)
    const floor = layers.filter((l) => (storeyOf(l) ? levelOf(l) : 0) <= at.z + 0.2).sort((a, b) => storeyOf(b) - storeyOf(a))[0] ?? layers[0]
    if (floor) store.setActiveLayer(floor.id)
    const box = hostRef.current?.getBoundingClientRect()
    const zoom = 60
    if (box) store.update({ view: { zoom, x0: at.x - box.width / 2 / zoom, y0: at.y - box.height / 2 / zoom } })
  }

  return (
    <>
      <div className="tab-actions">
        <Segmented<MepPrefs['view']> value={mep.view} options={VIEWS} onChange={(view) => set({ view })} title="The plan, the 3-D view, or the construction details" />
        {MEP_SYSTEMS.map((s) => (
          <CheckField key={s} label={SYSTEM_TITLES[s]} checked={mep[s]} onChange={(on) => set({ [s]: on })} />
        ))}
        <CheckField label="Equipment" checked={mep.equipment} onChange={(equipment) => set({ equipment })} title="Every tab's equipment: boards, tanks, heaters, units, meters" />
        <CheckField label="Clashes" checked={mep.clashes} onChange={(clashes) => set({ clashes })} title="Where two installations come too close" />
        {mep.view === '3d' && <CheckField label="Trenches" checked={mep.trenches} onChange={(trenches) => set({ trenches })} title="The earth dug round what is buried" />}
        {mep.view === 'plan' && (
          <>
            <nav className="tools" aria-label="Tools">
              {MEP_TAB_TOOLS.map((id) => (
                <button key={id} className={tool === id ? 'tool active' : 'tool'} onClick={() => chooseTool(id)} title={`${TOOL_INFO[id].title}${TOOL_INFO[id].key ? ` (${TOOL_INFO[id].key})` : ''}`}>
                  {TOOL_INFO[id].title}
                  {TOOL_INFO[id].key && <kbd>{TOOL_INFO[id].key}</kbd>}
                </button>
              ))}
            </nav>
            <StoreyPicker add={false} />
          </>
        )}
      </div>
      <main className="app-main mep-main">
        <div className="mep-host" ref={hostRef}>
          {mep.view === 'plan' && <Canvas mode="mep" />}
          {mep.view === '3d' && (
            <Suspense fallback={<p className="tab-loading">Loading the 3-D view…</p>}>
              <MepView focus={focus} />
              <p className="exterior-hint">
                Drag to orbit, right-drag to pan, wheel to zoom; look up from under the ground to see what is buried. The house is a ghost, its roofs left off;
                the lines run at the heights they are laid at.
              </p>
            </Suspense>
          )}
          {mep.view === 'details' && <MepDetails onShow={(spot: MepSpot, where) => show(spot.at, where)} />}
          <NoticeBar />
        </div>
        <aside className="sidebar">
          <MepPanel onShow={show} />
          {mep.view === 'plan' && <LayersPanel />}
        </aside>
      </main>
    </>
  )
}

