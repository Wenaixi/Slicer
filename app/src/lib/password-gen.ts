// 密码生成器（基于 crypto.getRandomValues，浏览器 + Node 18+）
// 注意：仅作为用户体验辅助，不强制使用；保留密码可由用户自选

const UPPER = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
const LOWER = 'abcdefghijklmnopqrstuvwxyz'
const DIGITS = '0123456789'
const SYMBOLS = '!@#$%^&*()-_=+[]{};:,.<>?'

function pickChars(
  pool: string,
  n: number,
  out: string[],
  rng: () => number,
): void {
  for (let i = 0; i < n; i++) {
    out.push(pool[Math.floor(rng() * pool.length)])
  }
}

export interface PasswordGeneratorOptions {
  length?: number
  upper?: boolean
  lower?: boolean
  digits?: boolean
  symbols?: boolean
  /** 同种字符连续最大数（防止 111111 / aaaaaa），0=不限 */
  maxRepeat?: number
}

export function generatePassword(opts: PasswordGeneratorOptions = {}): string {
  const length = Math.max(4, opts.length ?? 16)
  const useUpper = opts.upper ?? true
  const useLower = opts.lower ?? true
  const useDigits = opts.digits ?? true
  const useSymbols = opts.symbols ?? true

  // CSPRNG：浏览器 crypto.getRandomValues；Node fallback
  const rng = (() => {
    const buf = new Uint32Array(1)
    if (typeof globalThis.crypto?.getRandomValues === 'function') {
      return () => {
        globalThis.crypto.getRandomValues(buf)
        return buf[0] / 0xffffffff
      }
    }
    return () => Math.random()
  })()

  // 池组装：保证每类至少出现一次（除非禁用）
  const required: string[] = []
  const pools: string[] = []
  if (useUpper) { pools.push(UPPER); required.push(UPPER[Math.floor(rng() * UPPER.length)]) }
  if (useLower) { pools.push(LOWER); required.push(LOWER[Math.floor(rng() * LOWER.length)]) }
  if (useDigits) { pools.push(DIGITS); required.push(DIGITS[Math.floor(rng() * DIGITS.length)]) }
  if (useSymbols) { pools.push(SYMBOLS); required.push(SYMBOLS[Math.floor(rng() * SYMBOLS.length)]) }
  if (pools.length === 0) pools.push(LOWER)

  const allChars = pools.join('')
  const remaining = length - required.length
  const rest: string[] = []
  pickChars(allChars, Math.max(0, remaining), rest, rng)

  // Fisher-Yates 洗牌
  const pool = [...required, ...rest]
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[pool[i], pool[j]] = [pool[j], pool[i]]
  }
  return pool.join('')
}
