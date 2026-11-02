import { useEffect, useRef, useState } from 'react'
import { parseLength } from '../model/geometry'
import { useEditor } from '../state/store'

/** Asks for a length in meters (store.askLength; "28,00" or "28.00") or a name (store.askText). */
export function PromptDialog() {
  const prompt = useEditor((s) => s.prompt)
  const ref = useRef<HTMLDialogElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const [text, setText] = useState('')

  useEffect(() => {
    const dialog = ref.current!
    if (prompt && !dialog.open) {
      setText(prompt.kind === 'text' ? prompt.initial : '')
      dialog.showModal()
      // select the suggested name so typing replaces it
      requestAnimationFrame(() => inputRef.current?.select())
    } else if (!prompt && dialog.open) dialog.close()
  }, [prompt])

  const length = parseLength(text)
  const valid = prompt?.kind === 'text' || length > 0
  return (
    <dialog
      ref={ref}
      className="prompt-dialog"
      onCancel={(e) => {
        e.preventDefault()
        prompt?.resolve(null)
      }}
    >
      {prompt && (
        <form
          method="dialog"
          onSubmit={(e) => {
            e.preventDefault()
            if (prompt.kind === 'text') prompt.resolve(text)
            else if (valid) prompt.resolve(length)
          }}
        >
          <h2>{prompt.title}</h2>
          <p className="muted">{prompt.text}</p>
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
          <div className="button-row dialog-buttons">
            <button type="button" onClick={() => prompt.resolve(null)}>
              Cancel
            </button>
            <button type="submit" className="primary" disabled={!valid}>
              {prompt.kind === 'length' ? 'Set length' : 'OK'}
            </button>
          </div>
        </form>
      )}
    </dialog>
  )
}
