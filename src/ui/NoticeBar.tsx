import { useEffect } from 'react'
import { getStore, useEditor } from '../state/store'

/** Info notices without an action fade after a while; errors stay until dismissed. */
const INFO_MS = 7000

export function NoticeBar() {
  const notice = useEditor((s) => s.notice)
  useEffect(() => {
    if (!notice || notice.kind !== 'info' || notice.action) return
    const timer = setTimeout(() => {
      if (getStore().getState().notice === notice) getStore().notify(undefined)
    }, INFO_MS)
    return () => clearTimeout(timer)
  }, [notice])
  if (!notice) return null
  const dismiss = () => getStore().notify(undefined)
  return (
    <div className={`notice notice-${notice.kind}`} role={notice.kind === 'error' ? 'alert' : 'status'}>
      <div className="notice-body">
        <span>{notice.text}</span>
        {notice.details && (
          <ul>
            {notice.details.map((detail, i) => (
              <li key={i}>{detail}</li>
            ))}
          </ul>
        )}
      </div>
      {notice.action && <button onClick={() => notice.action!.run()}>{notice.action.label}</button>}
      <button className="ghost" onClick={dismiss} aria-label="Dismiss">
        ✕
      </button>
    </div>
  )
}
