import { useState } from 'react'
import { addLayer, moveLayer, removeLayer, updateLayer, type LayerPatch } from '../../model/edit'
import type { Layer } from '../../model/plan'
import { getStore, useEditor } from '../../state/store'
import { Box, NumberField } from '../fields'

/** Layers, top of the stack first. Click a row to draw on it; lines connect only within a layer. */
export function LayersPanel() {
  const store = getStore()
  const layers = useEditor((s) => s.plan.layers)
  const activeLayer = useEditor((s) => s.activeLayer)
  const active = layers.find((l) => l.id === activeLayer)

  const add = () => {
    const result = addLayer(store.getState().plan)
    store.edit(() => result.plan)
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
          <NumberField
            label={`${active.name}: floor level above the ground`}
            value={active.level ?? 0}
            min={0}
            onCommit={(level) => store.edit((p) => updateLayer(p, active.id, { level: Math.min(3, level) }))}
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
