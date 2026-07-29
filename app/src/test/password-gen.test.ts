import { describe, it, expect } from 'vitest'
import { generatePassword } from '../lib/password-gen'

describe('密码生成器', () => {
  it('默认长度 16，每类字符都包含', () => {
    const pw = generatePassword()
    expect(pw.length).toBe(16)
    expect(/[A-Z]/.test(pw)).toBe(true)
    expect(/[a-z]/.test(pw)).toBe(true)
    expect(/\d/.test(pw)).toBe(true)
    expect(/[^a-zA-Z0-9]/.test(pw)).toBe(true)
  })

  it('自定义长度', () => {
    expect(generatePassword({ length: 32 }).length).toBe(32)
    expect(generatePassword({ length: 8 }).length).toBe(8)
  })

  it('下限：最少 4 字符', () => {
    expect(generatePassword({ length: 1 }).length).toBe(4)
    expect(generatePassword({ length: 0 }).length).toBe(4)
    expect(generatePassword({ length: -10 }).length).toBe(4)
  })

  it('关闭某些字符类后不再包含', () => {
    const noSymbol = generatePassword({ symbols: false, length: 20 })
    expect(/[^a-zA-Z0-9]/.test(noSymbol)).toBe(false)

    const noDigit = generatePassword({ digits: false, length: 20 })
    expect(/\d/.test(noDigit)).toBe(false)

    const onlyLower = generatePassword({
      upper: false,
      digits: false,
      symbols: false,
      length: 20,
    })
    expect(/^[a-z]+$/.test(onlyLower)).toBe(true)
  })

  it('多次调用结果不同（随机性）', () => {
    const pw1 = generatePassword({ length: 20 })
    const pw2 = generatePassword({ length: 20 })
    expect(pw1).not.toBe(pw2)
  })
})
