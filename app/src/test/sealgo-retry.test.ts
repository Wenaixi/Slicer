// 单元测试：initSealGo 失败时应清空 readyPromise
// 直接通过 vi.resetModules + spy 触发,不走真实 init 流程

import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as sealgo from '../lib/sealgo'

beforeEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('initSealGo 失败重置', () => {
  it('attempt 失败后,readyPromise 内部状态被清空(可观察 __getReadyPromiseForTest)', async () => {
    // 桩 fetch + instantiate,让 attempt 走到 instantiate 后立刻失败
    vi.stubGlobal('fetch', vi.fn(async () => new Response(new Uint8Array([0, 0, 0, 0]), { status: 200 })))
    const origInst = WebAssembly.instantiate
    let count = 0
    ;(WebAssembly as unknown as { instantiate: unknown }).instantiate = vi.fn(async () => {
      count += 1
      throw new Error('boom')
    })
    try {
      sealgo.__resetSealGoForTest()
      const before = sealgo.__getReadyPromiseForTest()
      expect(before).toBeNull()
      const p = sealgo.initSealGo()
      // 立即 readyPromise 已被缓存
      const during = sealgo.__getReadyPromiseForTest()
      expect(during).toBe(p)
      // 等 reject
      await expect(p).rejects.toThrow('boom')
      // 等 catch handler 执行
      await new Promise((r) => setTimeout(r, 0))
      await new Promise((r) => setTimeout(r, 0))
      // 核心断言:失败后,readyPromise 必须被清空
      expect(sealgo.__getReadyPromiseForTest()).toBeNull()
    } finally {
      ;(WebAssembly as unknown as { instantiate: typeof origInst }).instantiate = origInst
    }
  })
})
