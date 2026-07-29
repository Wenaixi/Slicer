// 轻量 Toast 通知系统：全局单例 store + 订阅。
// 设计遵循 Apple 原则：进入/退出沿同一路径（底部滑入滑出），CSS transition 可中断。

import { useSyncExternalStore } from 'react';

export type ToastType = 'info' | 'success' | 'error';

export interface ToastItem {
  id: number;
  message: string;
  type: ToastType;
  leaving: boolean;
}

type Listener = () => void;

let toasts: ToastItem[] = [];
let listeners = new Set<Listener>();
let nextId = 1;

function emit() {
  listeners.forEach((l) => l());
}

function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): ToastItem[] {
  return toasts;
}

export function toast(message: string, type: ToastType = 'info', duration = 3200): void {
  const id = nextId++;
  toasts = [...toasts, { id, message, type, leaving: false }];
  emit();
  setTimeout(() => dismissToast(id), duration);
}

export function dismissToast(id: number): void {
  // 先标记 leaving 触发退出动画，再真正移除
  toasts = toasts.map((t) => (t.id === id ? { ...t, leaving: true } : t));
  emit();
  setTimeout(() => {
    toasts = toasts.filter((t) => t.id !== id);
    emit();
  }, 180);
}

export function useToasts(): ToastItem[] {
  return useSyncExternalStore(subscribe, getSnapshot);
}
