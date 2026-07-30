// 单元测试：subscribeProgress 注册时应从 sessionStorage 补发最近一条事件
// 当前:订阅时立即拿不到最近一次进度,新打开的 tab 只能等下一次 postMessage
// 期望:state replay 模式 —— subscribeProgress 时如果 sessionStorage 有最新 split-progress 事件,
//      立即向新订阅者补发一次(state replay)

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { subscribeProgress, type CrossTabProgressEvent } from '../lib/cross-tab'

const KEY = 'slicer:split-progress:last'

function makeEvent(): CrossTabProgressEvent {
  return {
    kind: 'split-progress',
    fileName: 'video.mp4',
    fileSize: 1024 * 1024,
    completedIndices: [0, 1, 2],
    totalParts: 10,
    timestamp: Date.now(),
  }
}

beforeEach(() => {
  // 清理 sessionStorage
  sessionStorage.clear()
  vi.restoreAllMocks()
})

describe('subscribeProgress state replay', () => {
  it('sessionStorage 无历史时,新订阅者不会立即收到任何事件', () => {
    const got: CrossTabProgressEvent[] = []
    const unsub = subscribeProgress((e) => got.push(e))
    // 不补发
    expect(got.length).toBe(0)
    unsub()
  })

  it('sessionStorage 有历史时,新订阅者立即收到补发的那条', () => {
    const evt = makeEvent()
    sessionStorage.setItem(KEY, JSON.stringify(evt))
    const got: CrossTabProgressEvent[] = []
    const unsub = subscribeProgress((e) => got.push(e))
    expect(got.length).toBe(1)
    expect(got[0].kind).toBe('split-progress')
    expect(got[0].fileName).toBe('video.mp4')
    expect(got[0].completedIndices).toEqual([0, 1, 2])
    unsub()
  })

  it('sessionStorage 里的历史是损坏 JSON 时,补发时安全忽略(不抛)', () => {
    sessionStorage.setItem(KEY, '{not json')
    const got: CrossTabProgressEvent[] = []
    expect(() => subscribeProgress((e) => got.push(e))).not.toThrow()
    expect(got.length).toBe(0)
  })
})
