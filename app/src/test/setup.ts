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
