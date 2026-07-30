// 单元测试：worker-kdf 的请求/响应调度逻辑
// 重点：1) id 校验,迟到响应被丢弃 2) Map 支持多请求并发 3) 拒绝错误正确传递

import { describe, it, expect } from 'vitest'
import { createKdfDispatcher, type KdfWorkerLike } from '../lib/worker-kdf'

class FakeWorker implements KdfWorkerLike {
  public onmessage: ((ev: { data: unknown }) => void) | null = null
  public sent: { id: number; password: string; salt: Uint8Array }[] = []
  /** 当 defaults 或 responses 都不匹配时是否自动回 ok:显式 auto 标志 */
  private auto: { result?: Uint8Array; error?: string } | null
  private responses: { matchId?: number; payload: { id: number; result?: Uint8Array; error?: string } }[]

  constructor(opts: { defaults?: { result?: Uint8Array; error?: string }; responses?: { matchId?: number; payload: { id: number; result?: Uint8Array; error?: string } }[] } = {}) {
    // 显式传 defaults 才自动回,否则保持静默(由测试用 emit() 手工驱动)
    this.auto = opts.defaults ?? null
    this.responses = opts.responses ?? []
  }

  postMessage(msg: { id: number; password: string; salt: Uint8Array }): void {
    this.sent.push(msg)
    const override = this.responses.find((r) => r.matchId === msg.id)
    if (override) {
      queueMicrotask(() => this.onmessage?.({ data: override.payload }))
      return
    }
    if (this.auto) {
      const payload = { id: msg.id, ...(this.auto.result ? { result: this.auto.result } : {}), ...(this.auto.error ? { error: this.auto.error } : {}) }
      queueMicrotask(() => this.onmessage?.({ data: payload }))
    }
    // 否则完全静默,等测试显式 emit
  }

  /** 手动推一条 worker 响应(用于模拟"迟到旧响应"等异常时序） */
  emit(payload: { id: number; result?: Uint8Array; error?: string }): void {
    this.onmessage?.({ data: payload })
  }
}

describe('createKdfDispatcher', () => {
  it('返回的 derive 在 worker 回复同 id 时 resolve', async () => {
    const fake = new FakeWorker({ defaults: { result: new Uint8Array([1, 2, 3]) } })
    const d = createKdfDispatcher(() => fake)
    const out = await d.derive('pw', new Uint8Array([9]))
    expect([...out]).toEqual([1, 2, 3])
    expect(fake.sent.length).toBe(1)
    expect(fake.sent[0].id).toBe(1)
  })

  it('id 单调递增,两次 derive 各自分配不同 id', async () => {
    const fake = new FakeWorker({ defaults: { result: new Uint8Array([7]) } })
    const d = createKdfDispatcher(() => fake)
    const [a, b] = await Promise.all([
      d.derive('pw1', new Uint8Array([1])),
      d.derive('pw2', new Uint8Array([2])),
    ])
    expect([...a]).toEqual([7])
    expect([...b]).toEqual([7])
    const ids = fake.sent.map((s) => s.id)
    expect(ids[0]).not.toBe(ids[1])
    expect(ids).toEqual([1, 2])
  })

  it('并发请求:两个 Promise 分别 resolve 自己的结果', async () => {
    const fake = new FakeWorker() // 静默模式,手工 emit
    const d = createKdfDispatcher(() => fake)
    const p1 = d.derive('pw1', new Uint8Array([1]))
    const p2 = d.derive('pw2', new Uint8Array([2]))
    await Promise.resolve()
    expect(fake.sent.length).toBe(2)
    const id1 = fake.sent[0].id
    const id2 = fake.sent[1].id
    fake.emit({ id: id2, result: new Uint8Array([42]) })
    fake.emit({ id: id1, result: new Uint8Array([99]) })
    expect([...(await p1)]).toEqual([99])
    expect([...(await p2)]).toEqual([42])
  })

  it('拒绝错误正确 reject 同一 id 的 Promise', async () => {
    const fake = new FakeWorker({ defaults: { error: 'argon2 炸了' } })
    const d = createKdfDispatcher(() => fake)
    await expect(d.derive('pw', new Uint8Array([1]))).rejects.toThrow('argon2 炸了')
  })

  it('迟到旧响应(id 不匹配)被静默丢弃,不污染当前 Promise', async () => {
    const fake = new FakeWorker()
    const d = createKdfDispatcher(() => fake)
    const p1 = d.derive('pw', new Uint8Array([1]))
    await Promise.resolve()
    expect(fake.sent.length).toBe(1)
    expect(fake.sent[0].id).toBe(1)
    // 模拟旧 worker 迟到推一条 id=999 的响应(根本不存在)
    fake.emit({ id: 999, result: new Uint8Array([0xff]) })
    // 再推正常 id=1 的响应
    fake.emit({ id: 1, result: new Uint8Array([0xab]) })
    expect([...(await p1)]).toEqual([0xab])
  })

  it('worker 抛同步异常:dispatcher 仍能 throw', async () => {
    const boom = () => { throw new Error('worker 构造失败') }
    const d = createKdfDispatcher(boom)
    await expect(d.derive('pw', new Uint8Array([1]))).rejects.toThrow('worker 构造失败')
  })
})
