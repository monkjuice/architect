import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type DragEvent, type PointerEvent } from 'react'
import type { Vec } from '../../model/geometry'
import { isStyleOf } from '../../model/openings'
import { FURNITURE } from '../../model/furniture'
import { findMaterial } from '../../model/materials'
import { COLUMN_STYLES, type ColumnStyle } from '../../model/plan'
import {
  chooseTool,
  COLONNADE_DRAG_TYPE,
  dropColonnade,
  dropFile,
  dropFurniture,
  dropMaterial,
  dropOpening,
  fitView,
  FURNITURE_DRAG_TYPE,
  IMAGE_TOOLS,
  loadBaseImage,
  MATERIAL_DRAG_TYPE,
  OPENING_DRAG_TYPE,
  planBounds,
} from '../../state/actions'
import { ColonnadeLayer } from './Columns'
import { FinishLayer, FinishPatterns } from './Finishes'
import { FurnitureLayer } from './Furniture'
import { storeyView } from '../../state/derived'
import { getPrefs, setPrefs, setSun, usePrefs } from '../../state/prefs'
import { getStore, useEditor, type ToolId, type Viewport } from '../../state/store'
import { Overlay } from './Overlay'
import { OpeningLayer } from './Openings'
import { RoofLayer } from './Roofs'
import { AreaFills, AreaLabels, BaseImageView, CalibrationMarks, Grid, LayerShapes, SelectionMarks } from './Scene'
import { SunDial, SunShadows } from './Sun'
import { createTools, TOOL_INFO } from './tools'
import { SNAP_PX, WALL_REACH_PX, type PointerInfo } from './tools/types'
import { formatMeters, frame, gridSteps, MAX_ZOOM, MIN_ZOOM, niceStep } from './view'

const SHORTCUTS: Record<string, ToolId> = { v: 'select', l: 'line', a: 'area', d: 'door', w: 'window', m: 'measure', h: 'pan' }
const ROOF_SHORTCUTS: Record<string, ToolId> = { v: 'roof-select', r: 'roof', m: 'measure', h: 'pan' }

const isTyping = (target: EventTarget | null) => !!(target as HTMLElement | null)?.closest?.('input, textarea, select, [contenteditable="true"]')

/**
 * The plan, drawn to scale with its tools. On the Floor tab it is the floor plan; on the Roof tab (`mode` roof)
 * the floor plan is faded under the roofs, which are what the tools there work on.
 */
export function Canvas({ mode = 'floor' }: { mode?: 'floor' | 'roof' }) {
  const roofMode = mode === 'roof'
  const store = getStore()
  const plan = useEditor((s) => s.plan)
  const selection = useEditor((s) => s.selection)
  const activeLayer = useEditor((s) => s.activeLayer)
  const toolId = useEditor((s) => s.tool)
  const storedView = useEditor((s) => s.view)
  const prompt = useEditor((s) => s.prompt)
  const prefs = usePrefs()

  const wrapRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const [size, setSize] = useState({ w: 0, h: 0 })
  const [cursor, setCursor] = useState<Vec | null>(null)
  const [, setTick] = useState(0)
  const [dropping, setDropping] = useState(false)
  const [spaceHeld, setSpaceHeld] = useState(false)
  const [panning, setPanning] = useState(false)
  const pan = useRef<{ client: [number, number]; view: Viewport } | null>(null)
  const lastPointer = useRef<PointerInfo | null>(null)

  useLayoutEffect(() => {
    const observer = new ResizeObserver(([entry]) => setSize({ w: entry.contentRect.width, h: entry.contentRect.height }))
    observer.observe(wrapRef.current!)
    return () => observer.disconnect()
  }, [])

  // with no stored zoom and pan (start, Fit, a new plan or image) the plan is fitted once and the fit is stored:
  // a view that kept following the plan's bounds would move under the cursor while drawing or cropping
  const view = storedView ?? frame(planBounds(plan), size.w, size.h)
  const viewRef = useRef(view)
  useLayoutEffect(() => {
    viewRef.current = view
    if (!storedView && view) store.update({ view })
  })
  const setView = useCallback((next: Viewport) => store.update({ view: next }), [store])

  const redraw = useCallback(() => setTick((t) => t + 1), [])
  const tools = useMemo(() => createTools({ store, prefs: getPrefs, redraw }), [store, redraw])
  const tool = tools[toolId]

  // every tool starts over when it is picked and when it is left
  const previousTool = useRef(toolId)
  useEffect(() => {
    if (previousTool.current === toolId) return
    tools[previousTool.current].reset?.()
    tools[toolId].reset?.()
    previousTool.current = toolId
  }, [toolId, tools])

  // wheel zoom around the cursor; registered natively because React's wheel listener is passive
  useEffect(() => {
    const element = wrapRef.current!
    const onWheel = (event: WheelEvent) => {
      const current = viewRef.current
      if (!current) return
      event.preventDefault()
      const rect = element.getBoundingClientRect()
      const sx = event.clientX - rect.left
      const sy = event.clientY - rect.top
      const delta = event.deltaMode === 1 ? event.deltaY * 16 : event.deltaY
      const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, current.zoom * Math.exp(-delta * 0.0015)))
      const mx = current.x0 + sx / current.zoom
      const my = current.y0 + sy / current.zoom
      setView({ zoom, x0: mx - sx / zoom, y0: my - sy / zoom })
    }
    element.addEventListener('wheel', onWheel, { passive: false })
    return () => element.removeEventListener('wheel', onWheel)
  }, [setView])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (isTyping(event.target) || store.getState().prompt) return
      const down = event.type === 'keydown'
      if (event.key === ' ') {
        setSpaceHeld(down)
        event.preventDefault()
        return
      }
      if (event.key === 'Shift' || event.key === 'Alt') {
        // re-run the pointer so constraints and snapping follow the modifier at once
        if (event.key === 'Alt') event.preventDefault()
        const last = lastPointer.current
        if (last && !pan.current) {
          lastPointer.current = { ...last, shift: event.shiftKey, alt: event.altKey }
          tools[store.getState().tool].move?.(lastPointer.current)
        }
        return
      }
      if (!down) return
      const current = tools[store.getState().tool]
      if (current.key?.(event)) {
        event.preventDefault()
        return
      }
      if (event.ctrlKey || event.metaKey || event.altKey) return
      const key = event.key.toLowerCase()
      const shortcuts = roofMode ? ROOF_SHORTCUTS : SHORTCUTS
      const home = roofMode ? 'roof-select' : 'select'
      if (shortcuts[key]) chooseTool(shortcuts[key])
      else if (key === 'f') fitView()
      else if (key === 'g') setPrefs({ grid: !getPrefs().grid })
      else if (key === 's' && !roofMode) setSun({ visible: !getPrefs().sun.visible })
      else if (key === 'escape' && store.getState().tool !== home) chooseTool(home)
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('keyup', onKey)
    const onBlur = () => setSpaceHeld(false)
    window.addEventListener('blur', onBlur)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('keyup', onKey)
      window.removeEventListener('blur', onBlur)
    }
  }, [store, tools, roofMode])

  const toInfo = (event: PointerEvent): PointerInfo => {
    const rect = svgRef.current!.getBoundingClientRect()
    const v = viewRef.current!
    return {
      p: { x: v.x0 + (event.clientX - rect.left) / v.zoom, y: v.y0 + (event.clientY - rect.top) / v.zoom },
      px: 1 / v.zoom,
      shift: event.shiftKey,
      alt: event.altKey,
    }
  }

  const onPointerDown = (event: PointerEvent<SVGSVGElement>) => {
    if (!view) return
    ;(document.activeElement as HTMLElement | null)?.blur?.()
    event.currentTarget.setPointerCapture(event.pointerId)
    if (event.button === 1 || (event.button === 0 && (spaceHeld || toolId === 'pan'))) {
      event.preventDefault()
      pan.current = { client: [event.clientX, event.clientY], view }
      setPanning(true)
      return
    }
    if (event.button === 2) tool.cancel?.()
    else if (event.button === 0) tool.down?.(toInfo(event))
  }

  const onPointerMove = (event: PointerEvent<SVGSVGElement>) => {
    if (!view) return
    const info = toInfo(event)
    lastPointer.current = info
    setCursor(info.p)
    const p = pan.current
    if (p) {
      setView({ ...p.view, x0: p.view.x0 - (event.clientX - p.client[0]) / p.view.zoom, y0: p.view.y0 - (event.clientY - p.client[1]) / p.view.zoom })
      return
    }
    tool.move?.(info)
  }

  const onPointerUp = (event: PointerEvent<SVGSVGElement>) => {
    if (pan.current) {
      pan.current = null
      setPanning(false)
      return
    }
    if (event.button === 0) tool.up?.(toInfo(event))
  }

  const onDragOver = (event: DragEvent) => {
    if ([OPENING_DRAG_TYPE, COLONNADE_DRAG_TYPE, FURNITURE_DRAG_TYPE, MATERIAL_DRAG_TYPE].some((t) => event.dataTransfer.types.includes(t))) {
      event.preventDefault()
      event.dataTransfer.dropEffect = 'copy'
      return
    }
    if (!event.dataTransfer.types.includes('Files')) return
    event.preventDefault()
    event.dataTransfer.dropEffect = 'copy'
    setDropping(true)
  }

  const onDrop = (event: DragEvent) => {
    setDropping(false)
    // a door or window from the library arrives as "kind:style"
    const [kind, style] = event.dataTransfer.getData(OPENING_DRAG_TYPE).split(':')
    const columns = event.dataTransfer.getData(COLONNADE_DRAG_TYPE)
    const at = () => {
      const rect = svgRef.current!.getBoundingClientRect()
      return { x: view!.x0 + (event.clientX - rect.left) / view!.zoom, y: view!.y0 + (event.clientY - rect.top) / view!.zoom }
    }
    if ((kind === 'door' || kind === 'window' || kind === 'gate' || kind === 'fireplace') && isStyleOf(kind, style) && view && svgRef.current) {
      event.preventDefault()
      dropOpening(kind, style, at(), WALL_REACH_PX / view.zoom, SNAP_PX / view.zoom)
      return
    }
    if (COLUMN_STYLES.includes(columns as ColumnStyle) && view && svgRef.current) {
      event.preventDefault()
      dropColonnade(columns as ColumnStyle, at(), WALL_REACH_PX / view.zoom)
      return
    }
    const [surface, materialId] = event.dataTransfer.getData(MATERIAL_DRAG_TYPE).split(':')
    if ((surface === 'wall' || surface === 'floor') && findMaterial(materialId) && view && svgRef.current) {
      event.preventDefault()
      dropMaterial(surface, materialId, at(), WALL_REACH_PX / view.zoom)
      return
    }
    const [piece, pieceStyle] = event.dataTransfer.getData(FURNITURE_DRAG_TYPE).split(':')
    const info = FURNITURE.find((i) => i.kind === piece && i.style === (pieceStyle || undefined))
    if (info && view && svgRef.current) {
      event.preventDefault()
      dropFurniture(info.kind, info.style, at())
      return
    }
    const file = event.dataTransfer.files[0]
    if (!file) return
    event.preventDefault()
    void dropFile(file)
  }

  const overlay = tool.overlay()
  const showCalibration = !roofMode && !!plan.image?.visible && (prefs.calibration || IMAGE_TOOLS.includes(toolId))
  // the welcome card shows on an empty plan until a drawing tool is picked; it lets clicks through to the canvas
  const empty = !roofMode && !plan.image && plan.layers.every((l) => !Object.keys(l.segments).length) && (toolId === 'select' || toolId === 'pan')
  const refIds = (kind: 'area' | 'opening' | 'roof' | 'furniture', layer: string) =>
    selection
      .filter((r) => r.kind === kind && r.layer === layer)
      .map((r) => r.id)
      .join(' ')
  const hovered = (kind: 'area' | 'opening' | 'roof' | 'furniture', layer: string) => (overlay.hover?.kind === kind && overlay.hover.layer === layer ? overlay.hover.id : undefined)
  const cursorStyle = panning ? 'grabbing' : spaceHeld || toolId === 'pan' ? 'grab' : tool.cursor()
  const scaleBar = view ? niceStep(90 / view.zoom).step : 0
  // the active layer's floor, over the floor below it, faded and out of reach; the floors above do not show
  const floor = storeyView(plan, activeLayer)
  const below = storeyView(plan, activeLayer, true).layers.filter((l) => l.visible && !floor.layers.includes(l))

  return (
    <div
      className={dropping ? 'canvas-wrap dropping' : 'canvas-wrap'}
      ref={wrapRef}
      onDragOver={onDragOver}
      onDragLeave={() => setDropping(false)}
      onDrop={onDrop}
    >
      {view && (
        <svg
          ref={svgRef}
          className={roofMode ? 'canvas roof-mode' : 'canvas'}
          style={{ cursor: cursorStyle }}
          viewBox={`${view.x0} ${view.y0} ${size.w / view.zoom} ${size.h / view.zoom}`}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={() => {
            pan.current = null
            setPanning(false)
            store.cancelGesture()
            tool.reset?.()
          }}
          onPointerLeave={() => setCursor(null)}
          onContextMenu={(event) => event.preventDefault()}
        >
          <FinishPatterns />
          {plan.image?.visible && <BaseImageView image={plan.image} cropping={toolId === 'crop'} />}
          {prefs.grid && <Grid view={view} width={size.w} height={size.h} />}
          {below.length > 0 && (
            <g className="underlay">
              {below.map((layer) => (
                <LayerShapes key={layer.id} layer={layer} active={false} zoom={view.zoom} lengths={false} thick={prefs.thickWalls} />
              ))}
              {below.map((layer) => (
                <ColonnadeLayer key={layer.id} layer={layer} />
              ))}
              {below.map((layer) => (
                <FurnitureLayer key={layer.id} layer={layer} selected="" />
              ))}
              {below.map((layer) => (
                <OpeningLayer key={layer.id} layer={layer} zoom={view.zoom} thick={prefs.thickWalls} selected="" />
              ))}
              {roofMode && below.map((layer) => <RoofLayer key={layer.id} layer={layer} zoom={view.zoom} selected="" />)}
            </g>
          )}
          {!roofMode &&
            floor.layers.map((layer) => layer.visible && <AreaFills key={layer.id} layer={layer} selected={refIds('area', layer.id)} hovered={hovered('area', layer.id)} materials={prefs.materials} />)}
          {!roofMode && <SunShadows plan={plan} sun={prefs.sun} />}
          {floor.layers.map(
            (layer) =>
              layer.visible && (
                <LayerShapes
                  key={layer.id}
                  layer={layer}
                  active={!roofMode && layer.id === activeLayer}
                  zoom={view.zoom}
                  lengths={!roofMode && prefs.lengths}
                  thick={prefs.thickWalls}
                />
              ),
          )}
          {!roofMode && prefs.materials && floor.layers.map((layer) => layer.visible && <FinishLayer key={layer.id} layer={layer} zoom={view.zoom} thick={prefs.thickWalls} />)}
          {floor.layers.map((layer) => layer.visible && <ColonnadeLayer key={layer.id} layer={layer} />)}
          {floor.layers.map(
            (layer) => layer.visible && <FurnitureLayer key={layer.id} layer={layer} selected={refIds('furniture', layer.id)} hovered={hovered('furniture', layer.id)} />,
          )}
          {floor.layers.map(
            (layer) =>
              layer.visible && (
                <OpeningLayer key={layer.id} layer={layer} zoom={view.zoom} thick={prefs.thickWalls} selected={refIds('opening', layer.id)} hovered={hovered('opening', layer.id)} />
              ),
          )}
          {roofMode ? (
            floor.layers.map((layer) => layer.visible && <RoofLayer key={layer.id} layer={layer} zoom={view.zoom} selected={refIds('roof', layer.id)} hovered={hovered('roof', layer.id)} />)
          ) : (
            <>
              <AreaLabels plan={floor} selection={selection} zoom={view.zoom} lines={{ name: prefs.areaNames, size: prefs.areaSizes }} />
              <SunDial plan={plan} sun={prefs.sun} zoom={view.zoom} />
            </>
          )}
          {showCalibration && plan.image && <CalibrationMarks image={plan.image} zoom={view.zoom} />}
          {!roofMode && <SelectionMarks plan={plan} refs={selection} hover={overlay.hover} zoom={view.zoom} />}
          {!prompt || toolId === 'calibrate' ? <Overlay data={overlay} zoom={view.zoom} thick={prefs.thickWalls} /> : null}
        </svg>
      )}
      {empty && (
        <div className="empty-state">
          <p>Start from a photo or scan of the plan.</p>
          <button className="primary" onClick={() => void loadBaseImage()}>
            Load base image…
          </button>
          <p className="muted">or drop / paste it here, or just start drawing (L)</p>
        </div>
      )}
      {view && (
        <div className="scale-bar" aria-hidden="true">
          <div className="scale-bar-line" style={{ width: scaleBar * view.zoom }} />
          <span>{formatMeters(scaleBar)}</span>
        </div>
      )}
      <div className="canvas-status">
        <span className="coords">{cursor ? `x ${cursor.x.toFixed(2)}  y ${cursor.y.toFixed(2)} m` : ' '}</span>
        {view && (
          <span>
            {view.zoom < 10 ? view.zoom.toFixed(1) : Math.round(view.zoom)} px/m
            {prefs.grid && ` · grid ${formatMeters(gridSteps(view.zoom).minor)}`}
          </span>
        )}
        <span className="tool-hint">{TOOL_INFO[toolId].hint}</span>
        <button className="ghost small" onClick={fitView} title="Fit the plan (F)">
          Fit
        </button>
      </div>
    </div>
  )
}
