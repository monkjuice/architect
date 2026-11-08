import { COLUMNS, layerColonnades, newColonnade } from '../../model/colonnades'
import {
  moveAreas,
  moveSegments,
  segmentsAt,
  setAreaFloor,
  setAreaDepth,
  setAreaLot,
  setColonnade,
  setSegmentKind,
  setSegmentLength,
  setWallFinish,
  turnFurniture,
  updateArea,
  updateFurniture,
  updateOpening,
  updateWalls,
  type OpeningPatch,
} from '../../model/edit'
import { sideNormal, wallSide, type WallSide } from '../../model/finishes'
import { FURNITURE, infoOf, stairTreads } from '../../model/furniture'
import { stairRise } from '../../model/storeys'
import { fitOffset, hasHinge, hasSide, overlappingOpening, parkingRoom, placeOpening, slides, STYLES } from '../../model/openings'
import { dist, screenAngleDeg } from '../../model/geometry'
import { measureSegments } from '../../model/pick'
import { COLUMN_STYLES, findLayer, segmentKind, type ColumnStyle, type OpeningKind, type OpeningStyle, type Ref, type SegmentKind } from '../../model/plan'
import { DOOR_HEAD, windowSill } from '../../model/solids'
import { EXTERIOR_WALL, INTERIOR_WALL, wallHeight } from '../../model/walls'
import { deleteSelection } from '../../state/actions'
import { areaSize, facesOutside, getPlacedAreas, getRegions, getThickness } from '../../state/derived'
import { getStore, useEditor } from '../../state/store'
import { Box, CheckField, MaterialField, NumberField, Segmented, SelectField, TextField } from '../fields'

const KIND_OPTIONS = [
  ['wall', 'Wall'],
  ['open', 'Open edge'],
  ['outline', 'Outline'],
] as const

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

/**
 * What is selected: a line's length and angle, the totals and enclosed area of several lines, an area's name
 * and size. Lines switch between wall, open edge and outline here, walls get their thickness and height, and
 * lines and areas move to another layer.
 */
export function SelectionPanel() {
  const store = getStore()
  const plan = useEditor((s) => s.plan)
  const selection = useEditor((s) => s.selection)

  if (!selection.length) {
    return (
      <Box id="selection" title="Selection">
        <p className="muted">Nothing selected. With Select (V), click a line, a point or an area, or drag a box around them.</p>
      </Box>
    )
  }

  const segments = selection.filter((r) => r.kind === 'segment')
  const vertices = selection.filter((r) => r.kind === 'vertex')
  const areas = selection.filter((r) => r.kind === 'area')
  const openings = selection.filter((r) => r.kind === 'opening')
  const furniture = selection.filter((r) => r.kind === 'furniture')
  const movable = [...segments, ...areas]
  const layerIds = [...new Set(movable.map((r) => r.layer))]
  const oneLayer = layerIds.length === 1 ? findLayer(plan, layerIds[0]) : undefined
  const segmentLayers = [...new Set(segments.map((r) => r.layer))]
  const openingKinds = openings.map((r) => findLayer(plan, r.layer)?.openings[r.id]?.kind)
  const ofKind = (kind: OpeningKind) => openingKinds.filter((k) => k === kind).length
  const title = [
    segments.length && plural(segments.length, 'line'),
    vertices.length && plural(vertices.length, 'point'),
    areas.length && plural(areas.length, 'area'),
    ...(['door', 'window', 'gate', 'fireplace'] as const).map((k) => ofKind(k) && plural(ofKind(k), k)),
    furniture.length && plural(furniture.length, 'piece'),
  ]
    .filter(Boolean)
    .join(', ')

  const kinds = new Set(segments.map((r) => segmentKind(findLayer(plan, r.layer)!.segments[r.id])))
  const kind = kinds.size === 1 ? [...kinds][0] : undefined

  const moveTo = (target: string) => {
    let next = store.getState().plan
    const moved: Ref[] = []
    for (const layerId of layerIds) {
      const lines = moveSegments(next, layerId, segments.filter((r) => r.layer === layerId).map((r) => r.id), target)
      const named = moveAreas(lines.plan, layerId, areas.filter((r) => r.layer === layerId).map((r) => r.id), target)
      next = named.plan
      moved.push(...lines.ids.map((id) => ({ layer: target, kind: 'segment' as const, id })), ...named.ids.map((id) => ({ layer: target, kind: 'area' as const, id })))
    }
    store.edit(() => next)
    store.select(moved)
    store.setActiveLayer(target)
  }

  return (
    <Box
      id="selection"
      title={`Selection · ${title}`}
      actions={
        <button className="ghost small danger" onClick={deleteSelection} title="Delete (Del)">
          Delete
        </button>
      }
    >
      {areas.length === 1 && selection.length === 1 && <AreaDetails layerId={areas[0].layer} id={areas[0].id} />}
      {openings.length === 1 && selection.length === 1 && <OpeningDetails layerId={openings[0].layer} id={openings[0].id} />}
      {furniture.length === 1 && selection.length === 1 && <FurnitureDetails layerId={furniture[0].layer} id={furniture[0].id} />}
      {furniture.length > 1 && (
        <div className="button-row">
          <button onClick={() => store.edit((p) => turnFurniture(p, furniture))} title="Turn every selected piece a quarter turn where it stands (R)">
            Turn
          </button>
        </div>
      )}
      {segments.length > 0 && (
        <Segmented<SegmentKind> label="Type" value={kind} options={KIND_OPTIONS} onChange={(k) => store.edit((p) => setSegmentKind(p, segments, k))} />
      )}
      {kind === 'wall' && <WallFields refs={segments} />}
      {kind === 'open' && <ColonnadeFields refs={segments} />}
      {kind === 'wall' && segments.length === 1 && selection.length === 1 && <WallFinishFields layerId={segments[0].layer} id={segments[0].id} />}
      {segments.length === 1 && selection.length === 1 && <SegmentDetails layerId={segments[0].layer} id={segments[0].id} />}
      {segments.length > 1 && segmentLayers.length === 1 && <Totals layerId={segmentLayers[0]} ids={segments.map((r) => r.id)} />}
      {segments.length > 1 && segmentLayers.length > 1 && <p className="muted">Lines on {segmentLayers.length} layers.</p>}
      {vertices.length === 1 && selection.length === 1 && <VertexDetails refs={vertices} />}
      {movable.length > 0 && (
        <div className="fields">
          <SelectField
            label="Layer"
            value={oneLayer?.id ?? ''}
            options={[...(oneLayer ? [] : [['', 'Several'] as const]), ...plan.layers.map((l) => [l.id, l.name] as const)]}
            onChange={(id) => id && moveTo(id)}
          />
        </div>
      )}
    </Box>
  )
}

function AreaDetails({ layerId, id }: { layerId: string; id: string }) {
  const store = getStore()
  const layer = useEditor((s) => findLayer(s.plan, layerId))
  const placed = layer && getPlacedAreas(layer).find((a) => a.id === id)
  if (!placed) return null
  const r = placed.region
  const { lot } = placed.area
  const refs = [{ layer: layerId, kind: 'area' as const, id }]
  return (
    <>
      <div className="fields">
        <TextField label="Name" value={placed.area.name} onCommit={(name) => store.edit((p) => updateArea(p, layerId, id, { name }))} />
        <div className="field">
          <label>{lot ? 'Lot, to its boundary lines' : 'Floor, inside the walls'}</label>
          <span className="readout">{r ? `${areaSize(placed)!.toFixed(2)} m²` : '—'}</span>
        </div>
        <MaterialField
          label={lot ? 'Ground cover' : 'Floor material'}
          surface="floor"
          outdoor={r ? !r.indoor || !!lot : undefined}
          value={placed.area.floor}
          onChange={(m) => store.edit((p) => setAreaFloor(p, refs, m))}
        />
        {r && !r.indoor && !lot && (
          <NumberField
            label="Pool depth (0: not a pool)"
            value={placed.area.depth ?? 0}
            min={0}
            onCommit={(depth) => store.edit((p) => setAreaDepth(p, layerId, id, depth))}
          />
        )}
        <div className="field-wide">
          <CheckField
            label="Lot: the land, not a room"
            checked={!!lot}
            onChange={(on) => store.edit((p) => setAreaLot(p, refs, on))}
            title="A lot is outdoors even where its boundary walls close it in (so lawn suits it), is sized to its boundary lines, and is summed apart from the rooms in the Areas panel"
          />
        </div>
      </div>
      {r ? (
        <p className="hint">
          {r.area.toFixed(2)} m² to the wall centrelines · boundary {(r.walls + r.open + r.outline).toFixed(2)} m
          {r.open > 0 && ` · ${r.open.toFixed(2)} m of it open`}
          {r.outline > 0 && ` · ${r.outline.toFixed(2)} m outline`}
          {r.holes.length > 0 && ` · ${plural(r.holes.length, 'island')} subtracted`}
        </p>
      ) : (
        <p className="hint warning">Not enclosed: its lines no longer close around it. Close the outline, or drag the label into a closed room.</p>
      )}
    </>
  )
}

/**
 * A door or window: its width and the free wall either side, named by where they are on screen (left/right
 * for a wall running across, top/bottom for one running down), and for a door which way it opens.
 */
function OpeningDetails({ layerId, id }: { layerId: string; id: string }) {
  const store = getStore()
  const layer = useEditor((s) => findLayer(s.plan, layerId))
  const o = layer?.openings[id]
  const placed = layer && o && placeOpening(layer, o)
  if (!layer || !o || !placed) return null
  const across = Math.abs(placed.dir.x) >= Math.abs(placed.dir.y)
  const [first, second] = across ? ['left', 'right'] : ['top', 'bottom']
  // a, the end offsets are measured from, is the first one on screen when the segment runs right or down
  const aFirst = across ? placed.dir.x > 0 : placed.dir.y > 0
  const w = Math.min(o.width, placed.length)
  const gapA = placed.offset - w / 2
  const gapB = placed.length - placed.offset - w / 2
  const change = (patch: OpeningPatch) => {
    const width = patch.width ?? o.width
    const offset = fitOffset(placed.length, width, patch.offset ?? o.offset)
    if (overlappingOpening(layer, o.segment, offset, width, id)) {
      store.notify({ kind: 'error', text: 'That would overlap another opening in this wall.' })
      return
    }
    store.edit((p) => updateOpening(p, layerId, id, { ...patch, offset }))
  }
  const gapField = (end: 'a' | 'b') => (
    <NumberField
      key={end}
      label={`Wall to the ${(end === 'a') === aFirst ? first : second}`}
      value={end === 'a' ? gapA : gapB}
      min={0}
      onCommit={(gap) => change({ offset: end === 'a' ? gap + w / 2 : placed.length - gap - w / 2 })}
    />
  )
  return (
    <>
      <div className="fields">
        <SelectField<OpeningStyle>
          label="Style"
          value={o.style}
          options={STYLES.filter((s) => s.kind === o.kind).map((s) => [s.style, s.title] as const)}
          onChange={(style) => store.edit((p) => updateOpening(p, layerId, id, { style }))}
        />
        <div className="field">
          <label>Wall</label>
          <span className="readout">{placed.length.toFixed(2)} m</span>
        </div>
        <NumberField label="Width" value={o.width} min={0.3} onCommit={(width) => change({ width })} />
        {o.kind === 'door' ? (
          <NumberField
            label={`Height (wall ${wallHeight(layer.segments[o.segment]).toFixed(2)} m)`}
            value={o.height ?? DOOR_HEAD}
            min={0.5}
            onCommit={(height) => store.edit((p) => updateOpening(p, layerId, id, { height: Math.min(height, wallHeight(layer.segments[o.segment])) }))}
          />
        ) : o.kind === 'window' ? (
          // its top, up to its wall's; at least 0.30 m over its sill
          <NumberField
            label={`Top (wall ${wallHeight(layer.segments[o.segment]).toFixed(2)} m)`}
            value={o.height ?? DOOR_HEAD}
            min={0.5}
            onCommit={(height) => store.edit((p) => updateOpening(p, layerId, id, { height: Math.max(windowSill(o) + 0.3, Math.min(height, wallHeight(layer.segments[o.segment]))) }))}
          />
        ) : (
          <div />
        )}
        {aFirst ? [gapField('a'), gapField('b')] : [gapField('b'), gapField('a')]}
        {o.kind === 'window' && (
          <NumberField
            label="Sill (0: to the floor)"
            value={windowSill(o)}
            min={0}
            onCommit={(sill) => store.edit((p) => updateOpening(p, layerId, id, { sill: Math.min(sill, (o.height ?? DOOR_HEAD) - 0.3) }))}
          />
        )}
        {o.kind === 'fireplace' && (
          <MaterialField
            label="Material (exposed brick when none)"
            surface="wall"
            outdoor={undefined}
            value={o.finish}
            onChange={(finish) => store.edit((p) => updateOpening(p, layerId, id, { finish: finish ?? undefined }))}
          />
        )}
      </div>
      {(hasSide(o) || hasHinge(o)) && (
        <div className="button-row opening-buttons">
          {hasSide(o) && (
            <button
              onClick={() => store.edit((p) => updateOpening(p, layerId, id, { swing: o.swing === 'left' ? 'right' : 'left' }))}
              title={o.kind === 'fireplace' ? 'Move it to the other side of the wall' : 'Open or slide to the other side of the wall'}
            >
              Flip side
            </button>
          )}
          {hasHinge(o) && (
            <button
              onClick={() => store.edit((p) => updateOpening(p, layerId, id, { hinge: o.hinge === 'a' ? 'b' : 'a' }))}
              title={slides(o) ? 'Slide it open the other way' : 'Hang it from the other jamb'}
            >
              {slides(o) ? 'Flip direction' : 'Flip hinge'}
            </button>
          )}
        </div>
      )}
      {!placed.fits && <p className="hint warning">The wall is shorter than this {o.kind}.</p>}
      {slides(o) && <ParkingHint room={parkingRoom(layer, id)} width={o.width} />}
      <p className="hint">Drag it along its wall, or onto another wall of the layer.</p>
    </>
  )
}

/** A piece of furniture: its style, size and turn; a kitchen sink's counter, a bathtub's shower head. */
function FurnitureDetails({ layerId, id }: { layerId: string; id: string }) {
  const store = getStore()
  const plan = useEditor((s) => s.plan)
  const layer = findLayer(plan, layerId)
  const f = layer?.furniture[id]
  if (!layer || !f) return null
  const info = infoOf(f)
  const risers = f.kind === 'stair' ? stairTreads(f.depth) + 1 : 0
  const rise = f.kind === 'stair' ? stairRise(plan, layer) : 0
  const styles = FURNITURE.filter((i) => i.kind === f.kind && i.style && i.snap === info.snap)
  const set = (next: typeof f) => store.edit((p) => updateFurniture(p, layerId, id, next))
  const round = f.kind === 'table' && f.style === 'circle'
  return (
    <>
      <div className="fields">
        <div className="field-wide">
          <b>{f.kind === 'bed' || f.kind === 'bathtub' || f.kind === 'table' ? `${info.title} ${f.kind}` : info.title}</b>
        </div>
        {styles.length > 1 && 'style' in f && f.style && (
          <SelectField
            label="Style"
            value={f.style}
            options={styles.map((i) => [i.style!, i.title] as const)}
            // a new style comes at its own size: a queen bed is a queen's size
            onChange={(style) => {
              const to = styles.find((i) => i.style === style)!
              set({ ...f, style, width: to.width, depth: to.depth } as typeof f)
            }}
          />
        )}
        <NumberField label={round ? 'Diameter' : 'Width'} value={f.width} min={0.1} onCommit={(width) => set({ ...f, width, ...(round ? { depth: width } : {}) })} />
        {!round && <NumberField label="Depth" value={f.depth} min={0.1} onCommit={(depth) => set({ ...f, depth })} />}
        {'angle' in f && <NumberField label="Turned" unit="°" digits={0} value={f.angle} onCommit={(angle) => set({ ...f, angle: ((angle % 360) + 360) % 360 })} />}
        {f.kind === 'sofa' && f.style === 'sectional' && (
          <div className="field">
            <label>&nbsp;</label>
            <button onClick={() => set({ ...f, mirror: !f.mirror })} title="Put the return at the other end">
              Flip
            </button>
          </div>
        )}
        {'counter' in f && (
          <p className="hint field-wide">In its counter: drag it along it, or onto another counter. It moves and turns with its counter.</p>
        )}
        {(f.kind === 'bathtub' || f.kind === 'shower') && (
          <p className="hint field-wide">Drag the shower head (the round mark on its rim) to move it round the {f.kind === 'shower' ? 'tray' : 'tub'}.</p>
        )}
        {f.kind === 'stair' && (
          <p className={rise / risers > 0.19 ? 'hint field-wide warning' : 'hint field-wide'}>
            {risers} steps of {((100 * rise) / risers).toFixed(1)} cm, {((100 * f.depth) / (risers - 1)).toFixed(0)} cm deep, up {rise.toFixed(2)} m to the floor above (a longer stair has gentler steps). On that floor, leave the stairwell over it unnamed, an outline where it arrives.
          </p>
        )}
      </div>
      {'angle' in f && (
        <div className="button-row">
          <button onClick={() => store.edit((p) => turnFurniture(p, [{ layer: layerId, kind: 'furniture', id }]))} title="A quarter turn where it stands (R)">
            Turn
          </button>
        </div>
      )}
    </>
  )
}

/** Columns along open edges: none, Roman or metal, and the most they stand apart; several edges can differ. */
function ColonnadeFields({ refs }: { refs: Ref[] }) {
  const store = getStore()
  const plan = useEditor((s) => s.plan)
  const found = refs.map((r) => findLayer(plan, r.layer)?.segments[r.id]?.colonnade)
  const styles = new Set(found.map((c) => c?.style ?? 'none'))
  const style = styles.size === 1 ? [...styles][0] : undefined
  const spacings = new Set(found.flatMap((c) => (c ? [c.spacing] : [])))
  const one = refs.length === 1 ? findLayer(plan, refs[0].layer) : undefined
  const columns = one && layerColonnades(one, getThickness(one)).find((c) => c.segment === refs[0].id)?.columns.length
  return (
    <>
      <Segmented<ColumnStyle | 'none'>
        label="Columns"
        value={style}
        options={[['none', 'None'], ...COLUMN_STYLES.map((s) => [s, COLUMNS[s].title] as const)]}
        onChange={(s) => store.edit((p) => setColonnade(p, refs, s === 'none' ? null : newColonnade(s)))}
        title="A colonnade along the open edge: its columns under a beam"
      />
      {style && style !== 'none' && (
        <div className="fields">
          <NumberField
            label="Spacing, at most"
            value={spacings.size === 1 ? [...spacings][0] : null}
            min={0.5}
            onCommit={(spacing) => store.edit((p) => setColonnade(p, refs, { style, spacing }))}
          />
          {columns !== undefined && (
            <div className="field">
              <label>Columns</label>
              <span className="readout">{columns}</span>
            </div>
          )}
          <p className="hint field-wide">Shared out evenly along the edge, one at each end a wall does not hold.</p>
        </div>
      )}
    </>
  )
}

/** A sliding gate needs as much clear wall as its width on the side it slides to. */
function ParkingHint({ room, width }: { room: number; width: number }) {
  return room < width - 1e-6 ? (
    <p className="hint warning">
      Not enough wall to slide open: it needs {width.toFixed(2)} m, {room.toFixed(2)} m is free on that side.
    </p>
  ) : (
    <p className="hint">Slides open along {width.toFixed(2)} m of wall, which is free.</p>
  )
}

function SegmentDetails({ layerId, id }: { layerId: string; id: string }) {
  const store = getStore()
  const layer = useEditor((s) => findLayer(s.plan, layerId))
  const seg = layer?.segments[id]
  if (!layer || !seg) return null
  const a = layer.vertices[seg.a]
  const b = layer.vertices[seg.b]
  return (
    <div className="fields">
      <NumberField label="Length" value={dist(a, b)} min={0.001} onCommit={(length) => store.edit((plan) => setSegmentLength(plan, layerId, id, length))} />
      <div className="field">
        <label>Angle</label>
        <span className="readout">{screenAngleDeg(a, b).toFixed(1)}°</span>
      </div>
      <p className="hint field-wide">A new length moves the end with fewer other lines on it.</p>
    </div>
  )
}

/**
 * The thickness and height of the selected walls: what they share, or an empty field when they differ, where a
 * number sets them all. A wall without a thickness of its own is automatic, and says why it is as thick as it is.
 */
function WallFields({ refs }: { refs: Ref[] }) {
  const store = getStore()
  const plan = useEditor((s) => s.plan)
  const walls = refs.flatMap((r) => {
    const layer = findLayer(plan, r.layer)
    const seg = layer?.segments[r.id]
    return layer && seg ? [{ seg, thickness: getThickness(layer).get(r.id) ?? 0, outside: facesOutside(layer, r.id) }] : []
  })
  if (!walls.length) return null
  const shared = (values: number[]) => (values.every((v) => Math.abs(v - values[0]) < 1e-9) ? values[0] : null)
  const own = walls.filter((w) => w.seg.thickness !== undefined).length
  const auto = (outside: boolean) => (outside ? `${EXTERIOR_WALL.toFixed(2)} m, it faces outside` : `${INTERIOR_WALL.toFixed(2)} m, between two rooms`)
  let why: string
  if (walls.length === 1) why = own ? `Set by hand; automatic would be ${auto(walls[0].outside)}.` : `Automatic: ${auto(walls[0].outside)}.`
  else if (own) why = `${own} of ${walls.length} set by hand.`
  else why = `Automatic: ${EXTERIOR_WALL.toFixed(2)} m facing outside, ${INTERIOR_WALL.toFixed(2)} m between rooms.`
  return (
    <>
      <div className="fields">
        <NumberField label="Thickness" value={shared(walls.map((w) => w.thickness))} min={0.02} onCommit={(thickness) => store.edit((p) => updateWalls(p, refs, { thickness }))} />
        <NumberField label="Height" value={shared(walls.map((w) => wallHeight(w.seg)))} min={0.1} onCommit={(height) => store.edit((p) => updateWalls(p, refs, { height }))} />
      </div>
      <p className="hint">{why}</p>
      {own > 0 && (
        <div className="button-row">
          <button onClick={() => store.edit((p) => updateWalls(p, refs, { thickness: null }))} title="Thickness by whether the wall faces outside">
            Automatic thickness
          </button>
        </div>
      )}
    </>
  )
}

/**
 * What each side of a wall is finished in. The sides are named by where they are on screen and what they face (a
 * room, the outside), and offer the materials that suit it there.
 */
function WallFinishFields({ layerId, id }: { layerId: string; id: string }) {
  const store = getStore()
  const layer = useEditor((s) => findLayer(s.plan, layerId))
  const seg = layer?.segments[id]
  if (!layer || !seg) return null
  const [a, b] = [layer.vertices[seg.a], layer.vertices[seg.b]]
  if (dist(a, b) < 1e-9) return null
  const half = (getThickness(layer).get(id) ?? 0) / 2
  const placed = getPlacedAreas(layer)
  const sides = (['left', 'right'] as WallSide[]).map((side) => {
    const { region, outdoor } = wallSide(layer, getRegions(layer), half, id, side)
    const n = sideNormal(a, b, side)
    const where = Math.abs(n.x) > Math.abs(n.y) ? (n.x > 0 ? 'Right' : 'Left') : n.y > 0 ? 'Bottom' : 'Top'
    const facing = region ? (placed.find((p) => p.region === region)?.area.name ?? 'an unnamed area') : 'the outside'
    return { side, outdoor, label: `${where} side, facing ${facing}` }
  })
  return (
    <div className="fields">
      {sides.map(({ side, outdoor, label }) => (
        <MaterialField
          key={side}
          label={label}
          surface="wall"
          outdoor={outdoor}
          value={seg.finish?.[side]}
          onChange={(m) => store.edit((p) => setWallFinish(p, layerId, id, side, m))}
        />
      ))}
    </div>
  )
}

function Totals({ layerId, ids }: { layerId: string; ids: string[] }) {
  const layer = useEditor((s) => findLayer(s.plan, layerId))
  if (!layer) return null
  const { length, open, area } = measureSegments(layer, ids)
  return (
    <div className="readouts">
      <span>
        Total length <b>{length.toFixed(2)} m</b>
        {open > 0 && ` · ${open.toFixed(2)} m not wall`}
      </span>
      {area !== undefined && (
        <span>
          Closed outline · area <b>{area.toFixed(2)} m²</b>
        </span>
      )}
    </div>
  )
}

function VertexDetails({ refs }: { refs: Ref[] }) {
  const layer = useEditor((s) => findLayer(s.plan, refs[0].layer))
  const v = layer?.vertices[refs[0].id]
  if (!layer || !v) return null
  const lines = segmentsAt(layer, refs[0].id).length
  return (
    <div className="readouts">
      <span>
        x <b>{v.x.toFixed(2)}</b> y <b>{v.y.toFixed(2)}</b> m
      </span>
      <span>{plural(lines, 'line')} meet here</span>
    </div>
  )
}
