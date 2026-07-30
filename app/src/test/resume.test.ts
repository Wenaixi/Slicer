import { describe, it, expect } from 'vitest'
import type { SplitOptions } from '../lib/split'
import { parseIndex } from '../lib/resume'

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

describe('parseIndex 三种命名规范', () => {
  it('part 规范解析明文切片', () => {
    expect(parseIndex('big.bin.part1', 'big.bin', 'part')).toBe(1)
    expect(parseIndex('big.bin.part42', 'big.bin', 'part')).toBe(42)
  })

  it('part 规范解析 .sc 加密切片', () => {
    expect(parseIndex('big.bin.part7.sc', 'big.bin', 'part')).toBe(7)
  })

  it('number 规范解析三位补零切片', () => {
    expect(parseIndex('big.bin.001', 'big.bin', 'number')).toBe(1)
    expect(parseIndex('big.bin.123', 'big.bin', 'number')).toBe(123)
  })

  it('number 规范解析四位补零切片', () => {
    expect(parseIndex('big.bin.0001', 'big.bin', 'number')).toBe(1)
    expect(parseIndex('big.bin.1234', 'big.bin', 'number')).toBe(1234)
  })

  it('infix 规范解析单扩展名（baseName 已去一次扩展名）', () => {
    expect(parseIndex('big.tar_part1.gz', 'big.tar', 'infix')).toBe(1)
    expect(parseIndex('big.tar_part12.gz', 'big.tar', 'infix')).toBe(12)
  })

  it('infix 规范解析无扩展名文件', () => {
    expect(parseIndex('noext_part1', 'noext', 'infix')).toBe(1)
  })

  it('infix 规范解析 .sc 加密切片', () => {
    expect(parseIndex('big.tar_part1.gz.sc', 'big.tar', 'infix')).toBe(1)
  })

  it('infix 规范 baseName 中带特殊字符时正确转义', () => {
    // dot 在 baseName 中必须转义，否则 . 匹配任意字符会导致误判
    expect(parseIndex('file.v1_part2.bin', 'file.v1', 'infix')).toBe(2)
  })

  it('part 规范不匹配的输入返回 null', () => {
    expect(parseIndex('big.bin.001', 'big.bin', 'part')).toBeNull()
  })

  it('number 规范不匹配的输入返回 null', () => {
    expect(parseIndex('big.bin.part1', 'big.bin', 'number')).toBeNull()
  })

  it('infix 规范不匹配的输入返回 null', () => {
    expect(parseIndex('big.bin.part1', 'big.bin', 'infix')).toBeNull()
  })
})
