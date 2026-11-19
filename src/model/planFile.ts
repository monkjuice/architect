import type { z } from 'zod'
import { checkIntegrity, PLAN_FORMAT, PlanSchema, SCHEMA_VERSION, type Plan } from './plan'

/** One step upgrades a raw plan object from schemaVersion N (its key) to N + 1. */
export type Migration = (raw: Record<string, unknown>) => Record<string, unknown>

/** The size the service points of version 1 (tap, drain, well, biodigestor) take as equipment, m. */
const V1_POINTS: Record<string, { kind: string; size: [number, number] }> = {
  tap: { kind: 'tap', size: [0.1, 0.1] },
  drain: { kind: 'floor-drain', size: [0.2, 0.2] },
  well: { kind: 'well', size: [0.8, 0.8] },
  biodigestor: { kind: 'biodigestor', size: [1.2, 1.2] },
}

/**
 * Upgrade steps, keyed by the version they upgrade from. When the format changes: bump SCHEMA_VERSION, add the
 * N → N + 1 step here, and add a test that loads a version-N file.
 *
 * 1 → 2: the Plumbing tab's service points became equipment with a footprint (`layer.points` → `layer.services`,
 * each at its catalogue size), and the machine room and water heater settings (`plan.plumbing`) gave way to the
 * equipment put down on the plan, so they are dropped.
 *
 * 2 → 3: heating moved from the Plumbing tab to the HVAC tab, so its pipe material moves from
 * `plan.plumbing.materials.heating` to `plan.hvac.materials.heating`.
 *
 * 3 → 4: Gas settings and optional manual routes were added. Both fields are optional, so old plans need no
 * data transformation beyond advancing the version.
 */
export const MIGRATIONS: Readonly<Record<number, Migration>> = {
  1: (raw) => {
    const { plumbing: _dropped, ...plan } = raw
    const layers = Array.isArray(raw.layers) ? raw.layers : []
    return {
      ...plan,
      layers: layers.map((layer) => {
        if (!isRecord(layer)) return layer
        const { points, ...rest } = layer
        if (!isRecord(points)) return rest
        const services: Record<string, unknown> = {}
        for (const [id, point] of Object.entries(points)) {
          if (!isRecord(point) || typeof point.kind !== 'string') continue
          const info = V1_POINTS[point.kind]
          if (info) services[id] = { kind: info.kind, at: point.at, angle: 0, width: info.size[0], depth: info.size[1], ...(point.hot ? { hot: true } : {}) }
        }
        return { ...rest, services }
      }),
    }
  },
  2: (raw) => {
    const plumbing = isRecord(raw.plumbing) ? raw.plumbing : undefined
    const materials = plumbing && isRecord(plumbing.materials) ? plumbing.materials : undefined
    if (!plumbing || !materials || !('heating' in materials)) return raw
    const { heating, ...water } = materials
    const nextPlumbing = { ...plumbing, materials: water }
    if (!Object.keys(water).length) delete (nextPlumbing as Record<string, unknown>).materials
    const plan: Record<string, unknown> = { ...raw, plumbing: nextPlumbing, hvac: { materials: { heating } } }
    if (!Object.keys(nextPlumbing).length) delete plan.plumbing
    return plan
  },
  3: (raw) => raw,
}

export type ParseResult = { ok: true; plan: Plan; migratedFrom?: number } | { ok: false; errors: string[] }

export function parsePlanText(text: string): ParseResult {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch (error) {
    return fail(`The file is not valid JSON: ${(error as Error).message}`)
  }
  return parsePlan(raw)
}

/** Validates an untrusted value as a plan, upgrading older schema versions first. */
export function parsePlan(raw: unknown, migrations: Readonly<Record<number, Migration>> = MIGRATIONS): ParseResult {
  if (!isRecord(raw) || raw.format !== PLAN_FORMAT) return fail(`Not an Architect plan: expected "format": "${PLAN_FORMAT}".`)
  const version = raw.schemaVersion
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) return fail('The plan has no valid "schemaVersion".')
  if (version > SCHEMA_VERSION) {
    return fail(`This plan uses schema version ${version}; this app understands up to version ${SCHEMA_VERSION}. Update the app to open it.`)
  }
  let current = raw
  for (let v = version; v < SCHEMA_VERSION; v++) {
    const step = migrations[v]
    if (!step) return fail(`No migration from schema version ${v} to ${v + 1}.`)
    current = { ...step(current), schemaVersion: v + 1 }
  }
  const parsed = PlanSchema.safeParse(current)
  if (!parsed.success) return { ok: false, errors: parsed.error.issues.map((issue) => describeIssue(issue, current)) }
  const errors = checkIntegrity(parsed.data)
  if (errors.length) return { ok: false, errors }
  return { ok: true, plan: parsed.data, migratedFrom: version < SCHEMA_VERSION ? version : undefined }
}

/** File contents: schema key order, numbers rounded to 0.1 mm (image transforms keep full precision). */
export function serializePlan(plan: Plan): string {
  const clean = PlanSchema.parse(plan)
  const layers = clean.layers.map((layer) => ({
    ...layer,
    vertices: Object.fromEntries(Object.entries(layer.vertices).map(([id, v]) => [id, { x: round(v.x), y: round(v.y) }])),
    openings: Object.fromEntries(Object.entries(layer.openings).map(([id, o]) => [id, { ...o, offset: round(o.offset) }])),
    roofs: Object.fromEntries(Object.entries(layer.roofs).map(([id, r]) => [id, { ...r, outline: r.outline.map((p) => ({ x: round(p.x), y: round(p.y) })) }])),
    furniture: Object.fromEntries(
      Object.entries(layer.furniture).map(([id, f]) => [id, 'at' in f ? { ...f, at: { x: round(f.at.x), y: round(f.at.y) } } : { ...f, offset: round(f.offset) }]),
    ),
    electrical: Object.fromEntries(
      Object.entries(layer.electrical).map(([id, e]) => {
        const at = { x: round(e.at.x), y: round(e.at.y) }
        return [id, 'route' in e && e.route ? { ...e, at, route: e.route.map((p) => ({ x: round(p.x), y: round(p.y) })) } : { ...e, at }]
      }),
    ),
    services: Object.fromEntries(Object.entries(layer.services).map(([id, s]) => [id, { ...s, at: { x: round(s.at.x), y: round(s.at.y) } }])),
  }))
  return `${JSON.stringify({ ...clean, layers }, null, 2)}\n`
}

const round = (v: number) => Math.round(v * 1e4) / 1e4

function fail(message: string): ParseResult {
  return { ok: false, errors: [message] }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

/** "layers[0] (L1).vertices.v3.x: Invalid input…": the path, with ids of list items to find them in the file. */
function describeIssue(issue: z.core.$ZodIssue, root: unknown): string {
  let where = ''
  let node: unknown = root
  for (const key of issue.path) {
    if (typeof key === 'number') {
      where += `[${key}]`
      node = Array.isArray(node) ? node[key] : undefined
      if (isRecord(node) && typeof node.id === 'string') where += ` (${node.id})`
    } else {
      where += where ? `.${String(key)}` : String(key)
      node = isRecord(node) ? node[key as string] : undefined
    }
  }
  return where ? `${where}: ${issue.message}` : issue.message
}
