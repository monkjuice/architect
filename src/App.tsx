import { lazy, Suspense, useEffect } from 'react'
import './App.css'
import type { Plan } from './model/plan'
import { serializePlan } from './model/planFile'
import { loadBaseImage, openPlan, savePlan } from './state/actions'
import { writeDraft } from './state/files'
import { getStore, useEditor } from './state/store'
import { ElevationsTab } from './ui/ElevationsTab'
import { FloorTab } from './ui/FloorTab'
import { RoofTab } from './ui/RoofTab'
import { PromptDialog } from './ui/PromptDialog'
import { TopBar } from './ui/TopBar'

/** three.js is large: the 3-D view loads only when its tab is opened. */
const ExteriorTab = lazy(() => import('./ui/exterior/ExteriorTab'))

export default function App() {
  const tab = useEditor((s) => s.tab)
  useDraftAutosave()
  useShortcuts()
  usePastedImage()
  return (
    <div className="app">
      <TopBar />
      {tab === 'floor' && <FloorTab />}
      {tab === 'roof' && <RoofTab />}
      {tab === 'elevations' && <ElevationsTab />}
      {tab === 'exterior' && (
        <Suspense fallback={<p className="tab-loading">Loading the 3-D view…</p>}>
          <ExteriorTab />
        </Suspense>
      )}
      <PromptDialog />
    </div>
  )
}

/** Keeps the latest plan, active layer and view in IndexedDB so a reload or crash does not lose work. */
function useDraftAutosave() {
  useEffect(() => {
    const store = getStore()
    let timer: ReturnType<typeof setTimeout> | undefined
    let last = store.getState()
    let serialized: { plan: Plan; text: string } | undefined
    let warned = false
    const unsubscribe = store.subscribe(() => {
      const state = store.getState()
      if (state.plan === last.plan && state.activeLayer === last.activeLayer && state.view === last.view && state.file === last.file) return
      last = state
      clearTimeout(timer)
      timer = setTimeout(() => {
        const { plan, file, activeLayer, view } = store.getState()
        try {
          if (serialized?.plan !== plan) serialized = { plan, text: serializePlan(plan) }
          const draft = { savedAt: new Date().toISOString(), fileName: file.name, text: serialized.text, dirty: plan !== file.saved, activeLayer, view }
          writeDraft(draft).catch((error: unknown) => {
            console.error('Autosave failed', error)
            if (!warned) store.notify({ kind: 'error', text: `Autosave failed: ${(error as Error).message}. Save the plan to a file to keep your work.` })
            warned = true
          })
        } catch (error) {
          console.error('Autosave failed', error)
        }
      }, 400)
    })
    return () => {
      clearTimeout(timer)
      unsubscribe()
    }
  }, [])
}

function useShortcuts() {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const store = getStore()
      if ((event.target as HTMLElement | null)?.closest('input, textarea, select, [contenteditable="true"]') || store.getState().prompt) return
      const mod = event.ctrlKey || event.metaKey
      if (!mod) return
      const key = event.key.toLowerCase()
      if (key === 's') {
        event.preventDefault()
        void savePlan(event.shiftKey)
      } else if (key === 'o') {
        event.preventDefault()
        void openPlan()
      } else if (key === 'z') {
        event.preventDefault()
        if (event.shiftKey) store.redo()
        else store.undo()
      } else if (key === 'y') {
        event.preventDefault()
        store.redo()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}

/** Ctrl+V with an image on the clipboard, on the floor plan, loads it as the base plan. */
function usePastedImage() {
  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      if ((event.target as HTMLElement | null)?.closest('input, textarea') || getStore().getState().tab !== 'floor') return
      const file = [...(event.clipboardData?.files ?? [])].find((f) => f.type.startsWith('image/'))
      if (!file) return
      event.preventDefault()
      void loadBaseImage(file)
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [])
}
