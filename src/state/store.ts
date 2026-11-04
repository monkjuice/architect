import { useSyncExternalStore } from 'react'
import { findLayer, refExists, type DoorStyle, type GateStyle, type Plan, type Ref, type RoofType, type SegmentKind, type WindowStyle } from '../model/plan'

/** The tabs along the top, in order. */
export type Tab = 'foundation' | 'floor' | 'roof' | 'elevations' | 'exterior' | 'interior' | 'plumbing' | 'electricity' | 'gas' | 'materials'

export type ToolId =
  | 'select'
  | 'line'
  | 'area'
  | 'door'
  | 'window'
  | 'gate'
  | 'measure'
  | 'pan'
  | 'image-move'
  | 'level'
  | 'crop'
  | 'calibrate'
  | 'north'
  | 'roof'
  | 'roof-select'

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
  /** The style the door, window and gate tools place (picked in the library; D and W keep the last one). */
  openingStyle: { door: DoorStyle; window: WindowStyle; gate: GateStyle }
  /** The type new roofs get (the Roof tab's toolbar). */
  roofType: RoofType
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
      openingStyle: { door: 'single', window: 'sliding', gate: 'single' },
      roofType: 'gable',
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
    this.update({ selection })
  }

  setActiveLayer(id: string) {
    if (id !== this.state.activeLayer) this.update({ activeLayer: id })
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
