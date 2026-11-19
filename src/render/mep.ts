import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { KIND_COLORS, MEP, type MepKind, type MepPlan, type MepSystem } from '../model/mep'

/**
 * The MEP tab's lines in 3-D, drawn with the ghosted house (engine.ts, `xray`): each line a tube at its size (never
 * thinner than MEP.minRadius, so it shows from across the house) in its kind's colour, with a ball at each bend; a
 * ring where a line goes through a wall or under a foundation (its sleeve); a box of earth round each buried stretch
 * (its trench); a red ball at each clash. Plan x is x, plan y is z, heights are y, as in house.ts.
 */

export interface MepModel {
  root: THREE.Group
  dispose(): void
}

const world = (p: { x: number; y: number; z: number }) => new THREE.Vector3(p.x, p.z, p.y)
const UP = new THREE.Vector3(0, 1, 0)

/** A cylinder from a to b of radius r, as a geometry in place. */
function tube(a: THREE.Vector3, b: THREE.Vector3, r: number): THREE.BufferGeometry | null {
  const d = new THREE.Vector3().subVectors(b, a)
  const l = d.length()
  if (l < 1e-5) return null
  const g = new THREE.CylinderGeometry(r, r, l, 10, 1, true)
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, d.normalize()))
  g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2)
  return g
}

function ball(p: THREE.Vector3, r: number): THREE.BufferGeometry {
  return new THREE.SphereGeometry(r, 10, 6).translate(p.x, p.y, p.z)
}

/** Merged, without the attributes the pieces do not share. */
function merge(parts: THREE.BufferGeometry[]): THREE.BufferGeometry | null {
  if (!parts.length) return null
  for (const g of parts) for (const name of Object.keys(g.attributes)) if (name !== 'position' && name !== 'normal') g.deleteAttribute(name)
  const merged = mergeGeometries(parts.map((g) => (g.index ? g.toNonIndexed() : g)))
  for (const g of parts) g.dispose()
  return merged
}

export function buildMep(mep: MepPlan, show: (system: MepSystem) => boolean, opts: { trenches: boolean; clashes: boolean }): MepModel {
  const root = new THREE.Group()
  const geometries: THREE.BufferGeometry[] = []
  const materials: THREE.Material[] = []
  const add = (g: THREE.BufferGeometry | null, m: THREE.Material, order = 2) => {
    if (!g) return
    geometries.push(g)
    const mesh = new THREE.Mesh(g, m)
    // drawn after the ghosted house and the see-through ground
    mesh.renderOrder = order
    root.add(mesh)
  }
  const material = (params: THREE.MeshStandardMaterialParameters) => {
    const m = new THREE.MeshStandardMaterial(params)
    materials.push(m)
    return m
  }

  // the lines, a mesh per kind
  const byKind = new Map<MepKind, THREE.BufferGeometry[]>()
  for (const line of mep.lines) {
    if (!show(line.system)) continue
    const r = Math.max(line.radius, MEP.minRadius)
    const parts = byKind.get(line.kind) ?? []
    const pts = line.pts.map(world)
    for (let i = 1; i < pts.length; i++) {
      const t = tube(pts[i - 1], pts[i], r)
      if (t) parts.push(t)
    }
    for (const p of pts) parts.push(ball(p, r))
    byKind.set(line.kind, parts)
  }
  for (const [kind, parts] of byKind) add(merge(parts), material({ color: KIND_COLORS[kind], roughness: 0.45, metalness: 0.1, emissive: KIND_COLORS[kind], emissiveIntensity: 0.25 }))

  // the sleeves: a short pipe round the line where it goes through a wall or under a foundation, see-through
  const sleeves: THREE.BufferGeometry[] = []
  for (const c of mep.crossings) {
    if (!show(c.system)) continue
    const at = world(c.at)
    const half = new THREE.Vector3(c.dir.x, 0, c.dir.y).multiplyScalar(0.2)
    const t = tube(at.clone().sub(half), at.clone().add(half), c.radius)
    if (t) sleeves.push(t)
  }
  add(merge(sleeves), material({ color: '#e7e5e4', roughness: 0.6, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false }), 3)

  // the trenches: earth round each buried stretch, see-through
  if (opts.trenches) {
    const boxes: THREE.BufferGeometry[] = []
    for (const t of mep.trenches) {
      if (!show(t.system)) continue
      const a = new THREE.Vector3(t.a.x, 0, t.a.y)
      const b = new THREE.Vector3(t.b.x, 0, t.b.y)
      const l = a.distanceTo(b)
      if (l < 1e-3) continue
      const g = new THREE.BoxGeometry(l + t.width, t.depth + 0.1, t.width)
      g.rotateY(-Math.atan2(b.z - a.z, b.x - a.x))
      g.translate((a.x + b.x) / 2, -(t.depth + 0.1) / 2, (a.z + b.z) / 2)
      boxes.push(g)
    }
    add(merge(boxes), material({ color: '#8b6a47', roughness: 1, transparent: true, opacity: 0.22, depthWrite: false }), 1)
  }

  // the clashes: a red ball, bigger than any line
  if (opts.clashes) {
    const marks = mep.clashes.filter((c) => show(c.systems[0]) && show(c.systems[1])).map((c) => ball(world(c.at), 0.09))
    add(merge(marks), material({ color: '#ef4444', emissive: '#ef4444', emissiveIntensity: 0.6, transparent: true, opacity: 0.85 }), 4)
  }

  return {
    root,
    dispose() {
      for (const g of geometries) g.dispose()
      for (const m of materials) m.dispose()
    },
  }
}

