// 加密 Worker：将 WASM 加解密移出主线程，避免 UI 冻结
// 与 crypto.ts 保持同一套 SealGo WASM 逻辑，但运行在 Worker 上下文

import { initSealGo, type SealGoWasmApi } from './sealgo'

export type WorkerRequest =
  | { kind: 'derive'; password: string; salt: Uint8Array }
  | { kind: 'encrypt'; data: Uint8Array; fileKey: Uint8Array; salt: Uint8Array }
  | { kind: 'decrypt'; data: Uint8Array; fileKey: Uint8Array }
  | { kind: 'rand'; n: number }

export type WorkerResponse =
  | { kind: 'ok'; id: number; result: Uint8Array }
  | { kind: 'err'; id: number; error: string }

let api: SealGoWasmApi | null = null

/** 初始化 WASM（Worker 内只需一次） */
export async function initCryptoWorker(): Promise<void> {
  if (!api) api = await initSealGo()
}

/** 在 Worker 中执行 Argon2id 派生 */
export async function deriveKeyInWorker(password: string, salt: Uint8Array): Promise<Uint8Array> {
  await initCryptoWorker()
  try {
    return api!.derivePasswordKey(password, salt)
  } catch (err) {
    throw err instanceof Error ? err : new Error(String(err))
  }
}

/** 在 Worker 中加密（当前实现：主线程降级，因为 Go WASM 绑定 window） */
export async function encryptInWorker(
  data: Uint8Array,
  fileKey: Uint8Array,
  salt: Uint8Array,
): Promise<Uint8Array> {
  await initCryptoWorker()
  try {
    return api!.encryptWithKey(data, fileKey, salt)
  } catch (err) {
    throw err instanceof Error ? err : new Error(String(err))
  }
}

/** 在 Worker 中解密 */
export async function decryptInWorker(data: Uint8Array, fileKey: Uint8Array): Promise<Uint8Array> {
  await initCryptoWorker()
  try {
    return api!.decryptWithKey(data, fileKey)
  } catch (err) {
    throw err instanceof Error ? err : new Error(String(err))
  }
}

/** 在 Worker 中生成随机字节 */
export async function randInWorker(n: number): Promise<Uint8Array> {
  await initCryptoWorker()
  return api!.randBytes(n)
}
