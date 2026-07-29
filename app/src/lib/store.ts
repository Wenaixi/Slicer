// 应用全局状态（zustand 之外，不引依赖：用 useSyncExternalStore 手写即可？）
// 但切片/合并两块状态相对独立且组件树浅，直接用 React useState + props 更清晰。
// 这里只保留主题与全局拖拽这类真正的全局状态。

import { useSyncExternalStore } from 'react';

export type Theme = 'dark' | 'light';
export type AppTab = 'split' | 'merge';

type Listener = () => void;

interface AppState {
  theme: Theme;
  tab: AppTab;
}

let state: AppState = {
  theme: (typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: light)').matches)
    ? 'light'
    : 'dark',
  tab: 'split',
};

const listeners = new Set<Listener>();

function emit() {
  listeners.forEach((l) => l());
}

function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): AppState {
  return state;
}

export function setTheme(theme: Theme): void {
  state = { ...state, theme };
  emit();
}

export function toggleTheme(): void {
  setTheme(state.theme === 'dark' ? 'light' : 'dark');
}

export function setTab(tab: AppTab): void {
  state = { ...state, tab };
  emit();
}

export function useAppState(): AppState {
  return useSyncExternalStore(subscribe, getSnapshot);
}
