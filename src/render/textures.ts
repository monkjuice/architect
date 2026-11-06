import * as THREE from 'three'
import type { Material } from '../model/materials'

/**
 * Finishes in 3-D beyond a flat colour: brick courses, wood boards, a lawn and checkered tile, painted on canvases
 * at their real size as a colour map and a relief (normal) map. Faces are mapped in metres (see house.ts), so one
 * repeat of a canvas covers its width and height over its pixels per metre. Each is painted once per material and
 * kept for the session: the house is rebuilt on every change, its textures are not.
 */

export type TextureKind = 'brick' | 'planks' | 'grass' | 'seams' | 'tiles' | 'stone' | 'dirt' | 'grain' | 'checker'

/** What a finish's texture shows, and its canvas: one repeat, in px, at `px` pixels per metre. */
export interface TextureRecipe {
  kind: TextureKind
  width: number
  height: number
  px: number
  /** How deep its relief is (mortar joints, the seams between boards, blades of grass), in m; 0 for none. */
  depth: number
}

/** Bricks 0.24 × 0.055 m in 1 cm joints (a 0.25 × 0.065 m module, near enough at 512 px/m), four to a course, eight courses. */
const BRICK = { px: 512, module: 128, course: 33, joint: 5, perCourse: 4, courses: 8 }
/** Boards 0.156 m wide, six across a 2.5 m repeat, from 0.6 to 1.6 m long with their ends staggered. */
const PLANK = { px: 256, width: 40, length: 640, rows: 6, min: 0.6, max: 1.6 }
/** Standing seam panels 0.45 m wide, four to a repeat, their seams 2.5 cm ribs down the slope. */
const SEAM = { px: 256, panel: 115, panels: 4, length: 256 }
/** Square tiles, four by four to a repeat (eight by eight when small), at about 256 px/m. */
const TILES = { px: 256, joint: 3 }
/** Stacked stone: courses of rectangular stones of random height and length, 2 × 1 m to a repeat. */
const STONE = { px: 256, width: 512, height: 256, joint: 3 }
/** A lawn 8 m square: a smaller repeat showed as a grid of patches from above. */
const LAWN = { px: 128, size: 1024 }

export function textureRecipe(material: Material): TextureRecipe | null {
  if (material.checker) return { kind: 'checker', width: 64, height: 64, px: 32 / material.checker.tile, depth: 0 }
  switch (material.pattern) {
    case 'brick':
      return { kind: 'brick', width: BRICK.module * BRICK.perCourse, height: BRICK.course * BRICK.courses, px: BRICK.px, depth: 0.01 }
    case 'planks':
      return { kind: 'planks', width: PLANK.length, height: PLANK.width * PLANK.rows, px: PLANK.px, depth: 0.004 }
    case 'grass':
      return { kind: 'grass', width: LAWN.size, height: LAWN.size, px: LAWN.px, depth: 0.004 }
    case 'dirt':
      return { kind: 'dirt', width: LAWN.size, height: LAWN.size, px: LAWN.px, depth: 0.006 }
    case 'grain':
      return { kind: 'grain', width: 768, height: 256, px: 256, depth: 0.002 }
    case 'seams':
      return { kind: 'seams', width: SEAM.panel * SEAM.panels, height: SEAM.length, px: SEAM.px, depth: 0.025 }
    case 'tiles': {
      const size = material.tile ?? 0.6
      const cell = Math.round(size * TILES.px)
      const n = size < 0.4 ? 8 : 4
      return { kind: 'tiles', width: cell * n, height: cell * n, px: cell / size, depth: natural(material) ? 0.006 : 0.003 }
    }
    case 'stone':
      return { kind: 'stone', width: STONE.width, height: STONE.height, px: STONE.px, depth: 0.015 }
    default:
      return null
  }
}

/** Stone (and a pool's stone lining) varies from piece to piece; porcelain and fired tile hardly do. */
const natural = (m: Material) => m.group === 'Brick and stone' || !!m.water

/** Random numbers seeded by a string (mulberry32), so a material looks the same every time it is painted. */
export function seeded(seed: string): () => number {
  let a = 2166136261
  for (let i = 0; i < seed.length; i++) a = Math.imul(a ^ seed.charCodeAt(i), 16777619)
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * The bricks of one repeat in px, in running bond (each course half a brick along from the one under it), each
 * with a tone: most within a few percent of the colour, now and then a darker, harder-fired one. A brick that runs
 * off the right edge carries on at the left.
 */
export function brickLayout(rand: () => number): { x: number; y: number; w: number; h: number; tone: number }[] {
  const bricks = []
  for (let c = 0; c < BRICK.courses; c++) {
    const shift = c % 2 ? BRICK.module / 2 : 0
    for (let i = 0; i < BRICK.perCourse; i++) {
      const tone = rand() < 0.08 ? 0.7 + 0.1 * rand() : 0.88 + 0.22 * rand()
      bricks.push({ x: shift + i * BRICK.module, y: c * BRICK.course, w: BRICK.module - BRICK.joint, h: BRICK.course - BRICK.joint, tone })
    }
  }
  return bricks
}

/** The rows of boards of one repeat: where each row's first board starts and the boards' lengths in px, which fill the repeat. */
export function plankLayout(rand: () => number): { start: number; lengths: number[] }[] {
  const [min, max] = [PLANK.min * PLANK.px, PLANK.max * PLANK.px]
  const rows = []
  for (let r = 0; r < PLANK.rows; r++) {
    const lengths: number[] = []
    let left = PLANK.length
    for (;;) {
      const l = Math.round(min + rand() * (max - min))
      // the last board takes what is left rather than leave a sliver
      if (left - l < min) {
        lengths.push(left)
        break
      }
      lengths.push(l)
      left -= l
    }
    rows.push({ start: Math.floor(rand() * PLANK.length), lengths })
  }
  return rows
}

// ---- painting --------------------------------------------------------------------------------------------------

type Rgb = readonly [number, number, number]

const rgb = (hex: string): Rgb => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as unknown as Rgb
const scaled = (c: Rgb, k: number): Rgb => c.map((v) => Math.max(0, Math.min(255, v * k))) as unknown as Rgb
const css = (c: Rgb, alpha = 1) => `rgba(${c.map(Math.round).join(',')},${alpha})`
const gray = (v: number, alpha = 1) => css([v, v, v], alpha)
const luminance = ([r, g, b]: Rgb) => (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255

function canvas(width: number, height: number) {
  const el = document.createElement('canvas')
  el.width = width
  el.height = height
  return { el, g: el.getContext('2d', { willReadFrequently: true })! }
}

/** Where something `w` wide drawn at `x` shows on a canvas `width` wide that repeats: once, or again off the other edge. */
const wrapped = (x: number, w: number, width: number): number[] => (x + w > width ? [x, x - width] : x < 0 ? [x, x + width] : [x])

/** Every pixel a little lighter or darker, by up to ± `amount` / 2. */
function grain(g: CanvasRenderingContext2D, rand: () => number, amount: number) {
  const { width, height } = g.canvas
  const img = g.getImageData(0, 0, width, height)
  const d = img.data
  for (let i = 0; i < d.length; i += 4) {
    const k = 1 + (rand() - 0.5) * amount
    d[i] = Math.min(255, d[i] * k)
    d[i + 1] = Math.min(255, d[i + 1] * k)
    d[i + 2] = Math.min(255, d[i + 2] * k)
  }
  g.putImageData(img, 0, 0)
}

interface Painted {
  map: HTMLCanvasElement
  /** Heights, black low to white high, for the relief. */
  height?: HTMLCanvasElement
}

function paintBricks(r: TextureRecipe, material: Material, rand: () => number): Painted {
  const [color, height] = [canvas(r.width, r.height), canvas(r.width, r.height)]
  const base = rgb(material.color)
  // a pale cement joint, or for painted brick the paint a shade darker
  color.g.fillStyle = css(luminance(base) > 0.6 ? scaled(base, 0.85) : [186, 178, 165])
  color.g.fillRect(0, 0, r.width, r.height)
  height.g.fillStyle = gray(40)
  height.g.fillRect(0, 0, r.width, r.height)
  for (const b of brickLayout(rand)) {
    for (const x of wrapped(b.x, b.w, r.width)) {
      color.g.fillStyle = css(scaled(base, b.tone))
      color.g.fillRect(x, b.y, b.w, b.h)
      // the face, its arrises rounded over a few pixels: a sharp edge only shows from close up
      for (const [inset, v] of [[0, 140], [1, 185], [2, 215], [3, 235]]) {
        height.g.fillStyle = gray(v)
        height.g.fillRect(x + inset, b.y + inset, b.w - 2 * inset, b.h - 2 * inset)
      }
    }
  }
  // flecks in the clay
  color.g.fillStyle = 'rgba(0,0,0,0.16)'
  for (let i = 0; i < 700; i++) color.g.fillRect(rand() * r.width, rand() * r.height, 1 + rand() * 1.5, 1 + rand())
  grain(color.g, rand, 0.12)
  grain(height.g, rand, 0.15)
  return { map: color.el, height: height.el }
}

/** How one board looks: its tone, the streaks of its grain, maybe a knot; worked out once, as a board across the edge is drawn twice. */
function boardLook(rand: () => number) {
  const wave = 40 + rand() * 80
  const phase = rand() * 6
  const streaks = Array.from({ length: 16 }, () => ({
    y: rand(),
    amp: 0.5 + rand() * 1.5,
    dark: rand() < 0.65,
    alpha: rand(),
    width: 0.6 + rand() * 1.4,
  }))
  const knot = rand() < 0.2 ? { at: rand(), y: 0.3 + 0.4 * rand() } : null
  return { tone: 0.84 + 0.26 * rand(), wave, phase, streaks, knot }
}

function paintPlanks(r: TextureRecipe, material: Material, rand: () => number): Painted {
  const [color, height] = [canvas(r.width, r.height), canvas(r.width, r.height)]
  const base = rgb(material.color)
  const ph = PLANK.width
  plankLayout(rand).forEach((row, i) => {
    const y = i * ph
    let along = row.start
    for (const len of row.lengths) {
      const look = boardLook(rand)
      for (const x of wrapped(along % r.width, len, r.width)) {
        const g = color.g
        g.save()
        g.beginPath()
        g.rect(x, y, len, ph)
        g.clip()
        g.fillStyle = css(scaled(base, look.tone))
        g.fillRect(x, y, len, ph)
        // the grain: long faint streaks along the board, darker and lighter
        for (const s of look.streaks) {
          g.strokeStyle = s.dark ? css([40, 22, 8], 0.05 + 0.15 * s.alpha) : css([255, 236, 205], 0.04 + 0.08 * s.alpha)
          g.lineWidth = s.width
          g.beginPath()
          for (let t = 0; t <= len; t += 8) {
            const yy = y + s.y * ph + Math.sin((x + t) / look.wave + look.phase + s.y * 9) * s.amp
            if (t) g.lineTo(x + t, yy)
            else g.moveTo(x + t, yy)
          }
          g.stroke()
        }
        if (look.knot) {
          const [kx, ky] = [x + look.knot.at * len, y + look.knot.y * ph]
          const knot = g.createRadialGradient(kx, ky, 0, kx, ky, 8)
          knot.addColorStop(0, css([35, 18, 6], 0.55))
          knot.addColorStop(1, css([35, 18, 6], 0))
          g.fillStyle = knot
          g.beginPath()
          g.ellipse(kx, ky, 8, 4, 0, 0, Math.PI * 2)
          g.fill()
        }
        g.restore()
        // the joints: the board's end, and its long edge
        g.fillStyle = css([25, 12, 4], 0.55)
        g.fillRect(x, y, 1, ph)
        g.fillRect(x, y + ph - 1, len, 1)
        height.g.fillStyle = gray(215)
        height.g.fillRect(x, y, len, ph)
        height.g.fillStyle = gray(40)
        height.g.fillRect(x, y, 2, ph)
        height.g.fillRect(x, y + ph - 2, len, 2)
      }
      along += len
    }
  })
  grain(color.g, rand, 0.06)
  grain(height.g, rand, 0.1)
  return { map: color.el, height: height.el }
}

function paintLawn(r: TextureRecipe, material: Material, rand: () => number): Painted {
  const size = r.width
  const [color, height] = [canvas(size, size), canvas(size, size)]
  const base = rgb(material.color)
  color.g.fillStyle = css(base)
  color.g.fillRect(0, 0, size, size)
  height.g.fillStyle = gray(128)
  height.g.fillRect(0, 0, size, size)
  // patches of lusher or drier growth, wrapped round the edges
  for (let i = 0; i < 70; i++) {
    const [cx, cy, radius] = [rand() * size, rand() * size, 40 + rand() * 140]
    const tint: Rgb = rand() < 0.5 ? [base[0] * 1.2 + 14, base[1] * 1.1, base[2] * 0.8] : scaled(base, 0.8)
    const alpha = 0.08 + rand() * 0.14
    for (const x of [cx - size, cx, cx + size]) {
      for (const y of [cy - size, cy, cy + size]) {
        if (x + radius < 0 || x - radius > size || y + radius < 0 || y - radius > size) continue
        const patch = color.g.createRadialGradient(x, y, 0, x, y, radius)
        patch.addColorStop(0, css(tint, alpha))
        patch.addColorStop(1, css(tint, 0))
        color.g.fillStyle = patch
        color.g.fillRect(x - radius, y - radius, 2 * radius, 2 * radius)
      }
    }
  }
  // blades, seen from above as short strokes, in a few shades (one path each), their tips the highest
  color.g.lineCap = height.g.lineCap = 'round'
  color.g.lineWidth = height.g.lineWidth = 1.2
  // a blade near an edge is drawn again off the opposite one
  const again = (v: number, l: number) => (v < l ? [0, size] : v > size - l ? [0, -size] : [0])
  for (const shade of [0.6, 0.72, 0.85, 1, 1.15, 1.32]) {
    const path = new Path2D()
    for (let i = 0; i < 12000; i++) {
      const [x, y, a, l] = [rand() * size, rand() * size, rand() * Math.PI * 2, 2 + rand() * 5]
      for (const ox of again(x, l)) {
        for (const oy of again(y, l)) {
          path.moveTo(x + ox, y + oy)
          path.lineTo(x + ox + Math.cos(a) * l, y + oy + Math.sin(a) * l)
        }
      }
    }
    color.g.strokeStyle = css(scaled(base, shade), 0.55)
    color.g.stroke(path)
    height.g.strokeStyle = gray(60 + 140 * (shade - 0.6), 0.7)
    height.g.stroke(path)
  }
  grain(color.g, rand, 0.12)
  grain(height.g, rand, 0.3)
  return { map: color.el, height: height.el }
}

/** Mottling over a stone, a few soft darker and lighter blots, clipped to it. */
function mottle(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, rand: () => number) {
  g.save()
  g.beginPath()
  g.rect(x, y, w, h)
  g.clip()
  for (let i = 0; i < 4; i++) {
    const [cx, cy, r] = [x + rand() * w, y + rand() * h, (0.2 + rand() * 0.5) * Math.max(w, h)]
    const blot = g.createRadialGradient(cx, cy, 0, cx, cy, r)
    const c = rand() < 0.5 ? '0,0,0' : '255,255,255'
    blot.addColorStop(0, `rgba(${c},${0.05 + rand() * 0.08})`)
    blot.addColorStop(1, `rgba(${c},0)`)
    g.fillStyle = blot
    g.fillRect(x, y, w, h)
  }
  g.restore()
}

/** Square tiles in a grid with thin joints: stone each a different tone and mottled, porcelain all but even; a pool's lining under water. */
function paintTiles(r: TextureRecipe, material: Material, rand: () => number): Painted {
  const [color, height] = [canvas(r.width, r.height), canvas(r.width, r.height)]
  const base = rgb(material.color)
  const stone = natural(material)
  const n = r.width / Math.round((material.tile ?? 0.6) * TILES.px)
  const cell = r.width / n
  const j = material.water || !stone ? 2 : TILES.joint
  color.g.fillStyle = css(luminance(base) > 0.5 ? scaled(base, 0.82) : scaled(base, 1.25))
  color.g.fillRect(0, 0, r.width, r.height)
  height.g.fillStyle = gray(60)
  height.g.fillRect(0, 0, r.width, r.height)
  for (let row = 0; row < n; row++) {
    for (let col = 0; col < n; col++) {
      const [x, y, s] = [col * cell + j / 2, row * cell + j / 2, cell - j]
      // a pool's stones shift between greener and bluer as well as lighter and darker
      const tone = stone ? 0.78 + 0.4 * rand() : 0.97 + 0.06 * rand()
      const shift = material.water ? (rand() - 0.5) * 30 : 0
      const c = scaled(base, tone)
      color.g.fillStyle = css([c[0] - shift * 0.4, c[1] + shift * 0.2, c[2] + shift])
      color.g.fillRect(x, y, s, s)
      if (stone) mottle(color.g, x, y, s, s, rand)
      for (const [inset, v] of [[0, 170], [1, 215], [2, 235]] as const) {
        height.g.fillStyle = gray(v)
        height.g.fillRect(x + inset, y + inset, s - 2 * inset, s - 2 * inset)
      }
    }
  }
  if (material.water) {
    // light rippling over the stones, the water's surface
    color.g.lineWidth = 1.5
    for (let i = 0; i < 40; i++) {
      const [x0, y0, len] = [rand() * r.width, rand() * r.height, 30 + rand() * 80]
      color.g.strokeStyle = `rgba(255,255,255,${0.03 + rand() * 0.05})`
      color.g.beginPath()
      for (let t = 0; t <= len; t += 4) {
        const [x, y] = [(x0 + t) % r.width, y0 + Math.sin((t + x0) / 9) * 3]
        if (t) color.g.lineTo(x, y)
        else color.g.moveTo(x, y)
      }
      color.g.stroke()
    }
  }
  grain(color.g, rand, stone ? 0.1 : 0.03)
  grain(height.g, rand, stone ? 0.12 : 0.03)
  return { map: color.el, height: height.el }
}

/**
 * Stacked stone: courses of random height (filling the repeat's height) of stones of random length, each its own
 * tone, mottled, in dark recessed joints; a stone across the right edge carries on at the left.
 */
function paintStone(r: TextureRecipe, material: Material, rand: () => number): Painted {
  const [color, height] = [canvas(r.width, r.height), canvas(r.width, r.height)]
  const base = rgb(material.color)
  const j = STONE.joint
  color.g.fillStyle = css(scaled(base, 0.45))
  color.g.fillRect(0, 0, r.width, r.height)
  height.g.fillStyle = gray(20)
  height.g.fillRect(0, 0, r.width, r.height)
  const courses: number[] = []
  for (let left = r.height; left > 0; ) {
    const h = Math.round((0.08 + rand() * 0.12) * r.px)
    courses.push(left - h < 0.06 * r.px ? left : h)
    left -= courses[courses.length - 1]
  }
  let y = 0
  for (const h of courses) {
    let along = rand() * r.width
    const end = along + r.width
    while (along < end) {
      const len = Math.min(Math.round((0.18 + rand() * 0.42) * r.px), end - along)
      const tone = 0.72 + 0.45 * rand()
      const warm = (rand() - 0.5) * 24
      const look = [rand(), rand(), rand(), rand(), rand(), rand(), rand(), rand(), rand(), rand(), rand(), rand(), rand(), rand(), rand(), rand()]
      for (const x of wrapped(along % r.width, len, r.width)) {
        const c = scaled(base, tone)
        color.g.fillStyle = css([c[0] + warm, c[1] + warm * 0.5, c[2] - warm * 0.3])
        color.g.fillRect(x + j / 2, y + j / 2, len - j, h - j)
        let k = 0
        mottle(color.g, x + j / 2, y + j / 2, len - j, h - j, () => look[k++ % look.length])
        // the face bulges a little: higher in the middle than at its arrises
        for (const [inset, v] of [[0, 140], [2, 190], [4, 225], [7, 245]] as const) {
          height.g.fillStyle = gray(v)
          height.g.fillRect(x + j / 2 + inset, y + j / 2 + inset, len - j - 2 * inset, h - j - 2 * inset)
        }
      }
      along += len
    }
    y += h
  }
  grain(color.g, rand, 0.14)
  grain(height.g, rand, 0.2)
  return { map: color.el, height: height.el }
}

/** Standing seam: flat panels, each a touch different, with a raised seam down each edge catching the light on one side. */
function paintSeams(r: TextureRecipe, material: Material, rand: () => number): Painted {
  const [color, height] = [canvas(r.width, r.height), canvas(r.width, r.height)]
  const base = rgb(material.color)
  height.g.fillStyle = gray(60)
  height.g.fillRect(0, 0, r.width, r.height)
  for (let i = 0; i < SEAM.panels; i++) {
    const x = i * SEAM.panel
    color.g.fillStyle = css(scaled(base, 0.96 + 0.08 * rand()))
    color.g.fillRect(x, 0, SEAM.panel, r.height)
    // faint streaks down the panel, as rolled sheet has
    for (let s = 0; s < 10; s++) {
      color.g.fillStyle = rand() < 0.5 ? 'rgba(255,255,255,0.025)' : 'rgba(0,0,0,0.03)'
      color.g.fillRect(x + 4 + rand() * (SEAM.panel - 8), 0, 1 + rand() * 3, r.height)
    }
    // the seam: a lit flank, its top, a shaded flank; and as heights, a rib with sloping sides
    for (const [dx, k] of [[0, 1.45], [1, 1.25], [2, 1.05], [3, 0.6]] as const) {
      color.g.fillStyle = css(scaled(base, k))
      color.g.fillRect(x + dx, 0, 1, r.height)
    }
    for (const [dx, v] of [[-1, 140], [0, 220], [1, 255], [2, 255], [3, 220], [4, 140]] as const) {
      height.g.fillStyle = gray(v)
      height.g.fillRect((x + dx + r.width) % r.width, 0, 1, r.height)
    }
  }
  grain(color.g, rand, 0.03)
  return { map: color.el, height: height.el }
}

/** Packed earth: drier and damper patches, pebbles and crumbs, wrapped round the edges. */
function paintDirt(r: TextureRecipe, material: Material, rand: () => number): Painted {
  const size = r.width
  const [color, height] = [canvas(size, size), canvas(size, size)]
  const base = rgb(material.color)
  color.g.fillStyle = css(base)
  color.g.fillRect(0, 0, size, size)
  height.g.fillStyle = gray(128)
  height.g.fillRect(0, 0, size, size)
  for (let i = 0; i < 90; i++) {
    const [cx, cy, radius] = [rand() * size, rand() * size, 30 + rand() * 160]
    const dry = rand() < 0.55
    const tint: Rgb = dry ? scaled(base, 1.22) : scaled(base, 0.72)
    const alpha = 0.1 + rand() * 0.2
    for (const x of [cx - size, cx, cx + size]) {
      for (const y of [cy - size, cy, cy + size]) {
        if (x + radius < 0 || x - radius > size || y + radius < 0 || y - radius > size) continue
        const patch = color.g.createRadialGradient(x, y, 0, x, y, radius)
        patch.addColorStop(0, css(tint, alpha))
        patch.addColorStop(1, css(tint, 0))
        color.g.fillStyle = patch
        color.g.fillRect(x - radius, y - radius, 2 * radius, 2 * radius)
      }
    }
  }
  // pebbles, lighter on top, each a bump
  for (let i = 0; i < 2600; i++) {
    const [x, y, s] = [rand() * size, rand() * size, 1 + rand() * 2.5]
    color.g.fillStyle = css(scaled(base, 0.7 + rand() * 0.7), 0.8)
    color.g.fillRect(x, y, s, s)
    height.g.fillStyle = gray(200, 0.8)
    height.g.fillRect(x, y, s, s)
  }
  grain(color.g, rand, 0.16)
  grain(height.g, rand, 0.35)
  return { map: color.el, height: height.el }
}

/**
 * Solid timber along its grain: long wavy streaks darker and lighter, broad bands of tone, a few knots and checks,
 * the grey of weathered (reclaimed) oak in places. It runs along a texture's u, which faces set along each piece.
 */
function paintGrain(r: TextureRecipe, material: Material, rand: () => number): Painted {
  const [color, height] = [canvas(r.width, r.height), canvas(r.width, r.height)]
  const base = rgb(material.color)
  color.g.fillStyle = css(base)
  color.g.fillRect(0, 0, r.width, r.height)
  height.g.fillStyle = gray(200)
  height.g.fillRect(0, 0, r.width, r.height)
  // bands of tone across the grain, wrapped top to bottom
  for (let i = 0; i < 14; i++) {
    const [y, h] = [rand() * r.height, 6 + rand() * 30]
    const tint = rand() < 0.5 ? scaled(base, 0.82) : [base[0] * 1.08 + 8, base[1] * 1.08 + 8, base[2] * 1.12 + 10]
    color.g.fillStyle = css(tint as Rgb, 0.18 + rand() * 0.2)
    for (const yy of [y, y - r.height]) color.g.fillRect(0, yy, r.width, h)
  }
  // the grain: streaks the length of the repeat, waving gently (the ends meet as it repeats along)
  for (let i = 0; i < 70; i++) {
    const [y0, amp, phase, waves] = [rand() * r.height, 0.5 + rand() * 3, rand() * 6, 1 + Math.floor(rand() * 3)]
    const dark = rand() < 0.7
    color.g.strokeStyle = dark ? css([45, 30, 18], 0.08 + rand() * 0.2) : css([235, 220, 195], 0.05 + rand() * 0.1)
    color.g.lineWidth = 0.6 + rand() * 1.8
    height.g.strokeStyle = gray(dark ? 160 : 225, 0.6)
    height.g.lineWidth = color.g.lineWidth
    for (const g of [color.g, height.g]) {
      g.beginPath()
      for (let x = 0; x <= r.width; x += 8) {
        const y = y0 + Math.sin((x / r.width) * Math.PI * 2 * waves + phase) * amp
        if (x) g.lineTo(x, y)
        else g.moveTo(x, y)
      }
      g.stroke()
    }
  }
  // a few knots and checks
  for (let i = 0; i < 4; i++) {
    const [kx, ky] = [rand() * r.width, 20 + rand() * (r.height - 40)]
    const knot = color.g.createRadialGradient(kx, ky, 0, kx, ky, 12)
    knot.addColorStop(0, css([40, 25, 14], 0.6))
    knot.addColorStop(1, css([40, 25, 14], 0))
    color.g.fillStyle = knot
    color.g.beginPath()
    color.g.ellipse(kx, ky, 14, 6, 0, 0, Math.PI * 2)
    color.g.fill()
    color.g.strokeStyle = css([35, 22, 12], 0.5)
    color.g.lineWidth = 1
    color.g.beginPath()
    color.g.moveTo(kx + 14, ky)
    color.g.lineTo(kx + 40 + rand() * 60, ky + (rand() - 0.5) * 3)
    color.g.stroke()
  }
  grain(color.g, rand, 0.08)
  grain(height.g, rand, 0.1)
  return { map: color.el, height: height.el }
}

function paintChecker(r: TextureRecipe, material: Material): Painted {
  const [dark, light] = material.checker!.colors
  const { el, g } = canvas(r.width, r.height)
  g.fillStyle = light
  g.fillRect(0, 0, r.width, r.height)
  g.fillStyle = dark
  g.fillRect(0, 0, r.width / 2, r.height / 2)
  g.fillRect(r.width / 2, r.height / 2, r.width / 2, r.height / 2)
  return { map: el }
}

/**
 * A normal map from heights, `depth` m from black to white at `px` pixels per metre. Its green runs up the
 * texture, the canvas's y down (canvases are flipped as they are uploaded), and it wraps round the edges as the
 * texture repeats.
 */
function normalMap(heights: HTMLCanvasElement, depth: number, px: number): HTMLCanvasElement {
  const { width: w, height: h } = heights
  const src = heights.getContext('2d')!.getImageData(0, 0, w, h).data
  const out = canvas(w, h)
  const img = out.g.createImageData(w, h)
  const d = img.data
  // a height step of 1 (black to white) is `depth` m, over the 2 px between a pixel's neighbours
  const k = (depth * px) / 2
  const at = (x: number, y: number) => src[(((y + h) % h) * w + ((x + w) % w)) * 4] / 255
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const nx = -(at(x + 1, y) - at(x - 1, y)) * k
      const ny = (at(x, y + 1) - at(x, y - 1)) * k
      const l = Math.hypot(nx, ny, 1)
      const i = (y * w + x) * 4
      d[i] = (nx / l / 2 + 0.5) * 255
      d[i + 1] = (ny / l / 2 + 0.5) * 255
      d[i + 2] = (1 / l / 2 + 0.5) * 255
      d[i + 3] = 255
    }
  }
  out.g.putImageData(img, 0, 0)
  return out.el
}

export interface FinishTextures {
  map: THREE.Texture
  normalMap?: THREE.Texture
}

const cache = new Map<string, FinishTextures | null>()

/** A material's textures for 3-D, painted the first time they are asked for; null for one drawn in its flat colour. */
export function finishTextures(material: Material): FinishTextures | null {
  let textures = cache.get(material.id)
  if (textures !== undefined) return textures
  const r = textureRecipe(material)
  textures = null
  if (r) {
    const rand = seeded(material.id)
    const painted =
      r.kind === 'brick'
        ? paintBricks(r, material, rand)
        : r.kind === 'planks'
          ? paintPlanks(r, material, rand)
          : r.kind === 'grass'
            ? paintLawn(r, material, rand)
            : r.kind === 'seams'
              ? paintSeams(r, material, rand)
              : r.kind === 'tiles'
                ? paintTiles(r, material, rand)
                : r.kind === 'stone'
                  ? paintStone(r, material, rand)
                  : r.kind === 'dirt'
                    ? paintDirt(r, material, rand)
                    : r.kind === 'grain'
                      ? paintGrain(r, material, rand)
                      : paintChecker(r, material)
    const texture = (el: HTMLCanvasElement, colour: boolean) => {
      const t = new THREE.CanvasTexture(el)
      t.wrapS = t.wrapT = THREE.RepeatWrapping
      t.repeat.set(r.px / r.width, r.px / r.height)
      t.colorSpace = colour ? THREE.SRGBColorSpace : THREE.NoColorSpace
      t.anisotropy = 8
      // sharp edges between a checker's squares close up
      if (r.kind === 'checker') t.magFilter = THREE.NearestFilter
      return t
    }
    textures = { map: texture(painted.map, true) }
    if (painted.height && r.depth > 0) textures.normalMap = texture(normalMap(painted.height, r.depth, r.px), false)
  }
  cache.set(material.id, textures)
  return textures
}
