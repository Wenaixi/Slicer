// 流式分割执行器：未加密零拷贝（File.slice 引用视图），
// 加密路径逐块物化 + 用后即弃，敏感材料 finally 擦除。
// 切片通过 onChunk 回调逐块交付，执行器本身不累积结果。
// 支持（1）跳过续传 skipIndices（2）onChunk 同步触发，消费方可立即落盘

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

export type StreamSplitPhase =
  | 'derive'
  | 'slice'
  | 'encrypt'
  | 'skip'
  | 'done'

export interface StreamSplitProgress {
  index: number
  total: number
  bytesDone: number
  bytesTotal: number
  phase: StreamSplitPhase
}

export interface StreamSplitHandlers {
  /**
   * 切片产出回调。签名约定为 async：消费方（直写磁盘、广播、saveProgress）可串行 await，
   * 写盘错误能直接上抛，由外层 catch 统一兜底。
   */
  onChunk: (chunk: SplitChunkOut) => Promise<void>
  onProgress: (p: StreamSplitProgress) => void
  shouldAbort: () => boolean
}

export interface StreamSplitSummary {
  totalParts: number
  handledParts: number
  skippedParts: number
  totalOutSize: number
  encrypted: boolean
}

export interface StreamSplitOptions {
  /** 已完成序号集合：跳过加密与产物生成（断点续传） */
  skipIndices?: Set<number>
}

export async function streamSplit(
  file: File,
  options: SplitOptions,
  handlers: StreamSplitHandlers,
  streamOptions: StreamSplitOptions = {},
): Promise<StreamSplitSummary> {
  const { chunkSize, totalParts } = computeChunkPlan(file.size, options)
  const { onChunk, onProgress, shouldAbort } = handlers
  const skipIndices = streamOptions.skipIndices

  let fileKey: Uint8Array | null = null
  let salt: Uint8Array | null = null
  if (options.encrypt) {
    onProgress({ index: 0, total: totalParts, bytesDone: 0, bytesTotal: file.size, phase: 'derive' })
    salt = await generateSalt()
    fileKey = await deriveKeyFromPassword(options.password, salt)
  }

  let totalOutSize = 0
  let handledParts = 0
  let skippedParts = 0

  try {
    for (let index = 1; index <= totalParts; index++) {
      if (shouldAbort()) throw new DOMException('已取消', 'AbortError')

      const start = (index - 1) * chunkSize
      const end = Math.min(start + chunkSize, file.size)

      if (skipIndices?.has(index)) {
        skippedParts++
        onProgress({ index, total: totalParts, bytesDone: end, bytesTotal: file.size, phase: 'skip' })
        await new Promise((r) => setTimeout(r, 0))
        continue
      }

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
        outBlob = slice
      }

      totalOutSize += outBlob.size
      handledParts++
      // onChunk 约定 async：消费方写盘/广播错误能直接上抛
      await onChunk({ index, name: outName, blob: outBlob })
      onProgress({ index, total: totalParts, bytesDone: end, bytesTotal: file.size, phase: 'slice' })

      if (index % 8 === 0) await new Promise((r) => setTimeout(r, 0))
    }
    onProgress({ index: totalParts, total: totalParts, bytesDone: file.size, bytesTotal: file.size, phase: 'done' })
    return { totalParts, handledParts, skippedParts, totalOutSize, encrypted: options.encrypt }
  } finally {
    if (fileKey) fileKey.fill(0)
  }
}

/** 加密输出大小估算：100B 头 + 68B stanza + Σ(4B len + plain + 16B tag) */
export function estimateEncryptedSize(plainSize: number, chunkSize: number): number {
  const parts = Math.ceil(plainSize / Math.max(1, chunkSize))
  if (plainSize === 0) return 100 + 68 + 20
  return 100 + 68 + plainSize + parts * 20
}
