import { ROOF_TYPES, type RoofType } from '../model/plan'
import { ROOF_TITLES } from '../model/roofs'
import { chooseTool, roofTheHouse } from '../state/actions'
import { setPrefs, usePrefs } from '../state/prefs'
import { getStore, useEditor, type ToolId } from '../state/store'
import { Canvas } from './canvas/Canvas'
import { TOOL_INFO } from './canvas/tools'
import { Segmented } from './fields'
import { NoticeBar } from './NoticeBar'
import { LayersPanel } from './panels/LayersPanel'
import { RoofPanel } from './panels/RoofPanel'

const ROOF_TAB_TOOLS: ToolId[] = ['roof-select', 'roof', 'pan']

/** The roof plan: roof tools in the bar's second row, the floor plan faded under the roofs, and the Roofs section. */
export function RoofTab() {
  const store = getStore()
  const tool = useEditor((s) => s.tool)
  const roofType = useEditor((s) => s.roofType)
  const prefs = usePrefs()
  return (
    <>
      <div className="tab-actions">
        <nav className="tools" aria-label="Tools">
          {ROOF_TAB_TOOLS.map((id) => (
            <button key={id} className={tool === id ? 'tool active' : 'tool'} onClick={() => chooseTool(id)} title={`${TOOL_INFO[id].title} (${TOOL_INFO[id].key})`}>
              {TOOL_INFO[id].title}
              <kbd>{TOOL_INFO[id].key}</kbd>
            </button>
          ))}
        </nav>
        <Segmented<RoofType>
          label="New roofs"
          value={roofType}
          options={ROOF_TYPES.map((t) => [t, ROOF_TITLES[t]] as const)}
          onChange={(type) => store.update({ roofType: type })}
          title="The type the next roof gets, drawn or made with Roof the house"
        />
        <button onClick={roofTheHouse} title="Roofs over the active layer's rooms and galleries, out to the walls' outside faces">
          Roof the house
        </button>
        <label className="check-field" title="Snap to points and lines (hold Alt to override)">
          <input type="checkbox" checked={prefs.snap} onChange={(e) => setPrefs({ snap: e.target.checked })} />
          Snap
        </label>
      </div>
      <main className="app-main roof-main">
        <Canvas mode="roof" />
        <NoticeBar />
        <aside className="sidebar">
          <RoofPanel />
          <LayersPanel />
        </aside>
      </main>
    </>
  )
}
