import { createBaseImage, imageToWorld, visibleCorners } from '../model/baseImage'
import { addOpening, deleteItems } from '../model/edit'
import { boundsOf, type Box, type Vec } from '../model/geometry'
import { openingFor, openingTarget, type OpeningTarget } from '../model/openings'
import { createPlan, findLayer, isEditable, type BaseImage, type Opening, type OpeningKind, type OpeningStyle, type Plan } from '../model/plan'
import { parsePlanText, serializePlan } from '../model/planFile'
import { pickFile, pickPlanFile, readImageFile, savePlanFile } from './files'
import { drawnHalfWidth } from './derived'
import { getPrefs, openingWidth } from './prefs'
import { getStore, type ToolId } from './store'

export const DEFAULT_FILE_NAME = 'house-plan.json'

/** Tools that work on the base image; they need one, unlocked. */
export const IMAGE_TOOLS: readonly ToolId[] = ['image-move', 'level', 'crop', 'calibrate']

export function chooseTool(tool: ToolId) {
  const store = getStore()
  const image = store.getState().plan.image
  if (IMAGE_TOOLS.includes(tool)) {
    if (!image) return store.notify({ kind: 'error', text: 'Load a base plan image first.' })
    if (image.locked) return store.notify({ kind: 'error', text: 'The base plan is locked: unlock it in the Base plan panel first.' })
  }
  store.setTool(tool)
}

export function isDirty(): boolean {
  const { plan, file } = getStore().getState()
  return plan !== file.saved
}

export function newPlan() {
  if (isDirty() && !window.confirm('Discard the current plan and start a new one? Unsaved changes are lost.')) return
  getStore().load(createPlan(), { name: DEFAULT_FILE_NAME })
}

export async function openPlan() {
  try {
    const file = await pickPlanFile()
    if (file) openPlanText(file.text, file.name, file.handle)
  } catch (error) {
    getStore().notify({ kind: 'error', text: `Could not open the file: ${(error as Error).message}` })
  }
}

function openPlanText(text: string, name: string, handle?: FileSystemFileHandle) {
  const store = getStore()
  const result = parsePlanText(text)
  if (!result.ok) {
    store.notify({ kind: 'error', text: `Could not open ${name}.`, details: result.errors.slice(0, 12) })
    return
  }
  if (isDirty() && !window.confirm(`Open ${name}? Unsaved changes to the current plan are lost.`)) return
  store.load(result.plan, { name, handle }, { kind: 'info', text: `Opened ${name}.` })
}

export async function savePlan(saveAs = false) {
  const store = getStore()
  const { plan, file } = store.getState()
  let text: string
  try {
    text = serializePlan(plan)
  } catch (error) {
    store.notify({ kind: 'error', text: `The plan is not valid and was not saved: ${(error as Error).message}` })
    return
  }
  try {
    const saved = await savePlanFile(text, file.name, saveAs ? undefined : file.handle)
    if (!saved) return
    store.update({
      file: { name: saved.name, handle: saved.handle ?? file.handle, saved: plan },
      notice: { kind: 'info', text: saved.handle ? `Saved ${saved.name}.` : `Downloaded ${saved.name}.` },
    })
  } catch (error) {
    store.notify({ kind: 'error', text: `Could not save: ${(error as Error).message}` })
  }
}

/** Loads (or replaces) the base image from `file`, or from a file picker. */
export async function loadBaseImage(file?: Blob) {
  const store = getStore()
  if (store.getState().plan.image && !window.confirm('Replace the base plan image? Its crop and calibration start over; your lines stay.')) return
  const picked = file ?? (await pickFile('image/*'))
  if (!picked) return
  try {
    const img = await readImageFile(picked)
    store.edit((plan) => ({ ...plan, image: createBaseImage(img.src, img.width, img.height) }))
    store.update({ view: undefined, tool: 'select' })
    const scaled = img.original ? `Scaled down from ${img.original.width} × ${img.original.height} px. ` : ''
    store.notify({ kind: 'info', text: `${scaled}Next: straighten the image, then calibrate it with a length written on the plan.` })
  } catch (error) {
    store.notify({ kind: 'error', text: `Could not load the image: ${(error as Error).message}` })
  }
}

/**
 * Applies an edit to the base image and keeps the image where it was on screen. Calibrating changes the
 * image's size in the world, not what the user is looking at, so the view zooms by the inverse factor.
 */
export function editImageInPlace(change: (image: BaseImage) => BaseImage) {
  const store = getStore()
  const before = store.getState().plan.image
  store.edit((plan) => (plan.image ? { ...plan, image: change(plan.image) } : plan))
  const { plan, view } = store.getState()
  const after = plan.image
  if (!before || !after || !view || before.scale === after.scale) return
  const zoom = (view.zoom * before.scale) / after.scale
  const was = imageToWorld(before, before.width / 2, before.height / 2)
  const now = imageToWorld(after, after.width / 2, after.height / 2)
  store.update({ view: { zoom, x0: now.x - ((was.x - view.x0) * view.zoom) / zoom, y0: now.y - ((was.y - view.y0) * view.zoom) / zoom } })
}

/** Drag data of a door or window dragged from the library. */
export const OPENING_DRAG_TYPE = 'application/x-architect-opening'

/** Puts a door or window where `target` says and selects it; reports why when it cannot go there. */
export function placeOpeningAt(opening: Opening, target: OpeningTarget): string | null {
  const store = getStore()
  if (target.problem) {
    store.notify({ kind: 'error', text: target.problem })
    return null
  }
  const result = addOpening(store.getState().plan, target.layer, opening)
  if (!result) return null
  store.edit(() => result.plan)
  store.setActiveLayer(target.layer)
  store.select([{ layer: target.layer, kind: 'opening', id: result.id }])
  return result.id
}

/**
 * A door or window dropped from the library at world point `p` goes into the wall there, at the remembered
 * width. `reach` and `snapReach` are in m (screen distances at the current zoom).
 */
export function dropOpening(kind: OpeningKind, style: OpeningStyle, p: Vec, reach: number, snapReach: number) {
  const store = getStore()
  const { plan, activeLayer } = store.getState()
  const prefs = getPrefs()
  const width = openingWidth(prefs, kind, style)
  const target = openingTarget(plan, p, { reach, snapReach, width, activeLayer, snap: prefs.snap, halfWidth: drawnHalfWidth })
  if (!target) return store.notify({ kind: 'error', text: `Drop the ${kind} on a wall.` })
  placeOpeningAt(openingFor(kind, style, target, width), target)
}

/** A file dropped on the canvas: an image becomes the base plan, a .json file opens as a plan. */
export async function dropFile(file: File) {
  if (file.type.startsWith('image/')) return loadBaseImage(file)
  if (file.name.toLowerCase().endsWith('.json')) return openPlanText(await file.text(), file.name)
  getStore().notify({ kind: 'error', text: `${file.name} is neither an image nor a plan file.` })
}

export function deleteSelection() {
  const store = getStore()
  const { selection } = store.getState()
  if (!selection.length) return
  store.edit((plan) => deleteItems(plan, selection))
  store.select([])
}

/** Every line and area of the active layer, so dragging them keeps the areas in their rooms. */
export function selectAll() {
  const store = getStore()
  const { plan, activeLayer } = store.getState()
  const layer = findLayer(plan, activeLayer)
  if (!isEditable(layer)) return
  store.select([
    ...Object.keys(layer.segments).map((id) => ({ layer: layer.id, kind: 'segment' as const, id })),
    ...Object.keys(layer.areas).map((id) => ({ layer: layer.id, kind: 'area' as const, id })),
  ])
}

/** The part of the world worth framing: the visible base image and every visible drawn point. */
export function planBounds(plan: Plan): Box | null {
  const pts = plan.layers.flatMap((l) => (l.visible ? Object.values(l.vertices) : []))
  if (plan.image?.visible) pts.push(...visibleCorners(plan.image))
  return boundsOf(pts)
}

export function fitView() {
  getStore().update({ view: undefined })
}
