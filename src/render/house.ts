import * as THREE from 'three'
import type { Solid, SolidMaterial } from '../model/solids'

/**
 * The house's solids as three.js meshes. Plan x is x, plan y (down on screen) is z, and heights are y, all in m,
 * so the top view looks like the plan. A basic palette stands in until materials are picked per surface; the
 * colours are approximate.
 */

const PALETTE: Record<SolidMaterial, THREE.MeshStandardMaterialParameters> = {
  facade: { color: '#ece8df', roughness: 0.9 },
  interior: { color: '#f4f2ed', roughness: 0.95 },
  roof: { color: '#c9c8c3', roughness: 0.85 },
  frame: { color: '#2a2b2e', roughness: 0.4, metalness: 0.5 },
  glass: { color: '#a8c8d8', roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.32, depthWrite: false },
  door: { color: '#a77a4f', roughness: 0.6 },
  gate: { color: '#4a4c4f', roughness: 0.5, metalness: 0.5 },
  floor: { color: '#d9d4cb', roughness: 0.45 },
  paving: { color: '#b4aea4', roughness: 0.9 },
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
    const geometry = prism(solid)
    if (!geometry) continue
    geometries.push(geometry)
    let material = materials.get(solid.material)
    if (!material) materials.set(solid.material, (material = new THREE.MeshStandardMaterial(PALETTE[solid.material])))
    const mesh = new THREE.Mesh(geometry, material)
    // glass lets the sun through; nothing stands over a flat roof, and roofs that shadowed each other drew dark
    // lines where the slabs of neighbouring rooms meet
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

/** A solid's outline extruded from its bottom to its top; null when it encloses nothing. */
function prism(solid: Solid): THREE.BufferGeometry | null {
  const ring = (pts: readonly { x: number; y: number }[]) => pts.map((p) => new THREE.Vector2(p.x, p.y))
  const outline = ring(solid.outline)
  if (Math.abs(THREE.ShapeUtils.area(outline)) < 1e-6) return null
  const shape = new THREE.Shape(outline)
  for (const hole of solid.holes) shape.holes.push(new THREE.Path(ring(hole)))
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: solid.top - solid.bottom, bevelEnabled: false })
  // the shape lies in x/y and is extruded along +z: turning it about x puts plan y on z and the extrusion downwards
  geometry.rotateX(Math.PI / 2)
  geometry.translate(0, solid.top, 0)
  return geometry
}
