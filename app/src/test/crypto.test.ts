import { describe, it, expect } from 'vitest'
import {
  isSealGoFile,
  extractSalt,
  extractPlainSize,
  extractArgonParams,
} from '../lib/crypto'

// WASM 端到端测试默认跳过（受 jsdom 环境 Argon2 状态稳定性限制）；
// 通过 `WASM_E2E=1 npm test` 显式开启。在浏览器内手工验证代替默认 e2e 路径。

// 协议常量级测试（不依赖 WASM 状态）：始终运行
describe('SealGo 协议与魔数校验', () => {
  it('SC01 魔数检测', () => {
    expect(isSealGoFile(new Uint8Array([0x53, 0x43, 0x30, 0x31, 1, 1, 1, 32]))).toBe(true)
    expect(isSealGoFile(new Uint8Array([1, 2, 3, 4]))).toBe(false)
    expect(isSealGoFile(new Uint8Array([1, 2, 3]))).toBe(false) // 长度不足
  })

  it('extractSalt 对非 SealGo 抛错', () => {
    expect(() => extractSalt(new Uint8Array([1, 2, 3]))).toThrow()
  })

  it('extractPlainSize 对非 SealGo 返回 0', () => {
    expect(extractPlainSize(new Uint8Array(50))).toBe(0)
  })

  it('extractArgonParams 对非 SealGo 返回 null', () => {
    expect(extractArgonParams(new Uint8Array(50))).toBeNull()
  })
})
