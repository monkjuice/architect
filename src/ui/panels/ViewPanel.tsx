import type { BaseImage } from '../../model/plan'
import { setPrefs, setSun, usePrefs } from '../../state/prefs'
import { getStore, useEditor } from '../../state/store'
import { Box, CheckField } from '../fields'

/**
 * What the floor plan shows. All of it is a view setting kept per browser, except the base plan's visibility,
 * which is saved with the plan (it is the Base plan section's Visible).
 */
export function ViewPanel() {
  const store = getStore()
  const image = useEditor((s) => s.plan.image)
  const prefs = usePrefs()
  const editImage = (patch: Partial<BaseImage>) => store.edit((plan) => (plan.image ? { ...plan, image: { ...plan.image, ...patch } } : plan))
  const noImage = image ? undefined : 'No base plan image is loaded'

  return (
    <Box id="view" title="View">
      <div className="view-list">
        <CheckField label="Base plan" title={noImage} checked={!!image?.visible} disabled={!image} onChange={(visible) => editImage({ visible })} />
        <CheckField
          label="Known lengths"
          title={noImage ?? "The base plan's known lengths and how far each reads off"}
          checked={prefs.calibration}
          disabled={!image}
          onChange={(calibration) => setPrefs({ calibration })}
        />
        <CheckField label="Grid" title="Grid (G)" checked={prefs.grid} onChange={(grid) => setPrefs({ grid })} />
        <CheckField label="Thick walls" title="Walls at their thickness; off, thin lines (to trace over the base plan)" checked={prefs.thickWalls} onChange={(thickWalls) => setPrefs({ thickWalls })} />
        <CheckField label="Wall lengths" title="Length labels on every line: walls, open edges and outlines" checked={prefs.lengths} onChange={(lengths) => setPrefs({ lengths })} />
        <CheckField label="Area names" checked={prefs.areaNames} onChange={(areaNames) => setPrefs({ areaNames })} />
        <CheckField label="Area sizes" title="Each area's floor inside its walls, under its name" checked={prefs.areaSizes} onChange={(areaSizes) => setPrefs({ areaSizes })} />
        <CheckField label="Sun" title="The sun over the plan (S); its season and time are in the Sun section" checked={prefs.sun.visible} onChange={(visible) => setSun({ visible })} />
      </div>
    </Box>
  )
}
