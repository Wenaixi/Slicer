import { describe, it, expect } from 'vitest'
import {
  sha256Hex,
  buildManifest,
  serializeManifest,
  parseManifest,
  verifyChunksAgainstManifest,
} from '../lib/manifest'

async function makeChunkResult(name: string, idx: number, bytes: Uint8Array) {
  return {
    name,
    blob: new Blob([bytes.buffer as ArrayBuffer]),
    size: bytes.byteLength,
    index: idx,
  }
}

describe('sha256Hex', () => {
  it('空数据返回固定 SHA-256', async () => {
    const sha = await sha256Hex(new Uint8Array(0))
    // 空输入的 SHA-256 是已知常量
    expect(sha).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855')
  })
  it('已知输入返回正确 hash', async () => {
    const sha = await sha256Hex(new TextEncoder().encode('hello'))
    expect(sha).toBe('2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824')
  })
  it('subarray 子视图只 hash 切片区间，不越界到整 buffer', async () => {
    // 构造 16 字节底层 buffer，取中间 8 字节 subarray
    const full = new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15])
    const sub = full.subarray(4, 12) // [4..11]
    // 期望：等于只对 [4..11] 这 8 字节计算 hash
    const expected = await crypto.subtle.digest('SHA-256', sub.slice().buffer as ArrayBuffer)
    const expectedHex = Array.from(new Uint8Array(expected))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')
    // 反向校验：不能等于整 16 字节的 hash
    const wholeHash = await crypto.subtle.digest('SHA-256', full.buffer as ArrayBuffer)
    const wholeHex = Array.from(new Uint8Array(wholeHash))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')
    expect(expectedHex).not.toBe(wholeHex)

    const actual = await sha256Hex(sub)
    expect(actual).toBe(expectedHex)
  })
})

describe('buildManifest / serialize / parse 往返', () => {
  it('生成 manifest 含所有切片的 SHA-256', async () => {
    const chunks = [
      await makeChunkResult('a.part1', 1, new Uint8Array([1, 2, 3])),
      await makeChunkResult('a.part2', 2, new Uint8Array([4, 5])),
    ]
    const m = await buildManifest(
      { name: 'a.bin', size: 5 },
      chunks,
      { encrypted: false, naming: 'part', chunkSize: 3 },
    )
    expect(m.version).toBe(1)
    expect(m.originalName).toBe('a.bin')
    expect(m.originalSize).toBe(5)
    expect(m.encrypted).toBe(false)
    expect(m.totalParts).toBe(2)
    expect(m.chunks.length).toBe(2)
    expect(m.chunks[0].sha256).toMatch(/^[0-9a-f]{64}$/)
    expect(m.chunks[1].sha256).toMatch(/^[0-9a-f]{64}$/)
  })

  it('serialize → parse 还原 manifest', async () => {
    const chunks = [await makeChunkResult('a.part1', 1, new Uint8Array([7]))]
    const m = await buildManifest(
      { name: 'a.bin', size: 1 },
      chunks,
      { encrypted: true, naming: 'part', chunkSize: 1 },
    )
    const json = serializeManifest(m)
    const parsed = parseManifest(json)
    expect(parsed).not.toBeNull()
    expect(parsed!.originalName).toBe('a.bin')
    expect(parsed!.encrypted).toBe(true)
    expect(parsed!.chunks[0].name).toBe('a.part1')
  })

  it('parse 拒绝无效 JSON', () => {
    expect(parseManifest('not-json{')).toBeNull()
  })

  it('parse 拒绝 version != 1', () => {
    expect(parseManifest(JSON.stringify({ version: 2 }))).toBeNull()
  })

  it('parse 拒绝缺关键字段', () => {
    expect(parseManifest(JSON.stringify({ version: 1, originalName: 'a' }))).toBeNull()
  })
})

describe('verifyChunksAgainstManifest', () => {
  it('所有切片匹配 → ok', async () => {
    const chunks = [
      await makeChunkResult('a.part1', 1, new Uint8Array([1, 2, 3])),
      await makeChunkResult('a.part2', 2, new Uint8Array([4, 5])),
    ]
    const m = await buildManifest(
      { name: 'a.bin', size: 5 },
      chunks,
      { encrypted: false, naming: 'part', chunkSize: 3 },
    )
    const r = await verifyChunksAgainstManifest(m, [
      { name: 'a.part1', data: new Uint8Array([1, 2, 3]) },
      { name: 'a.part2', data: new Uint8Array([4, 5]) },
    ])
    expect(r.ok).toBe(true)
    expect(r.mismatched).toEqual([])
    expect(r.missing).toEqual([])
  })

  it('数据被篡改 → mismatched 记录序号', async () => {
    const chunks = [await makeChunkResult('a.part1', 1, new Uint8Array([1, 2, 3]))]
    const m = await buildManifest(
      { name: 'a.bin', size: 3 },
      chunks,
      { encrypted: false, naming: 'part', chunkSize: 3 },
    )
    const r = await verifyChunksAgainstManifest(m, [
      { name: 'a.part1', data: new Uint8Array([1, 2, 99]) },
    ])
    expect(r.ok).toBe(false)
    expect(r.mismatched).toEqual([1])
  })

  it('切片缺失 → missing 记录文件名', async () => {
    const chunks = [
      await makeChunkResult('a.part1', 1, new Uint8Array([1])),
      await makeChunkResult('a.part2', 2, new Uint8Array([2])),
    ]
    const m = await buildManifest(
      { name: 'a.bin', size: 2 },
      chunks,
      { encrypted: false, naming: 'part', chunkSize: 1 },
    )
    const r = await verifyChunksAgainstManifest(m, [
      { name: 'a.part1', data: new Uint8Array([1]) },
    ])
    expect(r.ok).toBe(false)
    expect(r.missing).toEqual(['a.part2'])
  })

  it('大小不匹配也算 mismatched', async () => {
    const chunks = [await makeChunkResult('a.part1', 1, new Uint8Array([1, 2, 3]))]
    const m = await buildManifest(
      { name: 'a.bin', size: 3 },
      chunks,
      { encrypted: false, naming: 'part', chunkSize: 3 },
    )
    const r = await verifyChunksAgainstManifest(m, [
      { name: 'a.part1', data: new Uint8Array([1, 2]) },
    ])
    expect(r.ok).toBe(false)
    expect(r.mismatched).toEqual([1])
  })
})