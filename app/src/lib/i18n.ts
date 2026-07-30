// 轻量 i18n：中英文切换（默认中文，localStorage 记忆），复用 store 的订阅模式。

import { useSyncExternalStore } from 'react';

export type Locale = 'zh' | 'en';

type Listener = () => void;

const STORAGE_KEY = 'slicer:locale';

let locale: Locale = (() => {
  if (typeof window === 'undefined') return 'zh';
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'zh' || saved === 'en') return saved;
  } catch {}
  return 'zh';
})();

const listeners = new Set<Listener>();

function emit() {
  listeners.forEach((l) => l());
}

function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): Locale {
  return locale;
}

export function setLocale(l: Locale): void {
  if (locale === l) return;
  locale = l;
  try {
    localStorage.setItem(STORAGE_KEY, l);
  } catch {}
  emit();
}

export function toggleLocale(): void {
  setLocale(locale === 'zh' ? 'en' : 'zh');
}

export function useLocale(): Locale {
  return useSyncExternalStore(subscribe, getSnapshot);
}

/** 字典（key 用英文便于阅读，组件里 t('header.split') 即可） */
const dict: Record<string, { zh: string; en: string }> = {
  'header.split': { zh: '文件分割', en: 'Split' },
  'header.merge': { zh: '切片合并', en: 'Merge' },
  'header.current': { zh: '当前', en: 'Current' },
  'header.shortcut': { zh: '快捷键', en: 'Shortcuts' },
  'header.theme.dark': { zh: '深色', en: 'Dark' },
  'header.theme.light': { zh: '浅色', en: 'Light' },
  'header.locale': { zh: 'EN', en: '中文' },
  'footer.01.title': { zh: '流式分块', en: 'Streaming chunks' },
  'footer.01.body': {
    zh: 'File.slice + 零拷贝 Blob 拼接，1GB 文件内存占用稳定在数 MB。',
    en: 'File.slice + zero-copy Blob concat; 1GB files stay within a few MB of RAM.',
  },
  'footer.02.title': { zh: 'SealGo WASM', en: 'SealGo WASM' },
  'footer.02.body': {
    zh: 'XChaCha20-Poly1305 认证加密 + Argon2id 密码派生，浏览器本地完成，数据零外发。',
    en: 'XChaCha20-Poly1305 AEAD + Argon2id KDF, fully in-browser. Zero data leaves your device.',
  },
  'footer.03.title': { zh: '智能归组', en: 'Smart grouping' },
  'footer.03.body': {
    zh: '三种切片命名规范自动识别，支持跨目录多批次追加去重拼接。',
    en: 'Auto-detects 3 chunk-naming conventions; dedupes and stitches batches across folders.',
  },
};

export function t(key: keyof typeof dict | string): string {
  const entry = dict[key];
  if (!entry) return key;
  return locale === 'zh' ? entry.zh : entry.en;
}