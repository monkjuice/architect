import { useEffect, useRef, useState } from 'react'
import { parseLength } from '../model/geometry'
import { useEditor, type Prompt } from '../state/store'

/**
 * Asks for a length in meters (store.askLength; "28,00" or "28.00"), a name (store.askText), which of a few things
 * to take (store.askChoice, ticks), or a new board's name and what it feeds (store.askBoard).
 */
export function PromptDialog() {
  const prompt = useEditor((s) => s.prompt)
  const ref = useRef<HTMLDialogElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const [text, setText] = useState('')
  const [ticked, setTicked] = useState<string[]>([])

  useEffect(() => {
    const dialog = ref.current!
    if (prompt && !dialog.open) {
      setText(prompt.kind === 'text' ? prompt.initial : '')
      setTicked(prompt.kind === 'choice' ? prompt.options.filter((o) => o.checked).map((o) => o.id) : [])
      dialog.showModal()
      // select the suggested name so typing replaces it
      requestAnimationFrame(() => inputRef.current?.select())
    } else if (!prompt && dialog.open) dialog.close()
  }, [prompt])

  const length = parseLength(text)
  const valid = prompt?.kind === 'text' || prompt?.kind === 'choice' || length > 0
  return (
    <dialog
      ref={ref}
      className="prompt-dialog"
      onCancel={(e) => {
        e.preventDefault()
        prompt?.resolve(null)
      }}
    >
      {prompt?.kind === 'board' && <BoardForm key={prompt.title + prompt.name} prompt={prompt} />}
      {prompt && prompt.kind !== 'board' && (
        <form
          method="dialog"
          onSubmit={(e) => {
            e.preventDefault()
            if (prompt.kind === 'text') prompt.resolve(text)
            else if (prompt.kind === 'choice') prompt.resolve(prompt.options.filter((o) => ticked.includes(o.id)).map((o) => o.id))
            else if (valid) prompt.resolve(length)
          }}
        >
          <h2>{prompt.title}</h2>
          <p className="muted">{prompt.text}</p>
          {prompt.kind === 'choice' ? (
            <ul className="choice-list">
              {prompt.options.map((o) => (
                <li key={o.id}>
                  <label className="check-field">
                    <input
                      type="checkbox"
                      checked={ticked.includes(o.id)}
                      onChange={(e) => setTicked(e.target.checked ? [...ticked, o.id] : ticked.filter((id) => id !== o.id))}
                    />
                    {o.label}
                  </label>
                  {o.note && <span className="choice-note">{o.note}</span>}
                </li>
              ))}
            </ul>
          ) : (
            <div className="field-input">
              <input
                ref={inputRef}
                autoFocus
                inputMode={prompt.kind === 'length' ? 'decimal' : 'text'}
                placeholder={prompt.kind === 'length' ? 'e.g. 28,00' : ''}
                value={text}
                aria-invalid={text !== '' && !valid}
                onChange={(e) => setText(e.target.value)}
              />
              {prompt.kind === 'length' && <span className="unit">m</span>}
            </div>
          )}
          <div className="button-row dialog-buttons">
            <button type="button" onClick={() => prompt.resolve(null)}>
              Cancel
            </button>
            <button type="submit" className="primary" disabled={!valid} autoFocus={prompt.kind === 'choice'}>
              {prompt.kind === 'length' ? 'Set length' : 'OK'}
            </button>
          </div>
        </form>
      )}
    </dialog>
  )
}

/**
 * A new board: its name, and either the layers it feeds (a main board, fed from the meter) or the board it is fed from
 * and the named areas it feeds (a sub-board).
 */
function BoardForm({ prompt }: { prompt: Extract<Prompt, { kind: 'board' }> }) {
  const [name, setName] = useState(prompt.name)
  const [parent, setParent] = useState(prompt.parent ?? (prompt.subOnly ? (prompt.parents[0]?.key ?? '') : ''))
  const [layers, setLayers] = useState(prompt.layers.filter((o) => o.checked).map((o) => o.id))
  const [areas, setAreas] = useState<string[]>([])
  const sub = parent !== ''
  const toggle = (list: string[], id: string, on: boolean) => (on ? [...list, id] : list.filter((x) => x !== id))
  return (
    <form
      method="dialog"
      className="board-form"
      onSubmit={(e) => {
        e.preventDefault()
        prompt.resolve({ name: name.trim() || prompt.name, parent: sub ? parent : null, layers: sub ? [] : layers, areas: sub ? areas : [] })
      }}
    >
      <h2>{prompt.title}</h2>
      <div className="field">
        <label htmlFor="board-name">Name</label>
        <input id="board-name" autoFocus value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="field">
        <label htmlFor="board-parent">Fed from</label>
        <select id="board-parent" value={parent} onChange={(e) => setParent(e.target.value)}>
          {!prompt.subOnly && <option value="">The meter (a main board: it feeds layers)</option>}
          {prompt.parents.map((p) => (
            <option key={p.key} value={p.key}>
              {p.label} (a sub-board: it feeds areas)
            </option>
          ))}
        </select>
      </div>
      {sub ? (
        <>
          <p className="muted">The named areas it feeds: their points come off the board that feeds their layer. Each area feeds from one sub-board.</p>
          {!prompt.areas.length && <p className="hint warning">No named areas yet: name the rooms with Area (A) on the Floor tab.</p>}
          <div className="choice-groups">
            {prompt.areas.map((g) => (
              <div key={g.layer}>
                <h3>{g.label}</h3>
                <ul className="choice-list">
                  {g.options.map((o) => (
                    <li key={o.id}>
                      <label className="check-field">
                        <input type="checkbox" checked={areas.includes(o.id)} onChange={(e) => setAreas(toggle(areas, o.id, e.target.checked))} />
                        {o.label}
                      </label>
                      {o.note && <span className="choice-note">{o.note}</span>}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </>
      ) : (
        <>
          <p className="muted">The layers it feeds: its circuits take the switches, light outlets and sockets on them. Each layer feeds from one main board.</p>
          <ul className="choice-list">
            {prompt.layers.map((o) => (
              <li key={o.id}>
                <label className="check-field">
                  <input type="checkbox" checked={layers.includes(o.id)} onChange={(e) => setLayers(toggle(layers, o.id, e.target.checked))} />
                  {o.label}
                </label>
                {o.note && <span className="choice-note">{o.note}</span>}
              </li>
            ))}
          </ul>
        </>
      )}
      <div className="button-row dialog-buttons">
        <button type="button" onClick={() => prompt.resolve(null)}>
          Cancel
        </button>
        <button type="submit" className="primary">
          OK
        </button>
      </div>
    </form>
  )
}
