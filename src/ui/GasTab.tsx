import { chooseTool } from '../state/actions'
import { setPrefs, usePrefs } from '../state/prefs'
import { useEditor, type ToolId } from '../state/store'
import { Canvas } from './canvas/Canvas'
import { TOOL_INFO } from './canvas/tools'
import { NoticeBar } from './NoticeBar'
import { GasPanel } from './panels/GasPanel'
import { LayersPanel } from './panels/LayersPanel'
import { ServiceLibraryPanel } from './panels/ServiceLibraryPanel'
import { ServicePanel } from './panels/ServicePanel'
import { StoreyPicker } from './StoreyPicker'

const GAS_TAB_TOOLS: ToolId[] = ['gas-select', 'service', 'measure', 'pan']

/**
 * The gas installation: its tools in the bar's second row, its library (the meter, cylinders and outlets) on the
 * left, the floor shown faded under the pipe worked out to every appliance that burns gas (the other tabs' faded),
 * and the Selection, Gas, Show and Layers sections on the right. Laid out as the Plumbing and HVAC tabs are.
 */
export function GasTab() {
  const tool = useEditor((s) => s.tool)
  const prefs = usePrefs()
  return (
    <>
      <div className="tab-actions">
        <nav className="tools" aria-label="Tools">
          {GAS_TAB_TOOLS.map((id) => (
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
        <ServiceLibraryPanel tab="gas" />
        <Canvas mode="gas" />
        <NoticeBar />
        <aside className="sidebar">
          <ServicePanel tab="gas" />
          <GasPanel />
          <LayersPanel />
        </aside>
      </main>
    </>
  )
}

