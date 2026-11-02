// File System Access API pickers (Chromium only; absent elsewhere, hence optional).
interface FilePickerType {
  description?: string
  accept: Record<string, string[]>
}

interface Window {
  showOpenFilePicker?: (options?: { types?: FilePickerType[]; multiple?: boolean }) => Promise<FileSystemFileHandle[]>
  showSaveFilePicker?: (options?: { suggestedName?: string; types?: FilePickerType[] }) => Promise<FileSystemFileHandle>
}
