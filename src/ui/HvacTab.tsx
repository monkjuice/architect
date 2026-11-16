import { chooseTool } from '../state/actions'
import { setPrefs, usePrefs } from '../state/prefs'
import { useEditor, type ToolId } from '../state/store'
import { Canvas } from './canvas/Canvas'
import { TOOL_INFO } from './canvas/tools'
import { NoticeBar } from './NoticeBar'
import { HvacPanel } from './panels/HvacPanel'
import { LayersPanel } from './panels/LayersPanel'
import { ServiceLibraryPanel } from './panels/ServiceLibraryPanel'
import { ServicePanel } from './panels/ServicePanel'
import { StoreyPicker } from './StoreyPicker'

const HVAC_TAB_TOOLS: ToolId[] = ['hvac-select', 'service', 'radiant', 'measure', 'pan']

/**
 * The HVAC plan: heating, cooling and ventilation. Its tools in the bar's second row, its equipment library on the
 * left, the floor shown faded under its pipes, lines, ducts and room loads (the plumbing's pieces faded too), and
 * the Selection, HVAC, Show and Layers sections on the right. Laid out as the Plumbing tab is.
 */
export function HvacTab() {
  const tool = useEditor((s) => s.tool)
  const prefs = usePrefs()
  return (
    <>
      <div className="tab-actions">
        <nav className="tools" aria-label="Tools">
          {HVAC_TAB_TOOLS.map((id) => (
            <button key={id} className={tool === id ? 'tool active' : 'tool'} onClick={() => chooseTool(id)} title={`${TOOL_INFO[id].title}${TOOL_INFO[id].key ? ` (${TOOL_INFO[id].key})` : ''}`}>
              {TOOL_INFO[id].title}
              {TOOL_INFO[id].key && <kbd>{TOOL_INFO[id].key}</kbd>}
            </button>
          ))}
        </nav>
        <label className="check-field" title="Equipment that stands against a wall backs up to the nearest one (hold Alt to override)">
          <input type="checkbox" checked={prefs.snap} onChange={(e) => setPrefs({ snap: e.target.checked })} />
          Snap
        </label>
        <StoreyPicker add={false} />
      </div>
      <main className="app-main">
        <ServiceLibraryPanel tab="hvac" />
        <Canvas mode="hvac" />
        <NoticeBar />
        <aside className="sidebar">
          <ServicePanel tab="hvac" />
          <HvacPanel />
          <LayersPanel />
        </aside>
      </main>
    </>
  )
}
