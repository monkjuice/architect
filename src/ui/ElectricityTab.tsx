import { boardKey, boardsOf, MOUNT_TITLES, SUPPLY_TITLES, USE_TITLES } from '../model/electrical'
import { BOARD_SUPPLIES, SOCKET_USES, storeyOf, type CircuitKind } from '../model/plan'
import { CIRCUIT_RULES } from '../model/wiring'
import { storeyName } from '../model/storeys'
import { chooseTool, pickCircuit, pickedCircuit } from '../state/actions'
import { setPrefs, usePrefs } from '../state/prefs'
import { getStore, useEditor, type ElectricPick, type ToolId } from '../state/store'
import { Canvas } from './canvas/Canvas'
import { TOOL_INFO } from './canvas/tools'
import { Segmented } from './fields'
import { NoticeBar } from './NoticeBar'
import { ElectricityPanel } from './panels/ElectricityPanel'
import { LayersPanel } from './panels/LayersPanel'

const ELECTRIC_TAB_TOOLS: ToolId[] = ['electric-select', 'board', 'switch', 'light', 'socket', 'measure', 'pan']

/**
 * The electrical plan: a layer's boards, switches, light outlets and sockets over its floor (faded), with the cable
 * runs worked out from them. The bar's second row has the tools, what the picked tool puts down, and which layer's plan
 * is shown; the Electricity section has the boards, their circuits and what the selection is.
 */
export function ElectricityTab() {
  const store = getStore()
  const tool = useEditor((s) => s.tool)
  const pick = useEditor((s) => s.electricPick)
  const layers = useEditor((s) => s.plan.layers)
  const activeLayer = useEditor((s) => s.activeLayer)
  const prefs = usePrefs()
  const setPick = (patch: Partial<ElectricPick>) => store.update({ electricPick: { ...pick, ...patch } })

  return (
    <>
      <div className="tab-actions">
        <nav className="tools" aria-label="Tools">
          {ELECTRIC_TAB_TOOLS.map((id) => (
            <button key={id} className={tool === id ? 'tool active' : 'tool'} onClick={() => chooseTool(id)} title={`${TOOL_INFO[id].title} (${TOOL_INFO[id].key})`}>
              {TOOL_INFO[id].title}
              <kbd>{TOOL_INFO[id].key}</kbd>
            </button>
          ))}
        </nav>
        {tool === 'board' && (
          <Segmented
            label="Supply"
            value={pick.supply}
            options={BOARD_SUPPLIES.map((s) => [s, SUPPLY_TITLES[s]] as const)}
            onChange={(supply) => setPick({ supply })}
            title="Phases the new board is supplied with (each with the neutral); its circuits are shared out over them"
          />
        )}
        {tool === 'light' && (
          <Segmented
            label="On the"
            value={pick.light}
            options={(['ceiling', 'wall', 'floor'] as const).map((m) => [m, MOUNT_TITLES[m]] as const)}
            onChange={(light) => setPick({ light })}
            title="A ceiling light goes inside a room; a wall light on a wall's face; a floor light in a room or outdoors (a garden light, fed underground), flush in the ground or on a post"
          />
        )}
        {tool === 'socket' && (
          <>
            <Segmented
              label="On the"
              value={pick.socket}
              options={(['wall', 'floor'] as const).map((m) => [m, MOUNT_TITLES[m]] as const)}
              onChange={(socket) => setPick({ socket })}
              title="A wall socket goes on a wall's face; a floor socket in a room or outdoors (fed underground)"
            />
            <Segmented
              label="Use"
              value={pick.use}
              options={SOCKET_USES.map((u) => [u, USE_TITLES[u]] as const)}
              onChange={(use) => setPick({ use })}
              title="General sockets share circuits of up to 15; a special one (an oven, an AC, a pump) gets a circuit of its own"
            />
          </>
        )}
        {(tool === 'switch' || tool === 'light' || tool === 'socket') && (
          <CircuitField kind={tool === 'socket' ? (pick.use === 'special' ? 'special' : 'sockets') : 'lighting'} />
        )}
        <div className="inline-field tab-actions-end">
          <label htmlFor="electric-layer">Plan of</label>
          <select id="electric-layer" value={activeLayer} onChange={(e) => store.setActiveLayer(e.target.value)} title="The layer whose electrical plan is shown and drawn on">
            {[...layers].reverse().map((l) => (
              <option key={l.id} value={l.id}>
                {l.name} ({storeyName(storeyOf(l)).toLowerCase()})
              </option>
            ))}
          </select>
          <label className="check-field" title="Show every layer's points and cable runs on this floor, not only this layer's">
            <input type="checkbox" checked={prefs.wiringAll} onChange={(e) => setPrefs({ wiringAll: e.target.checked })} />
            All layers
          </label>
          <label className="check-field" title="Snap to walls and room middles, and a dragged bend to points and lines (hold Alt to override)">
            <input type="checkbox" checked={prefs.snap} onChange={(e) => setPrefs({ snap: e.target.checked })} />
            Snap
          </label>
        </div>
      </div>
      <main className="app-main electricity-main">
        <Canvas mode="electricity" />
        <NoticeBar />
        <aside className="sidebar">
          <ElectricityPanel />
          <LayersPanel />
        </aside>
      </main>
    </>
  )
}

/**
 * The circuit new points of a kind go on: one made by hand on the active layer (of any board feeding it), or a new
 * one, named when the first point is put down (it is then picked for the next ones).
 */
function CircuitField({ kind }: { kind: CircuitKind }) {
  const plan = useEditor((s) => s.plan)
  const activeLayer = useEditor((s) => s.activeLayer)
  useEditor((s) => s.circuitPick)
  const picked = pickedCircuit(kind)
  const boards = boardsOf(plan)
  const options = boards.flatMap((b) =>
    Object.entries(b.board.circuits).flatMap(([id, c]) =>
      c.type === kind && c.layer === activeLayer ? [{ value: `${boardKey({ layer: b.layer.id, id: b.id })}|${id}`, label: `${c.name || id}${boards.length > 1 ? ` (${b.board.name})` : ''}` }] : [],
    ),
  )
  const value = picked ? `${boardKey({ layer: picked.board.layer.id, id: picked.board.id })}|${picked.id}` : ''
  return (
    <div className="inline-field" title={`The ${CIRCUIT_RULES[kind].title.toLowerCase()} circuit new points go on; a new one is named when the first point is put down`}>
      <label htmlFor="electric-circuit">Circuit</label>
      <select
        id="electric-circuit"
        value={value}
        onChange={(e) => {
          const [board, id] = e.target.value.split('|')
          pickCircuit(kind, e.target.value ? { board, id } : null)
          e.target.blur()
        }}
      >
        <option value="">New circuit…</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  )
}
