import { useMemo, useRef, useState, type Ref } from 'react'
import { updateLayer } from '../model/edit'
import { elevation, elevationViews, type Elevation, type ElevationView } from '../model/elevations'
import { findMaterial } from '../model/materials'
import type { SolidMaterial } from '../model/solids'
import { getSolids } from '../state/derived'
import { downloadBlob } from '../state/files'
import { getStore, useEditor } from '../state/store'
import { CheckField, Segmented } from './fields'
import { NoticeBar } from './NoticeBar'

/** Paper colours, kept in the drawing itself (not in CSS) so a saved SVG looks the same anywhere. */
const FILL: Record<SolidMaterial, string> = {
  facade: '#f6f3ec',
  interior: '#ecebe6',
  roof: '#cf8a6f',
  slab: '#c4c3be',
  frame: '#3b3c3f',
  glass: '#d3e6ee',
  door: '#c49a6c',
  gate: '#76797d',
  floor: '#dcd7ce',
  paving: '#cdc7bd',
  stone: '#ece3cf',
  metal: '#4a4d51',
  brick: '#b5694e',
  soot: '#2a2725',
  ceramic: '#f7f6f2',
  wood: '#b0825c',
  fabric: '#a3adc2',
  foliage: '#7f9c66',
  bark: '#7b6553',
  linen: '#efe9dd',
  olive: '#9aa883',
}
const INK = '#2a2a2d'

/** A paper colour darkened for a face turned away from the viewer, so round columns and slopes read as such. */
function shade(hex: string, facing: number): string {
  const k = 0.72 + 0.28 * facing
  const c = (i: number) => Math.round(parseInt(hex.slice(i, i + 2), 16) * k)
  return `rgb(${c(1)},${c(3)},${c(5)})`
}
const PAPER = '#fbfaf7'
const FONT = "Inter, 'Segoe UI', system-ui, sans-serif"

/**
 * The four elevations of the house, drawn from the same 3-D model as the Exterior tab, so they follow the floor
 * plan and the roofs as they change: all four at once or one at a time, with level marks and the overall width.
 */
export function ElevationsTab() {
  const store = getStore()
  const plan = useEditor((s) => s.plan)
  const fileName = useEditor((s) => s.file.name)
  const solids = getSolids(plan)
  const drawings = useMemo(() => elevationViews(plan).map((view) => ({ view, elevation: elevation(solids, view) })), [plan, solids])
  const [shown, setShown] = useState<string>('all')
  const svgRef = useRef<SVGSVGElement>(null)
  const one = shown === 'all' ? undefined : drawings[Number(shown)]

  const save = () => {
    const svg = svgRef.current
    if (!svg || !one) return
    const text = new XMLSerializer().serializeToString(svg)
    const facade = one.view.name.toLowerCase()
    downloadBlob(new Blob([text], { type: 'image/svg+xml' }), `${fileName.replace(/\.json$/i, '')}-${facade}-elevation.svg`)
  }

  return (
    <>
      <div className="tab-actions">
        <Segmented<string> value={shown} options={[['all', 'All four'], ...drawings.map((d, i) => [String(i), d.view.name] as const)]} onChange={setShown} />
        <div className="inline-field" title="The layers drawn (also hides them on the other tabs): leave out the boundary wall to see the house">
          Layers
          {plan.layers.map((l) => (
            <CheckField key={l.id} label={l.name} checked={l.visible} onChange={(visible) => store.edit((p) => updateLayer(p, l.id, { visible }))} />
          ))}
        </div>
        <button className="tab-actions-end" onClick={save} disabled={!one} title={one ? 'Download this elevation as an SVG drawing' : 'Pick one elevation to save it'}>
          Save SVG
        </button>
      </div>
      <main className="app-main elevations-main">
        {one ? (
          <div className="elevation-single">
            <ElevationDrawing view={one.view} elevation={one.elevation} svgRef={svgRef} />
          </div>
        ) : (
          <div className="elevation-grid">
            {drawings.map((d, i) => (
              <button key={i} className="elevation-cell" onClick={() => setShown(String(i))} title={`Open the ${d.view.name.toLowerCase()} elevation`}>
                <ElevationDrawing view={d.view} elevation={d.elevation} />
              </button>
            ))}
          </div>
        )}
        <NoticeBar />
      </main>
    </>
  )
}

/** One elevation on paper, in m (z up): faces far to near, the ground line, level marks on the right and the overall width under it. */
function ElevationDrawing({ view, elevation: e, svgRef }: { view: ElevationView; elevation: Elevation; svgRef?: Ref<SVGSVGElement> }) {
  const title = `${view.name} elevation`
  const b = e.bounds
  if (!b) {
    return (
      <div className="elevation-empty">
        <b>{title}</b>
        <p>Nothing to draw yet: draw walls on the Floor tab.</p>
      </div>
    )
  }
  const width = b.u1 - b.u0
  const fs = Math.max(0.2, Math.max(width, b.z1 - b.z0) / 50)
  const left = 1 + fs
  const right = 1 + fs * 6
  const top = fs * 4
  const bottom = fs * 5
  const x0 = b.u0 - left
  const y0 = -b.z1 - top
  const w = width + left + right
  const h = b.z1 - b.z0 + top + bottom
  const marks = b.u1 + 0.4
  // level marks closer than a line of text would print over each other: the lower one stays
  const levels: number[] = []
  for (const z of e.levels) if (!levels.length || z - levels[levels.length - 1] >= fs * 1.3) levels.push(z)
  const line = { stroke: INK, strokeWidth: 1, vectorEffect: 'non-scaling-stroke' as const }
  return (
    <svg ref={svgRef} className="elevation" xmlns="http://www.w3.org/2000/svg" viewBox={`${x0} ${y0} ${w} ${h}`} preserveAspectRatio="xMidYMid meet" fontFamily={FONT}>
      <rect x={x0} y={y0} width={w} height={h} fill={PAPER} />
      <text x={x0 + fs} y={y0 + fs * 1.8} fontSize={fs * 1.3} fontWeight={600} fill={INK}>
        {title}
      </text>
      {e.polygons.map((p, i) => {
        const fill = shade(findMaterial(p.finish)?.color ?? FILL[p.material], p.facing)
        // facets of a round surface are drawn in their own colour: lines between them would merge into a dark bar
        return <polygon key={i} points={p.pts.map((q) => `${q.x},${-q.y}`).join(' ')} fill={fill} strokeLinejoin="round" {...line} stroke={p.smooth ? fill : INK} />
      })}
      <line x1={b.u0 - 1} y1={0} x2={b.u1 + 1} y2={0} {...line} strokeWidth={2.5} />
      {levels.map((z) => (
        <g key={z}>
          <line x1={marks} y1={-z} x2={marks + fs * 1.6} y2={-z} {...line} />
          <polygon points={`${marks},${-z} ${marks + fs * 0.5},${-z - fs * 0.6} ${marks - fs * 0.5},${-z - fs * 0.6}`} fill={INK} />
          <text x={marks + fs * 1.9} y={-z} fontSize={fs} fill={INK} dominantBaseline="central">
            {z === 0 ? '±0.00' : `+${z.toFixed(2)}`}
          </text>
        </g>
      ))}
      <g>
        <line x1={b.u0} y1={fs * 2.2} x2={b.u1} y2={fs * 2.2} {...line} />
        {[b.u0, b.u1].map((u) => (
          <line key={u} x1={u} y1={fs * 1.6} x2={u} y2={fs * 2.8} {...line} />
        ))}
        <text x={(b.u0 + b.u1) / 2} y={fs * 3.8} fontSize={fs} fill={INK} textAnchor="middle" dominantBaseline="central">
          {width.toFixed(2)} m
        </text>
      </g>
    </svg>
  )
}
