import { storeyOf, type Plan } from '../../model/plan'
import { levelOf } from '../../model/storeys'
import { getGas, getHvac, getMep, getPlumbing, getWiring } from '../../state/derived'
import { usePrefs } from '../../state/prefs'
import { ElectricalLayer, WiringLayer } from './Electrical'
import { GasLayer } from './Gas'
import { HvacLayer } from './Hvac'
import { PlumbingLayer } from './Plumbing'
import { ServiceLayer } from './Services'

/**
 * The MEP tab's plan: every installation over the floor shown, each drawn as its own tab draws it (electricity in one
 * colour here, see App.css), under the MEP tab's Show toggles; the equipment of every tab in full; the sleeves where
 * lines go through an outside wall or under a foundation (white squares) and the clashes (red rings, numbered as in
 * the MEP section).
 */
export function MepPlanLayers({ plan, floor, storey, zoom }: { plan: Plan; floor: Plan; storey: number; zoom: number }) {
  const { mep: show } = usePrefs()
  const px = 1 / zoom
  const mep = getMep(plan)
  const wiring = getWiring(plan)
  // which floor a height is on: the highest whose level it reaches (what is buried, the ground floor's)
  const levels = [...new Map(plan.layers.filter((l) => l.visible).map((l) => [storeyOf(l), storeyOf(l) ? levelOf(l) : 0])).entries()].sort((a, b) => a[0] - b[0])
  const storeyAt = (z: number) => levels.filter(([, level]) => level <= z + 0.2).reduce((s, [n]) => Math.max(s, n), 0)
  const shown = (system: string) => !!show[system as keyof typeof show]
  return (
    <>
      {show.electricity && (
        <>
          <WiringLayer wiring={wiring} storey={storey} layer={null} focus="" selected="" zoom={zoom} />
          {floor.layers.map((layer) => layer.visible && <ElectricalLayer key={layer.id} layer={layer} zoom={zoom} selected="" dim={false} unfed={wiring.unfed.has(layer.id)} />)}
        </>
      )}
      {(show.water || show.drains) && (
        <PlumbingLayer plumbing={getPlumbing(plan)} storey={storey} zoom={zoom} show={{ cold: show.water, hot: show.water, drains: show.drains, sizes: false, labels: false, linked: false }} />
      )}
      {show.hvac && (
        <HvacLayer
          hvac={getHvac(plan)}
          plumbing={getPlumbing(plan)}
          storey={storey}
          zoom={zoom}
          show={{ heating: true, cooling: true, ventilation: true, loads: false, sizes: false, labels: false, linked: false }}
        />
      )}
      {show.gas && <GasLayer gas={getGas(plan)} storey={storey} zoom={zoom} show={{ pipes: true, sizes: false, vents: true, labels: false }} />}
      {show.equipment &&
        floor.layers.map((layer) => layer.visible && <ServiceLayer key={layer.id} layer={layer} tab="all" linked={false} selected="" zoom={zoom} labels={false} />)}
      <g className="mep-marks">
        {mep.crossings
          .filter((c) => shown(c.system) && storeyAt(c.at.z) === storey)
          .map((c, i) => (
            <rect key={`x${i}`} className={`mep-sleeve ${c.way}`} x={c.at.x - 4 * px} y={c.at.y - 4 * px} width={8 * px} height={8 * px} />
          ))}
        {show.clashes &&
          mep.clashes.map((c, i) =>
            shown(c.systems[0]) && shown(c.systems[1]) && storeyAt(c.at.z) === storey ? (
              <g key={`c${i}`} className="mep-clash">
                <circle cx={c.at.x} cy={c.at.y} r={11 * px} />
                <text x={c.at.x} y={c.at.y} fontSize={10 * px} textAnchor="middle" dominantBaseline="central">
                  {i + 1}
                </text>
              </g>
            ) : null,
          )}
      </g>
    </>
  )
}

