import type { ReactNode } from 'react'
import { findLayer, storeyOf, type ServiceKind } from '../../model/plan'
import { GROUP_TITLES, serviceCounts, servicesOf, specText, TAB_GROUPS, type ServiceInfo, type ServiceTab } from '../../model/services'
import { chooseTool, SERVICE_DRAG_TYPE } from '../../state/actions'
import { getStore, useEditor } from '../../state/store'
import { ServiceIcon } from '../canvas/Services'
import { Box } from '../fields'

/**
 * The Plumbing or HVAC tab's library: every piece of the tab's equipment, in its groups (water supply, hot water,
 * drains and waste; heating, cooling, ventilation). Clicking one arms the Place tool with it; it can also be dragged
 * straight onto the plan. Each shows how many the visible layers hold, and the size and rating a new one gets; both
 * are changed afterwards in the Selection section.
 */
export function ServiceLibraryPanel({ tab }: { tab: ServiceTab }) {
  const store = getStore()
  const plan = useEditor((s) => s.plan)
  const tool = useEditor((s) => s.tool)
  const pick = useEditor((s) => s.servicePick)
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
      {tab === 'plumbing' ? (
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

function ServiceItem({ info, count, active, disabled, onClick }: { info: ServiceInfo; count: number; active: boolean; disabled: boolean; onClick: () => void }): ReactNode {
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
      <span className="library-detail">{`${count} · ${rating || `${info.width.toFixed(2)} × ${info.depth.toFixed(2)}`}`}</span>
    </button>
  )
}
