// 面板错误 hook wrapper：订阅 lib/panel-error 的状态变更并触发组件重渲染。

import { useSyncExternalStore } from 'react';
import {
  subscribePanelErrors,
  getPanelErrorsSnapshot,
  type PanelError,
} from '../../lib/panel-error';

export function usePanelErrors(): PanelError[] {
  return useSyncExternalStore(subscribePanelErrors, getPanelErrorsSnapshot);
}
