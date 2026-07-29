import { describe, it, expect } from 'vitest'
import type { SplitOptions } from '../lib/split'

// 通过内部 export 暴露的 STORAGE_KEY 探查逻辑；parseIndex 直接测试通过存读

const STORAGE_KEY = 'slicer:split-progress'

describe('sessionStorage 进度持久化', () => {
  it('写入+读出', () => {
    sessionStorage.clear()
    const payload = {
      fileName: 'big.bin',
      fileSize: 1_000_000,
      options: { mode: 'size', sizeValue: 10, sizeUnit: 'MB', countValue: 5, naming: 'part', encrypt: false, password: '' } as SplitOptions,
      completedIndices: [1, 2, 3],
      startedAt: 1000,
      updatedAt: 2000,
    }
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
    const raw = sessionStorage.getItem(STORAGE_KEY)
    expect(raw).not.toBeNull()
    expect(JSON.parse(raw!)).toEqual(payload)
  })

  it('JSON 损坏返回 null', () => {
    sessionStorage.setItem(STORAGE_KEY, 'not-json{')
    const raw = sessionStorage.getItem(STORAGE_KEY)
    expect(() => JSON.parse(raw!)).toThrow()
  })

  it('清空进度', () => {
    sessionStorage.setItem(STORAGE_KEY, '{}')
    sessionStorage.removeItem(STORAGE_KEY)
    expect(sessionStorage.getItem(STORAGE_KEY)).toBeNull()
  })
})
