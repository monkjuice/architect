import type { z } from 'zod'
import { checkIntegrity, PLAN_FORMAT, PlanSchema, SCHEMA_VERSION, type Plan } from './plan'

/** One step upgrades a raw plan object from schemaVersion N (its key) to N + 1. */
export type Migration = (raw: Record<string, unknown>) => Record<string, unknown>

/**
 * Upgrade steps, keyed by the version they upgrade from. Version 1 is the first format, so there are none
 * yet. When the format changes: bump SCHEMA_VERSION, add the N → N + 1 step here, and add a test that loads
 * a version-N file.
 */
export const MIGRATIONS: Readonly<Record<number, Migration>> = {}

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
