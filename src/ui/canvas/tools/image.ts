import {
  addCalibration,
  cropHandles,
  cropRect,
  imageToWorld,
  levelImage,
  resizeCrop,
  visibleCorners,
  worldToImage,
  type CropHandle,
} from '../../../model/baseImage'
import { constrainAngle, dist, normalizeAngle, toDeg, type Vec } from '../../../model/geometry'
import type { BaseImage, Crop } from '../../../model/plan'
import { editImageInPlace } from '../../../state/actions'
import type { OverlayData, PointerInfo, Tool, ToolContext } from './types'

const HANDLE_PX = 9

/** Base-plan tools only run with an image; this reads it, or undefined if it went away (undo, replace). */
const imageOf = (ctx: ToolContext): BaseImage | undefined => ctx.store.getState().plan.image

const outline = (corners: Vec[], style: 'crop' | 'calibration') =>
  corners.map((a, i) => ({ a, b: corners[(i + 1) % corners.length], style }))

/** Drag the image to position it. */
export function createImageMoveTool(ctx: ToolContext): Tool {
  const { store } = ctx
  let drag: { start: Vec; cx: number; cy: number } | null = null
  return {
    cursor: () => (drag ? 'grabbing' : 'move'),
    reset() {
      drag = null
    },
    down(e) {
      const img = imageOf(ctx)
      if (img) drag = { start: e.p, cx: img.cx, cy: img.cy }
    },
    move(e) {
      const d = drag
      if (!d) return
      store.preview((base) => (base.image ? { ...base, image: { ...base.image, cx: d.cx + e.p.x - d.start.x, cy: d.cy + e.p.y - d.start.y } } : base))
    },
    up() {
      drag = null
      store.endGesture()
    },
    overlay: () => {
      const img = imageOf(ctx)
      return img ? { lines: outline(visibleCorners(img), 'crop') } : {}
    },
  }
}

/** Click two points along a line of the plan that should be horizontal or vertical; the image turns to match. */
export function createLevelTool(ctx: ToolContext): Tool {
  const { store } = ctx
  let first: Vec | null = null
  let cursor: Vec | null = null
  return {
    cursor: () => 'crosshair',
    reset() {
      first = cursor = null
    },
    cancel() {
      first = null
      ctx.redraw()
    },
    down(e) {
      const img = imageOf(ctx)
      if (!img) return
      if (!first) {
        first = e.p
        return ctx.redraw()
      }
      const [a, b] = [first, e.p]
      if (dist(a, b) < 5 * e.px) return
      first = null
      const before = img.rotation
      store.edit((plan) => (plan.image ? { ...plan, image: levelImage(plan.image, a, b) } : plan))
      const turned = toDeg(normalizeAngle(store.getState().plan.image!.rotation - before))
      store.notify({ kind: 'info', text: `Rotated the base plan by ${turned >= 0 ? '+' : ''}${turned.toFixed(2)}°.` })
      store.setTool('select')
    },
    move(e) {
      cursor = e.p
      if (first) ctx.redraw()
    },
    overlay() {
      if (!first || !cursor) return {}
      const angle = toDeg(Math.atan2(cursor.y - first.y, cursor.x - first.x))
      const off = angle - Math.round(angle / 90) * 90
      const axis = Math.abs(Math.round(angle / 90)) % 2 === 0 ? 'horizontal' : 'vertical'
      return {
        lines: [{ a: first, b: cursor, style: 'level' }],
        points: [{ p: first, style: 'anchor' }],
        tag: { p: cursor, text: `${Math.abs(off).toFixed(2)}° off ${axis}`, style: 'accent' },
      }
    },
  }
}

/** Drag the edges, corners or inside of the crop rectangle; outside it the image is hidden once you leave. */
export function createCropTool(ctx: ToolContext): Tool {
  const { store } = ctx
  let drag: { handle: CropHandle; start: Vec; rect: Crop } | null = null
  let hover: CropHandle | null = null

  const handleAt = (img: BaseImage, p: Vec, px: number): CropHandle | null => {
    const rect = cropRect(img)
    const near = cropHandles(rect).find(([, u, v]) => dist(imageToWorld(img, u, v), p) <= HANDLE_PX * px)
    if (near) return near[0]
    const uv = worldToImage(img, p)
    return uv.x >= rect.x && uv.x <= rect.x + rect.w && uv.y >= rect.y && uv.y <= rect.y + rect.h ? 'move' : null
  }

  return {
    cursor: () => (drag || hover === 'move' ? 'move' : hover ? 'crosshair' : 'default'),
    reset() {
      drag = null
      hover = null
    },
    down(e) {
      const img = imageOf(ctx)
      const handle = img && handleAt(img, e.p, e.px)
      if (img && handle) drag = { handle, start: worldToImage(img, e.p), rect: cropRect(img) }
    },
    move(e: PointerInfo) {
      const img = imageOf(ctx)
      if (!img) return
      const d = drag
      if (!d) {
        const h = handleAt(img, e.p, e.px)
        if (h !== hover) {
          hover = h
          ctx.redraw()
        }
        return
      }
      const crop = resizeCrop(d.rect, d.handle, worldToImage(img, e.p), d.start, img.width, img.height)
      store.preview((base) => (base.image ? { ...base, image: { ...base.image, crop } } : base))
    },
    up() {
      drag = null
      store.endGesture()
    },
    overlay(): OverlayData {
      const img = imageOf(ctx)
      if (!img) return {}
      return {
        lines: outline(visibleCorners(img), 'crop'),
        points: cropHandles(cropRect(img)).map(([, u, v]) => ({ p: imageToWorld(img, u, v), style: 'handle' as const })),
      }
    },
  }
}

/**
 * Click both ends of a length written on the plan and type its real value: the image is scaled to match.
 * Every known length is kept, the scale is their best fit, and each shows how far off it reads, which
 * reveals a skewed photo or a mis-click.
 */
export function createCalibrateTool(ctx: ToolContext): Tool {
  const { store } = ctx
  let first: Vec | null = null
  let cursor: Vec | null = null
  let asking: [Vec, Vec] | null = null

  const at = (e: PointerInfo) => (first && e.shift ? constrainAngle(first, e.p).point : e.p)

  return {
    cursor: () => 'crosshair',
    reset() {
      first = cursor = asking = null
    },
    cancel() {
      first = null
      ctx.redraw()
    },
    down(e) {
      if (asking || !imageOf(ctx)) return
      const p = at(e)
      if (!first) {
        first = p
        return ctx.redraw()
      }
      if (dist(first, p) < 5 * e.px) return
      const line: [Vec, Vec] = [first, p]
      asking = line
      first = null
      void store
        .askLength('Known length', `The line measures ${dist(...line).toFixed(3)} m at the current scale. How long is it really?`)
        .then((length) => {
          asking = null
          ctx.redraw()
          if (length === null) return
          if (!(length > 0)) return store.notify({ kind: 'error', text: 'Type a positive length in meters, e.g. 28,00.' })
          editImageInPlace((image) => addCalibration(image, line[0], line[1], length))
          store.setTool('select')
          const img = imageOf(ctx)
          if (img) {
            const n = img.calibration.length
            store.notify({
              kind: 'info',
              text: `Calibrated: 1 px = ${(img.scale * 100).toFixed(3)} cm (${n} known length${n > 1 ? 's' : ''}). ${n === 1 ? 'Add another length, ideally across the first, to check the photo is not skewed.' : ''}`,
            })
          }
        })
    },
    move(e) {
      cursor = at(e)
      if (first) ctx.redraw()
    },
    overlay() {
      const line = asking ?? (first && cursor ? [first, cursor] : null)
      if (!line) return {}
      const [a, b] = line
      return {
        lines: [{ a, b, style: 'calibration' }],
        points: [
          { p: a, style: 'anchor' },
          { p: b, style: 'anchor' },
        ],
        tag: { p: b, text: `${dist(a, b).toFixed(3)} m`, style: 'calibration' },
      }
    },
  }
}
