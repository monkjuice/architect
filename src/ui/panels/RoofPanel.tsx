import type { CSSProperties } from 'react'
import { updateRoof } from '../../model/edit'
import { ROOF_TYPES, sameRef, type Roof } from '../../model/plan'
import { GLAZING_BAR, GROW_LIGHT, nextEdge, RAFTER, raftersOf, ROOF_TITLES, roofProblem, roofSummary } from '../../model/roofs'
import { chooseTool, deleteSelection, fitRoofToWalls } from '../../state/actions'
import { getStore, useEditor } from '../../state/store'
import { Box, CheckField, MaterialField, NumberField, Segmented } from '../fields'

const titleOf = (roof: Roof) => (roof.type === 'flat' ? ROOF_TITLES.flat : `${ROOF_TITLES[roof.type]} ${roof.pitch.toFixed(0)}°`)

/** The roofs on visible layers (click one to select it) and the selected roof's type, slope and heights. */
export function RoofPanel() {
  const store = getStore()
  const plan = useEditor((s) => s.plan)
  const selection = useEditor((s) => s.selection)
  const roofs = plan.layers.filter((l) => l.visible).flatMap((layer) => Object.entries(layer.roofs).map(([id, roof]) => ({ layer, id, roof })))
  const selected = selection.filter((r) => r.kind === 'roof')
  const one = selected.length === 1 ? roofs.find((r) => r.layer.id === selected[0].layer && r.id === selected[0].id) : undefined

  return (
    <Box
      id="roofs"
      title="Roofs"
      actions={
        <button className="ghost small" onClick={() => chooseTool('roof')} title="Draw a roof (R)">
          + Roof
        </button>
      }
    >
      {roofs.length === 0 ? (
        <p className="muted">No roofs yet. Draw one with Roof (R), or use Roof the house to cover the active layer's rooms and galleries.</p>
      ) : (
        <ul className="area-list">
          {roofs.map(({ layer, id, roof }) => {
            const ref = { layer: layer.id, kind: 'roof' as const, id }
            return (
              <li
                key={`${layer.id}:${id}`}
                className={selection.some((r) => sameRef(r, ref)) ? 'selected' : ''}
                style={{ '--layer': layer.color } as CSSProperties}
                onClick={() => {
                  store.select([ref])
                  store.setActiveLayer(layer.id)
                }}
              >
                <span className="area-swatch" />
                <span className="area-list-name">{titleOf(roof)}</span>
                <span className={roofProblem(roof) ? 'area-list-size warning' : 'area-list-size'}>{roofSummary(roof).planArea.toFixed(2)} m²</span>
              </li>
            )
          })}
        </ul>
      )}
      {one && <RoofFields layer={one.layer.id} id={one.id} roof={one.roof} />}
      {selected.length > 1 && (
        <div className="row roof-many">
          <span className="hint">{selected.length} roofs selected</span>
          <button className="danger small" onClick={deleteSelection}>
            Delete
          </button>
        </div>
      )}
    </Box>
  )
}

function RoofFields({ layer, id, roof }: { layer: string; id: string; roof: Roof }) {
  const store = getStore()
  const set = (patch: Partial<Roof>) => store.edit((plan) => updateRoof(plan, layer, id, patch))
  const summary = roofSummary(roof)
  const problem = roofProblem(roof)
  const pitched = roof.type !== 'flat'
  const framed = !!raftersOf(roof.type)
  return (
    <div className="roof-fields">
      <h3>Selected roof</h3>
      <Segmented<Roof['type']> value={roof.type} options={ROOF_TYPES.map((t) => [t, ROOF_TITLES[t]] as const)} onChange={(type) => set({ type })} />
      <div className="fields">
        {pitched && <NumberField label="Pitch" unit="°" digits={1} min={0} value={roof.pitch} onCommit={(pitch) => set({ pitch: Math.min(70, pitch) })} />}
        <NumberField label="Height at the walls" min={0.5} value={roof.height} onCommit={(height) => set({ height })} />
        <NumberField label="Overhang" min={0} value={roof.overhang} onCommit={(overhang) => set({ overhang: Math.min(3, overhang) })} />
        {roof.type === 'flat' && <NumberField label="Parapet" min={0} value={roof.parapet} onCommit={(parapet) => set({ parapet: Math.min(2, parapet) })} />}
        {(roof.type === 'shed' || roof.type === 'gable' || framed) && (
          <div className="field">
            <label>&nbsp;</label>
            <button onClick={() => set({ edge: nextEdge(roof) })} title={roof.type === 'gable' ? 'Run the ridge the other way' : 'Slope down to the next side'}>
              {roof.type === 'gable' ? 'Turn the ridge' : 'Turn the slope'}
            </button>
          </div>
        )}
        <p className="hint field-wide">
          {pitched && `${(Math.tan((roof.pitch * Math.PI) / 180) * 100).toFixed(0)}% slope · `}covers {summary.planArea.toFixed(2)} m²
          {pitched && `, ${summary.surface.toFixed(2)} m² of roof`} · eaves +{summary.eaves.toFixed(2)} · top +{summary.top.toFixed(2)}
        </p>
        {roof.type === 'pergola' && (
          <p className="hint field-wide">
            Rafters every {RAFTER.spacing.toFixed(2)} m on the beams of its open edges; with no covering it is open (polycarbonate lets the light through).
          </p>
        )}
        {roof.type === 'glass' && (
          <>
            <p className="hint field-wide">
              A greenhouse's: glass on galvanized steel glazing bars every {GLAZING_BAR.spacing.toFixed(2)} m, on the beams of its open edges (make
              them Glazed for glass sides). Against a wall, slope it away from the wall and use Fit to the walls.
            </p>
            <CheckField
              label="Grow lights"
              title={`Rows of LED grow lights ${GROW_LIGHT.spacing.toFixed(1)} m apart, hung ${GROW_LIGHT.drop.toFixed(2)} m under the glazing bars`}
              checked={!!roof.lights}
              onChange={(on) => set({ lights: on || undefined })}
            />
          </>
        )}
        {!framed && (
          <NumberField
            label="Skylights (0: none)"
            digits={0}
            min={0}
            value={roof.skylights?.count ?? 0}
            onCommit={(n) => {
              const count = Math.min(40, Math.round(n))
              set({ skylights: count > 0 ? { count, width: roof.skylights?.width ?? 1 } : undefined })
            }}
          />
        )}
        {!framed && roof.skylights && (
          <NumberField
            label="Skylight width"
            min={0.2}
            value={roof.skylights.width}
            onCommit={(width) => set({ skylights: { count: roof.skylights!.count, width: Math.min(10, width) } })}
          />
        )}
        {roof.type !== 'glass' && (
          <MaterialField label="Covering" surface="roof" outdoor value={roof.finish} onChange={(finish) => set({ finish: finish ?? undefined })} />
        )}
        {!framed && (
          <MaterialField
            label="Soffit (its underside)"
            surface="ceiling"
            outdoor
            value={roof.soffit}
            onChange={(soffit) => set({ soffit: soffit ?? undefined })}
          />
        )}
        {problem && <p className="hint warning field-wide">{problem}</p>}
      </div>
      <div className="row">
        <button
          className="small"
          onClick={() => fitRoofToWalls(layer, id)}
          title="For a carport or a pergola between walls: its sides that run along a wall (a boundary wall, the house) move to that wall's face, and it overhangs only where it is free"
        >
          Fit to the walls
        </button>
        <button className="danger small" onClick={deleteSelection}>
          Delete roof
        </button>
      </div>
    </div>
  )
}
