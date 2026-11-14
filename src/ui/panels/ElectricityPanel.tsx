import { useState } from 'react'
import {
  addCircuit,
  removeCircuit,
  setBoardAreas,
  setBoardIntegrated,
  setBoardLayers,
  setBoardParent,
  setPointCircuit,
  setRoute,
  updateCircuit,
  updateElectrical,
} from '../../model/edit'
import { boardAndDescendants, boardChildren, boardCovers, boardFeeding, boardFor, boardKey, boardOfArea, boardsOf, electricTitle, heightOf, LOADS, SUPPLY_TITLES, USE_TITLES } from '../../model/electrical'
import { BOARD_SUPPLIES, CIRCUIT_TYPES, findLayer, SOCKET_USES, storeyOf, type Board, type CircuitKind, type Electrical, type ElectricPoint, type Layer, type Plan, type Ref } from '../../model/plan'
import { storeyName } from '../../model/storeys'
import { formatNumber } from '../../model/takeoffText'
import { BURIED_DEPTH, CIRCUIT_RULES, circuitKindOf, MAX_DROP, PHASE_NAMES, phasesOf, pointKey, RHO, VOLTAGE, WASTE, type BoardWiring, type Circuit, type Wiring } from '../../model/wiring'
import { addIntegratedSubBoard, deleteSelection, keepCircuit, moveCircuitTo, offerCircuitsTo, pickCircuit } from '../../state/actions'
import { getPlacedAreas, getRegions, getWiring } from '../../state/derived'
import { getStore, useEditor } from '../../state/store'
import { Box, CheckField, NumberField, Segmented, SelectField, TextField } from '../fields'

const n0 = (x: number) => formatNumber(x, 0, 'en')
const n1 = (x: number) => formatNumber(x, 1, 'en')
const kw = (va: number) => `${(va / 1000).toFixed(1)} kVA`

/** "2 × 1.5 mm² + PE 2.5 mm²": line and neutral, and the earth. */
const cableText = (c: Pick<Circuit, 'section' | 'earth'>) => `2 × ${c.section} mm² + PE ${c.earth} mm²`

/** The conduit a circuit's runs take, by the plane they run in. */
const CONDUIT_WAYS: Record<Circuit['plane'], string> = {
  ceiling: 'corrugated PVC conduit (walls and ceiling)',
  floor: 'reinforced corrugated PVC conduit (floor and walls)',
}

/** "23.4 m: 15.2 along the walls, 4.8 up and down to the boxes, 3.4 buried": where a cable's length goes. */
function lengthText(length: number, parts: { walls: number; vertical: number; buried: number; riser?: number }): string {
  const bits = [
    parts.walls > 0.05 && `${n1(parts.walls)} along walls, ceilings and floors`,
    parts.vertical > 0.05 && `${n1(parts.vertical)} up and down to its boxes`,
    parts.buried > 0.05 && `${n1(parts.buried)} buried (with ${BURIED_DEPTH} m down and up, and down walls into the ground)`,
    (parts.riser ?? 0) > 0.05 && `${n1(parts.riser!)} riser between floors`,
  ].filter(Boolean)
  return `${n1(length)} m${bits.length ? `: ${bits.join(', ')}` : ''}.`
}

/** A circuit's name for the lists: "C3 “Kitchen lighting”" when it has one. */
const named = (c: Circuit) => `${c.name}${c.label ? ` “${c.label}”` : ''}`

type BoardEntry = { layer: Layer; id: string; board: Board }

/** Circuit kinds in a few letters, for the narrow sidebar. */
const SHORT_TITLES: Record<CircuitKind, string> = { lighting: 'Lighting', sockets: 'Sockets', special: 'Special' }

/** The board feeding a point's spot (a sub-board for one in its areas, else its layer's main board): where new circuits for it go. */
const spotBoard = (plan: Plan, layer: string, e: ElectricPoint): BoardEntry | undefined => boardFor(plan, layer, e, getRegions)

const areaBoardKey = (plan: Plan, layer: string, e: ElectricPoint): string | null => {
  const b = spotBoard(plan, layer, e)
  return b ? boardKey({ layer: b.layer.id, id: b.id }) : null
}

/** Whether board `b` may feed every one of `points` (where they are): what a circuit holding them may be on. */
function feedsAll(plan: Plan, b: BoardEntry, points: readonly Ref[] | readonly { layer: string; id: string }[]): boolean {
  return points.every((p) => {
    const e = findLayer(plan, p.layer)?.electrical[p.id]
    return !!e && boardCovers(plan, b, p.layer, e, getRegions)
  })
}

/** "board key|circuit id" of the circuit defined by hand a point is on, as the Circuit field's options are keyed. */
function circuitValue(wiring: Wiring, ref: Ref): string | undefined {
  const c = wiring.circuitOf.get(pointKey(ref))
  return c?.manualId ? `${pointKey(c.board)}|${c.manualId}` : undefined
}

/** The board that feeds a point (its circuit's, or the one feeding its spot), from the wiring. */
function feederOf(plan: Plan, wiring: Wiring, ref: Ref): BoardEntry | undefined {
  const key = wiring.feedOf.get(pointKey(ref))
  return key ? boardsOf(plan).find((b) => boardKey({ layer: b.layer.id, id: b.id }) === key) : undefined
}

/**
 * The Electricity tab's sections: the boards, main boards with their sub-boards under them (and what the wiring found
 * wrong), what is selected, and each board's circuits with their breaker, cable, conduit, length and voltage drop.
 * What building it takes is in the Materials tab.
 */
export function ElectricityPanel() {
  const plan = useEditor((s) => s.plan)
  const selection = useEditor((s) => s.selection)
  const wiring = getWiring(plan)
  const picked = selection.filter((r) => r.kind === 'electrical')
  const focus = new Set(picked.flatMap((r) => (wiring.circuitOf.get(pointKey(r)) ? [wiring.circuitOf.get(pointKey(r))!] : [])))
  const boards = boardsOf(plan)
  // main boards first, each followed by its sub-boards, indented
  const tree: { b: BoardEntry; depth: number }[] = []
  const visit = (b: BoardEntry, depth: number) => {
    if (tree.some((t) => t.b === b) || depth > 8) return
    tree.push({ b, depth })
    for (const c of boardChildren(plan, { layer: b.layer.id, id: b.id })) visit(c, depth + 1)
  }
  for (const b of boards) if (!b.board.parent || !boards.some((p) => p.layer.id === b.board.parent!.layer && p.id === b.board.parent!.board)) visit(b, 0)

  return (
    <>
      <Box id="electric-boards" title="Boards">
        {!boards.length && <p className="muted">No board yet. With Board (B), click a wall to put one on it, name it and tick the layers it feeds.</p>}
        <ul className="area-list board-tree">
          {tree.map(({ b, depth }) => {
            const bw = wiring.boards.find((w) => w.ref.layer === b.layer.id && w.ref.id === b.id)
            const selected = picked.some((r) => r.layer === b.layer.id && r.id === b.id)
            return (
              <li
                key={`${b.layer.id}:${b.id}`}
                className={selected ? 'selected' : ''}
                style={{ paddingLeft: 8 + depth * 16 }}
                onClick={() => {
                  getStore().setActiveLayer(b.layer.id)
                  getStore().select([{ layer: b.layer.id, kind: 'electrical', id: b.id }])
                }}
              >
                <span className="area-list-name">
                  {depth > 0 && '↳ '}
                  {b.board.name}
                  <span className="muted">
                    {' '}
                    · {b.board.parent ? (b.board.integrated ? 'in its parent' : 'sub-board') : SUPPLY_TITLES[b.board.supply].toLowerCase()}
                  </span>
                </span>
                <span className="area-list-size">{bw ? `${bw.circuits.length} circuit${bw.circuits.length === 1 ? '' : 's'}` : 'hidden'}</span>
              </li>
            )
          })}
        </ul>
        {wiring.warnings.map((w) => (
          <p key={w} className="hint warning">
            {w}
          </p>
        ))}
        <p className="hint">
          Usual sizes for a house after AEA 90364-7-771 (220 V, copper, conduit in the walls), not a signed design: a registered electrician sets the real
          one. What it takes to build is in the Materials tab; boards, switches, sockets and light fixtures show in the Exterior and Elevations.
        </p>
      </Box>
      <ElectricSelection refs={picked} />
      <Box id="electric-circuits" title="Circuits">
        {!wiring.boards.length && <p className="muted">A board's circuits show here: a new point goes on the circuit picked in the bar, or on a new one.</p>}
        {wiring.boards.map((bw) => (
          <BoardCircuits key={pointKey(bw.ref)} bw={bw} focus={focus} />
        ))}
        {wiring.boards.length > 0 && <HowWorkedOut />}
      </Box>
    </>
  )
}

/** What the lengths and sizes are worked out from, and what they leave out, so they can be checked. */
function HowWorkedOut() {
  return (
    <details className="how-worked-out">
      <summary>How lengths and sizes are worked out</summary>
      <ul className="hint">
        <li>
          <b>Along</b>: each run follows the walls' centrelines on the plan (open edges' beams if it must), from the wall behind one box to the next; a ceiling
          or floor box is reached straight across its room. Corners are where centrelines meet, so a run is a few cm off per corner, not more.
        </li>
        <li>
          <b>Up and down</b>: lighting, feeders and high special sockets run in the ceiling, at the height of the wall nearest each box (a taller wall, a
          taller ceiling); sockets run in the floor. Each run climbs or drops from its box's height to that plane at both ends. A sloping ceiling under a
          pitched roof is taken flat at the wall's height.
        </li>
        <li>
          <b>Buried</b>: between buildings apart and to outdoor floor lights and sockets, {BURIED_DEPTH} m deep: down and up at each end, and a ceiling run
          down the wall into the ground. A circuit on another floor adds a riser at its board.
        </li>
        <li>
          <b>Section</b>: the least ({CIRCUIT_RULES.lighting.minSection} mm² lighting, {CIRCUIT_RULES.sockets.minSection} mm² sockets) that carries the
          breaker in conduit and keeps the voltage drop to the farthest box within {MAX_DROP} % at {VOLTAGE} V: ΔU = 2 · L · I · ρ / S along the tree,
          each run carrying what is beyond it, with ρ = {RHO} Ω·mm²/m (hot copper) and every point's load on at once (the Power field).
        </li>
        <li>
          <b>Not counted</b>: the slack left in boxes and offcuts (the Materials tab adds {Math.round(WASTE * 100)} %), the meter-to-board feeder, the
          conductor between a switch and its lights (a lighting circuit is not told which switch works which light), derating where several circuits share a
          conduit or run hot, and short-circuit checks. A registered electrician sets the real ones.
        </li>
      </ul>
    </details>
  )
}

/** The layers a board's circuits may be on: a main board's, or the layers of a sub-board's areas. */
function circuitLayers(board: Board): string[] {
  return board.parent ? [...new Set(board.areas.map((a) => a.layer))] : board.layers
}

/** + Circuit: what it may hold and (with more than one) on which layer; its name is asked. The new one is picked. */
function AddCircuit({ bw }: { bw: BoardWiring }) {
  const store = getStore()
  const [kind, setKind] = useState<CircuitKind>('lighting')
  const [layer, setLayer] = useState('')
  const allLayers = useEditor((s) => s.plan.layers)
  const layers = allLayers.filter((l) => circuitLayers(bw.board).includes(l.id))
  if (!layers.length) return null
  // its own layer by default, so it does not surprise; else the first it feeds
  const fallback = (layers.find((l) => l.id === bw.ref.layer) ?? layers[0]).id
  const forLayer = layers.some((l) => l.id === layer) ? layer : fallback
  const add = async () => {
    const suggested = `${CIRCUIT_RULES[kind].title} ${Object.values(bw.board.circuits).filter((c) => c.type === kind).length + 1}`
    const name = await store.askText('A new circuit', `${CIRCUIT_RULES[kind].title} on ${bw.board.name}: what does it feed?`, suggested)
    if (name === null) return
    const result = addCircuit(store.getState().plan, bw.ref.layer, bw.ref.id, kind, forLayer, name.trim() || suggested)
    if (!result) return
    store.edit(() => result.plan)
    pickCircuit(kind, { board: pointKey(bw.ref), id: result.id })
  }
  return (
    <div className="row add-circuit">
      <Segmented label="New circuit" value={kind} options={CIRCUIT_TYPES.map((t) => [t, SHORT_TITLES[t]] as const)} onChange={setKind} title="What it may hold: switches and light outlets, general sockets, or a special socket" />
      {layers.length > 1 && <SelectField label="On" value={forLayer} options={layers.map((l) => [l.id, l.name] as const)} onChange={setLayer} />}
      <button className="small" onClick={() => void add()}>
        + Add
      </button>
    </div>
  )
}

/** A board's circuits: made by hand first, in the order they were made, then grouped automatically, then its sub-boards'. */
function BoardCircuits({ bw, focus }: { bw: BoardWiring; focus: ReadonlySet<Circuit> }) {
  const store = getStore()
  const plan = useEditor((s) => s.plan)
  const circuitPick = useEditor((s) => s.circuitPick)
  const phases = bw.phaseLoads.map((l, i) => `${PHASE_NAMES[i]} ${kw(l)}`).join(' · ')
  const fedFrom = bw.board.parent ? findLayer(plan, bw.board.parent.layer)?.electrical[bw.board.parent.board] : undefined
  return (
    <div className="board-circuits">
      <h3>
        {bw.board.name} <span className="muted">· {storeyName(bw.storey).toLowerCase()}</span>
      </h3>
      <p className="hint">
        {SUPPLY_TITLES[bw.board.supply]} ({phasesOf(bw.board.supply)} phases and neutral, {VOLTAGE} V to neutral): main breaker {bw.poles} × {bw.mainBreaker} A, RCD 4 ×{' '}
        {bw.rcd} A 30 mA
        {bw.integrated ? '' : `, feeder ${bw.poles} × ${bw.feeder} mm², enclosure ${bw.enclosure} modules`}. Loads: {phases}; the heaviest phase draws{' '}
        {n1(bw.demand)} A at once.
        {fedFrom?.kind === 'board' && (bw.integrated ? ` In ${fedFrom.name}'s enclosure.` : ` Fed from ${fedFrom.name}.`)}
      </p>
      <AddCircuit bw={bw} />
      <ul className="circuit-list">
        {bw.circuits.map((c) => {
          const rules = CIRCUIT_RULES[c.type]
          const layer = findLayer(plan, c.layer)
          const active = !!c.manualId && c.type !== 'subfeeder' && circuitPick[c.type]?.board === pointKey(bw.ref) && circuitPick[c.type]?.id === c.manualId
          const to = c.type === 'subfeeder' ? findLayer(plan, c.points[0].layer)?.electrical[c.points[0].id] : undefined
          const select = () => {
            if (c.manualId && c.type !== 'subfeeder') pickCircuit(c.type, { board: pointKey(bw.ref), id: c.manualId })
            if (c.points.length) {
              store.setActiveLayer(c.points[0].layer)
              store.select(c.points.map((p) => ({ ...p, kind: 'electrical' as const })))
            }
          }
          return (
            <li key={c.name} className={[focus.has(c) && 'selected', active && 'active'].filter(Boolean).join(' ')}>
              <div className="row">
                <b title="Select its points" onClick={select}>
                  {c.name}
                </b>
                {c.manualId && <CircuitName bw={bw} circuit={c} />}
                {c.type !== 'subfeeder' && <MoveCircuit bw={bw} circuit={c} />}
                {c.manualId && (
                  <button
                    className="ghost small"
                    title="Remove this circuit; its points go back to being grouped automatically"
                    onClick={() => store.edit((p) => removeCircuit(p, bw.ref.layer, bw.ref.id, c.manualId!))}
                  >
                    ×
                  </button>
                )}
                {!c.manualId && c.type !== 'subfeeder' && (
                  <button className="ghost small" title="Make it a circuit of its own, with these points, named" onClick={() => void keepCircuit(c)}>
                    Keep
                  </button>
                )}
              </div>
              <div>
                <span title={c.manualId ? 'New points of its kind go on it; select its points' : 'Select its points'} onClick={select}>
                  {rules.title} ({rules.code}) · phase {PHASE_NAMES[c.phase]}
                  {c.type === 'subfeeder' ? ` · to ${to?.kind === 'board' ? to.name : 'its sub-board'}${c.integrated ? ', in this enclosure' : ''}` : ` · ${c.points.length} point${c.points.length === 1 ? '' : 's'}`}
                  {layer && c.type !== 'subfeeder' && <span className="muted"> · {layer.name}</span>}
                  {!c.manualId && c.type !== 'subfeeder' && <span className="muted"> · grouped automatically</span>}
                  {active && <span className="tag-active"> · new points go here</span>}
                </span>
              </div>
              <div className="muted" title="Select its points" onClick={select}>
                {n0(c.load)} VA, {n1(c.current)} A → breaker 2 × {c.breaker} A
                {c.integrated ? '' : ` · ${cableText(c)} in ${c.conduit} ${CONDUIT_WAYS[c.plane]}`}
                {c.buriedPipe && ` · buried: 3 × ${c.section} mm² subterranean cable (IRAM 2178) in ${c.buriedPipe} rigid PVC pipe`}
                {!c.integrated && ` · drop ${c.drop.toFixed(2)} %`}
              </div>
              {!c.integrated && c.length > 0 && (
                <div className="muted" title="Select its points" onClick={select}>
                  {lengthText(c.length, c.parts)}
                </div>
              )}
              {c.warnings.map((w) => (
                <div key={w} className="warning">
                  {w}
                </div>
              ))}
            </li>
          )
        })}
      </ul>
    </div>
  )
}

/** Moves a circuit, with its points, to another board (one grouped automatically is kept there, named). */
function MoveCircuit({ bw, circuit }: { bw: BoardWiring; circuit: Circuit }) {
  const plan = useEditor((s) => s.plan)
  const others = boardsOf(plan).filter((b) => b.layer.visible && boardKey({ layer: b.layer.id, id: b.id }) !== pointKey(bw.ref))
  if (!others.length) return null
  // a board may take it when it may feed all its points (their layer, or areas of it, or through its sub-boards)
  const fits = (b: BoardEntry) => feedsAll(plan, b, circuit.points)
  return (
    <select
      className="circuit-move"
      aria-label="Move to board"
      title={circuit.manualId ? 'Move this circuit, with its points, to another board: they are fed from there' : 'Keep this circuit, with its points, on another board'}
      value=""
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => {
        const to = others.find((b) => boardKey({ layer: b.layer.id, id: b.id }) === e.target.value)
        if (to) void moveCircuitTo(circuit, { layer: to.layer.id, id: to.id })
      }}
    >
      <option value="">Move to…</option>
      {others.map((b) => (
        <option key={boardKey({ layer: b.layer.id, id: b.id })} value={boardKey({ layer: b.layer.id, id: b.id })} disabled={!fits(b)}>
          {b.board.name}
          {fits(b) ? '' : ' (does not feed its points)'}
        </option>
      ))}
    </select>
  )
}

/** A manual circuit's name, edited in place. */
function CircuitName({ bw, circuit }: { bw: BoardWiring; circuit: Circuit }) {
  const store = getStore()
  // starts over whenever the committed value changes (undo, another edit), like the fields in fields.tsx
  const committed = circuit.label ?? ''
  const [text, setText] = useState(committed)
  const [base, setBase] = useState(committed)
  if (base !== committed) {
    setBase(committed)
    setText(committed)
  }
  const commit = () => {
    if (text !== committed) store.edit((p) => updateCircuit(p, bw.ref.layer, bw.ref.id, circuit.manualId!, { name: text }))
  }
  return (
    <input
      className="circuit-name"
      value={text}
      placeholder={`${circuit.name} (name it)`}
      title={circuit.name}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
    />
  )
}

/**
 * The circuit one or more points (of one layer and kind) are on, chosen by hand among the circuits of that layer and
 * kind of every board that may feed them all (a circuit on another board than the one feeding their spot by default,
 * such as a main board for points in a sub-board's area, takes them there); a new one, on `board`
 * (the board feeding their spot), may be made here.
 */
function AssignCircuit({ board, layer, kind, points, value }: { board?: BoardEntry; layer: string; kind: CircuitKind; points: Ref[]; value?: string }) {
  const store = getStore()
  const plan = useEditor((s) => s.plan)
  const wiring = getWiring(plan)
  const circuits = boardsOf(plan)
    .filter((b) => b.layer.visible && feedsAll(plan, b, points))
    .flatMap((b) =>
      Object.entries(b.board.circuits)
        .filter(([, def]) => def.layer === layer && def.type === kind)
        .map(([id, def]) => {
          const key = boardKey({ layer: b.layer.id, id: b.id })
          const c = wiring.boards.find((w) => pointKey(w.ref) === key)?.circuits.find((c) => c.manualId === id)
          return { value: `${key}|${id}`, id, board: b, label: `${c ? named(c) : def.name || 'Circuit'}${board && key === boardKey({ layer: board.layer.id, id: board.id }) ? '' : ` (${b.board.name})`}` }
        }),
    )
  const options = [['', 'Grouped automatically'] as const, ...circuits.map((c) => [c.value, c.label] as const), ...(board ? [['+new', '+ New circuit…'] as const] : [])]
  const assign = async (v: string) => {
    if (v !== '+new') {
      const id = circuits.find((c) => c.value === v)?.id ?? null
      return store.edit((p) => points.reduce((q, ref) => setPointCircuit(q, ref.layer, ref.id, id), p))
    }
    if (!board) return
    const suggested = `${CIRCUIT_RULES[kind].title} ${Object.values(board.board.circuits).filter((c) => c.type === kind).length + 1}`
    const name = await store.askText('A new circuit', `${CIRCUIT_RULES[kind].title} on ${board.board.name}: what does it feed?`, suggested)
    if (name === null) return
    const result = addCircuit(store.getState().plan, board.layer.id, board.id, kind, layer, name.trim() || suggested)
    if (!result) return
    store.edit(() => points.reduce((q, ref) => setPointCircuit(q, ref.layer, ref.id, result.id), result.plan))
    pickCircuit(kind, { board: boardKey({ layer: board.layer.id, id: board.id }), id: result.id })
  }
  return <SelectField label="Circuit" value={value && circuits.some((c) => c.value === value) ? value : ''} options={options} onChange={(v) => void assign(v)} />
}

/** A board's supply and what it feeds: the meter and layers, or its parent and areas (in the parent's enclosure or on a wall). */
function BoardFeeds({ boardRef, board }: { boardRef: { layer: string; id: string }; board: Board }) {
  const store = getStore()
  const plan = useEditor((s) => s.plan)
  const excluded = boardAndDescendants(plan, boardRef)
  const candidates = boardsOf(plan).filter((b) => !excluded.has(boardKey({ layer: b.layer.id, id: b.id })))
  const options = [
    ['', 'The meter (a main board: it feeds layers)'] as const,
    ...candidates.map((b) => [boardKey({ layer: b.layer.id, id: b.id }), `${b.board.name} (${b.layer.name})`] as const),
  ]
  const value = board.parent ? boardKey({ layer: board.parent.layer, id: board.parent.board }) : ''
  const children = boardChildren(plan, boardRef)
  return (
    <>
      <SelectField
        label="Fed from"
        value={value}
        options={options}
        onChange={(v) => {
          const picked = candidates.find((b) => boardKey({ layer: b.layer.id, id: b.id }) === v)
          store.edit((p) => setBoardParent(p, boardRef.layer, boardRef.id, picked ? { layer: picked.layer.id, board: picked.id } : null))
        }}
      />
      {board.parent && (
        <CheckField
          label="In its parent's enclosure"
          checked={!!board.integrated}
          title="A group of circuits with its own main breaker and RCD inside its parent board; off, a board on a wall of its own, fed by a cable from its parent"
          onChange={(on) => store.edit((p) => setBoardIntegrated(p, boardRef.layer, boardRef.id, on))}
        />
      )}
      {board.parent ? (
        <>
          {board.layers.length > 0 && (
            <div className="row">
              <span className="hint warning">It still feeds whole layers, as sub-boards did before they fed areas.</span>
              <button className="small" onClick={() => store.edit((p) => setBoardLayers(p, boardRef.layer, boardRef.id, []))}>
                Feed areas only
              </button>
            </div>
          )}
          <h3>Areas it feeds</h3>
          <div className="check-list">
            {[...plan.layers].reverse().map((l) => {
              const areas = getPlacedAreas(l).filter((a) => a.region && !a.area.lot)
              if (!areas.length) return null
              return (
                <div key={l.id}>
                  <div className="muted">{l.name}</div>
                  {areas.map((a) => {
                    const by = boardOfArea(plan, l.id, a.id)
                    const other = by && !(by.layer.id === boardRef.layer && by.id === boardRef.id) ? by.board.name : null
                    const on = board.areas.some((x) => x.layer === l.id && x.area === a.id)
                    return (
                      <CheckField
                        key={a.id}
                        label={`${a.area.name}${other ? `, fed by ${other}` : ''}`}
                        checked={on}
                        title={other ? `Ticking it moves it from ${other} to this board` : undefined}
                        onChange={(tick) => {
                          store.edit((p) =>
                            setBoardAreas(p, boardRef.layer, boardRef.id, tick ? [...board.areas, { layer: l.id, area: a.id }] : board.areas.filter((x) => !(x.layer === l.id && x.area === a.id))),
                          )
                          if (tick) void offerCircuitsTo(boardRef)
                        }}
                      />
                    )
                  })}
                </div>
              )
            })}
          </div>
        </>
      ) : (
        <>
          <h3>Layers it feeds</h3>
          <div className="check-list">
            {[...plan.layers].reverse().map((l) => {
              const by = boardFeeding(plan, l.id)
              const other = by && !(by.layer.id === boardRef.layer && by.id === boardRef.id) ? by.board.name : null
              return (
                <CheckField
                  key={l.id}
                  label={`${l.name} (${storeyName(storeyOf(l)).toLowerCase()})${other ? `, fed by ${other}` : ''}`}
                  checked={board.layers.includes(l.id)}
                  title={other ? `Ticking it moves it from ${other} to this board` : undefined}
                  onChange={(on) => {
                    store.edit((p) => setBoardLayers(p, boardRef.layer, boardRef.id, on ? [...board.layers, l.id] : board.layers.filter((x) => x !== l.id)))
                    if (on) void offerCircuitsTo(boardRef)
                  }}
                />
              )
            })}
          </div>
        </>
      )}
      <div className="row">
        {children.length > 0 && <span className="hint">Its sub-boards: {children.map((c) => c.board.name).join(', ')}.</span>}
        <button className="small" onClick={() => void addIntegratedSubBoard(boardRef)} title="A sub-board inside this board's enclosure, feeding some areas">
          + Sub-board in it
        </button>
      </div>
    </>
  )
}

/** The selected boards and points: a board's name, supply and what it feeds; a point's height, power and circuit, and its cable's way. */
function ElectricSelection({ refs }: { refs: Ref[] }) {
  const store = getStore()
  const plan = useEditor((s) => s.plan)
  const wiring = getWiring(plan)
  const items = refs.flatMap((r) => {
    const e = findLayer(plan, r.layer)?.electrical[r.id]
    return e ? [{ ref: r, e }] : []
  })
  if (!items.length) {
    return (
      <Box id="electric-selection" title="Selection">
        <p className="muted">Nothing selected. With Select (V), click a board, a point or a cable run; a board in another's enclosure is in the Boards list.</p>
      </Box>
    )
  }
  if (items.length > 1) {
    const drawn = items.filter((i) => i.e.route)
    const points = items.flatMap((i) => (i.e.kind === 'board' ? [] : [{ ref: i.ref, e: i.e }]))
    // all on one layer, of one circuit kind (a lighting circuit cannot hold a socket): assign them together; a new
    // circuit for them goes on the board feeding their spots, when that is one board
    const layers = new Set(points.map((i) => i.ref.layer))
    const kinds = new Set(points.map((i) => circuitKindOf(i.e)))
    const same = points.length === items.length && layers.size === 1 && kinds.size === 1
    const spots = new Set(points.map((i) => areaBoardKey(plan, i.ref.layer, i.e)))
    const spotBoard = spots.size === 1 ? boardsOf(plan).find((b) => boardKey({ layer: b.layer.id, id: b.id }) === [...spots][0]) : undefined
    const circuits = new Set(points.map((i) => circuitValue(wiring, i.ref)))
    return (
      <Box id="electric-selection" title="Selection">
        <p>{items.length} boards and points selected.</p>
        {same && <AssignCircuit board={spotBoard} layer={points[0].ref.layer} kind={[...kinds][0]} points={points.map((i) => i.ref)} value={circuits.size === 1 ? [...circuits][0] : undefined} />}
        <div className="row">
          {drawn.length > 0 && (
            <button className="small" onClick={() => store.edit((p) => drawn.reduce((q, i) => setRoute(q, i.ref.layer, i.ref.id, null), p))}>
              Route along the walls
            </button>
          )}
          <button className="small" onClick={deleteSelection}>
            Delete
          </button>
        </div>
      </Box>
    )
  }
  const { ref, e } = items[0]
  const layer = findLayer(plan, ref.layer)!
  const set = (next: Electrical) => store.edit((p) => updateElectrical(p, ref.layer, ref.id, next))
  const circuit = wiring.circuitOf.get(pointKey(ref))
  const run = circuit?.runs.find((r) => pointKey(r.to) === pointKey(ref))
  const feeding = e.kind !== 'board' ? feederOf(plan, wiring, ref) : undefined
  const circuitBoard = circuit && wiring.boards.find((b) => pointKey(b.ref) === pointKey(circuit.board))

  return (
    <Box id="electric-selection" title={e.kind === 'board' ? (e.parent ? 'Sub-board' : 'Main board') : electricTitle(e)}>
      <p className="muted">
        On {layer.name}, {storeyName(storeyOf(layer)).toLowerCase()}
        {e.kind !== 'board' && (feeding ? `, fed by ${feeding.board.name}` : ': no board feeds it')}.
      </p>
      {e.kind === 'board' ? (
        <>
          <div className="fields">
            <TextField label="Name" value={e.name} onCommit={(name) => set({ ...e, name })} />
            {!e.integrated && <NumberField label="Height" min={0} value={heightOf(e)} onCommit={(height) => set({ ...e, height })} />}
          </div>
          <Segmented
            label="Supply"
            value={e.supply}
            options={BOARD_SUPPLIES.map((s) => [s, SUPPLY_TITLES[s]] as const)}
            onChange={(supply) => set({ ...e, supply })}
            title="Its phases, each with the neutral; the circuits are shared out over them by load"
          />
          <BoardFeeds boardRef={ref} board={e} />
        </>
      ) : (
        <>
          <div className="fields">
            {e.mount === 'wall' && <NumberField label="Height" min={0} value={heightOf(e)} onCommit={(height) => set({ ...e, height })} />}
            {e.kind === 'light' && e.mount === 'floor' && (
              <NumberField label="Post" min={0} value={e.post ?? 0} onCommit={(post) => set({ ...e, post: post > 0 ? Math.min(6, post) : undefined })} />
            )}
            {e.kind !== 'switch' && (
              <NumberField
                label="Power"
                unit="W"
                digits={0}
                min={1}
                value={e.power ?? (e.kind === 'light' ? LOADS.light : e.use === 'special' ? LOADS.special : LOADS.socket)}
                onCommit={(power) => set({ ...e, power })}
              />
            )}
          </div>
          {e.kind === 'socket' && (
            <Segmented
              label="Use"
              value={e.use}
              options={SOCKET_USES.map((u) => [u, USE_TITLES[u]] as const)}
              onChange={(use) => set({ ...e, use })}
              title="General sockets share circuits of up to 15; a special one (an oven, an AC, a pump) usually has a circuit of its own"
            />
          )}
          <AssignCircuit board={spotBoard(plan, ref.layer, e)} layer={ref.layer} kind={circuitKindOf(e)} points={[ref]} value={circuitValue(wiring, ref)} />
          {circuit && (
            <p className="hint">
              <b>
                {named(circuit)} of {circuitBoard?.board.name}
              </b>
              : {CIRCUIT_RULES[circuit.type].title.toLowerCase()}, phase {PHASE_NAMES[circuit.phase]}, breaker 2 × {circuit.breaker} A, {cableText(circuit)} IRAM NM 247-3 in{' '}
              {circuit.conduit} {CONDUIT_WAYS[circuit.plane]}
              {circuit.buriedPipe && `; buried, 3 × ${circuit.section} mm² subterranean cable (IRAM 2178) in ${circuit.buriedPipe} rigid PVC pipe`}.
            </p>
          )}
          {run && (
            <div className="row">
              <span className="hint">
                Its cable, {run.manual ? 'drawn by hand' : 'along the walls'}: {lengthText(run.length, { walls: run.length - run.buriedLength - run.vertical, vertical: run.vertical, buried: run.buriedLength })}
              </span>
              {run.manual && (
                <button className="small" onClick={() => store.edit((p) => setRoute(p, ref.layer, ref.id, null))}>
                  Route along the walls
                </button>
              )}
            </div>
          )}
          {e.height !== undefined && e.mount === 'wall' && (
            <div className="row">
              <button className="small" onClick={() => set({ ...e, height: undefined })}>
                Usual height
              </button>
            </div>
          )}
        </>
      )}
      <div className="row">
        <button className="small" onClick={deleteSelection}>
          Delete
        </button>
      </div>
    </Box>
  )
}
