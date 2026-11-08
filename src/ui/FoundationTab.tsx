import { setFoundationSystem } from '../model/edit'
import { FOUNDATION_TITLES, foundationSystem } from '../model/foundations'
import { FOUNDATION_SYSTEMS, type FoundationSystem } from '../model/plan'
import { chooseTool } from '../state/actions'
import { getStore, useEditor, type ToolId } from '../state/store'
import { Canvas } from './canvas/Canvas'
import { TOOL_INFO } from './canvas/tools'
import { Segmented } from './fields'
import { NoticeBar } from './NoticeBar'
import { FoundationPanel } from './panels/FoundationPanel'
import { LayersPanel } from './panels/LayersPanel'

const FOUNDATION_TAB_TOOLS: ToolId[] = ['foundation-select', 'measure', 'pan']

/** The foundation plan: its tools and system in the bar's second row, the ground floor faded under it, and the Foundation section. */
export function FoundationTab() {
  const store = getStore()
  const tool = useEditor((s) => s.tool)
  const plan = useEditor((s) => s.plan)
  return (
    <>
      <div className="tab-actions">
        <nav className="tools" aria-label="Tools">
          {FOUNDATION_TAB_TOOLS.map((id) => (
            <button key={id} className={tool === id ? 'tool active' : 'tool'} onClick={() => chooseTool(id)} title={`${TOOL_INFO[id].title} (${TOOL_INFO[id].key})`}>
              {TOOL_INFO[id].title}
              <kbd>{TOOL_INFO[id].key}</kbd>
            </button>
          ))}
        </nav>
        <Segmented<FoundationSystem>
          label="System"
          value={foundationSystem(plan)}
          options={FOUNDATION_SYSTEMS.map((s) => [s, FOUNDATION_TITLES[s]] as const)}
          onChange={(system) => store.edit((p) => setFoundationSystem(p, system))}
          title="How the house stands on the ground; boundary and garden walls keep their strip footings"
        />
      </div>
      <main className="app-main foundation-main">
        <Canvas mode="foundation" />
        <NoticeBar />
        <aside className="sidebar">
          <FoundationPanel />
          <LayersPanel />
        </aside>
      </main>
    </>
  )
}
