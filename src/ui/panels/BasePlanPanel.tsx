import { calibrationError, removeCalibration, withRotation } from '../../model/baseImage'
import { toDeg, toRad } from '../../model/geometry'
import type { BaseImage, Plan } from '../../model/plan'
import { chooseTool, editImageInPlace, loadBaseImage } from '../../state/actions'
import { setPrefs, usePrefs } from '../../state/prefs'
import { getStore, useEditor, type ToolId } from '../../state/store'
import { Box, CheckField, NumberField, SliderField } from '../fields'

const withImage = (change: (image: BaseImage) => BaseImage) => (plan: Plan): Plan => (plan.image ? { ...plan, image: change(plan.image) } : plan)

/** The base plan: load it, then the three steps that turn a photo into a reference: straighten, crop, calibrate. */
export function BasePlanPanel() {
  const store = getStore()
  const image = useEditor((s) => s.plan.image)
  const tool = useEditor((s) => s.tool)
  const prefs = usePrefs()

  if (!image) {
    return (
      <Box id="base-plan" title="Base plan">
        <p className="muted">A photo or scan of the plan to draw over. Drop it on the canvas, paste it (Ctrl+V), or:</p>
        <button className="primary" onClick={() => void loadBaseImage()}>
          Load image…
        </button>
      </Box>
    )
  }

  const edit = (change: (image: BaseImage) => BaseImage) => store.edit(withImage(change))
  const preview = (change: (image: BaseImage) => BaseImage) => store.preview(withImage(change))
  const end = () => store.endGesture()
  const toolButton = (id: ToolId, label: string, title: string) => (
    <button className={tool === id ? 'active' : ''} disabled={image.locked} title={title} onClick={() => chooseTool(tool === id ? 'select' : id)}>
      {label}
    </button>
  )

  // the slider fine-tunes around the nearest quarter turn; ±90° buttons make the big turns
  const degrees = toDeg(image.rotation)
  const quarter = Math.round(degrees / 90) * 90
  const refs = image.calibration
  const widthM = image.width * image.scale
  const heightM = image.height * image.scale

  return (
    <Box
      id="base-plan"
      title="Base plan"
      actions={
        <button className="ghost small" onClick={() => void loadBaseImage()} title="Load another image instead of this one">
          Replace…
        </button>
      }
    >
      <div className="row">
        <CheckField label="Visible" checked={image.visible} onChange={(visible) => edit((img) => ({ ...img, visible }))} />
        <CheckField label="Locked" checked={image.locked} onChange={(locked) => edit((img) => ({ ...img, locked }))} />
      </div>
      <SliderField
        label="Opacity"
        value={image.opacity}
        min={0.1}
        max={1}
        step={0.05}
        display={`${Math.round(image.opacity * 100)}%`}
        onPreview={(opacity) => preview((img) => ({ ...img, opacity }))}
        onEnd={end}
      />

      <h3>1 · Straighten</h3>
      <div className="button-row">
        {toolButton('level', 'Level by 2 points', 'Click two points along a line that should be horizontal or vertical')}
        <button disabled={image.locked} title="Turn 90° counter-clockwise" onClick={() => edit((img) => withRotation(img, img.rotation - Math.PI / 2))}>
          ⟲ 90°
        </button>
        <button disabled={image.locked} title="Turn 90° clockwise" onClick={() => edit((img) => withRotation(img, img.rotation + Math.PI / 2))}>
          ⟳ 90°
        </button>
      </div>
      <div className="fields rotation-fields">
        <SliderField
          label="Fine rotation"
          value={degrees - quarter}
          min={-45}
          max={45}
          step={0.05}
          display=""
          onPreview={(fine) => !image.locked && preview((img) => withRotation(img, toRad(quarter + fine)))}
          onEnd={end}
        />
        <NumberField label="Rotation" unit="°" value={degrees} onCommit={(deg) => !image.locked && edit((img) => withRotation(img, toRad(deg)))} />
      </div>

      <h3>2 · Crop &amp; position</h3>
      <div className="button-row">
        {toolButton('crop', 'Crop', 'Drag the frame to hide what is outside the lot')}
        <button disabled={image.locked || !image.crop} onClick={() => edit((img) => ({ ...img, crop: undefined }))}>
          Reset crop
        </button>
        {toolButton('image-move', 'Move', 'Drag the image to position it')}
      </div>

      <h3>3 · Calibrate</h3>
      <p className="muted small">
        {refs.length
          ? `1 px = ${(image.scale * 100).toFixed(3)} cm · image ${widthM.toFixed(2)} × ${heightM.toFixed(2)} m`
          : 'Not calibrated yet: pick both ends of a dimension written on the plan (a long one, e.g. 28,00) and type its value.'}
      </p>
      <div className="button-row">
        {toolButton('calibrate', refs.length ? 'Add known length' : 'Calibrate', 'Click both ends of a known length, then type its value')}
        <CheckField label="Show on plan" checked={prefs.calibration} onChange={(calibration) => setPrefs({ calibration })} />
      </div>
      {refs.length > 0 && (
        <ul className="calibration-list">
          {refs.map((ref, i) => {
            const error = calibrationError(image, ref) * 100
            const level = Math.abs(error) < 0.5 ? 'ok' : Math.abs(error) < 2 ? 'warn' : 'bad'
            return (
              <li key={i}>
                <span>{ref.length.toFixed(2)} m</span>
                {refs.length > 1 && (
                  <span className={`calibration-error ${level}`} title="How far this length reads from its true value at the fitted scale">
                    {error >= 0 ? '+' : ''}
                    {error.toFixed(2)}%
                  </span>
                )}
                <button className="ghost small" title="Remove this known length" disabled={image.locked} onClick={() => editImageInPlace((img) => removeCalibration(img, i))}>
                  ✕
                </button>
              </li>
            )
          })}
        </ul>
      )}
      {refs.length === 1 && <p className="hint">Add a second known length, ideally across the first: the % each one is off tells you how much to trust the photo.</p>}
    </Box>
  )
}
