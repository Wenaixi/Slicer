// 应用全局状态（主题/Tab/全局拖拽遮罩）。
// 手写 useSyncExternalStore，避免引入 Redux/Zustand 等依赖。

import { useSyncExternalStore } from 'react';

export type Theme = 'dark' | 'light';
export type AppTab = 'split' | 'merge';

type Listener = () => void;

interface AppState {
  theme: Theme;
  tab: AppTab;
  /** 全屏拖拽悬停（window 级 dragenter 计数 > 0 时置真） */
  globalDragging: boolean;
}

let state: AppState = {
  theme: (typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: light)').matches)
    ? 'light'
    : 'dark',
  tab: 'split',
  globalDragging: false,
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

export function setGlobalDragging(dragging: boolean): void {
  if (state.globalDragging === dragging) return;
  state = { ...state, globalDragging: dragging };
  emit();
}

export function useAppState(): AppState {
  return useSyncExternalStore(subscribe, getSnapshot);
}
