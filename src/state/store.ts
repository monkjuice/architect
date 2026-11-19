import { useSyncExternalStore } from 'react'
import {
  findLayer,
  refExists,
  storeyOf,
  type BoardSupply,
  type CircuitKind,
  type ColumnStyle,
  type DoorStyle,
  type FireplaceStyle,
  type FurnitureKind,
  type GateStyle,
  type Plan,
  type Ref,
  type RoofType,
  type SegmentKind,
  type SocketUse,
  type ServiceKind,
  type WindowStyle,
} from '../model/plan'

/** The tabs along the top, in order. */
export type Tab = 'foundation' | 'floor' | 'roof' | 'elevations' | 'exterior' | 'interior' | 'plumbing' | 'hvac' | 'electricity' | 'gas' | 'mep' | 'materials'

export type ToolId =
  | 'select'
  | 'line'
  | 'area'
  | 'door'
  | 'window'
  | 'gate'
  | 'fireplace'
  | 'colonnade'
  | 'furniture'
  | 'material'
  | 'measure'
  | 'pan'
  | 'image-move'
  | 'level'
  | 'crop'
  | 'calibrate'
  | 'north'
  | 'roof'
  | 'roof-select'
  | 'foundation-select'
  | 'electric-select'
  | 'board'
  | 'switch'
  | 'light'
  | 'socket'
  | 'plumbing-select'
  | 'hvac-select'
  | 'gas-select'
  | 'mep-select'
  | 'service'
  | 'radiant'

export interface Notice {
  kind: 'info' | 'error'
  text: string
  details?: string[]
  action?: { label: string; run: () => void }
}

export interface FileInfo {
  name: string
  handle?: FileSystemFileHandle
  /** The plan as last loaded or saved; the editor is dirty while the current plan differs. */
  saved: Plan
}

/** The visible part of the world: top-left corner in meters and the scale in screen pixels per meter. */
export interface Viewport {
  x0: number
  y0: number
  zoom: number
}

/** A question for the prompt dialog: a length in meters or a name; `resolve` gets null when cancelled. */
export type Prompt =
  | { kind: 'length'; title: string; text: string; resolve: (length: number | null) => void }
  | { kind: 'text'; title: string; text: string; initial: string; resolve: (text: string | null) => void }
  | { kind: 'choice'; title: string; text: string; options: ChoiceOption[]; resolve: (ids: string[] | null) => void }
  | ({ kind: 'board'; title: string; resolve: (board: BoardAnswer | null) => void } & BoardQuestion)

/** What a new board's dialog offers: its name, the boards it may be fed from, and the layers or areas to tick. */
export interface BoardQuestion {
  name: string
  /** Boards it may be fed from (key and name); none: only a main board. */
  parents: { key: string; label: string }[]
  /** The parent to start with, as a sub-board; absent: a main board. */
  parent?: string
  layers: ChoiceOption[]
  /** Named areas by layer. */
  areas: { layer: string; label: string; options: ChoiceOption[] }[]
  /** Only a sub-board (it is made inside its parent's enclosure). */
  subOnly?: boolean
}

/** The answer: a main board's layers, or a sub-board's parent (a board key) and areas ("layer:area" ids). */
export interface BoardAnswer {
  name: string
  parent: string | null
  layers: string[]
  areas: string[]
}

/** The circuit a circuit kind's new points go on: a circuit defined by hand, by its board's key and its id. */
export type CircuitPick = Partial<Record<CircuitKind, { board: string; id: string }>>

/** One box of a choice prompt: what it is, a note under it, and whether it starts ticked. */
export interface ChoiceOption {
  id: string
  label: string
  note?: string
  checked: boolean
}

/** How the Electricity tab's tools put things down: lights on the ceiling or a wall, sockets on a wall or the floor… */
export interface ElectricPick {
  light: 'ceiling' | 'wall' | 'floor'
  socket: 'wall' | 'floor'
  use: SocketUse
  supply: BoardSupply
}

export interface EditorState {
  /** The tab shown; every tab works on the same plan, with one undo history. */
  tab: Tab
  plan: Plan
  past: Plan[]
  future: Plan[]
  selection: Ref[]
  /** The layer new lines go to. Editor state, not saved in the plan, so switching is not an undo step. */
  activeLayer: string
  tool: ToolId
  /** What the line tool draws. */
  lineKind: SegmentKind
  /** The style the door, window, gate and fireplace tools place (picked in the library; D and W keep the last one). */
  openingStyle: { door: DoorStyle; window: WindowStyle; gate: GateStyle; fireplace: FireplaceStyle }
  /** The columns the colonnade tool puts on an open edge. */
  columnStyle: ColumnStyle
  /** The piece the furniture tool puts down (picked in the library). */
  furniturePick: { kind: FurnitureKind; style?: string }
  /** The equipment the Plumbing tab's library puts down (its Service tool). */
  servicePick: ServiceKind
  /** The material the material tool puts on a wall's side or a floor (picked in the library's Walls or Floors). */
  materialPick: { id: string; surface: 'wall' | 'floor' }
  /** The type new roofs get (the Roof tab's toolbar). */
  roofType: RoofType
  /** Where the Electricity tab's tools put lights and sockets, and what new sockets and boards are. */
  electricPick: ElectricPick
  /** The circuit of each kind new points go on (picked in the bar, the Circuits list, or by selecting a point on it). */
  circuitPick: CircuitPick
  /**
   * A pipe (or duct) picked on the Plumbing or HVAC tab (they are worked out, so they are not refs): the tab, its kind
   * and place in that tab's runs, and the fixture, piece or room it ends at when it is the branch to one, to find it
   * again after an edit.
   */
  pipePick?: { tab: 'plumbing' | 'hvac' | 'gas'; kind: string; index: number; stretch?: number; to?: Ref }
  /** Zoom and pan; absent: the canvas fits the plan once and stores that fit (start, Fit, new plan or image). */
  view?: Viewport
  file: FileInfo
  notice?: Notice
  prompt?: Prompt
}

const HISTORY_LIMIT = 200

export class EditorStore {
  private state: EditorState
  private readonly listeners = new Set<() => void>()
  /** The plan at the start of a drag: previews derive from it, and the drag is one undo step. */
  private gestureBase?: Plan

  constructor(plan: Plan, file: FileInfo, extra: Partial<Pick<EditorState, 'activeLayer' | 'view' | 'notice'>> = {}) {
    this.state = {
      tab: 'floor',
      plan,
      past: [],
      future: [],
      selection: [],
      activeLayer: validLayer(plan, extra.activeLayer),
      tool: 'select',
      lineKind: 'wall',
      openingStyle: { door: 'single', window: 'sliding', gate: 'single', fireplace: 'masonry' },
      columnStyle: 'roman',
      furniturePick: { kind: 'counter' },
      servicePick: 'tank',
      materialPick: { id: 'plaster-white', surface: 'wall' },
      roofType: 'gable',
      electricPick: { light: 'ceiling', socket: 'wall', use: 'general', supply: 'triphasic' },
      circuitPick: {},
      view: extra.view,
      file,
      notice: extra.notice,
    }
  }

  getState = (): EditorState => this.state

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  update(patch: Partial<EditorState>) {
    this.state = { ...this.state, ...patch }
    for (const listener of this.listeners) listener()
  }

  /** Applies an edit as one undo step. */
  edit(change: (plan: Plan) => Plan) {
    const before = this.state.plan
    const after = change(before)
    if (after === before) return
    this.update({ plan: after, past: [...this.state.past, before].slice(-HISTORY_LIMIT), future: [], ...this.settle(after) })
  }

  /** Shows the result of a gesture in progress; `change` always receives the plan from before it. */
  preview(change: (base: Plan) => Plan) {
    this.gestureBase ??= this.state.plan
    this.update({ plan: change(this.gestureBase) })
  }

  endGesture() {
    const base = this.gestureBase
    this.gestureBase = undefined
    if (!base || base === this.state.plan) return
    this.update({ past: [...this.state.past, base].slice(-HISTORY_LIMIT), future: [], ...this.settle(this.state.plan) })
  }

  cancelGesture() {
    if (this.gestureBase) this.update({ plan: this.gestureBase })
    this.gestureBase = undefined
  }

  undo() {
    const { past, future, plan } = this.state
    const previous = past.at(-1)
    if (!previous) return
    this.update({ plan: previous, past: past.slice(0, -1), future: [plan, ...future], ...this.settle(previous) })
  }

  redo() {
    const { past, future, plan } = this.state
    const next = future[0]
    if (!next) return
    this.update({ plan: next, past: [...past, plan], future: future.slice(1), ...this.settle(next) })
  }

  /** Replaces the whole plan (open, new): starts a fresh history. */
  load(plan: Plan, file: Omit<FileInfo, 'saved'>, notice?: Notice) {
    this.gestureBase = undefined
    this.update({
      plan,
      past: [],
      future: [],
      selection: [],
      activeLayer: validLayer(plan, undefined),
      view: undefined,
      file: { ...file, saved: plan },
      notice,
    })
  }

  select(selection: Ref[]) {
    this.update(selection.length && this.state.pipePick ? { selection, pipePick: undefined } : { selection })
  }

  /** Makes `id` the active layer; moving to another floor keeps only what is selected on that floor. */
  setActiveLayer(id: string) {
    if (id === this.state.activeLayer) return
    const { plan, selection } = this.state
    const storey = storeyOf(findLayer(plan, id))
    const kept = selection.filter((r) => storeyOf(findLayer(plan, r.layer)) === storey)
    this.update(kept.length === selection.length ? { activeLayer: id } : { activeLayer: id, selection: kept })
  }

  setTool(tool: ToolId) {
    if (tool !== this.state.tool) this.update({ tool })
  }

  notify(notice: Notice | undefined) {
    this.update({ notice })
  }

  /** Asks for a length in the dialog; null when cancelled. */
  askLength(title: string, text: string): Promise<number | null> {
    return new Promise((resolve) => {
      const done = (length: number | null) => {
        this.update({ prompt: undefined })
        resolve(length)
      }
      this.update({ prompt: { kind: 'length', title, text, resolve: done } })
    })
  }

  /** Asks for a name in the dialog, starting from `initial`; null when cancelled. */
  askText(title: string, text: string, initial: string): Promise<string | null> {
    return new Promise((resolve) => {
      const done = (value: string | null) => {
        this.update({ prompt: undefined })
        resolve(value)
      }
      this.update({ prompt: { kind: 'text', title, text, initial, resolve: done } })
    })
  }

  /** Asks which of `options` to take (ticks); null when cancelled. */
  askChoice(title: string, text: string, options: ChoiceOption[]): Promise<string[] | null> {
    return new Promise((resolve) => {
      const done = (ids: string[] | null) => {
        this.update({ prompt: undefined })
        resolve(ids)
      }
      this.update({ prompt: { kind: 'choice', title, text, options, resolve: done } })
    })
  }

  /** Asks for a new board's name and what it feeds; null when cancelled. */
  askBoard(title: string, question: BoardQuestion): Promise<BoardAnswer | null> {
    return new Promise((resolve) => {
      const done = (answer: BoardAnswer | null) => {
        this.update({ prompt: undefined })
        resolve(answer)
      }
      this.update({ prompt: { kind: 'board', title, ...question, resolve: done } })
    })
  }

  /** Keeps the selection and the active layer valid for a plan that replaces the current one. */
  private settle(plan: Plan): Pick<EditorState, 'selection' | 'activeLayer'> {
    return { selection: pruneSelection(this.state.selection, plan), activeLayer: validLayer(plan, this.state.activeLayer) }
  }
}

/** `id` when the plan has that layer, otherwise its top layer. */
function validLayer(plan: Plan, id: string | undefined): string {
  return id && findLayer(plan, id) ? id : plan.layers[plan.layers.length - 1].id
}

function pruneSelection(selection: Ref[], plan: Plan): Ref[] {
  if (!selection.length) return selection
  const kept = selection.filter((r) => refExists(plan, r))
  return kept.length === selection.length ? selection : kept
}

let current: EditorStore | undefined

export function initStore(store: EditorStore) {
  current = store
}

export function getStore(): EditorStore {
  if (!current) throw new Error('The editor store is not initialised.')
  return current
}

/** Subscribes a component to part of the editor state; the selector must return existing references. */
export function useEditor<T>(selector: (state: EditorState) => T): T {
  const store = getStore()
  return useSyncExternalStore(store.subscribe, () => selector(store.getState()))
}
