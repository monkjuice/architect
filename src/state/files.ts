import type { Viewport } from './store'

/**
 * Opening and saving without a backend: the File System Access API where the browser has it (Chromium:
 * Save writes back to the opened file), file input and download elsewhere. A draft of the latest state is
 * kept in IndexedDB, because a plan embeds its base image and localStorage is too small for photos.
 */

export interface OpenedFile {
  text: string
  name: string
  handle?: FileSystemFileHandle
}

const JSON_TYPE = { description: 'Architect plan', accept: { 'application/json': ['.json'] } }

export async function pickPlanFile(): Promise<OpenedFile | undefined> {
  if (window.showOpenFilePicker) {
    try {
      const [handle] = await window.showOpenFilePicker({ types: [JSON_TYPE], multiple: false })
      const file = await handle.getFile()
      return { text: await file.text(), name: file.name, handle }
    } catch (error) {
      if (isAbort(error)) return undefined
      throw error
    }
  }
  const file = await pickFile('.json,application/json')
  return file && { text: await file.text(), name: file.name }
}

/** Asks for a file with a plain file input; undefined when the user picks nothing. */
export function pickFile(accept: string): Promise<File | undefined> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = accept
    input.onchange = () => resolve(input.files?.[0])
    input.oncancel = () => resolve(undefined)
    input.click()
  })
}

/** Writes to `handle` when given, otherwise asks where to save (or downloads). */
export async function savePlanFile(
  text: string,
  suggestedName: string,
  handle?: FileSystemFileHandle,
): Promise<{ name: string; handle?: FileSystemFileHandle } | undefined> {
  let target = handle
  if (!target && window.showSaveFilePicker) {
    try {
      target = await window.showSaveFilePicker({ suggestedName, types: [JSON_TYPE] })
    } catch (error) {
      if (isAbort(error)) return undefined
      throw error
    }
  }
  if (!target) {
    downloadBlob(new Blob([text], { type: 'application/json' }), suggestedName)
    return { name: suggestedName }
  }
  const writable = await target.createWritable()
  try {
    await writable.write(text)
  } finally {
    await writable.close()
  }
  return { name: target.name, handle: target }
}

export function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = name
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function isAbort(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError'
}

// ---- base images -----------------------------------------------------------------------------------------

/** Larger images are scaled down on import: plenty for a plan, and it keeps files and the draft small. */
const MAX_IMAGE_SIDE = 4096

export interface ImportedImage {
  src: string
  width: number
  height: number
  /** The original size when the image was scaled down. */
  original?: { width: number; height: number }
}

export async function readImageFile(file: Blob): Promise<ImportedImage> {
  const src = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error ?? new Error('The file could not be read.'))
    reader.readAsDataURL(file)
  })
  const img = new Image()
  img.src = src
  try {
    await img.decode()
  } catch {
    throw new Error('The browser cannot read this image (try a JPEG or PNG).')
  }
  const { naturalWidth: width, naturalHeight: height } = img
  if (!width || !height) throw new Error('The image has no size.')
  const k = MAX_IMAGE_SIDE / Math.max(width, height)
  if (k >= 1) return { src, width, height }
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(width * k)
  canvas.height = Math.round(height * k)
  const ctx = canvas.getContext('2d')!
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
  return { src: canvas.toDataURL('image/jpeg', 0.92), width: canvas.width, height: canvas.height, original: { width, height } }
}

// ---- autosaved draft -------------------------------------------------------------------------------------

export interface Draft {
  savedAt: string
  fileName: string
  /** The plan, serialized as a plan file. */
  text: string
  /** Whether it held changes that were not saved to a file. */
  dirty: boolean
  activeLayer?: string
  view?: Viewport
}

const DB_NAME = 'architect'
const STORE = 'drafts'
const DRAFT_KEY = 'current'

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1)
    request.onupgradeneeded = () => request.result.createObjectStore(STORE)
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

async function withStore<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb()
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE, mode)
      const request = run(tx.objectStore(STORE))
      tx.oncomplete = () => resolve(request.result)
      tx.onerror = () => reject(tx.error)
      tx.onabort = () => reject(tx.error ?? new Error('The draft transaction was aborted.'))
    })
  } finally {
    db.close()
  }
}

export async function readDraft(): Promise<Draft | undefined> {
  try {
    const draft = (await withStore('readonly', (s) => s.get(DRAFT_KEY))) as Partial<Draft> | undefined
    return draft && typeof draft.text === 'string' && typeof draft.savedAt === 'string'
      ? { savedAt: draft.savedAt, fileName: draft.fileName ?? 'house-plan.json', text: draft.text, dirty: !!draft.dirty, activeLayer: draft.activeLayer, view: draft.view }
      : undefined
  } catch (error) {
    console.error('Could not read the autosaved draft', error)
    return undefined
  }
}

export function writeDraft(draft: Draft): Promise<unknown> {
  return withStore('readwrite', (s) => s.put(draft, DRAFT_KEY))
}
