import { describe, it, expect } from 'vitest'
import { estimateEncryptSeconds, formatEstimateSeconds, SEALGO_THROUGHPUT_MBPS } from '../lib/perf'

describe('性能预估', () => {
  it('小文件估算 < 1 秒', () => {
    expect(estimateEncryptSeconds(1024 * 100)).toBeLessThan(2)
  })

  it('100MB 文件估算约 5 秒（含 Argon2）', () => {
    const sec = estimateEncryptSeconds(100 * 1024 * 1024)
    // 100/30 + 1 ≈ 4.33s
    expect(sec).toBeGreaterThan(3)
    expect(sec).toBeLessThan(6)
  })

  it('非加密场景快 1 秒（无 Argon2）', () => {
    const sec = estimateEncryptSeconds(100 * 1024 * 1024, false)
    expect(sec).toBeLessThan(4)
  })

  it('格式化：< 1', () => {
    expect(formatEstimateSeconds(0.5)).toBe('< 1 秒')
    expect(formatEstimateSeconds(0.99)).toBe('< 1 秒')
  })

  it('格式化：秒级', () => {
    expect(formatEstimateSeconds(3.4)).toBe('~ 3 秒')
    expect(formatEstimateSeconds(45)).toBe('~ 45 秒')
  })

  it('格式化：分+秒', () => {
    expect(formatEstimateSeconds(75)).toBe('~ 1 分 15 秒')
    expect(formatEstimateSeconds(125)).toBe('~ 2 分 5 秒')
  })

  it('吞吐常量合理', () => {
    expect(SEALGO_THROUGHPUT_MBPS).toBeGreaterThan(20)
    expect(SEALGO_THROUGHPUT_MBPS).toBeLessThan(80)
  })
})
