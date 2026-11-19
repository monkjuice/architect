import type { ReactNode } from 'react'
import { findLayer, storeyOf, type ServiceKind } from '../../model/plan'
import { isCooker } from '../../model/gas'
import { GROUP_TITLES, SERVICES, serviceCounts, servicesOf, specText, TAB_GROUPS, tabOf, type ServiceInfo, type ServiceTab } from '../../model/services'
import { chooseTool, FURNITURE_DRAG_TYPE, SERVICE_DRAG_TYPE } from '../../state/actions'
import { getStore, useEditor } from '../../state/store'
import { FurnitureIcon } from '../canvas/Furniture'
import { ServiceIcon } from '../canvas/Services'
import { Box } from '../fields'

/**
 * The Plumbing, HVAC or Gas tab's library: every piece of the tab's equipment, in its groups (water supply, hot water,
 * drains and waste; heating, cooling, ventilation; the gas supply and outlets). Clicking one arms the Place tool with it; it can also be dragged
 * straight onto the plan. Each shows how many the visible layers hold, and the size and rating a new one gets; both
 * are changed afterwards in the Selection section.
 */
export function ServiceLibraryPanel({ tab }: { tab: ServiceTab }) {
  const store = getStore()
  const plan = useEditor((s) => s.plan)
  const tool = useEditor((s) => s.tool)
  const pick = useEditor((s) => s.servicePick)
  const furniturePick = useEditor((s) => s.furniturePick)
  const activeLayer = useEditor((s) => s.activeLayer)
  const upstairs = storeyOf(findLayer(plan, activeLayer)) > 0
  const counts = serviceCounts(plan)

  const arm = (kind: ServiceKind) => () => {
    store.update({ servicePick: kind })
    chooseTool('service')
  }

  return (
    <aside className="sidebar sidebar-left">
      {TAB_GROUPS[tab].map((group) => (
        <Box key={group} id={`library-service-${group}`} title={GROUP_TITLES[group]} className="group">
          <div className="library-list">
            {servicesOf(group).map((info) => (
              <ServiceItem key={info.kind} info={info} count={counts.get(info.kind) ?? 0} active={tool === 'service' && pick === info.kind} disabled={upstairs && !!info.ground} onClick={arm(info.kind)} />
            ))}
          </div>
        </Box>
      ))}
      {tab === 'gas' && (
        <Box id="library-gas-appliances" title="Appliances" className="group">
          <div className="library-list">
            <CookerItem
              count={plan.layers.reduce((n, l) => n + (l.visible ? Object.values(l.furniture).filter((f) => isCooker({ kind: f.kind, style: 'style' in f ? f.style : undefined })).length : 0), 0)}
              active={tool === 'furniture' && isCooker(furniturePick)}
              onClick={() => {
                store.update({ furniturePick: { kind: 'appliance', style: 'oven' } })
                chooseTool('furniture')
              }}
            />
            {SERVICES.filter((i) => i.links?.gas).map((info) => (
              <ServiceItem
                key={info.kind}
                info={info}
                count={counts.get(info.kind) ?? 0}
                active={tool === 'service' && pick === info.kind}
                disabled={upstairs && !!info.ground}
                onClick={arm(info.kind)}
                owner={tabOf(info)}
              />
            ))}
          </div>
        </Box>
      )}
      {tab === 'gas' ? (
        <p className="hint library-hint">
          Put the natural gas meter (or the cylinders, with no gas main) down where the gas reaches the lot, outside.
          Everything that burns gas is piped to automatically, wherever it was put down: the appliances here are the
          same cooker (the Floor tab's oven; click it to make it electric), water heater (Plumbing's) and boiler and
          heaters (HVAC's). A shut-off valve closes off the building beside it, and its reserve sizes the pipe for what
          is to come; outlets are for what is not drawn.
        </p>
      ) : tab === 'plumbing' ? (
        <p className="hint library-hint">
          Click a piece, then click where it goes, or drag it onto the plan. Pieces that stand against a wall back up
          to the nearest one; what is buried or drilled goes on the ground floor only. The pipes between whatever is
          here and the fixtures on the Floor tab are worked out for you; click a pipe to choose its material. Heating,
          cooling and ventilation are on the HVAC tab.
        </p>
      ) : (
        <p className="hint library-hint">
          Click a piece, then click where it goes, or drag it onto the plan. Radiant floor marks a room's floor as
          heated, fed from the nearest underfloor manifold. The pipes, lines and ducts are worked out for you; the
          water a boiler makes and takes, and a split's condensate, are the Plumbing tab's.
        </p>
      )}
    </aside>
  )
}
const OWNER_TITLES: Record<ServiceTab, string> = { plumbing: 'Plumbing', hvac: 'HVAC', gas: 'Gas' }

/** The Floor tab's oven, a cooker on gas: put down with the furniture tool, so it is the same piece everywhere. */
function CookerItem({ count, active, onClick }: { count: number; active: boolean; onClick: () => void }): ReactNode {
  return (
    <button
      className={active ? 'library-item service-item active' : 'library-item service-item'}
      onClick={onClick}
      title="Cooker (oven with its hob): the Floor tab's oven, burning about 9 500 kcal/h; it backs up to the nearest wall. Click, then click where it goes, or drag it there."
      draggable
      onDragStart={(event) => {
        event.dataTransfer.setData(FURNITURE_DRAG_TYPE, 'appliance:oven')
        event.dataTransfer.effectAllowed = 'copy'
      }}
    >
      <svg className="library-icon" viewBox="0 0 32 24" aria-hidden="true">
        <FurnitureIcon kind="appliance" style="oven" />
      </svg>
      <span className="library-name">Cooker (oven)</span>
      <span className="library-detail">{`${count} · Floor tab's oven`}</span>
    </button>
  )
}
function ServiceItem({
  info,
  count,
  active,
  disabled,
  onClick,
  owner,
}: {
  info: ServiceInfo
  count: number
  active: boolean
  disabled: boolean
  onClick: () => void
  /** Another tab that owns the piece, shown in its detail. */
  owner?: ServiceTab
}): ReactNode {
  const rating = specText(info, info.width, info.depth)
  return (
    <button
      className={active ? 'library-item service-item active' : 'library-item service-item'}
      onClick={onClick}
      disabled={disabled}
      title={
        disabled
          ? `${info.title}: only on the ground floor. Show the ground floor (Floor) to put it down.`
          : `${info.title}: ${info.note} Click, then click where it goes, or drag it there${info.snap === 'wall' ? '; it backs up to the nearest wall' : ''}.${info.ground ? ' Ground floor only.' : ''}`
      }
      draggable={!disabled}
      onDragStart={(event) => {
        event.dataTransfer.setData(SERVICE_DRAG_TYPE, info.kind)
        event.dataTransfer.effectAllowed = 'copy'
      }}
    >
      <svg className="library-icon" viewBox="0 0 32 24" aria-hidden="true">
        <ServiceIcon kind={info.kind} />
      </svg>
      <span className="library-name">{info.title}</span>
      <span className="library-detail">{`${count} · ${rating || `${info.width.toFixed(2)} × ${info.depth.toFixed(2)}`}${owner ? ` · ${OWNER_TITLES[owner]} tab's` : ''}`}</span>
    </button>
  )
}
