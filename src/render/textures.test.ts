import { describe, expect, it } from 'vitest'
import { findMaterial, MATERIALS } from '../model/materials'
import { brickLayout, plankLayout, seeded, textureRecipe } from './textures'

const recipe = (id: string) => textureRecipe(findMaterial(id)!)

describe('finish textures', () => {
  it('textures brick, wood, lawn and checkered tile, at their real size', () => {
    expect(['brick-red', 'brick-white'].map((id) => recipe(id)?.kind)).toEqual(['brick', 'brick'])
    expect(['wood-oak', 'wood-walnut', 'wood-deck'].map((id) => recipe(id)?.kind)).toEqual(['planks', 'planks', 'planks'])
    expect(recipe('grass')?.kind).toBe('grass')
    expect(recipe('tile-checkered')).toMatchObject({ kind: 'checker', px: 32 / 0.3 })
    expect(recipe('plaster-white')).toBeNull()
    // one repeat: four bricks of a 0.25 m module, boards 0.156 m wide in 2.5 m, a lawn 8 m square
    const size = (id: string) => [recipe(id)!.width / recipe(id)!.px, recipe(id)!.height / recipe(id)!.px]
    expect(size('brick-red')).toEqual([1, (8 * 33) / 512])
    expect(size('wood-oak')).toEqual([2.5, 0.9375])
    expect(size('grass')).toEqual([8, 8])
    for (const m of MATERIALS) {
      const r = textureRecipe(m)
      if (r) expect(r.depth).toBeGreaterThanOrEqual(0)
    }
  })

  it('draws the same every time for a material, and differently for another', () => {
    const a = seeded('wood-oak')
    const b = seeded('wood-oak')
    const c = seeded('wood-walnut')
    const take = (rand: () => number) => Array.from({ length: 5 }, rand)
    expect(take(a)).toEqual(take(b))
    expect(take(seeded('wood-oak'))).not.toEqual(take(c))
    for (const v of take(seeded('x'))) expect(v >= 0 && v < 1).toBe(true)
  })

  it('lays bricks in running bond, each course half a brick along from the one under it', () => {
    const bricks = brickLayout(seeded('brick-red'))
    expect(bricks).toHaveLength(32)
    const course = (c: number) => bricks.filter((b) => b.y === c * 33).map((b) => b.x)
    expect(course(0)).toEqual([0, 128, 256, 384])
    expect(course(1)).toEqual([64, 192, 320, 448])
    // a joint round each brick
    expect(bricks.every((b) => b.w === 123 && b.h === 28)).toBe(true)
    expect(bricks.every((b) => b.tone > 0.6 && b.tone < 1.15)).toBe(true)
  })

  it('fills every row of boards to the length of the repeat, no board shorter than 0.6 m', () => {
    for (const seed of ['wood-oak', 'wood-walnut', 'wood-deck', 'other']) {
      const rows = plankLayout(seeded(seed))
      expect(rows).toHaveLength(6)
      for (const row of rows) {
        expect(row.lengths.reduce((s, l) => s + l, 0)).toBe(640)
        expect(Math.min(...row.lengths)).toBeGreaterThanOrEqual(0.6 * 256)
        expect(row.start >= 0 && row.start < 640).toBe(true)
      }
    }
  })
})
