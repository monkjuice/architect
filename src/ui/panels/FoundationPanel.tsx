import { setFooting } from '../../model/edit'
import { autoFooting, FOUNDATION_TITLES, PILE, RAFT } from '../../model/foundations'
import { rowCost } from '../../model/prices'
import { rowText, formatNumber } from '../../model/takeoffText'
import { getFoundation, getTakeoff } from '../../state/derived'
import { getStore, useEditor } from '../../state/store'
import { Box, NumberField } from '../fields'

/** What each system is, for the Foundation section. */
const SYSTEM_TEXT = {
  strip: 'A strip footing of lean concrete with brick rubble under every wall, with a reinforced ring beam on it under the load-bearing walls; pad footings under columns.',
  piles: `Reinforced ground beams under every wall of the house, on bored piles Ø ${PILE.diameter * 100} cm, ${PILE.depth} m deep, along its outside walls at most ${PILE.spacing} m apart; for soft or expansive soil.`,
  raft: `A reinforced slab ${RAFT.slab * 100} cm thick under the covered areas, out to the walls' outside faces, thickened into a beam under every wall; for weak soil. It replaces the sub-floor.`,
} as const

/**
 * The Foundation tab's section: what the system builds, what it takes (the materials list's foundation rows), and the
 * selected walls' footings, set by hand or back to the ones worked out from each wall.
 */
export function FoundationPanel() {
  const store = getStore()
  const plan = useEditor((s) => s.plan)
  const selection = useEditor((s) => s.selection)
  const foundation = getFoundation(plan)
  const rows = getTakeoff(plan).filter((r) => r.chapter === 'foundations')
  const cost = rows.reduce((sum, r) => sum + (rowCost(r) ?? 0), 0)
  const picked = foundation.walls.filter((f) => selection.some((r) => r.kind === 'segment' && r.layer === f.layer && r.id === f.segment))
  const refs = picked.map((f) => ({ layer: f.layer, kind: 'segment' as const, id: f.segment }))
  const same = (values: number[]) => (values.length && values.every((v) => Math.abs(v - values[0]) < 1e-9) ? values[0] : null)

  return (
    <Box id="foundation" title="Foundation">
      <p className="hint">
        <b>{FOUNDATION_TITLES[foundation.system]}.</b> {SYSTEM_TEXT[foundation.system]} Boundary and garden walls stand on strip footings. Usual sizes for
        ordinary soil, not a structural design: a soil study and an engineer's calculation set the real ones.
      </p>
      <table className="foundation-rows">
        <tbody>
          {rows.map((r) => (
            <tr key={`${r.key}|${r.unit}`}>
              <td>{rowText(r, 'en').item}</td>
              <td className="number">{formatNumber(r.unit === 'u' ? Math.ceil(r.quantity - 1e-9) : r.quantity, r.unit === 'u' ? 0 : 2, 'en')}</td>
              <td>{r.unit}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {cost > 0 && <p className="hint">Priced materials: $ {formatNumber(cost, 0, 'en')} (the concrete's cement, sand, gravel and rebar are in the Materials tab's basic materials).</p>}
      {picked.length > 0 && (
        <div className="roof-fields">
          <h3>
            {picked.length === 1 ? 'Selected wall' : `${picked.length} walls`}:{' '}
            {picked.every((f) => f.kind === 'strip') ? 'strip footing' : picked.every((f) => f.kind === 'beam') ? (foundation.system === 'raft' ? 'raft beam' : 'ground beam') : 'footings'}
          </h3>
          <div className="fields">
            <NumberField label="Width" min={0.1} value={same(picked.map((f) => f.width))} onCommit={(width) => store.edit((p) => setFooting(p, refs, { width: Math.min(3, width) }))} />
            <NumberField label="Depth" min={0.1} value={same(picked.map((f) => f.depth))} onCommit={(depth) => store.edit((p) => setFooting(p, refs, { depth: Math.min(5, depth) }))} />
            <p className="hint field-wide">
              {picked.length === 1 &&
                (() => {
                  const auto = autoFooting(foundation.system, picked[0].use, picked[0].thickness)
                  return `${picked[0].use === 'envelope' ? 'An outside wall' : picked[0].use === 'partition' ? 'A partition' : 'A boundary or garden wall'}, ${Math.round(picked[0].thickness * 100)} cm: worked out as ${auto.width.toFixed(2)} × ${auto.depth.toFixed(2)} m. `
                })()}
              {picked.some((f) => f.custom) ? 'Set by hand.' : 'Worked out from the wall.'}
            </p>
          </div>
          {picked.some((f) => f.custom) && (
            <div className="row">
              <button className="small" onClick={() => store.edit((p) => setFooting(p, refs, { width: null, depth: null }))}>
                Back to automatic
              </button>
            </div>
          )}
        </div>
      )}
      {picked.length === 0 && <p className="hint">Click a wall's footing to set its width and depth by hand.</p>}
    </Box>
  )
}
