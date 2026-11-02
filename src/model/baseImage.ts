import { clamp, dist, lerp, normalizeAngle, rotate, type Vec } from './geometry'
import type { BaseImage, Calibration, Crop } from './plan'

/**
 * Placement of the base plan image in the world, plus the calibration and crop math. Image pixel (u, v)
 * maps to world as: centre + R(rotation) · scale · ((u, v) − (width, height) / 2), with `scale` in meters
 * per pixel. Edits return new image objects.
 */

/** A freshly loaded image: about 30 m across until it is calibrated, top-left corner at the origin. */
export function createBaseImage(src: string, width: number, height: number): BaseImage {
  const scale = 30 / Math.max(width, height)
  return {
    src,
    width,
    height,
    cx: (width * scale) / 2,
    cy: (height * scale) / 2,
    rotation: 0,
    scale,
    opacity: 0.8,
    visible: true,
    locked: false,
    calibration: [],
  }
}

export function imageToWorld(img: BaseImage, u: number, v: number): Vec {
  const d = rotate({ x: (u - img.width / 2) * img.scale, y: (v - img.height / 2) * img.scale }, img.rotation)
  return { x: img.cx + d.x, y: img.cy + d.y }
}

export function worldToImage(img: BaseImage, p: Vec): Vec {
  const d = rotate({ x: p.x - img.cx, y: p.y - img.cy }, -img.rotation)
  return { x: d.x / img.scale + img.width / 2, y: d.y / img.scale + img.height / 2 }
}

/** The visible part of the image in pixels: the crop, or the whole image. */
export const cropRect = (img: BaseImage): Crop => img.crop ?? { x: 0, y: 0, w: img.width, h: img.height }

export function cropCenter(img: BaseImage): Vec {
  const r = cropRect(img)
  return { x: r.x + r.w / 2, y: r.y + r.h / 2 }
}

/** World positions of the visible rectangle's corners, clockwise from its top-left. */
export function visibleCorners(img: BaseImage): Vec[] {
  const { x, y, w, h } = cropRect(img)
  return [imageToWorld(img, x, y), imageToWorld(img, x + w, y), imageToWorld(img, x + w, y + h), imageToWorld(img, x, y + h)]
}

/** SVG transform that draws the image's pixel space in world coordinates. */
export function imageTransform(img: BaseImage): string {
  const deg = (img.rotation * 180) / Math.PI
  return `translate(${img.cx} ${img.cy}) rotate(${deg}) scale(${img.scale}) translate(${-img.width / 2} ${-img.height / 2})`
}

/** Moves the image so that pixel `pivot` sits where it was before `change` altered scale or rotation. */
function keepPivot(before: BaseImage, after: BaseImage, pivot: Vec): BaseImage {
  const a = imageToWorld(before, pivot.x, pivot.y)
  const b = imageToWorld(after, pivot.x, pivot.y)
  return { ...after, cx: after.cx + a.x - b.x, cy: after.cy + a.y - b.y }
}

export function withScale(img: BaseImage, scale: number, pivot = cropCenter(img)): BaseImage {
  return keepPivot(img, { ...img, scale }, pivot)
}

export function withRotation(img: BaseImage, rotation: number, pivot = cropCenter(img)): BaseImage {
  return keepPivot(img, { ...img, rotation: normalizeAngle(rotation) }, pivot)
}

/** The rotation that turns the world line a→b horizontal or vertical, whichever is closer. */
export function levelRotation(img: BaseImage, a: Vec, b: Vec): number {
  const angle = Math.atan2(b.y - a.y, b.x - a.x)
  const target = Math.round(angle / (Math.PI / 2)) * (Math.PI / 2)
  return normalizeAngle(img.rotation + target - angle)
}

/** Rotates the image so the world line a→b becomes level; the line's midpoint stays put. */
export function levelImage(img: BaseImage, a: Vec, b: Vec): BaseImage {
  return withRotation(img, levelRotation(img, a, b), worldToImage(img, lerp(a, b, 0.5)))
}

/**
 * Least-squares scale (meters per pixel) over all calibration lengths: minimizes Σ(s·Lᵢ − dᵢ)², i.e.
 * s = Σ dᵢLᵢ / Σ Lᵢ², with Lᵢ in pixels and dᵢ in meters. Longer references weigh more, which suits them:
 * the same click error is a smaller fraction of a longer line.
 */
export function fitScale(refs: readonly Calibration[]): number | null {
  let num = 0
  let den = 0
  for (const r of refs) {
    const px = dist(r.a, r.b)
    num += r.length * px
    den += px * px
  }
  return den > 0 ? num / den : null
}

/** Relative error of a reference under the current scale: +0.01 means the image measures it 1% long. */
export const calibrationError = (img: BaseImage, ref: Calibration): number => (dist(ref.a, ref.b) * img.scale - ref.length) / ref.length

/** Adds a known length between world points a and b and refits the scale, keeping `a` in place. */
export function addCalibration(img: BaseImage, a: Vec, b: Vec, length: number): BaseImage {
  const ref = { a: worldToImage(img, a), b: worldToImage(img, b), length }
  const calibration = [...img.calibration, ref]
  return withScale({ ...img, calibration }, fitScale(calibration)!, ref.a)
}

/** Drops a known length; the scale is refitted to the rest, or kept when none is left. */
export function removeCalibration(img: BaseImage, index: number): BaseImage {
  const calibration = img.calibration.filter((_, i) => i !== index)
  const scale = fitScale(calibration)
  return scale === null ? { ...img, calibration } : withScale({ ...img, calibration }, scale, calibration[0].a)
}

export type CropHandle = 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'nw' | 'move'

/** Handle positions on a crop rectangle, in image pixels. */
export function cropHandles(r: Crop): [CropHandle, number, number][] {
  const { x, y, w, h } = r
  return [
    ['nw', x, y],
    ['n', x + w / 2, y],
    ['ne', x + w, y],
    ['e', x + w, y + h / 2],
    ['se', x + w, y + h],
    ['s', x + w / 2, y + h],
    ['sw', x, y + h],
    ['w', x, y + h / 2],
  ]
}

/**
 * The crop after dragging `handle` from image pixel `start` to `uv`. Edges stay inside the image and the
 * rectangle never shrinks below `min` pixels.
 */
export function resizeCrop(r: Crop, handle: CropHandle, uv: Vec, start: Vec, width: number, height: number, min = 8): Crop {
  if (handle === 'move') {
    const dx = clamp(uv.x - start.x, -r.x, width - r.x - r.w)
    const dy = clamp(uv.y - start.y, -r.y, height - r.y - r.h)
    return { x: r.x + dx, y: r.y + dy, w: r.w, h: r.h }
  }
  let l = r.x
  let t = r.y
  let rr = r.x + r.w
  let b = r.y + r.h
  if (handle.includes('w')) l = clamp(uv.x, 0, rr - min)
  if (handle.includes('e')) rr = clamp(uv.x, l + min, width)
  if (handle.includes('n')) t = clamp(uv.y, 0, b - min)
  if (handle.includes('s')) b = clamp(uv.y, t + min, height)
  return { x: l, y: t, w: rr - l, h: b - t }
}
