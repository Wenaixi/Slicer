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

/** 写入文件夹里的指定文件（File System Access API），流式 append 模式 */
export interface FsFileInDirectory {
  write: (data: Blob | ArrayBuffer) => Promise<void>
  close: () => Promise<void>
  name: string
  fullPath: string
}

/**
 * 让用户选一个文件夹，再在里头创建（覆盖）目标文件并返回可流式写入的句柄。
 * 浏览器不支持时返回 null（调用方走降级：内存累积 + a 标签下载）。
 */
export async function pickDirectorySaveLocation(
  fileName: string,
): Promise<FsFileInDirectory | null> {
  if (typeof window === 'undefined') return null
  if (!window.showDirectoryPicker || !window.showSaveFilePicker) return null
  try {
    // 优先尝试 showSaveFilePicker：浏览器原生定位目标位置，体验最佳
    const handle = await window.showSaveFilePicker({ suggestedName: fileName })
    const writable = await handle.createWritable()
    return {
      name: handle.name,
      fullPath: handle.name,
      async write(data) {
        await writable.write(data)
      },
      async close() {
        await writable.close()
      },
    }
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') return null
    return null
  }
}

/**
 * 用户选一个文件夹，我们直接在该文件夹下创建/覆盖目标文件。
 * 适合大文件合并场景：边解密边逐块 append，浏览器内存峰值 ≈ chunkSize。
 */
export async function pickFolderAndCreateFile(
  fileName: string,
): Promise<FsFileInDirectory | null> {
  if (typeof window === 'undefined') return null
  if (!window.showDirectoryPicker) return null
  try {
    const dir = await window.showDirectoryPicker({ mode: 'readwrite' })
    const fileHandle = await (dir as unknown as {
      getFileHandle: (n: string, opts: { create: boolean }) => Promise<FileSystemFileHandle>
    }).getFileHandle(fileName, { create: true })
    const writable = await (fileHandle as unknown as {
      createWritable: () => Promise<{
        write: (d: Blob | ArrayBuffer) => Promise<void>
        close: () => Promise<void>
      }>
    }).createWritable()
    return {
      name: fileName,
      fullPath: `${dir.name}/${fileName}`,
      async write(data) {
        await writable.write(data)
      },
      async close() {
        await writable.close()
      },
    }
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') return null
    return null
  }
}

export function supportsDirectorySave(): boolean {
  return typeof window !== 'undefined' && typeof window.showDirectoryPicker === 'function'
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
