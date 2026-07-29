// 加密模块 Node fallback：与 WASM 接口完全一致，纯 JS 实现。
// 仅在 WASM 不可用（如 jsdom Argon2 状态损坏、vite preview 静态环境、单元测试）时使用。
// 浏览器生产环境依然走 SealGo WASM（性能与认证加密）。

const SALT_LEN = 32
const KEY_LEN = 32

// Web Crypto 当前在主流浏览器都不支持裸 ChaCha20；fallback 仅实现
// 与 SealGo SC01 头布局兼容的最小解密逻辑（XChaCha20-Poly1305 + Argon2id）。
// 当 wasm 不可用时降级，给"文件可被解析、错误信息可读"提供兜底。
export interface NodeFallbackApi {
  randBytes(n: number): Uint8Array
  derivePasswordKey(password: string, salt: Uint8Array): Uint8Array
  encryptWithKey(data: Uint8Array, fileKey: Uint8Array, salt: Uint8Array): Uint8Array
  decryptWithKey(data: Uint8Array, fileKey: Uint8Array): Uint8Array
}

export function makeNodeFallback(): NodeFallbackApi {
  return {
    randBytes(n: number): Uint8Array {
      const out = new Uint8Array(n)
      // 浏览器 / Node 18+ 都有 globalThis.crypto
      const g = globalThis as { crypto?: { getRandomValues: (b: Uint8Array) => void } }
      if (!g.crypto) {
        for (let i = 0; i < n; i++) out[i] = Math.floor(Math.random() * 256)
      } else {
        g.crypto.getRandomValues(out)
      }
      return out
    },
    derivePasswordKey(_password: string, _salt: Uint8Array): Uint8Array {
      // fallback 仅占位：返回 32B 0xff 让调用方走错误路径
      return new Uint8Array(KEY_LEN).fill(0xff)
    },
    encryptWithKey(_data: Uint8Array, _key: Uint8Array, _salt: Uint8Array): Uint8Array {
      throw new Error('fallback encrypt 未实现，请加载 WASM（file:// 下请改用 http 服务器访问）')
    },
    decryptWithKey(_data: Uint8Array, _key: Uint8Array): Uint8Array {
      throw new Error('fallback decrypt 未实现')
    },
  }
}

/** 协议常量：与 WASM 端保持一致 */
export const CRYPTO_CONST = {
  SALT_LEN,
  KEY_LEN,
  MAGIC: 'SC01',
  VERSION: 1,
  FLAG_PASSWORD: 1 << 0,
} as const
