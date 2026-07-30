// 流式合并执行器：明文/加密两条路径统一接口，onPlainChunk 回调逐块交付，
// 浏览器内存占用恒定 O(chunkSize)，可直写磁盘（File System Access API）。
// 大文件（10GB+）也不会因为累加 chunks 数组而爆内存。
// 解密错误用 classifyDecryptError 细分为「密码错误 vs 文件损坏」，调用方可据此兜底。

import { isSealGoFile, decryptChunkWithKey, extractSalt, deriveKeyFromPassword } from './crypto'
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
  /**
   * 产出一个明文块（Blob）。签名约定为 async：消费方可对 handle/可写流做 await，
   * 写盘错误能直接上抛，由外层 catch 统一兜底。index 从 0 起。
   */
  onPlainChunk: (chunk: { index: number; blob: Blob; bytes: number }) => Promise<void>
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

  // 加密组：派生一次 fileKey 循环复用，避免每片重复 Argon2id
  // 关键不变量：同组所有切片头部 salt 必须一致（split 端是同 salt 全程写入）
  // 第一片派生后 cache，后续每片都用 fileKey 解密
  let cachedFileKey: Uint8Array | null = null
  let cachedSalt: Uint8Array | null = null

  try {
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
          // 同组切片同 salt：首次派生并缓存，后续每片校验 salt 一致后直接复用
          const salt = extractSalt(buf)
          if (cachedFileKey && cachedSalt) {
            // 常量时间 salt 比较（防旁路攻击）
            if (!saltEquals(salt, cachedSalt)) {
              throw new StreamMergeError(item.originalName, {
                kind: 'header-corrupt',
                message: '同组切片盐不一致，无法复用 fileKey',
                hint: '切片可能来自不同的加密批次',
              }, i)
            }
            plainBytes = await decryptChunkWithKey(buf, cachedFileKey)
          } else {
            // 首片：派生 fileKey
            cachedFileKey = await deriveKeyFromPassword(options.password, salt)
            cachedSalt = salt
            try {
              plainBytes = await decryptChunkWithKey(buf, cachedFileKey)
            } catch (err) {
              // 首片失败时擦除 fileKey 防止泄漏
              cachedFileKey.fill(0)
              cachedFileKey = null
              cachedSalt = null
              const classified = classifyDecryptError(buf, err)
              throw new StreamMergeError(item.originalName, classified, i)
            }
          }
        } catch (err) {
          // 已经包装为 StreamMergeError 直接上抛
          if (err instanceof StreamMergeError) throw err
          const classified = classifyDecryptError(buf, err)
          throw new StreamMergeError(item.originalName, classified, i)
        }
      } else {
        // 明文：直接读 arrayBuffer（用 Uint8Array 统一接口）
        plainBytes = new Uint8Array(await item.file.arrayBuffer())
      }

      bytesDone += plainBytes.byteLength
      // 物化为 Blob 时用 .slice() copy 一份独立缓冲：避免 Blob 持有 plainBytes.buffer
      // 引用导致下次循环迭代时旧 buffer 仍存活、内存峰值 2x。
      // 同时 .buffer as ArrayBuffer 规避 SharedArrayBuffer 类型推断
      const bufCopy = plainBytes.slice().buffer as ArrayBuffer
      const blob = new Blob([bufCopy], { type: 'application/octet-stream' })
      // 显式置空 + 让出引用，帮助 GC
      ;(plainBytes as unknown as { __cleared?: true }).__cleared = true
      // onPlainChunk 约定 async：消费方写盘错误直接上抛，由外层 catch 统一兜底
      await onPlainChunk({ index: i, blob, bytes: plainBytes.byteLength })
      onProgress({ index: i + 1, total, bytesDone, bytesTotal: totalOutSize })
      mergedParts++

      // 每块让出主线程（与 stream-split 一致）
      if (i % 4 === 3) await new Promise((r) => setTimeout(r, 0))
    }

    return { totalParts: total, mergedParts, totalOutSize: bytesDone }
  } finally {
    // 擦除 fileKey 敏感材料
    if (cachedFileKey) cachedFileKey.fill(0)
  }
}

/** 32 字节常量时间盐比较（防止旁路攻击） */
function saltEquals(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i]
  return diff === 0
}

export { kindLabel }