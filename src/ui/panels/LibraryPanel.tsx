import type { ReactNode } from 'react'
import { COLUMNS } from '../../model/colonnades'
import { FURNITURE, furnitureKey, infoOf, type FurnitureInfo } from '../../model/furniture'
import { dist } from '../../model/geometry'
import { STYLES, styleKey, type StyleInfo } from '../../model/openings'
import { COLUMN_STYLES, segmentKind, type ColumnStyle, type FurnitureKind, type OpeningKind, type SegmentKind } from '../../model/plan'
import { chooseTool, COLONNADE_DRAG_TYPE, FURNITURE_DRAG_TYPE, OPENING_DRAG_TYPE } from '../../state/actions'
import { openingWidth, usePrefs } from '../../state/prefs'
import { getStore, useEditor } from '../../state/store'
import { FurnitureIcon } from '../canvas/Furniture'
import { OpeningIcon } from '../canvas/Openings'
import { Box } from '../fields'

const GROUPS: { kind: OpeningKind; title: string; key?: string }[] = [
  { kind: 'door', title: 'Doors', key: 'D' },
  { kind: 'window', title: 'Windows', key: 'W' },
  { kind: 'gate', title: 'Gates' },
  { kind: 'fireplace', title: 'Fireplaces' },
]

/** The furniture boxes of the library and the kinds each lists; the first kind names the box's id. */
const FURNITURE_GROUPS: { kinds: FurnitureKind[]; title: string }[] = [
  { kinds: ['counter'], title: 'Counters' },
  { kinds: ['sink'], title: 'Sinks' },
  { kinds: ['bathtub'], title: 'Bathtubs' },
  { kinds: ['shower'], title: 'Showers' },
  { kinds: ['toilet', 'bidet'], title: 'Toilets' },
  { kinds: ['bed'], title: 'Beds' },
  { kinds: ['sofa'], title: 'Sofas' },
  { kinds: ['table'], title: 'Tables' },
  { kinds: ['chair'], title: 'Chairs' },
]

/**
 * The library: what can be drawn or placed. Line types arm the Line tool with that kind; door, window, gate and
 * fireplace styles arm their tool with that style, or can be dragged straight onto a wall; colonnades go on open
 * edges the same way. Each shows how much of it the visible layers hold; openings also show the width the next
 * one gets, colonnades the most their columns stand apart.
 */
export function LibraryPanel() {
  const store = getStore()
  const plan = useEditor((s) => s.plan)
  const tool = useEditor((s) => s.tool)
  const lineKind = useEditor((s) => s.lineKind)
  const openingStyle = useEditor((s) => s.openingStyle)
  const columnStyle = useEditor((s) => s.columnStyle)
  const furniturePick = useEditor((s) => s.furniturePick)
  const prefs = usePrefs()

  const length: Record<SegmentKind, number> = { wall: 0, open: 0, outline: 0 }
  const count = new Map<string, number>()
  const colonnades: Record<ColumnStyle, number> = { roman: 0, metal: 0 }
  for (const layer of plan.layers) {
    if (!layer.visible) continue
    for (const s of Object.values(layer.segments)) {
      length[segmentKind(s)] += dist(layer.vertices[s.a], layer.vertices[s.b])
      if (segmentKind(s) === 'open' && s.colonnade) colonnades[s.colonnade.style]++
    }
    for (const f of Object.values(layer.furniture)) {
      const key = furnitureKey(f.kind, infoOf(f).style)
      count.set(key, (count.get(key) ?? 0) + 1)
    }
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
  const furnish = (info: FurnitureInfo) => () => {
    store.update({ furniturePick: { kind: info.kind, style: info.style } })
    chooseTool('furniture')
  }
  const columns = (style: ColumnStyle) => () => {
    store.update({ columnStyle: style })
    chooseTool('colonnade')
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
                drag={{ type: OPENING_DRAG_TYPE, data: styleKey(s.kind, s.style) }}
                active={tool === s.kind && openingStyle[group.kind] === s.style}
                onClick={pick(s)}
              />
            ))}
          </div>
        </Box>
      ))}
      <Box id="library-colonnade" title="Colonnades">
        <div className="library-list">
          {COLUMN_STYLES.map((style) => (
            <LibraryItem
              key={style}
              icon={<ColumnIcon style={style} />}
              name={COLUMNS[style].title}
              detail={`${colonnades[style]} · ${COLUMNS[style].spacing.toFixed(2)} m`}
              drag={{ type: COLONNADE_DRAG_TYPE, data: style }}
              title={`${COLUMNS[style].title} columns along an open edge: click, then click an open edge, or drag onto one`}
              active={tool === 'colonnade' && columnStyle === style}
              onClick={columns(style)}
            />
          ))}
        </div>
      </Box>
      {FURNITURE_GROUPS.map((group) => (
        <Box key={group.kinds[0]} id={`library-${group.kinds[0]}`} title={group.title}>
          <div className="library-list">
            {FURNITURE.filter((i) => group.kinds.includes(i.kind)).map((i) => {
              const key = furnitureKey(i.kind, i.style)
              return (
                <LibraryItem
                  key={key}
                  icon={<FurnitureIcon kind={i.kind} style={i.style} />}
                  name={i.title}
                  detail={`${count.get(key) ?? 0} · ${i.kind === 'table' && i.style === 'circle' ? `Ø ${i.width.toFixed(2)}` : `${i.width.toFixed(2)} × ${i.depth.toFixed(2)}`}`}
                  drag={{ type: FURNITURE_DRAG_TYPE, data: key }}
                  title={
                    i.snap === 'counter'
                      ? `${i.title}: click, then click a counter, or drag onto one`
                      : `${i.title}: click, then click where it goes${i.snap === 'wall' ? ' (it backs up to the nearest wall)' : i.snap === 'table' ? ' (it faces a table it is put by)' : ''}, or drag it there; R turns it`
                  }
                  active={tool === 'furniture' && furniturePick.kind === i.kind && furniturePick.style === i.style}
                  onClick={furnish(i)}
                />
              )
            })}
          </div>
        </Box>
      ))}
      <p className="hint library-hint">
        Pick a door, window, gate or fireplace and click a wall (gates also fences), or drag it there; type a number while placing to change its width. Colonnades go on open
        edges. Furniture goes where you click; R turns it.
      </p>
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
  /** Drag data for items that can be dropped on the plan: "door:double" for openings, a column style for colonnades. */
  drag?: { type: string; data: string }
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
        event.dataTransfer.setData(drag.type, drag.data)
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

/** Three columns of a style along a dashed open edge. */
function ColumnIcon({ style }: { style: ColumnStyle }) {
  const r = style === 'roman' ? 2.6 : 1.3
  return (
    <>
      <line x1="2" y1="12" x2="30" y2="12" strokeWidth="1" strokeDasharray="3 2.5" />
      {[5, 16, 27].map((x) => (
        <g key={x}>
          {style === 'roman' && <rect x={x - 3.4} y={8.6} width={6.8} height={6.8} strokeWidth="0.9" />}
          <circle cx={x} cy={12} r={r} strokeWidth="1.1" fill={style === 'metal' ? 'currentColor' : 'none'} />
        </g>
      ))}
    </>
  )
}
