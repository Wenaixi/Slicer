import { describe, it, expect } from 'vitest'
import {
  detectArchiveKind,
  unzipAll,
  packAsZip,
  filterChunkEntries,
  suggestedZipName,
} from '../lib/archive'

describe('detectArchiveKind', () => {
  it('识别 ZIP 魔数 PK\\x03\\x04', () => {
    expect(detectArchiveKind(new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x00, 0x00]))).toBe('zip')
  })
  it('识别空 ZIP 魔数 PK\\x05\\x06', () => {
    expect(detectArchiveKind(new Uint8Array([0x50, 0x4b, 0x05, 0x06, 0x00, 0x00]))).toBe('zip')
  })
  it('识别 7z 魔数', () => {
    expect(detectArchiveKind(new Uint8Array([0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c]))).toBe('7z')
  })
  it('未知字节返回 unknown', () => {
    expect(detectArchiveKind(new Uint8Array([0xff, 0x00, 0x00, 0x00]))).toBe('unknown')
  })
  it('过短字节返回 unknown', () => {
    expect(detectArchiveKind(new Uint8Array([0x50, 0x4b]))).toBe('unknown')
  })
})

describe('packAsZip / unzipAll 往返', () => {
  it('两个切片打包后可解压恢复', async () => {
    const e1 = { name: 'a.part1', data: new Uint8Array([1, 2, 3]), size: 3 }
    const e2 = { name: 'a.part2', data: new Uint8Array([4, 5]), size: 2 }
    const zipped = packAsZip([e1, e2])
    const entries = await unzipAll(zipped)
    expect(entries.length).toBe(2)
    const names = entries.map((e) => e.name).sort()
    expect(names).toEqual(['a.part1', 'a.part2'])
    const p1 = entries.find((e) => e.name === 'a.part1')!
    expect([...p1.data]).toEqual([1, 2, 3])
  })

  it('跳过 __MACOSX 目录与结尾 / 的目录条目', async () => {
    const e1 = { name: 'a.part1', data: new Uint8Array([1]), size: 1 }
    const e2 = { name: '__MACOSX/junk', data: new Uint8Array([9]), size: 1 }
    const e3 = { name: 'dir/', data: new Uint8Array(0), size: 0 }
    const zipped = packAsZip([e1, e2, e3])
    const entries = await unzipAll(zipped)
    const names = entries.map((e) => e.name)
    expect(names).toEqual(['a.part1'])
  })
})

describe('filterChunkEntries', () => {
  it('识别 part 命名 + .sc 加密后缀', () => {
    const entries = [
      { name: 'a.part1', data: new Uint8Array(0), size: 0 },
      { name: 'a.part1.sc', data: new Uint8Array(0), size: 0 },
      { name: 'readme.txt', data: new Uint8Array(0), size: 0 },
    ]
    const kept = filterChunkEntries(entries)
    expect(kept.map((e) => e.name)).toEqual(['a.part1', 'a.part1.sc'])
  })
  it('识别 number 命名（.001 / .0001）', () => {
    const entries = [
      { name: 'a.001', data: new Uint8Array(0), size: 0 },
      { name: 'a.0002', data: new Uint8Array(0), size: 0 },
      { name: 'a.00', data: new Uint8Array(0), size: 0 },
    ]
    const kept = filterChunkEntries(entries)
    expect(kept.map((e) => e.name)).toEqual(['a.001', 'a.0002'])
  })
  it('识别 infix 命名（_partN.ext）', () => {
    const entries = [
      { name: 'a_part1.zip', data: new Uint8Array(0), size: 0 },
      { name: 'a_part2.zip', data: new Uint8Array(0), size: 0 },
    ]
    const kept = filterChunkEntries(entries)
    expect(kept.map((e) => e.name)).toEqual(['a_part1.zip', 'a_part2.zip'])
  })
})

describe('suggestedZipName', () => {
  it('去掉原扩展名再加 .slices.zip', () => {
    expect(suggestedZipName('video.mp4')).toBe('video.slices.zip')
    expect(suggestedZipName('archive.tar.gz')).toBe('archive.tar.slices.zip')
  })
})