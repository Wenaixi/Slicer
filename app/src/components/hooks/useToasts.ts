// Toast 列表 React hook wrapper：订阅 lib/toast 触发组件重渲染。

import { useSyncExternalStore } from 'react';
import {
  subscribeToasts,
  getToastsSnapshot,
  type ToastItem,
} from '../../lib/toast';

export function useToasts(): ToastItem[] {
  return useSyncExternalStore(subscribeToasts, getToastsSnapshot);
}
