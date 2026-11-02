import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { createPlan } from './model/plan'
import { parsePlanText } from './model/planFile'
import { DEFAULT_FILE_NAME } from './state/actions'
import { readDraft } from './state/files'
import { EditorStore, initStore } from './state/store'

const root = createRoot(document.getElementById('root')!)

/** Starts on the autosaved draft when there is a valid one, otherwise on a new plan. */
async function start() {
  const draft = await readDraft()
  const fresh = createPlan()
  let store = new EditorStore(fresh, { name: DEFAULT_FILE_NAME, saved: fresh })
  if (draft) {
    const result = parsePlanText(draft.text)
    if (result.ok) {
      // a draft with unsaved changes stays marked unsaved: there is no file it matches
      const saved = draft.dirty ? fresh : result.plan
      store = new EditorStore(result.plan, { name: draft.fileName, saved }, { activeLayer: draft.activeLayer, view: draft.view })
    } else {
      store = new EditorStore(fresh, { name: DEFAULT_FILE_NAME, saved: fresh }, {
        notice: { kind: 'error', text: 'The autosaved plan could not be restored, so this is a new one.', details: result.errors.slice(0, 8) },
      })
    }
  }
  initStore(store)
  root.render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}

start().catch((error: unknown) => {
  root.render(
    <div className="fatal">
      <h1>Architect could not start</h1>
      <pre>{(error as Error).message}</pre>
    </div>,
  )
})
