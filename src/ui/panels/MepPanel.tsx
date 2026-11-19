import { KIND_COLORS, MEP, MEP_SYSTEMS, SYSTEM_TITLES, type MepKind } from '../../model/mep'
import { formatNumber } from '../../model/takeoffText'
import { getMep } from '../../state/derived'
import { usePrefs } from '../../state/prefs'
import { useEditor } from '../../state/store'
import { Box } from '../fields'

const LEGEND: readonly (readonly [MepKind, string])[] = [
  ['cable', 'Electricity'],
  ['cold', 'Cold water'],
  ['hot', 'Hot water'],
  ['drain', 'Drains'],
  ['heating', 'Heating'],
  ['refrigerant', 'Refrigerant'],
  ['duct', 'Ducts'],
  ['gas', 'Gas'],
]

/**
 * The MEP tab's section: how much of each installation there is and how much of it is buried, the sleeves through the
 * walls and under the foundations, and the clashes, numbered as on the plan (click one to look at it there, or in
 * 3-D on that view).
 */
export function MepPanel({ onShow }: { onShow: (at: { x: number; y: number; z: number }, where: 'plan' | '3d') => void }) {
  const plan = useEditor((s) => s.plan)
  const { mep: show } = usePrefs()
  const m = getMep(plan)
  const walls = m.crossings.filter((c) => c.way === 'wall').length
  const below = m.crossings.length - walls
  const trench = m.trenches.reduce((s, t) => s + Math.hypot(t.b.x - t.a.x, t.b.y - t.a.y), 0)
  const where = show.view === '3d' ? '3d' : 'plan'
  return (
    <Box id="mep" title="MEP">
      <p className="hint">
        Every installation together, as each tab works it out: its lines at the heights they are usually laid at (in the screed, up the walls, in
        the slab, buried), where they go through the walls, and where two come too close.
      </p>
      <table className="foundation-rows mep-totals">
        <tbody>
          {MEP_SYSTEMS.map((s) => (
            <tr key={s} className={show[s] ? undefined : 'muted'}>
              <td>{SYSTEM_TITLES[s]}</td>
              <td className="number">{formatNumber(m.totals[s].length, 1, 'en')} m</td>
              <td className="number">{m.totals[s].buried > 0.05 ? `${formatNumber(m.totals[s].buried, 1, 'en')} m buried` : ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="hint">
        {walls} sleeve{walls === 1 ? '' : 's'} through outside walls, {below} under foundations; {formatNumber(trench, 1, 'en')} m of trench.
      </p>
      <h3 className="plumbing-heading">Clashes</h3>
      {m.clashes.length ? (
        <>
          <p className="hint">
            Two installations closer than {Math.round(MEP.clearance * 100)} cm side by side over {MEP.together.toFixed(2)} m or more, or gas and electricity
            closer than {Math.round(MEP.gasElectric * 100)} cm anywhere: usual coordination clearances, to check on site. Move a piece, or route one on its tab.
          </p>
          <ul className="mep-clashes">
            {m.clashes.map((c, i) => (
              <li key={i} onClick={() => onShow(c.at, where)} title="Look at it">
                <b>{i + 1}</b>
                {c.how === 'together' ? `${c.titles[0]} beside ${c.titles[1]}, ${c.length.toFixed(1)} m` : `${c.titles[0]} crossing ${c.titles[1]}`}, {Math.round(c.gap * 100)} cm apart
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="hint">None: no two installations run too close.</p>
      )}
      <h3 className="plumbing-heading">Colours</h3>
      <ul className="mep-legend">
        {LEGEND.map(([kind, title]) => (
          <li key={kind}>
            <i style={{ background: KIND_COLORS[kind] }} />
            {title}
          </li>
        ))}
      </ul>
    </Box>
  )
}

