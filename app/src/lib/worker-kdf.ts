// worker-kdf:在 Worker 上下文中执行 Argon2id 派生。
// 主线程通过 dispatch 协议与本 worker 通信:每条请求带递增 id,响应必须同 id 才被接受。
// 设计要点:
//   1. id 校验:迟到旧响应(id 不匹配当前 pending)直接丢弃,避免污染。
//   2. Map 并发:支持同时发起多个 derive(同 salt 不同密码 / 同密码不同 salt),各自 resolve。
//   3. 单例 onmessage:worker 整个生命周期共用一个 handler,避免重复订阅。

import { initSealGo } from './sealgo'

/** 主线程发给 worker 的请求 */
export type KdfRequest = { id: number; password: string; salt: Uint8Array }

/** worker 推回主线程的响应 */
export type KdfResponse = { id: number; result?: Uint8Array; error?: string }

/** 抽象 Worker 接口(便于测试,真实 worker 满足该形状) */
export interface KdfWorkerLike {
  onmessage: ((ev: { data: KdfResponse }) => void) | null
  postMessage(msg: KdfRequest): void
}

/** 主线程侧的 dispatcher 句柄 */
export interface KdfDispatcher {
  derive(password: string, salt: Uint8Array): Promise<Uint8Array>
}

type Pending = { resolve: (v: Uint8Array) => void; reject: (e: Error) => void }

/** 工厂:接收一个能返回 worker 的 fn(便于测试注入假 worker) */
export function createKdfDispatcher(
  spawn: () => KdfWorkerLike,
): KdfDispatcher {
  const pending = new Map<number, Pending>()
  let counter = 0
  const nextId = () => {
    counter += 1
    return counter
  }
  let worker: KdfWorkerLike
  try {
    worker = spawn()
  } catch (e) {
    // 构造期就失败:把错误挂在所有后续 derive 上
    const initErr = e instanceof Error ? e : new Error(String(e))
    return {
      derive: () => Promise.reject(initErr),
    }
  }
  worker.onmessage = (ev) => {
    const { id, result, error } = ev.data
    const slot = pending.get(id)
    if (!slot) return // 迟到旧响应 / 不存在的 id,静默丢弃
    pending.delete(id)
    if (error) slot.reject(new Error(error))
    else if (result) slot.resolve(result)
    else slot.reject(new Error('KDF worker 返回空响应'))
  }
  return {
    derive(password, salt) {
      const id = nextId()
      return new Promise<Uint8Array>((resolve, reject) => {
        pending.set(id, { resolve, reject })
        try {
          worker.postMessage({ id, password, salt })
        } catch (e) {
          pending.delete(id)
          reject(e instanceof Error ? e : new Error(String(e)))
        }
      })
    },
  }
}

/** 真实 worker 入口:被 new Worker(new URL('./worker-kdf.ts', import.meta.url)) 加载 */
const ctx = self as unknown as { onmessage: ((ev: MessageEvent<KdfRequest>) => void) | null }

ctx.onmessage = async (ev) => {
  const { id, password, salt } = ev.data
  const reply = (payload: KdfResponse) => {
    ;(self as unknown as { postMessage: (m: KdfResponse) => void }).postMessage(payload)
  }
  try {
    const api = await initSealGo()
    const out = api.derivePasswordKey(password, salt)
    reply({ id, result: out })
  } catch (e) {
    reply({ id, error: e instanceof Error ? e.message : String(e) })
  }
}
