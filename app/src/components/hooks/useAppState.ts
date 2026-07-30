// 应用全局状态 React hook wrapper：订阅 lib/store 触发组件重渲染。
// 纯逻辑层不带 React 依赖，本文件位于 components/hooks/。

import { useSyncExternalStore } from 'react';
import {
  subscribeAppState,
  getAppStateSnapshot,
  type AppState,
} from '../../lib/store';

export function useAppState(): AppState {
  return useSyncExternalStore(subscribeAppState, getAppStateSnapshot);
}
