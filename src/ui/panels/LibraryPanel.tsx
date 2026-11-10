import type { ReactNode } from 'react'
import { COLUMNS } from '../../model/colonnades'
import { FURNITURE, furnitureKey, infoOf, type FurnitureInfo } from '../../model/furniture'
import { dist } from '../../model/geometry'
import { materialGroups, mosaicColor, type Material, type Pattern } from '../../model/materials'
import { STYLES, styleKey, type StyleInfo } from '../../model/openings'
import { COLUMN_STYLES, segmentKind, type ColumnStyle, type FurnitureKind, type OpeningKind, type SegmentKind } from '../../model/plan'
import { chooseTool, COLONNADE_DRAG_TYPE, FURNITURE_DRAG_TYPE, MATERIAL_DRAG_TYPE, OPENING_DRAG_TYPE } from '../../state/actions'
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
  { kinds: ['stair'], title: 'Stairs' },
  { kinds: ['counter'], title: 'Counters' },
  { kinds: ['sink'], title: 'Sinks' },
  { kinds: ['appliance'], title: 'Appliances' },
  { kinds: ['bathtub'], title: 'Bathtubs' },
  { kinds: ['shower'], title: 'Showers' },
  { kinds: ['toilet', 'bidet'], title: 'Toilets' },
  { kinds: ['bed'], title: 'Beds' },
  { kinds: ['sofa'], title: 'Sofas' },
  { kinds: ['table'], title: 'Tables' },
  { kinds: ['chair'], title: 'Chairs' },
  { kinds: ['plant'], title: 'Plants' },
  { kinds: ['tree'], title: 'Trees' },
]

/**
 * The library, in three groups. Drawing: the line types, which arm the Line tool with that kind. Materials: what
 * walls (each side) and floors can be finished in, by family. Objects: door, window, gate and fireplace styles,
 * which arm their tool or can be dragged straight onto a wall, colonnades for open edges, and furniture. Each item
 * shows how much of it the visible layers hold; openings also show the width the next one gets, colonnades the
 * most their columns stand apart, furniture its size.
 */
export function LibraryPanel() {
  const store = getStore()
  const plan = useEditor((s) => s.plan)
  const tool = useEditor((s) => s.tool)
  const lineKind = useEditor((s) => s.lineKind)
  const openingStyle = useEditor((s) => s.openingStyle)
  const columnStyle = useEditor((s) => s.columnStyle)
  const furniturePick = useEditor((s) => s.furniturePick)
  const materialPick = useEditor((s) => s.materialPick)
  const prefs = usePrefs()

  const length: Record<SegmentKind, number> = { wall: 0, open: 0, outline: 0 }
  const count = new Map<string, number>()
  const colonnades: Record<ColumnStyle, number> = { roman: 0, metal: 0, timber: 0, glazed: 0 }
  // wall sides and floors finished in each material
  const finished = new Map<string, number>()
  const tally = (key: string) => finished.set(key, (finished.get(key) ?? 0) + 1)
  for (const layer of plan.layers) {
    if (!layer.visible) continue
    for (const s of Object.values(layer.segments)) {
      length[segmentKind(s)] += dist(layer.vertices[s.a], layer.vertices[s.b])
      if (segmentKind(s) === 'open' && s.colonnade) colonnades[s.colonnade.style]++
      if (segmentKind(s) === 'wall' && s.finish) for (const m of [s.finish.left, s.finish.right]) if (m) tally(`wall:${m}`)
    }
    for (const a of Object.values(layer.areas)) if (a.floor) tally(`floor:${a.floor}`)
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
  const finish = (surface: 'wall' | 'floor', id: string) => () => {
    store.update({ materialPick: { id, surface } })
    chooseTool('material')
  }
  const columns = (style: ColumnStyle) => () => {
    store.update({ columnStyle: style })
    chooseTool('colonnade')
  }

  return (
    <aside className="sidebar sidebar-left">
      <Box id="library-drawing" title="Drawing" className="group" actions={<kbd title="Line">L</kbd>}>
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
            icon={<line x1="3" y1="12" x2="29" y2="12" strokeWidth="1" />}
            name="Outline"
            detail={`${length.outline.toFixed(1)} m`}
            title="An edge with no height: pools, paving, decks, planters. It closes areas, casts no shadow"
            active={tool === 'line' && lineKind === 'outline'}
            onClick={line('outline')}
          />
          <LibraryItem
            icon={<line x1="3" y1="12" x2="29" y2="12" strokeWidth="1.75" strokeDasharray="4 3" />}
            name="Open edge"
            detail={`${length.open.toFixed(1)} m`}
            title="The limit of a covered space with no wall: porch fronts, colonnades (O cycles the line type while drawing)"
            active={tool === 'line' && lineKind === 'open'}
            onClick={line('open')}
          />
        </div>
      </Box>
      <Box id="library-materials" title="Materials" className="group">
        {(['wall', 'floor'] as const).map((surface) => (
          <Box key={surface} id={`library-material-${surface}`} title={surface === 'wall' ? 'Walls' : 'Floors'} className="nested">
            {materialGroups(surface).map(({ group, materials }) => (
              <div key={group} className="library-family">
                <h3>{group}</h3>
                <div className="library-list">
                  {materials.map((m) => (
                    <LibraryItem
                      key={m.id}
                      icon={<MaterialIcon material={m} />}
                      name={m.title}
                      detail={`${finished.get(`${surface}:${m.id}`) ?? 0}`}
                      drag={{ type: MATERIAL_DRAG_TYPE, data: `${surface}:${m.id}` }}
                      title={`${m.title}${m.indoor && m.outdoor ? '' : m.indoor ? ', indoors only' : ', outdoors only'}: click, then click ${
                        surface === 'wall' ? 'the side of a wall it goes on' : 'inside a named area'
                      }, or drag it there. The number is how many ${surface === 'wall' ? 'wall sides' : 'floors'} have it`}
                      active={tool === 'material' && materialPick.surface === surface && materialPick.id === m.id}
                      onClick={finish(surface, m.id)}
                    />
                  ))}
                </div>
              </div>
            ))}
          </Box>
        ))}
      </Box>
      <Box id="library-objects" title="Objects" className="group">
      {GROUPS.map((group) => (
        <Box
          key={group.kind}
          id={`library-${group.kind}`}
          title={group.title}
          className="nested"
          actions={group.key && <kbd title={`${group.title}: the last style picked`}>{group.key}</kbd>}
        >
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
      <Box id="library-colonnade" title="Colonnades" className="nested">
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
        <Box key={group.kinds[0]} id={`library-${group.kinds[0]}`} title={group.title} className="nested">
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
                      : i.kind === 'stair'
                        ? `${i.title}: click, then click where it goes, or drag it there; it climbs from the dot to the arrow, up to the floor above; R turns it`
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
      </Box>
      <p className="hint library-hint">
        Wall materials go on the side of a wall you click, floor materials inside a named area. Pick a door, window, gate or fireplace and click a wall (gates also fences), or drag it there; type a number while placing to change its width. Colonnades go on open
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

/** Three columns of a style along a dashed open edge; glazed, small posts along a line of glass. */
function ColumnIcon({ style }: { style: ColumnStyle }) {
  const r = style === 'roman' ? 2.6 : 1.3
  return (
    <>
      <line x1="2" y1="12" x2="30" y2="12" strokeWidth="1" strokeDasharray={style === 'glazed' ? undefined : '3 2.5'} />
      {[5, 16, 27].map((x) => (
        <g key={x}>
          {style === 'roman' && <rect x={x - 3.4} y={8.6} width={6.8} height={6.8} strokeWidth="0.9" />}
          {style === 'glazed' ? (
            <rect x={x - 1.4} y={10.6} width={2.8} height={2.8} strokeWidth="1" fill="currentColor" />
          ) : style === 'timber' ? (
            <rect x={x - 2} y={10} width={4} height={4} strokeWidth="1.1" />
          ) : (
            <circle cx={x} cy={12} r={r} strokeWidth="1.1" fill={style === 'metal' ? 'currentColor' : 'none'} />
          )}
        </g>
      ))}
    </>
  )
}

/** A swatch of a material in its colour, with a hint of its pattern (courses of brick, planks, tiles). */
function MaterialIcon({ material }: { material: Material }) {
  const lines: Record<Pattern, string> = {
    brick: 'M4 9.3H28M4 14.7H28M10 4V9.3M22 4V9.3M16 9.3V14.7M10 14.7V20M22 14.7V20',
    planks: 'M4 8H28M4 12H28M4 16H28M12 4V8M20 8V12M9 12V16M24 16V20',
    tiles: 'M4 12H28M12 4V20M20 4V20',
    stone: 'M4 10L11 8L14 13L21 11L28 13M9 20L11 8M21 11L19 4',
    grass: 'M7 20L8 15M12 20L11 14M17 20L18 15M22 20L21 14M26 20L27 16',
    gravel: 'M8 8h.1M14 11h.1M20 7h.1M24 13h.1M10 15h.1M17 17h.1',
    seams: 'M10 4V20M16 4V20M22 4V20',
    grain: 'M4 8C10 7 18 9 28 8M4 12C12 13 20 11 28 12M4 16C9 15 19 17 28 16',
    dirt: 'M7 9h.1M12 15h.1M18 8h.1M23 14h.1M9 18h.1M26 10h.1M15 11h3M20 17h4',
  }
  const { checker, mosaic } = material
  // a checkerboard of 4 px squares, six by four
  const squares = Array.from({ length: 12 }, (_, i) => `M${4 + 4 * ((i % 3) * 2 + (Math.floor(i / 3) % 2))} ${4 + 4 * Math.floor(i / 3)}h4v4h-4Z`).join('')
  return (
    <g className="material-icon">
      <rect x="4" y="4" width="24" height="16" rx="2" fill={checker ? checker.colors[1] : mosaic ? mosaic.colors[0] : material.color} />
      {checker && <path className="checker" d={squares} fill={checker.colors[0]} />}
      {mosaic &&
        Array.from({ length: 24 }, (_, i) => {
          const [row, col] = [Math.floor(i / 6), i % 6]
          return <rect className="mosaic" key={i} x={4 + col * 4} y={4 + row * 4} width="4" height="4" fill={mosaicColor(mosaic, row, col)} />
        })}
      {mosaic && <rect x="4" y="4" width="24" height="16" rx="2" fill="none" />}
      {material.pattern && <path d={lines[material.pattern]} />}
    </g>
  )
}
