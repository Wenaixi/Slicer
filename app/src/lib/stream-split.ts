// 流式分割执行器：未加密零拷贝（File.slice 引用视图），
// 加密路径逐块物化 + 用后即弃，敏感材料 finally 擦除。
// 切片通过 onChunk 回调逐块交付，执行器本身不累积结果。

import {
  computeChunkPlan,
  buildChunkName,
  encryptedChunkName,
  type SplitOptions,
} from './split'
import { generateSalt, deriveKeyFromPassword, encryptChunkWithKey } from './crypto'

export interface SplitChunkOut {
  index: number
  name: string
  blob: Blob
}

export interface StreamSplitProgress {
  index: number
  total: number
  bytesDone: number
  bytesTotal: number
  phase: 'derive' | 'slice' | 'encrypt' | 'done'
}

export interface StreamSplitHandlers {
  onChunk: (chunk: SplitChunkOut) => void
  onProgress: (p: StreamSplitProgress) => void
  shouldAbort: () => boolean
}

export interface StreamSplitSummary {
  totalParts: number
  totalOutSize: number
  encrypted: boolean
}

export async function streamSplit(
  file: File,
  options: SplitOptions,
  handlers: StreamSplitHandlers,
): Promise<StreamSplitSummary> {
  const { chunkSize, totalParts } = computeChunkPlan(file.size, options)
  const { onChunk, onProgress, shouldAbort } = handlers

  let fileKey: Uint8Array | null = null
  let salt: Uint8Array | null = null
  if (options.encrypt) {
    onProgress({ index: 0, total: totalParts, bytesDone: 0, bytesTotal: file.size, phase: 'derive' })
    salt = await generateSalt()
    fileKey = await deriveKeyFromPassword(options.password, salt)
  }

  let totalOutSize = 0

  try {
    for (let index = 1; index <= totalParts; index++) {
      if (shouldAbort()) throw new DOMException('已取消', 'AbortError')

      const start = (index - 1) * chunkSize
      const end = Math.min(start + chunkSize, file.size)
      const slice = file.slice(start, end)

      let outName = buildChunkName(file.name, index, totalParts, options.naming)
      let outBlob: Blob

      if (options.encrypt && fileKey && salt) {
        onProgress({ index, total: totalParts, bytesDone: start, bytesTotal: file.size, phase: 'encrypt' })
        const bytes = new Uint8Array(await slice.arrayBuffer())
        const cipher = await encryptChunkWithKey(bytes, fileKey, salt)
        outName = encryptedChunkName(outName)
        outBlob = new Blob([cipher.buffer as ArrayBuffer], { type: 'application/octet-stream' })
      } else {
        // 未加密：File.slice 是磁盘引用视图，不物化 arrayBuffer —— 内存 O(1)
        outBlob = slice
      }

      totalOutSize += outBlob.size
      onChunk({ index, name: outName, blob: outBlob })
      onProgress({ index, total: totalParts, bytesDone: end, bytesTotal: file.size, phase: 'slice' })

      // 让出主线程：每 8 块一次（约 60fps 预算内不感知）
      if (index % 8 === 0) await new Promise((r) => setTimeout(r, 0))
    }
    onProgress({ index: totalParts, total: totalParts, bytesDone: file.size, bytesTotal: file.size, phase: 'done' })
    return { totalParts, totalOutSize, encrypted: options.encrypt }
  } finally {
    if (fileKey) fileKey.fill(0)
  }
}

/** 加密输出大小估算：100B 头 + 68B stanza + Σ(4B len + plain + 16B tag) */
export function estimateEncryptedSize(plainSize: number, chunkSize: number): number {
  const parts = Math.ceil(plainSize / Math.max(1, chunkSize))
  if (plainSize === 0) return 100 + 68 + 20 // 空文件也有 EOF 块
  return 100 + 68 + plainSize + parts * 20
}
