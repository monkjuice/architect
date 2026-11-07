import { useState } from 'react'
import { addLayer, moveLayer, removeLayer, updateLayer, type LayerPatch } from '../../model/edit'
import { storeyOf, type Layer } from '../../model/plan'
import { MAX_STOREY, storeyName } from '../../model/storeys'
import { moveLayerToStorey } from '../../state/actions'
import { getStore, useEditor } from '../../state/store'
import { Box, NumberField, SelectField } from '../fields'

/**
 * Layers, top of the stack first. Click a row to draw on it; lines connect only within a layer. Each is on a floor
 * (the canvas shows the active layer's floor); a new layer goes on the active layer's floor.
 */
export function LayersPanel() {
  const store = getStore()
  const layers = useEditor((s) => s.plan.layers)
  const activeLayer = useEditor((s) => s.activeLayer)
  const active = layers.find((l) => l.id === activeLayer)

  const add = () => {
    const result = addLayer(store.getState().plan)
    const storey = storeyOf(active)
    store.edit(() => (storey ? updateLayer(result.plan, result.id, { storey, level: active?.level }) : result.plan))
    store.setActiveLayer(result.id)
  }

  return (
    <Box
      id="layers"
      title="Layers"
      actions={
        <button className="ghost small" onClick={add} title="Add a layer">
          + Add
        </button>
      }
    >
      <ul className="layer-list">
        {[...layers].reverse().map((layer, i) => (
          <LayerRow key={layer.id} layer={layer} active={layer.id === activeLayer} top={i === 0} bottom={i === layers.length - 1} />
        ))}
      </ul>
      {active && (
        <div className="fields">
          <SelectField<string>
            label={`${active.name}: on the`}
            value={String(storeyOf(active))}
            options={Array.from({ length: MAX_STOREY + 1 }, (_, n) => [String(n), storeyName(n)] as const)}
            onChange={(n) => moveLayerToStorey(active.id, Number(n))}
          />
          <NumberField
            label={storeyOf(active) ? 'Floor level above the ground' : 'Floor level (on a plinth, up to 3 m)'}
            value={active.level ?? 0}
            min={0}
            // a ground floor stands on a plinth, a floor above on the floor below
            onCommit={(level) => store.edit((p) => updateLayer(p, active.id, { level: Math.min(storeyOf(active) ? 20 : 3, level) }))}
          />
        </div>
      )}
    </Box>
  )
}

function LayerRow({ layer, active, top, bottom }: { layer: Layer; active: boolean; top: boolean; bottom: boolean }) {
  const store = getStore()
  const [name, setName] = useState(layer.name)
  const [base, setBase] = useState(layer.name)
  if (base !== layer.name) {
    setBase(layer.name)
    setName(layer.name)
  }
  const patch = (p: LayerPatch) => store.edit((plan) => updateLayer(plan, layer.id, p))
  const count = Object.keys(layer.segments).length
  const remove = () => {
    if (count && !window.confirm(`Delete the layer "${layer.name}" and its ${count} line${count > 1 ? 's' : ''}?`)) return
    const result = removeLayer(store.getState().plan, layer.id)
    if (typeof result === 'string') store.notify({ kind: 'error', text: result })
    else store.edit(() => result)
  }

  return (
    <li className={active ? 'layer-row active' : 'layer-row'} onClick={() => store.setActiveLayer(layer.id)}>
      <input type="color" value={layer.color} title="Colour" onClick={(e) => e.stopPropagation()} onChange={(e) => patch({ color: e.target.value })} />
      <input
        className="layer-name"
        value={name}
        spellCheck={false}
        onFocus={() => store.setActiveLayer(layer.id)}
        onChange={(e) => setName(e.target.value)}
        onBlur={() => name.trim() && name !== layer.name ? patch({ name: name.trim() }) : setName(layer.name)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur()
          if (e.key === 'Escape') setName(layer.name)
        }}
      />
      {layer.storey && (
        <span className="layer-count" title={`On the ${storeyName(layer.storey)}`}>
          F{layer.storey}
        </span>
      )}
      <span className="layer-count" title={`${count} line${count === 1 ? '' : 's'}`}>
        {count}
      </span>
      <div className="layer-actions" onClick={(e) => e.stopPropagation()}>
        <button className="ghost icon" title={layer.visible ? 'Hide' : 'Show'} aria-pressed={!layer.visible} onClick={() => patch({ visible: !layer.visible })}>
          {layer.visible ? '◉' : '○'}
        </button>
        <button className="ghost icon" title={layer.locked ? 'Unlock' : 'Lock'} aria-pressed={layer.locked} onClick={() => patch({ locked: !layer.locked })}>
          {layer.locked ? '🔒' : '🔓'}
        </button>
        <button className="ghost icon" title="Move up" disabled={top} onClick={() => store.edit((plan) => moveLayer(plan, layer.id, 1))}>
          ▲
        </button>
        <button className="ghost icon" title="Move down" disabled={bottom} onClick={() => store.edit((plan) => moveLayer(plan, layer.id, -1))}>
          ▼
        </button>
        <button className="ghost icon danger" title="Delete layer" onClick={remove}>
          ✕
        </button>
      </div>
    </li>
  )
}
