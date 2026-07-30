import { describe, it, expect, beforeEach } from 'vitest'
import { t, setLocale, toggleLocale, useLocale } from '../lib/i18n'
import { renderHook } from '@testing-library/react'

describe('i18n', () => {
  beforeEach(() => {
    // 每个用例前重置为默认中文
    setLocale('zh')
    localStorage.clear()
  })

  it('默认中文', () => {
    expect(t('header.split')).toBe('文件分割')
    expect(t('header.merge')).toBe('切片合并')
    expect(t('header.current')).toBe('当前')
  })

  it('切换英文', () => {
    setLocale('en')
    expect(t('header.split')).toBe('Split')
    expect(t('header.merge')).toBe('Merge')
    expect(t('header.current')).toBe('Current')
  })

  it('toggleLocale 在 zh/en 之间切换', () => {
    setLocale('zh')
    toggleLocale()
    expect(t('header.split')).toBe('Split')
    toggleLocale()
    expect(t('header.split')).toBe('文件分割')
  })

  it('localStorage 持久化', () => {
    setLocale('en')
    expect(localStorage.getItem('slicer:locale')).toBe('en')
  })

  it('未知 key 返回 key 本身', () => {
    expect(t('unknown.key')).toBe('unknown.key')
  })

  it('useLocale hook 返回当前语言', () => {
    const { result } = renderHook(() => useLocale())
    expect(result.current).toBe('zh')
  })

  it('footer 文案双语可用', () => {
    setLocale('zh')
    expect(t('footer.01.title')).toBe('流式分块')
    setLocale('en')
    expect(t('footer.01.title')).toBe('Streaming chunks')
  })
})