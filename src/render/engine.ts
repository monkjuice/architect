import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { findMaterial } from '../model/materials'
import type { Site } from '../model/plan'
import type { Solid } from '../model/solids'
import { planAngle, planDirection, SEASON_DAY, sunPosition, type Season } from '../model/sun'
import { buildHouse, GRASS, type HouseModel } from './house'
import { finishTextures, textureRecipe } from './textures'

/**
 * The Exterior tab's 3-D view: the house on a lawn, lit by the plan's sun with real shadows, orbit controls
 * (frames drawn on demand), camera presets and image capture. Adapted from the Forge H1 planner's render engine.
 */

export type CameraPreset = 'aerial' | 'top' | 'north' | 'east' | 'south' | 'west'

/** The sun as the plan's Sun section sets it. */
export interface SunSetting {
  season: Season
  /** Clock hours. */
  time: number
  /** 0 clear to 1 overcast. */
  cloudiness: number
}

/** Where the camera is and what it looks at, to come back to the same view when the tab opens again. */
export interface CameraPose {
  position: THREE.Vector3
  target: THREE.Vector3
}

/**
 * The MEP tab's way of showing the house (`createExteriorEngine`'s `xray`): the building faded to a ghost so what runs
 * in its walls and floors shows, what `keep` says solid (the equipment), and the ground see-through, with the camera
 * free to go under it, to see what is buried.
 */
export interface XRay {
  /** How opaque the building is, 0–1. */
  ghost: number
  /** How opaque the ground is, 0–1. */
  ground: number
  /** Solid kinds drawn solid, not ghosted. */
  keep: readonly string[]
  /** The ground's colour (plain, no lawn), and the background's, in place of the sky. */
  groundColor: string
  background: string
}

export interface ExteriorEngine {
  show(solids: readonly Solid[]): void
  /** Something drawn with the house (the MEP tab's lines), replacing what was there; null for nothing. */
  overlay(object: THREE.Object3D | null): void
  /** Looks at a point (plan x, y and height z), from `distance` away, above and to the south-west of it. */
  focus(at: { x: number; y: number; z: number }, distance?: number): void
  light(site: Site, sun: SunSetting): void
  view(preset: CameraPreset, site: Site): void
  /** Where the camera is; undefined until a first view has been framed. */
  pose(): CameraPose | undefined
  /** A PNG of the current view at `scale` times the screen resolution. */
  snapshot(scale?: number): Promise<Blob | null>
  dispose(): void
}

/** Compass bearings of the facade views. */
const BEARINGS: Record<'north' | 'east' | 'south' | 'west', number> = { north: 0, east: 90, south: 180, west: 270 }

const SKY = { day: new THREE.Color('#9fc3e4'), dusk: new THREE.Color('#e7b98f'), night: new THREE.Color('#141a26') }

export function createExteriorEngine(host: HTMLElement, start?: CameraPose, xray?: XRay): ExteriorEngine {
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap
  host.appendChild(renderer.domElement)

  const scene = new THREE.Scene()
  const pmrem = new THREE.PMREMGenerator(renderer)
  const environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
  scene.environment = environment
  scene.environmentIntensity = 0.25
  const background = new THREE.Color()
  scene.background = background

  const sun = new THREE.DirectionalLight('#fff3e0', 3)
  sun.castShadow = true
  sun.shadow.mapSize.set(4096, 4096)
  sun.shadow.bias = -0.0004
  sun.shadow.normalBias = 0.03
  scene.add(sun, sun.target)
  const sky = new THREE.HemisphereLight('#cfe2f5', '#5b6b45', 0.6)
  scene.add(sky)

  // the ground in the lawn's texture (its own copies, to repeat over however big the ground is drawn), so a lot laid
  // to lawn runs on into it
  const lawn = findMaterial('grass')!
  const lawnTextures = finishTextures(lawn)
  const lawnRecipe = textureRecipe(lawn)
  const groundMaps = lawnTextures ? [lawnTextures.map.clone(), ...(lawnTextures.normalMap ? [lawnTextures.normalMap.clone()] : [])] : []
  let groundGeometry: THREE.BufferGeometry = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2)
  const groundMaterial = new THREE.MeshStandardMaterial(
    groundMaps.length ? { color: '#ffffff', map: groundMaps[0], normalMap: groundMaps[1] ?? null, roughness: 1 } : { color: GRASS, roughness: 1 },
  )
  if (xray) Object.assign(groundMaterial, { transparent: true, opacity: xray.ground, depthWrite: false, map: null, normalMap: null, color: new THREE.Color(xray.groundColor) })
  const ground = new THREE.Mesh(groundGeometry, groundMaterial)
  ground.receiveShadow = true
  // under the ground seen through it, the buried lines draw over it
  if (xray) ground.renderOrder = 1
  scene.add(ground)
  let extra: THREE.Object3D | null = null

  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 3000)
  const controls = new OrbitControls(camera, renderer.domElement)
  controls.enableDamping = true
  controls.dampingFactor = 0.2
  controls.minDistance = 0.5
  controls.maxDistance = 600
  // stay above the ground (x-ray: go under it too, to see what is buried)
  controls.maxPolarAngle = xray ? Math.PI - 0.02 : Math.PI / 2 - 0.02
  controls.screenSpacePanning = true
  // the wheel is ours (see zoom): the controls' own zoom crawls to a stop as it nears the point it orbits
  controls.enableZoom = false

  /**
   * The wheel zooms towards what is under the cursor, a share of the way there per notch but never less than
   * ZOOM.step, so it keeps going close up, on through that point when it gets there; the point orbited stays at
   * least ZOOM.ahead in front, so orbiting and panning never shrink to nothing, and panning keeps the speed it has
   * ZOOM.pan away.
   */
  const ZOOM = { share: 0.15, step: 0.4, ahead: 3, pan: 10 }
  const raycaster = new THREE.Raycaster()
  const zoom = (event: WheelEvent) => {
    event.preventDefault()
    const notches = THREE.MathUtils.clamp(event.deltaMode === 1 ? event.deltaY / 3 : event.deltaMode === 2 ? event.deltaY * 3 : event.deltaY / 100, -4, 4)
    if (!notches) return
    const rect = renderer.domElement.getBoundingClientRect()
    raycaster.setFromCamera(new THREE.Vector2(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1), camera)
    const hit = raycaster.intersectObjects(model ? [model.root, ground] : [ground], true)[0]
    const toward = hit ? hit.point : raycaster.ray.at(camera.position.distanceTo(controls.target), new THREE.Vector3())
    const d = camera.position.distanceTo(toward)
    const along = Math.abs(notches)
    if (notches < 0) {
      const move = Math.max(d * (1 - Math.pow(1 - ZOOM.share, along)), ZOOM.step * along)
      if (move >= d - 0.2) {
        // there already: fly on, through it
        const forward = raycaster.ray.direction.clone().multiplyScalar(move)
        camera.position.add(forward)
        controls.target.add(forward)
      } else {
        const k = (d - move) / d
        camera.position.sub(toward).multiplyScalar(k).add(toward)
        controls.target.sub(toward).multiplyScalar(k).add(toward)
      }
    } else {
      const k = (d + Math.max(d * (Math.pow(1 / (1 - ZOOM.share), along) - 1), ZOOM.step * along)) / Math.max(d, 1e-6)
      camera.position.sub(toward).multiplyScalar(k).add(toward)
      controls.target.sub(toward).multiplyScalar(k).add(toward)
    }
    camera.position.y = Math.max(camera.position.y, xray ? -20 : 0.3)
    keepAhead()
    controls.update()
    request()
  }
  /** The point orbited at least ZOOM.ahead in front, along the way the camera looks (the view does not move). */
  const keepAhead = () => {
    const look = new THREE.Vector3().subVectors(controls.target, camera.position)
    if (look.length() < ZOOM.ahead) controls.target.copy(camera.position).addScaledVector(look.normalize(), ZOOM.ahead)
  }
  renderer.domElement.addEventListener('wheel', zoom, { passive: false })

  let model: HouseModel | undefined
  /** Where the sun shines from, as a unit vector (y up). */
  const toSun = new THREE.Vector3(0, 1, 0)
  /** A preset waiting for the model and a laid-out canvas: framing needs the real aspect ratio. */
  let pending: { preset: CameraPreset; site?: Site } | undefined = start ? undefined : { preset: 'aerial' }
  if (start) {
    camera.position.copy(start.position)
    controls.target.copy(start.target)
    controls.update()
  }

  let frame = 0
  const draw = () => {
    frame = 0
    // panning moves by the distance to the point orbited: close up, no slower than it would ZOOM.pan away
    controls.panSpeed = Math.max(1, ZOOM.pan / Math.max(0.1, camera.position.distanceTo(controls.target)))
    if (controls.update()) request()
    renderer.render(scene, camera)
  }
  const request = () => {
    if (!frame) frame = requestAnimationFrame(draw)
  }
  controls.addEventListener('change', request)

  const resize = () => {
    const { clientWidth: w, clientHeight: h } = host
    if (!w || !h) return
    renderer.setSize(w, h)
    camera.aspect = w / h
    camera.updateProjectionMatrix()
    if (pending) view(pending.preset, pending.site)
    request()
  }

  /** Points the sun at the house from its direction, with a shadow box that holds the house and long shadows. */
  const aim = () => {
    if (!model) return
    const center = model.box.getCenter(new THREE.Vector3())
    const reach = model.box.getSize(new THREE.Vector3()).length() / 2 + 2
    sun.target.position.copy(center)
    sun.position.copy(center).addScaledVector(toSun, reach * 3)
    Object.assign(sun.shadow.camera, { left: -reach, right: reach, top: reach, bottom: -reach, near: 0.5, far: reach * 3 + 120 })
    sun.shadow.camera.updateProjectionMatrix()
  }

  function view(preset: CameraPreset, site?: Site) {
    if (!model || !host.clientWidth || !host.clientHeight) {
      pending = { preset, site }
      return
    }
    pending = undefined
    camera.aspect = host.clientWidth / host.clientHeight
    camera.updateProjectionMatrix()
    let direction: THREE.Vector3
    if (preset === 'aerial') direction = new THREE.Vector3(-0.6, 0.75, 1)
    else if (preset === 'top') direction = new THREE.Vector3(0, 1, 0.001)
    else {
      // from that side of the house, a little above eye level; the site says where north is on the plan
      const d = planDirection(BEARINGS[preset] + (site?.north ?? 0))
      direction = new THREE.Vector3(d.x, 0.16, d.y)
    }
    direction.normalize()
    const center = model.box.getCenter(new THREE.Vector3())
    controls.target.copy(center)
    camera.position.copy(center).addScaledVector(direction, fitDistance(camera, model.box, direction))
    controls.update()
    request()
  }

  const observer = new ResizeObserver(resize)
  observer.observe(host)
  resize()

  return {
    show(solids) {
      model?.root.removeFromParent()
      model?.dispose()
      model = buildHouse(solids)
      if (xray) ghost(model.root, xray)
      scene.add(model.root)
      const size = model.box.getSize(new THREE.Vector3())
      const center = model.box.getCenter(new THREE.Vector3())
      // the ground: a square round the house, open over its pools, mapped in metres (as the house's faces are)
      const extent = Math.max(150, 5 * Math.max(size.x, size.z))
      const square = new THREE.Shape([
        new THREE.Vector2(center.x - extent / 2, -(center.z - extent / 2)),
        new THREE.Vector2(center.x + extent / 2, -(center.z - extent / 2)),
        new THREE.Vector2(center.x + extent / 2, -(center.z + extent / 2)),
        new THREE.Vector2(center.x - extent / 2, -(center.z + extent / 2)),
      ])
      for (const hole of model.holes) square.holes.push(new THREE.Path(hole.map((p) => new THREE.Vector2(p.x, -p.y))))
      groundGeometry.dispose()
      // shape (x, −y) turned flat: plan x is x, plan y is z, facing up
      groundGeometry = new THREE.ShapeGeometry(square).rotateX(-Math.PI / 2)
      ground.geometry = groundGeometry
      if (lawnRecipe) for (const t of groundMaps) t.repeat.setScalar(lawnRecipe.px / lawnRecipe.width)
      aim()
      if (pending) view(pending.preset, pending.site)
      request()
    },
    light(site, setting) {
      const pos = sunPosition(site, SEASON_DAY[setting.season], setting.time)
      const d = planDirection(planAngle(site, pos.azimuth))
      const altitude = THREE.MathUtils.degToRad(pos.altitude)
      toSun.set(d.x * Math.cos(altitude), Math.sin(altitude), d.y * Math.cos(altitude)).normalize()
      const clear = 1 - setting.cloudiness
      // daylight comes up over the sun's first ten degrees; clouds soften the sun and the shadows, not the sky
      const day = THREE.MathUtils.clamp(pos.altitude / 10, 0, 1)
      sun.visible = pos.altitude > 0
      sun.intensity = 3.2 * day * (0.2 + 0.8 * clear)
      sun.shadow.intensity = 0.35 + 0.65 * clear
      sky.intensity = 0.15 + 0.75 * THREE.MathUtils.clamp((pos.altitude + 6) / 16, 0, 1)
      background.copy(SKY.night).lerp(SKY.dusk, THREE.MathUtils.clamp((pos.altitude + 6) / 8, 0, 1)).lerp(SKY.day, day)
      if (xray) background.set(xray.background)
      aim()
      request()
    },
    view,
    overlay(object) {
      extra?.removeFromParent()
      extra = object
      if (object) scene.add(object)
      request()
    },
    focus(at, distance = 6) {
      pending = undefined
      const target = new THREE.Vector3(at.x, at.z, at.y)
      const direction = new THREE.Vector3(-0.7, 0.55, 0.9).normalize()
      controls.target.copy(target)
      camera.position.copy(target).addScaledVector(direction, distance)
      controls.update()
      request()
    },
    pose: () => (pending ? undefined : { position: camera.position.clone(), target: controls.target.clone() }),
    async snapshot(scale = 2) {
      const ratio = renderer.getPixelRatio()
      renderer.setPixelRatio(scale)
      renderer.setSize(host.clientWidth, host.clientHeight)
      renderer.render(scene, camera)
      const blob = await new Promise<Blob | null>((resolve) => renderer.domElement.toBlob(resolve, 'image/png'))
      renderer.setPixelRatio(ratio)
      resize()
      return blob
    },
    dispose() {
      cancelAnimationFrame(frame)
      observer.disconnect()
      renderer.domElement.removeEventListener('wheel', zoom)
      controls.dispose()
      model?.dispose()
      environment.dispose()
      pmrem.dispose()
      groundGeometry.dispose()
      groundMaterial.dispose()
      for (const t of groundMaps) t.dispose()
      renderer.dispose()
      renderer.domElement.remove()
    },
  }
}

/** The building faded to a ghost (its own materials, which are the model's), but for the kinds kept solid. */
function ghost(root: THREE.Object3D, xray: XRay) {
  const faded = new Map<THREE.Material, THREE.Material>()
  root.traverse((o) => {
    const mesh = o as THREE.Mesh
    if (!mesh.isMesh || xray.keep.includes(mesh.userData.kind as string)) return
    const m = mesh.material as THREE.MeshStandardMaterial
    let f = faded.get(m)
    if (!f) {
      // a copy, so a material shared with a kept solid stays solid there; the model disposes only its own
      f = m.clone()
      Object.assign(f, { transparent: true, opacity: Math.min(m.opacity, xray.ghost), depthWrite: false })
      faded.set(m, f)
      mesh.userData.ghost = true
    }
    mesh.material = f
    mesh.castShadow = false
  })
  root.userData.ghosts = [...faded.values()]
}

/** The closest distance along `direction` at which the whole box stays in frame. */
function fitDistance(view: THREE.PerspectiveCamera, box: THREE.Box3, direction: THREE.Vector3): number {
  // probe with a copy: moving the real camera here would leak into the caller
  const camera = view.clone()
  const center = box.getCenter(new THREE.Vector3())
  const corners: THREE.Vector3[] = []
  for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) corners.push(new THREE.Vector3(x, y, z))
  const fits = (distance: number) => {
    camera.position.copy(center).addScaledVector(direction, distance)
    camera.lookAt(center)
    camera.updateMatrixWorld()
    return corners.every((corner) => {
      const p = corner.clone().project(camera)
      return Math.abs(p.x) <= 0.9 && Math.abs(p.y) <= 0.85 && p.z < 1
    })
  }
  let near = 0.5
  let far = 2000
  for (let i = 0; i < 32; i++) {
    const mid = (near + far) / 2
    if (fits(mid)) far = mid
    else near = mid
  }
  return far
}
