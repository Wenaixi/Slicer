// 断点续传支持：直写磁盘模式下，检测目录里已存在的同名切片，跳过这些切片
// 同时将进度持久化到 sessionStorage，跨页面刷新也能继续

import type { SplitOptions } from './split'

export interface SplitResumePlan {
  /** 是否可续传（磁盘上已存在部分切片） */
  resumable: boolean
  /** 已完成的序号集合（1 起） */
  completedIndices: number[]
  /** 跳过的序号集合（总列表 - 已完成 = 待处理） */
  pendingIndices: number[]
}

/** 探测目录里已存在的切片并生成续传计划 */
export async function probeResumePlan(
  dirHandle: FileSystemDirectoryHandle,
  fileName: string,
  options: Pick<SplitOptions, 'naming'>,
  totalParts: number,
): Promise<SplitResumePlan> {
  // 推断切片名前缀（part/number/infix 各有不同）
  const baseNameWithoutExt = fileName.replace(/\.[^.]+$/, '')

  const completed = new Set<number>()
  try {
    for await (const [name] of (dirHandle as unknown as {
      entries: () => AsyncIterable<[string, unknown]>
    }).entries()) {
      // 部分切片（产生中写过、中途取消）也会被记录，但全部有效
      // 这里按"存在且大小>0即视为完成"
      const handle = await (dirHandle as unknown as {
        getFileHandle: (n: string, opts?: { create?: boolean }) => Promise<FileSystemFileHandle>
      }).getFileHandle(name)
      const file = await (handle as unknown as { getFile: () => Promise<File> }).getFile()
      if (file.size <= 0) continue
      const idx = parseIndex(name, baseNameWithoutExt, options.naming)
      if (idx !== null) completed.add(idx)
    }
  } catch {
    // entries 不可迭代（隐私模式或无权限）：当作不可续传
    return { resumable: false, completedIndices: [], pendingIndices: [] }
  }

  const completedIndices = [...completed].sort((a, b) => a - b)
  const pendingIndices: number[] = []
  for (let i = 1; i <= totalParts; i++) {
    if (!completed.has(i)) pendingIndices.push(i)
  }
  return {
    resumable: completedIndices.length > 0 && pendingIndices.length > 0,
    completedIndices,
    pendingIndices,
  }
}

/** 进度记录到 sessionStorage */
export interface SplitProgress {
  fileName: string
  fileSize: number
  options: SplitOptions
  completedIndices: number[]
  startedAt: number
  updatedAt: number
}

const STORAGE_KEY = 'slicer:split-progress'

export function saveProgress(progress: SplitProgress): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(progress))
  } catch {}
}

export function loadProgress(): SplitProgress | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    return JSON.parse(raw) as SplitProgress
  } catch {
    return null
  }
}

export function clearProgress(): void {
  try {
    sessionStorage.removeItem(STORAGE_KEY)
  } catch {}
}

/** 从文件名解析分片序号（导出供测试做回归保护） */
export function parseIndex(
  chunkName: string,
  baseName: string,
  pattern: SplitOptions['naming'],
): number | null {
  let m: RegExpMatchArray | null
  if (pattern === 'part') {
    m = chunkName.match(/\.part(\d+)(?:\.sc)?$/)
  } else if (pattern === 'number') {
    m = chunkName.match(/\.(\d{3,4})(?:\.sc)?$/)
  } else {
    // infix：原文件名_part1.ext
    const escBase = baseName.replace(/\.[^.]+$/, '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    m = chunkName.match(new RegExp(`^${escBase}_part(\\d+)(?:\\.sc)?$`))
  }
  if (!m) return null
  const n = parseInt(m[1], 10)
  return isFinite(n) ? n : null
}
