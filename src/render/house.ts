import * as THREE from 'three'
import type { Face, Solid, SolidMaterial, Vec3 } from '../model/solids'

/**
 * The house's solids as three.js meshes. Plan x is x, plan y (down on screen) is z, and heights are y, all in m,
 * so the top view looks like the plan. A basic palette stands in until materials are picked per surface; the
 * colours are approximate.
 */

const PALETTE: Record<SolidMaterial, THREE.MeshStandardMaterialParameters> = {
  facade: { color: '#ece8df', roughness: 0.9 },
  interior: { color: '#f4f2ed', roughness: 0.95 },
  roof: { color: '#b8644a', roughness: 0.85 },
  slab: { color: '#c9c8c3', roughness: 0.85 },
  frame: { color: '#2a2b2e', roughness: 0.4, metalness: 0.5 },
  glass: { color: '#a8c8d8', roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.32, depthWrite: false },
  door: { color: '#a77a4f', roughness: 0.6 },
  gate: { color: '#4a4c4f', roughness: 0.5, metalness: 0.5 },
  floor: { color: '#d9d4cb', roughness: 0.45 },
  paving: { color: '#b4aea4', roughness: 0.9 },
  stone: { color: '#e3d9c4', roughness: 0.8 },
  metal: { color: '#2d3033', roughness: 0.45, metalness: 0.7 },
  brick: { color: '#9a5038', roughness: 0.9 },
  soot: { color: '#1b1917', roughness: 1 },
  ceramic: { color: '#f3f2ee', roughness: 0.15, metalness: 0.05 },
  wood: { color: '#9a6a44', roughness: 0.6 },
  fabric: { color: '#8a97b0', roughness: 1 },
}

export const GRASS = '#6d8f4e'

export interface HouseModel {
  root: THREE.Group
  /** Around everything built; a patch of ground at the origin when nothing is. */
  box: THREE.Box3
  dispose(): void
}

export function buildHouse(solids: readonly Solid[]): HouseModel {
  const root = new THREE.Group()
  const materials = new Map<SolidMaterial, THREE.Material>()
  const geometries: THREE.BufferGeometry[] = []
  for (const solid of solids) {
    const geometry = solidGeometry(solid)
    if (!geometry) continue
    geometries.push(geometry)
    let material = materials.get(solid.material)
    if (!material) materials.set(solid.material, (material = new THREE.MeshStandardMaterial(PALETTE[solid.material])))
    const mesh = new THREE.Mesh(geometry, material)
    // glass lets the sun through; nothing stands over a flat roof, and roofs that shadowed each other drew dark
    // lines where the slabs of neighbouring rooms met
    mesh.castShadow = solid.material !== 'glass'
    mesh.receiveShadow = solid.kind !== 'roof'
    mesh.userData.ref = solid.ref
    root.add(mesh)
  }
  const box = new THREE.Box3().setFromObject(root)
  if (box.isEmpty()) box.set(new THREE.Vector3(-5, 0, -5), new THREE.Vector3(5, 3, 5))
  return {
    root,
    box,
    dispose() {
      for (const g of geometries) g.dispose()
      for (const m of materials.values()) m.dispose()
    },
  }
}

/** Plan and height to three.js: x, height, plan y. */
const world = (p: Vec3) => new THREE.Vector3(p.x, p.z, p.y)

/** Every face of a solid, triangulated in its own plane, flat-shaded; null when it has no area. */
function solidGeometry(solid: Solid): THREE.BufferGeometry | null {
  const positions: number[] = []
  const normals: number[] = []
  for (const face of solid.faces) addFace(face, positions, normals)
  if (!positions.length) return null
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3))
  return geometry
}

function addFace(face: Face, positions: number[], normals: number[]) {
  const n = world(face.normal)
  // two axes in the face's plane to triangulate it in
  const u = new THREE.Vector3().crossVectors(n, Math.abs(n.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0)).normalize()
  const v = new THREE.Vector3().crossVectors(n, u)
  const flat = (ring: Vec3[]) => ring.map((p) => world(p)).map((q) => ({ q, uv: new THREE.Vector2(q.dot(u), q.dot(v)) }))
  const outer = flat(face.pts)
  const holes = face.holes.map(flat)
  if (outer.length < 3 || Math.abs(THREE.ShapeUtils.area(outer.map((p) => p.uv))) < 1e-8) return
  const points = [...outer, ...holes.flat()]
  const triangles = THREE.ShapeUtils.triangulateShape(
    outer.map((p) => p.uv),
    holes.map((h) => h.map((p) => p.uv)),
  )
  const e1 = new THREE.Vector3()
  const e2 = new THREE.Vector3()
  for (const [i, j, k] of triangles) {
    const [a, b, c] = [points[i].q, points[j].q, points[k].q]
    // wind each triangle to face the way the face does
    const facing = e1.subVectors(b, a).cross(e2.subVectors(c, a)).dot(n) >= 0
    for (const p of facing ? [a, b, c] : [a, c, b]) {
      positions.push(p.x, p.y, p.z)
      normals.push(n.x, n.y, n.z)
    }
  }
}
