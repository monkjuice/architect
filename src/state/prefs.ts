import { useSyncExternalStore } from 'react'
import { styleInfo, styleKey } from '../model/openings'
import type { OpeningKind, OpeningStyle } from '../model/plan'
import { MAX_STOREY } from '../model/storeys'
import { SEASONS, type Season } from '../model/sun'
import { LANGUAGES, type Lang } from '../model/takeoffText'

/** Editor preferences: per browser, not part of the plan file. */
export interface Prefs {
  grid: boolean
  /** Length labels on every line. */
  lengths: boolean
  /** Snap to existing points and lines (Alt turns it off while held). */
  snap: boolean
  /** Show the base plan's known lengths even when no base-plan tool is active. */
  calibration: boolean
  /** Walls drawn at their thickness; off, every line is a thin line (to trace over the base plan). */
  thickWalls: boolean
  /** Area labels on the plan: their names, and their sizes under them. */
  areaNames: boolean
  areaSizes: boolean
  /** Wall and floor materials on the plan; off, floors in their layer's tint and walls plain. */
  materials: boolean
  /** Roofs in the Exterior tab's 3-D view; off, it looks into the rooms. */
  roofs: boolean
  /** The top floor the Exterior tab shows (0 the ground floor); the floors above it are hidden, to look into it. */
  topStorey: number
  /** Widths new doors and windows get, by style ("door:double"…), in m: the last one typed for each style. */
  widths: Record<string, number>
  /** Ids of the panel sections that are folded away. */
  collapsed: string[]
  sun: SunPrefs
  /** The language the Materials tab's list is in. */
  language: Lang
}

/** The sun as the user plays with it: a view setting, so it is per browser and not in the plan. */
export interface SunPrefs {
  visible: boolean
  season: Season
  /** Clock hours, 0 to 24. */
  time: number
  /** 0 clear to 1 overcast: shadows and the sun fade with it. */
  cloudiness: number
  /** Shadows of the walls on the ground, each as tall as its wall (there are no roofs yet). */
  shadows: boolean
}

const SUN_DEFAULTS: SunPrefs = { visible: false, season: 'dec', time: 15, cloudiness: 0, shadows: true }

const KEY = 'architect:prefs'
const DEFAULTS: Prefs = {
  grid: true,
  lengths: true,
  snap: true,
  calibration: false,
  thickWalls: true,
  areaNames: true,
  areaSizes: true,
  materials: true,
  roofs: true,
  topStorey: MAX_STOREY,
  widths: {},
  collapsed: [],
  sun: SUN_DEFAULTS,
  language: 'en',
}

let prefs: Prefs = load()
const listeners = new Set<() => void>()

function load(): Prefs {
  try {
    const stored = JSON.parse(localStorage.getItem(KEY) ?? 'null') as (Partial<Prefs> & { doorWidth?: unknown }) | null
    if (!stored) return DEFAULTS
    const flag = (key: 'grid' | 'lengths' | 'snap' | 'calibration' | 'thickWalls' | 'areaNames' | 'areaSizes' | 'materials' | 'roofs') =>
      typeof stored[key] === 'boolean' ? stored[key] : DEFAULTS[key]
    const widths: Record<string, number> = {}
    for (const [key, value] of Object.entries(stored.widths ?? {})) if (typeof value === 'number' && value > 0) widths[key] = value
    // before styles there was one door width: it was a single door's
    if (typeof stored.doorWidth === 'number' && stored.doorWidth > 0) widths['door:single'] ??= stored.doorWidth
    const collapsed = Array.isArray(stored.collapsed) ? stored.collapsed.filter((id) => typeof id === 'string') : []
    return {
      grid: flag('grid'),
      lengths: flag('lengths'),
      snap: flag('snap'),
      calibration: flag('calibration'),
      thickWalls: flag('thickWalls'),
      areaNames: flag('areaNames'),
      areaSizes: flag('areaSizes'),
      materials: flag('materials'),
      roofs: flag('roofs'),
      topStorey: Number.isInteger(stored.topStorey) && stored.topStorey! >= 0 && stored.topStorey! <= MAX_STOREY ? stored.topStorey! : DEFAULTS.topStorey,
      widths,
      collapsed,
      sun: loadSun(stored.sun),
      language: LANGUAGES.includes(stored.language as Lang) ? (stored.language as Lang) : DEFAULTS.language,
    }
  } catch {
    return DEFAULTS
  }
}

function loadSun(stored: Partial<SunPrefs> | undefined): SunPrefs {
  const s = stored ?? {}
  const num = (v: unknown, lo: number, hi: number, fallback: number) => (typeof v === 'number' && v >= lo && v <= hi ? v : fallback)
  return {
    visible: typeof s.visible === 'boolean' ? s.visible : SUN_DEFAULTS.visible,
    season: SEASONS.includes(s.season as Season) ? (s.season as Season) : SUN_DEFAULTS.season,
    time: num(s.time, 0, 24, SUN_DEFAULTS.time),
    cloudiness: num(s.cloudiness, 0, 1, SUN_DEFAULTS.cloudiness),
    shadows: typeof s.shadows === 'boolean' ? s.shadows : SUN_DEFAULTS.shadows,
  }
}

export function setSun(patch: Partial<SunPrefs>) {
  setPrefs({ sun: { ...prefs.sun, ...patch } })
}

/** The width the next door or window of a style gets: the last one typed, or the style's usual width. */
export const openingWidth = (p: Prefs, kind: OpeningKind, style: OpeningStyle): number => p.widths[styleKey(kind, style)] ?? styleInfo(kind, style).width

export function getPrefs(): Prefs {
  return prefs
}

export function setPrefs(patch: Partial<Prefs>) {
  prefs = { ...prefs, ...patch }
  try {
    localStorage.setItem(KEY, JSON.stringify(prefs))
  } catch {
    // storage unavailable: keep the preference for this session only
  }
  for (const listener of listeners) listener()
}

export function usePrefs(): Prefs {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => prefs,
  )
}
