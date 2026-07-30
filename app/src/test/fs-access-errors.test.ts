// 单元测试：pickSaveLocation 应区分 AbortError(用户取消)与权限失败
// 当前实现:除 AbortError 外一律静默 return null(吞掉真正的错误)
// 期望:用户取消 → null;权限/能力失败 → 抛错让调用方知道降级原因

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { pickSaveLocation } from '../lib/fs-access'

beforeEach(() => {
  vi.restoreAllMocks()
  // 清理可能存在的 stub,避免跨测试污染
  delete (window as unknown as { showSaveFilePicker?: unknown }).showSaveFilePicker
  delete (window as unknown as { showDirectoryPicker?: unknown }).showDirectoryPicker
})

function stubPicker(name: 'showSaveFilePicker' | 'showDirectoryPicker', err: unknown) {
  ;(window as unknown as Record<string, unknown>)[name] = vi.fn(async () => {
    throw err
  })
}

describe('pickSaveLocation 错误分类', () => {
  it('用户取消(AbortError)→ 返回 null,不抛', async () => {
    stubPicker('showSaveFilePicker', new DOMException('用户取消', 'AbortError'))
    const r = await pickSaveLocation('foo.txt')
    expect(r).toBeNull()
  })

  it('权限拒绝(NotAllowedError)→ 抛错,不让调用方误以为"用户取消"', async () => {
    const err = new DOMException('权限被拒', 'NotAllowedError')
    stubPicker('showSaveFilePicker', err)
    await expect(pickSaveLocation('foo.txt')).rejects.toThrow('权限被拒')
  })

  it('SecurityError(隐私模式)→ 抛错', async () => {
    stubPicker('showSaveFilePicker', new DOMException('安全上下文缺失', 'SecurityError'))
    await expect(pickSaveLocation('foo.txt')).rejects.toThrow()
  })

  it('浏览器不支持 showSaveFilePicker → 返回 null(能力不可用,不是错误)', async () => {
    // 没设 stub:window.showSaveFilePicker 仍是 undefined
    const r = await pickSaveLocation('foo.txt')
    expect(r).toBeNull()
  })
})
