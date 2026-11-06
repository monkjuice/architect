import { useId, useState, type ReactNode } from 'react'
import { findMaterial, materialGroups, type Surface } from '../model/materials'
import { setPrefs, usePrefs } from '../state/prefs'

/** Inputs that commit on blur or Enter, so one edit is one undo step; Escape reverts. */

/** Local text for an input that starts over whenever the committed value changes (undo, another edit). */
function useDraft(committed: string): [string, (text: string) => void] {
  const [text, setText] = useState(committed)
  const [base, setBase] = useState(committed)
  if (base !== committed) {
    setBase(committed)
    setText(committed)
  }
  return [text, setText]
}

export function NumberField({
  label,
  value,
  onCommit,
  min,
  unit = 'm',
  digits = 2,
}: {
  label: string
  /** Null when the selected items differ: the field starts empty, and a number typed in sets them all. */
  value: number | null
  onCommit: (value: number) => void
  min?: number
  unit?: string
  /** Decimals shown; the value is committed only when the typed number differs from what is shown. */
  digits?: number
}) {
  const id = useId()
  const shown = value === null ? '' : value.toFixed(digits)
  const [text, setText] = useDraft(shown)
  const parsed = Number(text.trim().replace(',', '.'))
  const blank = text.trim() === ''
  const invalid = blank ? value !== null : !Number.isFinite(parsed) || (min !== undefined && parsed < min)
  const commit = () => {
    if (invalid || blank) return setText(shown)
    if (text.trim() !== shown) onCommit(parsed)
  }
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <div className="field-input">
        <input
          id={id}
          inputMode="decimal"
          value={text}
          placeholder={value === null ? 'mixed' : undefined}
          aria-invalid={invalid}
          onChange={(event) => setText(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === 'Enter') (event.target as HTMLInputElement).blur()
            if (event.key === 'Escape') setText(shown)
          }}
        />
        {unit && <span className="unit">{unit}</span>}
      </div>
    </div>
  )
}

export function TextField({ label, value, onCommit }: { label: string; value: string; onCommit: (value: string) => void }) {
  const id = useId()
  const [text, setText] = useDraft(value)
  const commit = () => {
    if (text.trim() === '') return setText(value)
    if (text !== value) onCommit(text.trim())
  }
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        value={text}
        spellCheck={false}
        onChange={(event) => setText(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') (event.target as HTMLInputElement).blur()
          if (event.key === 'Escape') setText(value)
        }}
      />
    </div>
  )
}

/** Buttons for a small set of choices; none is highlighted when `value` is undefined (a mixed selection). */
export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
  title,
}: {
  label?: string
  value: T | undefined
  options: readonly (readonly [T, string])[]
  onChange: (value: T) => void
  title?: string
}) {
  return (
    <div className="segmented-field" title={title}>
      {label && <span className="segmented-label">{label}</span>}
      <div className="segmented" role="radiogroup">
        {options.map(([option, text]) => (
          <button key={option} role="radio" aria-checked={value === option} className={value === option ? 'active' : ''} onClick={() => onChange(option)}>
            {text}
          </button>
        ))}
      </div>
    </div>
  )
}

export function SelectField<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: T
  options: readonly (readonly [T, string])[]
  onChange: (value: T) => void
}) {
  const id = useId()
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <select id={id} value={value} onChange={(event) => onChange(event.target.value as T)}>
        {options.map(([option, title]) => (
          <option key={option} value={option}>
            {title}
          </option>
        ))}
      </select>
    </div>
  )
}

export function CheckField({
  label,
  checked,
  onChange,
  title,
  disabled,
}: {
  label: string
  checked: boolean
  onChange: (checked: boolean) => void
  title?: string
  disabled?: boolean
}) {
  return (
    <label className="check-field" title={title}>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(event) => onChange(event.target.checked)} />
      {label}
    </label>
  )
}

/**
 * A range input whose drag is one undo step: `onPreview` runs while it moves, `onEnd` when it is released
 * (the change event) so the caller can close the gesture.
 */
export function SliderField({
  label,
  value,
  min,
  max,
  step,
  display,
  onPreview,
  onEnd,
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  display: string
  onPreview: (value: number) => void
  onEnd: () => void
}) {
  const id = useId()
  return (
    <div className="field">
      <label htmlFor={id}>
        {label} <span className="field-value">{display}</span>
      </label>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onPreview(Number(event.target.value))}
        onPointerUp={onEnd}
        onKeyUp={onEnd}
      />
    </div>
  )
}

/**
 * A panel section; with an `id` its title folds it away and back, remembered per browser. `className` styles it
 * as a group of sections (`group`) or a section inside one.
 */
export function Box({ title, children, actions, id, className }: { title: ReactNode; children: ReactNode; actions?: ReactNode; id?: string; className?: string }) {
  const { collapsed } = usePrefs()
  const folded = !!id && collapsed.includes(id)
  const toggle = () => id && setPrefs({ collapsed: folded ? collapsed.filter((c) => c !== id) : [...collapsed, id] })
  return (
    <section className={['box', className, folded && 'collapsed'].filter(Boolean).join(' ')} data-box={id}>
      <header className="box-header">
        {id ? (
          <button className="box-toggle" aria-expanded={!folded} onClick={toggle} title={folded ? 'Show' : 'Hide'}>
            <span className="chevron" aria-hidden="true">
              ▸
            </span>
            <h2>{title}</h2>
          </button>
        ) : (
          <h2>{title}</h2>
        )}
        {actions}
      </header>
      {!folded && children}
    </section>
  )
}

/**
 * A finish to pick, by family: the materials that suit the surface where it is (outdoors or not; either when that
 * is not known), and the one it has even when it does not, so it still shows.
 */
export function MaterialField({
  label,
  surface,
  outdoor,
  value,
  onChange,
}: {
  label: string
  surface: Surface
  outdoor: boolean | undefined
  value: string | undefined
  onChange: (material: string | null) => void
}) {
  const fieldId = useId()
  const groups = materialGroups(surface, outdoor)
  const current = findMaterial(value)
  const listed = !current || groups.some((g) => g.materials.includes(current))
  return (
    <div className="field field-wide">
      <label htmlFor={fieldId}>{label}</label>
      <select id={fieldId} value={value ?? ''} onChange={(event) => onChange(event.target.value || null)}>
        <option value="">None</option>
        {!listed && current && <option value={current.id}>{current.title} (does not suit it)</option>}
        {groups.map(({ group, materials }) => (
          <optgroup key={group} label={group}>
            {materials.map((m) => (
              <option key={m.id} value={m.id}>
                {m.title}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
    </div>
  )
}
