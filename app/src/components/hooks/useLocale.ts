// 语言 React hook wrapper：订阅 lib/i18n 触发组件重渲染。
// 纯函数式取文走 t()；locale 订阅走 useLocale()。

import { useSyncExternalStore } from 'react';
import {
  subscribeLocale,
  getLocaleSnapshot,
  type Locale,
} from '../../lib/i18n';

export function useLocale(): Locale {
  return useSyncExternalStore(subscribeLocale, getLocaleSnapshot);
}
