import { describe, it, expect } from 'vitest'
import { estimateEncryptedSize } from '../lib/stream-split'

describe('加密输出估算', () => {
  it('空文件最小头', () => {
    expect(estimateEncryptedSize(0, 1024)).toBe(188)
  })

  it('单 chunk 小文件', () => {
    // 100 + 68 + 100 + 1*20 = 288
    expect(estimateEncryptedSize(100, 1024)).toBe(288)
  })

  it('多 chunk 大文件', () => {
    // 100MB 切成 1MB，100 chunk：100+68+104857600+2000 = 104859768
    const est = estimateEncryptedSize(100 * 1024 * 1024, 1024 * 1024)
    expect(est).toBe(100 + 68 + 100 * 1024 * 1024 + 100 * 20)
  })

  it('不整除的最后一 chunk', () => {
    // 1500 字节 / 1000 字节每块 → 2 chunk
    const est = estimateEncryptedSize(1500, 1000)
    expect(est).toBe(100 + 68 + 1500 + 2 * 20)
  })

  it('随着 chunk 增大总开销降低', () => {
    const small = estimateEncryptedSize(10 * 1024 * 1024, 64 * 1024) // 多 chunk
    const big = estimateEncryptedSize(10 * 1024 * 1024, 1024 * 1024) // 少 chunk
    // 多 chunk 路径总开销更大
    expect(small).toBeGreaterThan(big)
  })
})
