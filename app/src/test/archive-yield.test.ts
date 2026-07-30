// 单元测试：unzipAll 是 async 但内部走 unzipSync 阻塞主线程
// 期望:在 unzip 真正执行前,至少让出一次主线程(setTimeout 0)
//
// 测法:检测 unzipSync 调用之前,setTimeout(0) 回调是否已经跑过
//       如果实现完全同步(直接 arrayBuffer → unzipSync → return),则 await 让出时不调度 setTimeout
//       修复后:实现会先 await 一帧再调 unzipSync,主线程让出

import { describe, it, expect } from 'vitest'
import { packAsZip, unzipAll } from '../lib/archive'

describe('unzipAll 主线程让出', () => {
  it('调用后,在 unzipSync 真正执行前会让出主线程(setTimeout 已触发)', async () => {
    const entries = [
      { name: 'a.part1', data: new Uint8Array([1, 2, 3]), size: 3 },
      { name: 'a.part2', data: new Uint8Array([4, 5]), size: 2 },
    ]
    const zipped = packAsZip(entries)
    // 注册一个早于 unzipSync 跑的 setTimeout 0 回调
    const order: string[] = []
    const original = setTimeout
    let suspend = false
    // 拦截 setTimeout 让 order 记录"让出"事件
    globalThis.setTimeout = ((fn: () => void, ms?: number) => {
      if (ms === 0 && suspend) order.push('yield')
      return original(fn, ms)
    }) as typeof setTimeout

    suspend = true
    order.push('call-start')
    const promise = unzipAll(zipped)
    // 给一个微任务,确保同步路径跑完
    await Promise.resolve()
    suspend = false
    const result = await promise
    order.push('call-end')

    // 如果实现正确让出主线程,order 序列里应包含 'yield'
    expect(order).toContain('yield')
    // 验证基本功能没破
    expect(result.length).toBe(2)
    globalThis.setTimeout = original
  })
})
