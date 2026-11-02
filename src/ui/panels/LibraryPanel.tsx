import type { ReactNode } from 'react'
import { dist } from '../../model/geometry'
import { STYLES, styleKey, type StyleInfo } from '../../model/openings'
import { segmentKind, type OpeningKind, type SegmentKind } from '../../model/plan'
import { chooseTool, OPENING_DRAG_TYPE } from '../../state/actions'
import { openingWidth, usePrefs } from '../../state/prefs'
import { getStore, useEditor } from '../../state/store'
import { OpeningIcon } from '../canvas/Openings'
import { Box } from '../fields'

const GROUPS: { kind: OpeningKind; title: string; key?: string }[] = [
  { kind: 'door', title: 'Doors', key: 'D' },
  { kind: 'window', title: 'Windows', key: 'W' },
  { kind: 'gate', title: 'Gates' },
]

/**
 * The library: what can be drawn or placed. Line types arm the Line tool with that kind; door, window and gate
 * styles arm their tool with that style, or can be dragged straight onto a wall. Each shows how much of it the
 * visible layers hold; openings also show the width the next one gets.
 */
export function LibraryPanel() {
  const store = getStore()
  const plan = useEditor((s) => s.plan)
  const tool = useEditor((s) => s.tool)
  const lineKind = useEditor((s) => s.lineKind)
  const openingStyle = useEditor((s) => s.openingStyle)
  const prefs = usePrefs()

  const length: Record<SegmentKind, number> = { wall: 0, open: 0, outline: 0 }
  const count = new Map<string, number>()
  for (const layer of plan.layers) {
    if (!layer.visible) continue
    for (const s of Object.values(layer.segments)) length[segmentKind(s)] += dist(layer.vertices[s.a], layer.vertices[s.b])
    for (const o of Object.values(layer.openings)) count.set(styleKey(o.kind, o.style), (count.get(styleKey(o.kind, o.style)) ?? 0) + 1)
  }

  const line = (kind: SegmentKind) => () => {
    store.update({ lineKind: kind })
    chooseTool('line')
  }
  const pick = (s: StyleInfo) => () => {
    store.update({ openingStyle: { ...store.getState().openingStyle, [s.kind]: s.style } })
    chooseTool(s.kind)
  }

  return (
    <aside className="sidebar sidebar-left">
      <Box id="library-lines" title="Line types" actions={<kbd>L</kbd>}>
        <div className="library-list">
          <LibraryItem
            icon={<line x1="3" y1="12" x2="29" y2="12" strokeWidth="2.5" />}
            name="Wall"
            detail={`${length.wall.toFixed(1)} m`}
            title="Drawn on its centreline at its thickness: automatic, 0.30 m facing outside and 0.15 m between rooms, or set per wall"
            active={tool === 'line' && lineKind === 'wall'}
            onClick={line('wall')}
          />
          <LibraryItem
            icon={<line x1="3" y1="12" x2="29" y2="12" strokeWidth="1.75" strokeDasharray="4 3" />}
            name="Open edge"
            detail={`${length.open.toFixed(1)} m`}
            title="The limit of a covered space with no wall: porch fronts, colonnades (O cycles the line type while drawing)"
            active={tool === 'line' && lineKind === 'open'}
            onClick={line('open')}
          />
          <LibraryItem
            icon={<line x1="3" y1="12" x2="29" y2="12" strokeWidth="1" />}
            name="Outline"
            detail={`${length.outline.toFixed(1)} m`}
            title="An edge with no height: pools, paving, decks, planters. It closes areas, casts no shadow"
            active={tool === 'line' && lineKind === 'outline'}
            onClick={line('outline')}
          />
        </div>
      </Box>
      {GROUPS.map((group) => (
        <Box key={group.kind} id={`library-${group.kind}`} title={group.title} actions={group.key && <kbd title={`${group.title}: the last style picked`}>{group.key}</kbd>}>
          <div className="library-list">
            {STYLES.filter((s) => s.kind === group.kind).map((s) => (
              <LibraryItem
                key={s.style}
                icon={<OpeningIcon kind={s.kind} style={s.style} />}
                name={s.title}
                detail={`${count.get(styleKey(s.kind, s.style)) ?? 0} · ${openingWidth(prefs, s.kind, s.style).toFixed(2)} m`}
                drag={styleKey(s.kind, s.style)}
                active={tool === s.kind && openingStyle[group.kind] === s.style}
                onClick={pick(s)}
              />
            ))}
          </div>
        </Box>
      ))}
      <p className="hint library-hint">Pick a door, window or gate and click a wall or fence, or drag it there. Type a number while placing to change its width.</p>
    </aside>
  )
}

function LibraryItem({
  icon,
  name,
  detail,
  active,
  onClick,
  drag,
  title,
}: {
  icon: ReactNode
  name: string
  detail: string
  active: boolean
  onClick: () => void
  /** Drag data ("door:double"…) for items that can be dropped on a wall. */
  drag?: string
  title?: string
}) {
  return (
    <button
      className={active ? 'library-item active' : 'library-item'}
      onClick={onClick}
      title={title ?? (drag ? `${name}: click, then click a wall, or drag onto a wall` : name)}
      draggable={!!drag}
      onDragStart={(event) => {
        if (!drag) return
        event.dataTransfer.setData(OPENING_DRAG_TYPE, drag)
        event.dataTransfer.effectAllowed = 'copy'
      }}
    >
      <svg className="library-icon" viewBox="0 0 32 24" aria-hidden="true">
        {icon}
      </svg>
      <span className="library-name">{name}</span>
      <span className="library-detail">{detail}</span>
    </button>
  )
}
