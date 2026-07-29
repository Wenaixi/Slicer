// 流式合并执行器：明文/加密两条路径统一接口，onPlainChunk 回调逐块交付，
// 浏览器内存占用恒定 O(chunkSize)，可直写磁盘（File System Access API）。
// 大文件（10GB+）也不会因为累加 chunks 数组而爆内存。
// 解密错误用 classifyDecryptError 细分为「密码错误 vs 文件损坏」，调用方可据此兜底。

import { isSealGoFile, decryptChunkWithPassword } from './crypto'
import { classifyDecryptError, kindLabel, type ClassifiedError } from './decrypt-error'

export class StreamMergeError extends Error {
  originalName: string
  classified: ClassifiedError
  itemIndex: number

  constructor(originalName: string, classified: ClassifiedError, itemIndex: number) {
    super(`${originalName}: ${classified.message}`)
    this.originalName = originalName
    this.classified = classified
    this.itemIndex = itemIndex
  }
}

export interface StreamMergeHandlers {
  /** 产出一个明文块（Blob）；index 从 0 起 */
  onPlainChunk: (chunk: { index: number; blob: Blob; bytes: number }) => void
  /** 进度回调：index=当前切片序号；bytesDone=累计明文字节；bytesTotal=预估总明文字节 */
  onProgress: (p: { index: number; total: number; bytesDone: number; bytesTotal: number }) => void
  /** 中断探测 */
  shouldAbort: () => boolean
}

export interface StreamMergeSummary {
  totalParts: number
  mergedParts: number
  totalOutSize: number
}

/**
 * 流式合并切片组。
 * @param items 已按序号排序的切片文件列表
 * @param options.encrypted 是否加密组（决定走解密路径）
 * @param options.password 密码（加密组必填）
 * @param options.bytesTotal 预估总明文字节（来自 group.totalSize，加密组粗估用）
 */
export async function streamMerge(
  items: { file: File; originalName: string }[],
  options: {
    encrypted: boolean
    password?: string
    bytesTotal: number
  },
  handlers: StreamMergeHandlers,
): Promise<StreamMergeSummary> {
  const { onPlainChunk, onProgress, shouldAbort } = handlers
  const total = items.length
  let mergedParts = 0
  let bytesDone = 0
  const totalOutSize = options.bytesTotal

  for (let i = 0; i < total; i++) {
    if (shouldAbort()) throw new DOMException('已取消', 'AbortError')

    const item = items[i]
    let plainBytes: Uint8Array

    if (options.encrypted) {
      const buf = new Uint8Array(await item.file.arrayBuffer())
      if (!isSealGoFile(buf)) {
        throw new StreamMergeError(item.originalName, {
          kind: 'not-sealgo',
          message: '不是合法的 SealGo 加密文件（缺少 SC01 魔数）',
          hint: '只有以 .sc 结尾的加密切片才能解密',
        }, i)
      }
      if (!options.password) {
        throw new StreamMergeError(item.originalName, {
          kind: 'wrong-password',
          message: '请先输入密码',
          hint: '解密需要密码',
        }, i)
      }
      try {
        plainBytes = await decryptChunkWithPassword(buf, options.password)
      } catch (err) {
        const classified = classifyDecryptError(buf, err)
        throw new StreamMergeError(item.originalName, classified, i)
      }
    } else {
      // 明文：直接读 arrayBuffer（用 Uint8Array 统一接口）
      plainBytes = new Uint8Array(await item.file.arrayBuffer())
    }

    bytesDone += plainBytes.byteLength
    // 物化为 Blob 时用 .buffer as ArrayBuffer 规避 SharedArrayBuffer 类型推断
    const blob = new Blob([plainBytes.buffer as ArrayBuffer], { type: 'application/octet-stream' })
    onPlainChunk({ index: i, blob, bytes: plainBytes.byteLength })
    onProgress({ index: i + 1, total, bytesDone, bytesTotal: totalOutSize })
    mergedParts++

    // 每块让出主线程（与 stream-split 一致）
    if (i % 4 === 3) await new Promise((r) => setTimeout(r, 0))
  }

  return { totalParts: total, mergedParts, totalOutSize: bytesDone }
}

export { kindLabel }