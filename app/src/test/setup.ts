// Vitest 全局 setup：注入 jest-dom 断言扩展 + 屏蔽测试噪音
import '@testing-library/jest-dom/vitest'

// jsdom 不实现 matchMedia，给 store.ts 的初始主题检测打桩
if (typeof window !== 'undefined' && !window.matchMedia) {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia
}

// Go WASM 的 js.Global() 在 jsdom 环境映射到 Node 的 globalThis。
// 将 wasm_exec.js 执行到 globalThis 上，让 window.Go 通过 globalThis 暴露给 jsdom window。
import { readFileSync, existsSync } from 'node:fs'
import { join, resolve } from 'node:path'

;(function loadGoRuntime() {
  const wasmDir = resolve(process.cwd(), 'public/wasm')
  const execPath = join(wasmDir, 'wasm_exec.js')
  if (!existsSync(execPath)) return
  if (typeof (globalThis as { Go?: unknown }).Go === 'function') return
  try {
    const code = readFileSync(execPath, 'utf-8')
    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    new Function(code)()
  } catch (e) {
    console.warn('[vitest setup] 注入 wasm_exec.js 失败:', e)
  }
})()
