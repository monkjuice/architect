import { createBaseImage, imageToWorld, visibleCorners } from '../model/baseImage'
import { newColonnade } from '../model/colonnades'
import { addFurniture, addOpening, addRoof, deleteItems, setAreaFloor, setColonnade, setWallFinish } from '../model/edit'
import { faceLine, finishProblem, sideOf, wallSide, type WallSide } from '../model/finishes'
import { findMaterial } from '../model/materials'
import { pointInPolygon, type Region } from '../model/regions'
import { FURNITURE_REACH_M, furnitureFor, furnitureInfo, furnitureTarget, type FurnitureTarget } from '../model/furniture'
import { boundsOf, polygonArea, type Box, type Vec } from '../model/geometry'
import { openingFor, openingTarget, type OpeningTarget } from '../model/openings'
import { hitTest } from '../model/pick'
import {
  createPlan,
  findLayer,
  isEditable,
  segmentKind,
  type BaseImage,
  type ColumnStyle,
  type Furniture,
  type FurnitureKind,
  type Opening,
  type OpeningKind,
  type OpeningStyle,
  type Plan,
  type Ref,
} from '../model/plan'
import { parsePlanText, serializePlan } from '../model/planFile'
import { newRoof, offsetPolygon, unionOutlines } from '../model/roofs'
import { isCovered } from '../model/solids'
import { EXTERIOR_WALL, WALL_HEIGHT, wallHeight } from '../model/walls'
import { pickFile, pickPlanFile, readImageFile, savePlanFile } from './files'
import { drawnHalfWidth, getPlacedAreas, getRegions, getThickness, hostThickness } from './derived'
import { getPrefs, openingWidth } from './prefs'
import { getStore, type EditorState, type Tab, type ToolId } from './store'

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

/** The tools of the Roof tab; the others belong to the floor plan. */
export const ROOF_TOOLS: readonly ToolId[] = ['roof-select', 'roof']

/**
 * Opens a tab. The floor plan and the roof plan have tools of their own and select their own things, so moving
 * between them picks the right tool and keeps only what that tab can select.
 */
export function openTab(tab: Tab) {
  const store = getStore()
  const { tool, selection } = store.getState()
  const patch: Partial<EditorState> = { tab }
  if (tab === 'roof' && !ROOF_TOOLS.includes(tool)) patch.tool = 'roof-select'
  if (tab === 'floor' && ROOF_TOOLS.includes(tool)) patch.tool = 'select'
  if (tab === 'roof' || tab === 'floor') {
    const keep = selection.filter((r) => (r.kind === 'roof') === (tab === 'roof'))
    if (keep.length !== selection.length) patch.selection = keep
  }
  store.update(patch)
}

/** The active layer, when it can be drawn on; otherwise says why not. */
function drawableLayer() {
  const store = getStore()
  const { plan, activeLayer } = store.getState()
  const layer = findLayer(plan, activeLayer)
  if (isEditable(layer)) return layer
  store.notify({ kind: 'error', text: 'The active layer is hidden or locked: pick another one in the Layers section.' })
  return undefined
}

/** A roof of the type picked in the toolbar over an outline drawn on the active layer, selected. */
export function addRoofOutline(outline: Vec[]) {
  const store = getStore()
  const layer = drawableLayer()
  if (!layer) return
  if (polygonArea(outline) < 0.05) return store.notify({ kind: 'error', text: 'That outline encloses next to nothing: click at least three corners around what the roof covers.' })
  const result = addRoof(store.getState().plan, layer.id, newRoof(outline, store.getState().roofType))
  if (!result) return
  store.edit(() => result.plan)
  store.select([{ layer: layer.id, kind: 'roof', id: result.id }])
}

/**
 * Roofs over the active layer's covered areas (rooms, and galleries bounded by walls and open edges), one per
 * group of areas that touch, out to the walls' outside faces and as high as the tallest of their walls.
 */
export function roofTheHouse() {
  const store = getStore()
  const layer = drawableLayer()
  if (!layer) return
  const covered = [...new Set(getPlacedAreas(layer).flatMap((a) => (a.region && isCovered(a.region) ? [a.region] : [])))]
  if (!covered.length) {
    return store.notify({ kind: 'error', text: `${layer.name} has no covered areas: name its rooms and galleries with Area (A) on the Floor tab first.` })
  }
  const walls = covered.flatMap((r) => r.wallIds.map((id) => wallHeight(layer.segments[id])))
  const height = walls.length ? Math.max(...walls) : WALL_HEIGHT
  const { roofType } = store.getState()
  let plan = store.getState().plan
  const ids: string[] = []
  for (const ring of unionOutlines(covered.map((r) => r.outer))) {
    const result = addRoof(plan, layer.id, newRoof(offsetPolygon(ring, EXTERIOR_WALL / 2), roofType, height))
    if (!result) continue
    plan = result.plan
    ids.push(result.id)
  }
  store.edit(() => plan)
  store.select(ids.map((id) => ({ layer: layer.id, kind: 'roof' as const, id })))
  store.notify({
    kind: 'info',
    text: `${ids.length === 1 ? 'A roof covers' : `${ids.length} roofs cover`} the rooms and galleries of ${layer.name}, out to the walls' outside faces. Set its type, pitch and overhang in the Roofs section.`,
  })
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
  const target = openingTarget(plan, p, { reach, snapReach, width, activeLayer, snap: prefs.snap, halfWidth: drawnHalfWidth, kind })
  if (!target) return store.notify({ kind: 'error', text: `Drop the ${kind} on a wall.` })
  placeOpeningAt(openingFor(kind, style, target, width), target)
}

/** Drag data of furniture dragged from the library: "bed:queen", or a kind without styles ("counter"). */
export const FURNITURE_DRAG_TYPE = 'application/x-architect-furniture'

/** Puts a piece down where `target` says and selects it; reports why when it cannot go there. */
export function placeFurnitureAt(item: Furniture, target: FurnitureTarget): string | null {
  const store = getStore()
  if (target.problem) {
    store.notify({ kind: 'error', text: target.problem })
    return null
  }
  const result = addFurniture(store.getState().plan, target.layer, item)
  if (!result) return null
  store.edit(() => result.plan)
  store.select([{ layer: target.layer, kind: 'furniture', id: result.id }])
  return result.id
}

/** A piece dropped from the library at world point `p`, on the active layer, snapped as the furniture tool would. */
export function dropFurniture(kind: FurnitureKind, style: string | undefined, p: Vec) {
  const store = getStore()
  const { plan, activeLayer } = store.getState()
  const info = furnitureInfo(kind, style)
  const target = furnitureTarget(plan, p, {
    kind,
    style,
    width: info.width,
    depth: info.depth,
    angle: 0,
    layer: activeLayer,
    reach: FURNITURE_REACH_M,
    snap: getPrefs().snap,
    thickness: hostThickness,
  })
  if (!target) return store.notify({ kind: 'error', text: 'The active layer is hidden or locked: pick another one in the Layers section.' })
  placeFurnitureAt(furnitureFor(kind, style, target, info.width, info.depth), target)
}

/** Drag data of a material dragged from the library: "wall:brick-red" or "floor:tile-light". */
export const MATERIAL_DRAG_TYPE = 'application/x-architect-material'

/** Where a material goes: one side of a wall, or the floor of a named area; with what is there, to name it. */
export type FinishTarget =
  | { surface: 'wall'; layer: string; segment: string; side: WallSide; outdoor: boolean; face: [Vec, Vec]; facing: string }
  | { surface: 'floor'; layer: string; area: string; region: Region; outdoor: boolean; name: string }

/**
 * The wall side or floor a material would go on at `p`: the wall within `reach` (m) and the side of it `p` is on,
 * or the smallest named area around `p`, on editable layers.
 */
export function finishTarget(surface: 'wall' | 'floor', p: Vec, reach: number): FinishTarget | null {
  const { plan, activeLayer } = getStore().getState()
  if (surface === 'wall') {
    const hit = hitTest(plan, p, activeLayer, 0, reach, drawnHalfWidth)
    const layer = hit?.kind === 'segment' ? findLayer(plan, hit.layer) : undefined
    const s = layer && hit ? layer.segments[hit.id] : undefined
    if (!layer || !hit || !s || segmentKind(s) !== 'wall') return null
    const side = sideOf(layer.vertices[s.a], layer.vertices[s.b], p)
    const half = (getThickness(layer).get(hit.id) ?? 0) / 2
    const { region, outdoor } = wallSide(layer, getRegions(layer), half, hit.id, side)
    const named = region && getPlacedAreas(layer).find((a) => a.region === region)
    return { surface, layer: layer.id, segment: hit.id, side, outdoor, face: faceLine(layer, hit.id, side, half), facing: named ? named.area.name : region ? 'an unnamed area' : 'the outside' }
  }
  let best: FinishTarget | null = null
  for (const layer of plan.layers) {
    if (!isEditable(layer)) continue
    for (const a of getPlacedAreas(layer)) {
      const r = a.region
      if (!r || !pointInPolygon(p, r.outer) || r.holes.some((h) => pointInPolygon(p, h))) continue
      if (!best || (best.surface === 'floor' && r.area < best.region.area)) best = { surface, layer: layer.id, area: a.id, region: r, outdoor: !r.indoor, name: a.area.name }
    }
  }
  return best
}

/** Why a material cannot go on a target, or null. */
export const finishTargetProblem = (t: FinishTarget, materialId: string): string | null => {
  const material = findMaterial(materialId)
  return material ? finishProblem(material, t.surface, t.outdoor) : 'That material is not in the catalogue.'
}

/** Puts a material on a wall's side or a floor, and selects that wall or area; says why when it does not suit it. */
export function applyFinish(t: FinishTarget, materialId: string) {
  const store = getStore()
  const problem = finishTargetProblem(t, materialId)
  if (problem) return store.notify({ kind: 'error', text: problem })
  if (t.surface === 'wall') {
    store.edit((plan) => setWallFinish(plan, t.layer, t.segment, t.side, materialId))
    store.select([{ layer: t.layer, kind: 'segment', id: t.segment }])
  } else {
    store.edit((plan) => setAreaFloor(plan, [{ layer: t.layer, kind: 'area', id: t.area }], materialId))
    store.select([{ layer: t.layer, kind: 'area', id: t.area }])
  }
  store.setActiveLayer(t.layer)
}

/** A material dropped from the library at world point `p` goes on the wall side or floor there. */
export function dropMaterial(surface: 'wall' | 'floor', materialId: string, p: Vec, reach: number) {
  const target = finishTarget(surface, p, reach)
  if (!target) {
    return getStore().notify({ kind: 'error', text: surface === 'wall' ? 'Drop a wall material on the side of a wall.' : 'Drop a floor material inside a named area (name it with Area first).' })
  }
  applyFinish(target, materialId)
}

/** Drag data of a colonnade dragged from the library: its column style. */
export const COLONNADE_DRAG_TYPE = 'application/x-architect-colonnade'

/** Stands columns of `style` along an open edge and selects it; says why when the line is not an open edge. */
export function applyColonnade(ref: Ref, style: ColumnStyle) {
  const store = getStore()
  const s = ref.kind === 'segment' ? findLayer(store.getState().plan, ref.layer)?.segments[ref.id] : undefined
  if (!s) return
  if (segmentKind(s) !== 'open') {
    return store.notify({ kind: 'error', text: 'Columns go along open edges: draw one (Open edge, in the library), or make this line one with Type in the Selection panel.' })
  }
  // the same style again keeps the spacing set for it
  store.edit((plan) => setColonnade(plan, [ref], s.colonnade?.style === style ? s.colonnade : newColonnade(style)))
  store.setActiveLayer(ref.layer)
  store.select([ref])
}

/** The line within `reach` (m) of `p` that a colonnade would go on, if any. */
export function colonnadeTarget(p: Vec, reach: number): Ref | null {
  const { plan, activeLayer } = getStore().getState()
  const hit = hitTest(plan, p, activeLayer, 0, reach, drawnHalfWidth)
  return hit?.kind === 'segment' ? hit : null
}

/** A colonnade dropped from the library at world point `p` goes on the open edge there. */
export function dropColonnade(style: ColumnStyle, p: Vec, reach: number) {
  const target = colonnadeTarget(p, reach)
  if (!target) return getStore().notify({ kind: 'error', text: 'Drop the colonnade on an open edge.' })
  applyColonnade(target, style)
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
    ...Object.keys(layer.furniture).map((id) => ({ layer: layer.id, kind: 'furniture' as const, id })),
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
