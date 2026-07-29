import { describe, it, expect } from 'vitest'
import {
  parseChunkFileName,
  groupMergeFiles,
  fileDedupKey,
} from '../lib/merge'

// 构造最小 File 对象（jsdom File 可用）
function makeFile(name: string, size: number, lastModified = 1): File {
  const f = new File([new Uint8Array(size)], name, { lastModified })
  return f
}

describe('parseChunkFileName', () => {
  it('part 规范', () => {
    expect(parseChunkFileName('a.zip.part1')).toEqual({
      baseName: 'a.zip',
      partIndex: 1,
      encrypted: false,
    })
    expect(parseChunkFileName('a.zip.part12')).toEqual({
      baseName: 'a.zip',
      partIndex: 12,
      encrypted: false,
    })
  })

  it('number 规范（3-4 位数字）', () => {
    expect(parseChunkFileName('a.zip.001')).toEqual({
      baseName: 'a.zip',
      partIndex: 1,
      encrypted: false,
    })
    expect(parseChunkFileName('a.zip.0123')).toEqual({
      baseName: 'a.zip',
      partIndex: 123,
      encrypted: false,
    })
  })

  it('infix 规范', () => {
    expect(parseChunkFileName('a_part1.zip')).toEqual({
      baseName: 'a.zip',
      partIndex: 1,
      encrypted: false,
    })
    expect(parseChunkFileName('archive.tar_part2.gz')).toEqual({
      baseName: 'archive.tar.gz',
      partIndex: 2,
      encrypted: false,
    })
  })

  it('加密扩展名 .sc 剥离', () => {
    expect(parseChunkFileName('a.zip.part1.sc')).toEqual({
      baseName: 'a.zip',
      partIndex: 1,
      encrypted: true,
    })
    expect(parseChunkFileName('a.zip.001.sc')).toEqual({
      baseName: 'a.zip',
      partIndex: 1,
      encrypted: true,
    })
    expect(parseChunkFileName('a_part1.zip.sc')).toEqual({
      baseName: 'a.zip',
      partIndex: 1,
      encrypted: true,
    })
  })

  it('无匹配时 fallback', () => {
    expect(parseChunkFileName('plain.txt')).toEqual({
      baseName: 'plain.txt',
      partIndex: null,
      encrypted: false,
    })
    expect(parseChunkFileName('a.zip.12')).toEqual({
      baseName: 'a.zip.12',
      partIndex: null,
      encrypted: false,
    }) // 2 位数字不匹配 number 规范
  })
})

describe('groupMergeFiles', () => {
  it('按 baseName 分组并排序', () => {
    const files = [
      makeFile('a.zip.part2', 10),
      makeFile('a.zip.part1', 10),
      makeFile('b.zip.part1', 10),
    ]
    const groups = groupMergeFiles(files)
    expect(groups).toHaveLength(2)
    expect(groups[0].baseName).toBe('a.zip')
    expect(groups[0].items[0].index).toBe(1)
    expect(groups[0].items[1].index).toBe(2)
    expect(groups[0].sequential).toBe(true)
  })

  it('加密与非加密同 baseName 分组分开', () => {
    const files = [
      makeFile('a.zip.part1', 10),
      makeFile('a.zip.part1.sc', 10),
    ]
    const groups = groupMergeFiles(files)
    expect(groups).toHaveLength(2)
    expect(groups.find((g) => g.encrypted)).toBeTruthy()
    expect(groups.find((g) => !g.encrypted)).toBeTruthy()
  })

  it('缺失序号检测', () => {
    const files = [
      makeFile('a.zip.part1', 10),
      makeFile('a.zip.part3', 10),
    ]
    const groups = groupMergeFiles(files)
    expect(groups[0].sequential).toBe(false)
    expect(groups[0].missing).toEqual([2])
  })

  it('不从 1 开始视为不连续', () => {
    const files = [
      makeFile('a.zip.part2', 10),
      makeFile('a.zip.part3', 10),
    ]
    const groups = groupMergeFiles(files)
    expect(groups[0].sequential).toBe(false)
  })

  it('无序号文件按名称自然排序', () => {
    const files = [
      makeFile('z.txt', 10),
      makeFile('a.txt', 10),
    ]
    const groups = groupMergeFiles(files)
    expect(groups[0].items[0].originalName).toBe('a.txt')
    expect(groups[0].sequential).toBe(true) // 无序号时不参与连续校验
  })

  it('总大小统计', () => {
    const files = [
      makeFile('a.zip.part1', 100),
      makeFile('a.zip.part2', 200),
    ]
    const groups = groupMergeFiles(files)
    expect(groups[0].totalSize).toBe(300)
  })
})

describe('fileDedupKey', () => {
  it('名称+大小+时间戳组合', () => {
    const f1 = makeFile('a.zip', 100, 123)
    const f2 = makeFile('a.zip', 100, 123)
    const f3 = makeFile('a.zip', 100, 456)
    expect(fileDedupKey(f1)).toBe(fileDedupKey(f2))
    expect(fileDedupKey(f1)).not.toBe(fileDedupKey(f3))
  })
})
