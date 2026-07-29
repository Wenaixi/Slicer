import { describe, it, expect } from 'vitest'
import { classifyDecryptError, kindLabel } from '../lib/decrypt-error'

function buildSealgoHeader(opts: { version?: number; extraBytes?: number } = {}): Uint8Array {
  const version = opts.version ?? 1
  const extra = opts.extraBytes ?? 68 + 20 + 16 // stanza + chunk 头
  const buf = new Uint8Array(100 + extra)
  buf[0] = 0x53 // S
  buf[1] = 0x43 // C
  buf[2] = 0x30 // 0
  buf[3] = 0x31 // 1
  buf[4] = version
  return buf
}

describe('classifyDecryptError', () => {
  it('魔数错误 → not-sealgo', () => {
    const cipher = new Uint8Array([0x00, 0x00, 0x00, 0x00])
    const r = classifyDecryptError(cipher, new Error('any'))
    expect(r.kind).toBe('not-sealgo')
  })

  it('长度不足 100B → not-sealgo', () => {
    const cipher = new Uint8Array(50)
    cipher[0] = 0x53; cipher[1] = 0x43; cipher[2] = 0x30; cipher[3] = 0x31
    const r = classifyDecryptError(cipher, new Error('any'))
    expect(r.kind).toBe('not-sealgo')
  })

  it('版本不支持 → header-corrupt', () => {
    const cipher = buildSealgoHeader({ version: 9 })
    const r = classifyDecryptError(cipher, new Error('any'))
    expect(r.kind).toBe('header-corrupt')
  })

  it('长度残缺（无 stanza 完整）→ cipher-corrupt', () => {
    // 100B 头 + 0B 附加 → 不够 stanza(68)+chunk(20) 最小
    const cipher = buildSealgoHeader({ extraBytes: 10 })
    const r = classifyDecryptError(cipher, new Error('any'))
    expect(r.kind).toBe('cipher-corrupt')
  })

  it('头结构完整 + "wrong password or corrupted file" → wrong-password', () => {
    const cipher = buildSealgoHeader()
    const r = classifyDecryptError(cipher, new Error('wrong password or corrupted file'))
    expect(r.kind).toBe('wrong-password')
    expect(r.hint).toContain('密码')
  })

  it('头结构完整 + 其他错误 → internal', () => {
    const cipher = buildSealgoHeader()
    const r = classifyDecryptError(cipher, new Error('some random error'))
    expect(r.kind).toBe('internal')
  })

  it('kindLabel 翻译', () => {
    expect(kindLabel('wrong-password')).toBe('密码错误')
    expect(kindLabel('not-sealgo')).toBe('非加密文件')
    expect(kindLabel('header-corrupt')).toBe('头部损坏')
    expect(kindLabel('cipher-corrupt')).toBe('密文残缺')
    expect(kindLabel('internal')).toBe('未知错误')
  })
})