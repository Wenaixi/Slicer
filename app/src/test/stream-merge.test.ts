import { describe, it, expect } from 'vitest'
import { streamMerge } from '../lib/stream-merge'

function makeFile(name: string, bytes: Uint8Array): File {
  return new File([bytes.buffer as ArrayBuffer], name, { type: 'application/octet-stream' })
}

describe('streamMerge', () => {
  it('明文合并：onPlainChunk 按序触发、汇总字节一致', async () => {
    const items = [
      { file: makeFile('a.part1', new Uint8Array([1, 2, 3])), originalName: 'a.part1' },
      { file: makeFile('a.part2', new Uint8Array([4, 5])), originalName: 'a.part2' },
      { file: makeFile('a.part3', new Uint8Array([6])), originalName: 'a.part3' },
    ]
    let chunks = 0
    let bytes = 0
    await streamMerge(
      items,
      { encrypted: false, bytesTotal: 6 },
      {
        shouldAbort: () => false,
        onPlainChunk: ({ blob }) => {
          chunks += 1
          bytes += blob.size
        },
        onProgress: () => {},
      },
    )
    expect(chunks).toBe(3)
    expect(bytes).toBe(6)
  })

  it('中止时抛 AbortError', async () => {
    const items = [
      { file: makeFile('a.part1', new Uint8Array([1])), originalName: 'a.part1' },
      { file: makeFile('a.part2', new Uint8Array([2])), originalName: 'a.part2' },
    ]
    let aborted = false
    await expect(
      streamMerge(
        items,
        { encrypted: false, bytesTotal: 2 },
        {
          shouldAbort: () => aborted,
          onPlainChunk: () => {
            aborted = true
          },
          onProgress: () => {},
        },
      ),
    ).rejects.toThrowError(/已取消/)
  })

  it('加密模式但未传密：会冒泡抛错', async () => {
    // 用一个完全不像 SC01 的字节触发解密路径里的 isSealGoFile 失败
    const items = [{ file: makeFile('bad.sc', new Uint8Array([0, 0, 0, 0])), originalName: 'bad.sc' }]
    await expect(
      streamMerge(
        items,
        { encrypted: true, password: '', bytesTotal: 4 },
        {
          shouldAbort: () => false,
          onPlainChunk: () => {},
          onProgress: () => {},
        },
      ),
    ).rejects.toThrowError(/不是合法的 SealGo 加密文件/)
  })

  it('空数组：汇总字节=0', async () => {
    const summary = await streamMerge(
      [],
      { encrypted: false, bytesTotal: 0 },
      {
        shouldAbort: () => false,
        onPlainChunk: () => {},
        onProgress: () => {},
      },
    )
    expect(summary.mergedParts).toBe(0)
    expect(summary.totalOutSize).toBe(0)
  })

  it('bytesDone 累计 = 各切片字节之和', async () => {
    const items = [
      { file: makeFile('a.part1', new Uint8Array(1024)), originalName: 'a.part1' },
      { file: makeFile('a.part2', new Uint8Array(2048)), originalName: 'a.part2' },
    ]
    const progresses: number[] = []
    await streamMerge(
      items,
      { encrypted: false, bytesTotal: 3072 },
      {
        shouldAbort: () => false,
        onPlainChunk: () => {},
        onProgress: ({ bytesDone }) => progresses.push(bytesDone),
      },
    )
    expect(progresses[progresses.length - 1]).toBe(3072)
  })
})