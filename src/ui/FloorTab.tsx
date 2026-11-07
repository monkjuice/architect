import { chooseTool } from '../state/actions'
import { setPrefs, usePrefs } from '../state/prefs'
import { useEditor, type ToolId } from '../state/store'
import { Canvas } from './canvas/Canvas'
import { TOOL_INFO } from './canvas/tools'
import { NoticeBar } from './NoticeBar'
import { AreasPanel } from './panels/AreasPanel'
import { BasePlanPanel } from './panels/BasePlanPanel'
import { LayersPanel } from './panels/LayersPanel'
import { LibraryPanel } from './panels/LibraryPanel'
import { SelectionPanel } from './panels/SelectionPanel'
import { SunPanel } from './panels/SunPanel'
import { ViewPanel } from './panels/ViewPanel'
import { StoreyPicker } from './StoreyPicker'

const DRAW_TOOLS: ToolId[] = ['select', 'line', 'area', 'measure', 'pan']

/** The floor plan: drawing tools in the bar's second row, the library, the canvas and the panels. */
export function FloorTab() {
  const tool = useEditor((s) => s.tool)
  const prefs = usePrefs()
  return (
    <>
      <div className="tab-actions">
        <nav className="tools" aria-label="Tools">
          {DRAW_TOOLS.map((id) => (
            <button key={id} className={tool === id ? 'tool active' : 'tool'} onClick={() => chooseTool(id)} title={`${TOOL_INFO[id].title} (${TOOL_INFO[id].key})`}>
              {TOOL_INFO[id].title}
              <kbd>{TOOL_INFO[id].key}</kbd>
            </button>
          ))}
        </nav>
        <label className="check-field" title="Snap to points and lines (hold Alt to override)">
          <input type="checkbox" checked={prefs.snap} onChange={(e) => setPrefs({ snap: e.target.checked })} />
          Snap
        </label>
        <StoreyPicker />
      </div>
      <main className="app-main">
        <LibraryPanel />
        <Canvas />
        <NoticeBar />
        <aside className="sidebar">
          <ViewPanel />
          <BasePlanPanel />
          <LayersPanel />
          <SelectionPanel />
          <AreasPanel />
          <SunPanel />
        </aside>
      </main>
    </>
  )
}
