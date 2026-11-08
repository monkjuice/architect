import { useEffect, useRef, useState, type ReactNode } from 'react'
import { loadBaseImage, newPlan, openPlan, openTab, savePlan } from '../state/actions'
import { getStore, useEditor, type Tab } from '../state/store'

/** The tabs in order; those not built yet show, disabled. */
const TABS: { id: Tab; title: string; ready?: boolean }[] = [
  { id: 'foundation', title: 'Foundation' },
  { id: 'floor', title: 'Floor', ready: true },
  { id: 'roof', title: 'Roof', ready: true },
  { id: 'elevations', title: 'Elevations', ready: true },
  { id: 'exterior', title: 'Exterior', ready: true },
  { id: 'interior', title: 'Interior' },
  { id: 'plumbing', title: 'Plumbing' },
  { id: 'electricity', title: 'Electricity' },
  { id: 'gas', title: 'Gas' },
  { id: 'materials', title: 'Materials', ready: true },
]

/**
 * The first row of the bar: the file, the tabs, undo and saving, which every tab shares. Each tab draws its own
 * actions in the row under it (see FloorTab, RoofTab, ElevationsTab, ExteriorTab and MaterialsTab).
 */
export function TopBar() {
  const store = getStore()
  const tab = useEditor((s) => s.tab)
  const plan = useEditor((s) => s.plan)
  const file = useEditor((s) => s.file)
  const canUndo = useEditor((s) => s.past.length > 0)
  const canRedo = useEditor((s) => s.future.length > 0)
  const dirty = plan !== file.saved

  return (
    <header className="topbar">
      <div className="brand">
        <span className="brand-mark">ARCHITECT</span>
      </div>
      <div className="project-title" title={file.name}>
        <span className="file-name">
          {file.name}
          {dirty && (
            <span className="dirty" title="Unsaved changes (autosaved in this browser)">
              ●
            </span>
          )}
        </span>
      </div>
      <nav className="tabs" aria-label="Tabs">
        {TABS.map(({ id, title, ready }) => (
          <button
            key={id}
            className={tab === id ? 'tab active' : 'tab'}
            aria-current={tab === id ? 'page' : undefined}
            disabled={!ready}
            title={ready ? undefined : `${title}: not built yet`}
            onClick={() => openTab(id)}
          >
            {title}
          </button>
        ))}
      </nav>
      <div className="toolbar-group history">
        <button onClick={() => store.undo()} disabled={!canUndo} title="Undo (Ctrl+Z)">
          Undo
        </button>
        <button onClick={() => store.redo()} disabled={!canRedo} title="Redo (Ctrl+Y)">
          Redo
        </button>
      </div>
      <div className="toolbar-group file-actions">
        <button onClick={() => void openPlan()} title="Open a plan file (Ctrl+O)">
          Open…
        </button>
        <button className="primary" onClick={() => void savePlan()} title="Save (Ctrl+S)">
          Save
        </button>
        <Menu label="More">
          <button onClick={() => void savePlan(true)}>Save as… (Ctrl+Shift+S)</button>
          <button onClick={newPlan}>New plan</button>
          <hr />
          <button onClick={() => void loadBaseImage()}>{plan.image ? 'Replace base image…' : 'Load base image…'}</button>
        </Menu>
      </div>
    </header>
  )
}

function Menu({ label, children }: { label: string; children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const close = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false)
    }
    window.addEventListener('pointerdown', close)
    return () => window.removeEventListener('pointerdown', close)
  }, [open])
  return (
    <div className="menu" ref={ref}>
      <button aria-expanded={open} onClick={() => setOpen(!open)}>
        {label} ▾
      </button>
      {open && (
        <div className="menu-popup" role="menu" onClick={() => setOpen(false)}>
          {children}
        </div>
      )}
    </div>
  )
}
