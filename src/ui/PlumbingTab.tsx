import { chooseTool } from '../state/actions'
import { setPrefs, usePrefs } from '../state/prefs'
import { useEditor, type ToolId } from '../state/store'
import { Canvas } from './canvas/Canvas'
import { TOOL_INFO } from './canvas/tools'
import { NoticeBar } from './NoticeBar'
import { LayersPanel } from './panels/LayersPanel'
import { PlumbingPanel } from './panels/PlumbingPanel'
import { ServiceLibraryPanel } from './panels/ServiceLibraryPanel'
import { ServicePanel } from './panels/ServicePanel'
import { StoreyPicker } from './StoreyPicker'

const PLUMBING_TAB_TOOLS: ToolId[] = ['plumbing-select', 'service', 'measure', 'pan']

/**
 * The plumbing plan: its tools in the bar's second row, the equipment library on the left, the floor shown faded
 * under the pipes worked out from it, and the Plumbing, Selection, Show and Layers sections on the right.
 */
export function PlumbingTab() {
  const tool = useEditor((s) => s.tool)
  const prefs = usePrefs()
  return (
    <>
      <div className="tab-actions">
        <nav className="tools" aria-label="Tools">
          {PLUMBING_TAB_TOOLS.map((id) => (
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
        <ServiceLibraryPanel tab="plumbing" />
        <Canvas mode="plumbing" />
        <NoticeBar />
        <aside className="sidebar">
          <ServicePanel tab="plumbing" />
          <PlumbingPanel />
          <LayersPanel />
        </aside>
      </main>
    </>
  )
}
