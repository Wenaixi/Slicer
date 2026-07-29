// File System Access API 包装：可选"保存到文件夹"模式，浏览器原生流式写盘。
// 不支持时降级为内存 Blob + a 标签下载。

declare global {
  interface Window {
    showSaveFilePicker?: (opts?: {
      suggestedName?: string
      types?: { description?: string; accept: Record<string, string[]> }[]
    }) => Promise<FileSystemFileHandle>
    showDirectoryPicker?: (opts?: { mode?: 'read' | 'readwrite' }) => Promise<FileSystemDirectoryHandle>
  }
}

export interface FsFileHandle {
  write: (data: Blob | ArrayBuffer) => Promise<void>
  close: () => Promise<void>
  name: string
}

/** 尝试让用户选保存路径，未授权或不支持时返回 null（由调用方走降级下载） */
export async function pickSaveLocation(
  suggestedName: string,
): Promise<FsFileHandle | null> {
  if (typeof window === 'undefined') return null
  if (!window.showSaveFilePicker) return null
  try {
    const handle = await window.showSaveFilePicker({ suggestedName })
    const writable = await handle.createWritable()
    return {
      name: suggestedName,
      async write(data) {
        await writable.write(data)
      },
      async close() {
        await writable.close()
      },
    }
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') return null
    // 浏览器禁用（隐私模式 / 权限）：返回 null
    return null
  }
}

export function supportsFsAccess(): boolean {
  return typeof window !== 'undefined' && typeof window.showSaveFilePicker === 'function'
}

/** 简单包装：用 a 标签下载降级 */
export function fallbackDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}
