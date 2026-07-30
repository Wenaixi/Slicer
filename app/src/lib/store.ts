// 应用全局状态（主题/Tab/全局拖拽遮罩）。
// 纯逻辑层：仅持有状态 + 订阅 + 变更 API，不依赖 React。
// React 订阅见 components/hooks/useAppState.ts。

export type Theme = 'dark' | 'light';
export type AppTab = 'split' | 'merge';

type Listener = () => void;

export interface AppState {
  theme: Theme;
  tab: AppTab;
  /** 全屏拖拽悬停（window 级 dragenter 计数 > 0 时置真） */
  globalDragging: boolean;
}

let state: AppState = {
  theme: (() => {
    // 优先读 localStorage 记忆，再 fallback 系统偏好
    try {
      const saved = localStorage.getItem('slicer:theme') as Theme | null
      if (saved === 'light' || saved === 'dark') return saved
    } catch {}
    return (typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: light)').matches)
      ? 'light'
      : 'dark'
  })(),
  tab: 'split',
  globalDragging: false,
};

const listeners = new Set<Listener>();

function emit() {
  listeners.forEach((l) => l());
}

export function subscribeAppState(l: Listener): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function getAppStateSnapshot(): AppState {
  return state;
}

export function setTheme(theme: Theme): void {
  state = { ...state, theme };
  try {
    localStorage.setItem('slicer:theme', theme);
  } catch {}
  emit();
}

export function toggleTheme(): void {
  setTheme(state.theme === 'dark' ? 'light' : 'dark');
}

export function setTab(tab: AppTab): void {
  state = { ...state, tab };
  emit();
}

export function setGlobalDragging(dragging: boolean): void {
  if (state.globalDragging === dragging) return;
  state = { ...state, globalDragging: dragging };
  emit();
}
