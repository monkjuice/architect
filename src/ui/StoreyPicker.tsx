import { findLayer, storeyOf } from '../model/plan'
import { MAX_STOREY, storeyName, storeys } from '../model/storeys'
import { addFloor, showStorey } from '../state/actions'
import { useEditor } from '../state/store'
import { Segmented } from './fields'

/** The floor the canvas shows and draws on (the floor below shows faded under it), and a button to add one over the top. */
export function StoreyPicker() {
  const plan = useEditor((s) => s.plan)
  const activeLayer = useEditor((s) => s.activeLayer)
  const floors = storeys(plan)
  return (
    <div className="inline-field tab-actions-end">
      {floors.length > 1 && (
        <Segmented<string>
          label="Floor"
          value={String(storeyOf(findLayer(plan, activeLayer)))}
          options={floors.map((n) => [String(n), storeyName(n)] as const)}
          onChange={(n) => showStorey(Number(n))}
          title="The floor shown and drawn on; the floor below shows faded under it"
        />
      )}
      <button onClick={addFloor} disabled={floors[floors.length - 1] >= MAX_STOREY} title="A layer on a new floor over the top one: an upper storey, or a loft (set its level lower)">
        + Floor
      </button>
    </div>
  )
}
