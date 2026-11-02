import { describe, expect, it } from 'vitest'
import {
  addCalibration,
  calibrationError,
  createBaseImage,
  fitScale,
  imageToWorld,
  levelImage,
  removeCalibration,
  resizeCrop,
  withRotation,
  withScale,
  worldToImage,
} from './baseImage'
import { dist, toRad } from './geometry'

const SRC = 'data:image/png;base64,AAAA'
const tilted = () => ({ ...createBaseImage(SRC, 1000, 600), rotation: toRad(3), cx: 4, cy: -2 })

describe('image placement', () => {
  it('maps pixels to world and back', () => {
    const img = tilted()
    const p = imageToWorld(img, 123, 456)
    const back = worldToImage(img, p)
    expect(back.x).toBeCloseTo(123, 9)
    expect(back.y).toBeCloseTo(456, 9)
  })

  it('keeps the pivot pixel in place when scaling or rotating', () => {
    const img = tilted()
    const pivot = { x: 100, y: 50 }
    const before = imageToWorld(img, pivot.x, pivot.y)
    for (const next of [withScale(img, 0.01, pivot), withRotation(img, toRad(-20), pivot)]) {
      const after = imageToWorld(next, pivot.x, pivot.y)
      expect(after.x).toBeCloseTo(before.x, 9)
      expect(after.y).toBeCloseTo(before.y, 9)
    }
  })

  it('levels the image so a picked line becomes horizontal, keeping its midpoint', () => {
    const img = tilted()
    const pa = { x: 100, y: 300 }
    const pb = { x: 900, y: 340 }
    const a = imageToWorld(img, pa.x, pa.y)
    const b = imageToWorld(img, pb.x, pb.y)
    const level = levelImage(img, a, b)
    const a2 = imageToWorld(level, pa.x, pa.y)
    const b2 = imageToWorld(level, pb.x, pb.y)
    expect(a2.y).toBeCloseTo(b2.y, 9)
    expect((a2.x + b2.x) / 2).toBeCloseTo((a.x + b.x) / 2, 9)
  })
})

describe('calibration', () => {
  it('fits one known length exactly, keeping its first point in place', () => {
    const img = tilted()
    const a = imageToWorld(img, 200, 100)
    const b = imageToWorld(img, 760, 100)
    const calibrated = addCalibration(img, a, b, 28)
    expect(calibrated.scale).toBeCloseTo(28 / 560, 12)
    const a2 = imageToWorld(calibrated, 200, 100)
    expect(a2.x).toBeCloseTo(a.x, 9)
    expect(dist(a2, imageToWorld(calibrated, 760, 100))).toBeCloseTo(28, 9)
    expect(calibrationError(calibrated, calibrated.calibration[0])).toBeCloseTo(0, 12)
  })

  it('takes the least-squares scale over several lengths and reports each error', () => {
    const refs = [
      { a: { x: 0, y: 0 }, b: { x: 500, y: 0 }, length: 25 },
      { a: { x: 0, y: 0 }, b: { x: 0, y: 620 }, length: 30.71 },
    ]
    const s = fitScale(refs)!
    expect(s).toBeCloseTo((25 * 500 + 30.71 * 620) / (500 ** 2 + 620 ** 2), 12)
    const img = { ...createBaseImage(SRC, 1000, 1000), scale: s, calibration: refs }
    expect(Math.sign(calibrationError(img, refs[0]))).toBe(-Math.sign(calibrationError(img, refs[1])))
    expect(fitScale([])).toBeNull()
  })

  it('refits after removing a length, and keeps the scale when none is left', () => {
    const img = tilted()
    const one = addCalibration(img, imageToWorld(img, 0, 0), imageToWorld(img, 500, 0), 25)
    const two = addCalibration(one, imageToWorld(one, 0, 0), imageToWorld(one, 0, 400), 21)
    expect(removeCalibration(two, 1).scale).toBeCloseTo(25 / 500, 12)
    const none = removeCalibration(one, 0)
    expect(none.calibration).toHaveLength(0)
    expect(none.scale).toBe(one.scale)
  })
})

describe('resizeCrop', () => {
  const r = { x: 100, y: 100, w: 400, h: 200 }

  it('moves the dragged edges and clamps them to the image', () => {
    expect(resizeCrop(r, 'nw', { x: -50, y: 150 }, { x: 100, y: 100 }, 1000, 600)).toEqual({ x: 0, y: 150, w: 500, h: 150 })
    expect(resizeCrop(r, 'e', { x: 2000, y: 0 }, { x: 500, y: 200 }, 1000, 600)).toEqual({ x: 100, y: 100, w: 900, h: 200 })
  })

  it('never shrinks below the minimum size', () => {
    expect(resizeCrop(r, 's', { x: 0, y: 0 }, { x: 300, y: 300 }, 1000, 600).h).toBe(8)
  })

  it('moves the whole rectangle without leaving the image', () => {
    expect(resizeCrop(r, 'move', { x: 900, y: 0 }, { x: 300, y: 200 }, 1000, 600)).toEqual({ x: 600, y: 0, w: 400, h: 200 })
  })
})
