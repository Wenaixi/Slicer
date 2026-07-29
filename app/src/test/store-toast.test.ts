import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { toast, dismissToast, useToasts } from '../lib/toast'
import { setTab, toggleTheme, useAppState } from '../lib/store'

describe('toast store', () => {
  beforeEach(() => {
    // 清空全部 toast
    const { result } = renderHook(() => useToasts())
    result.current.forEach((t) => dismissToast(t.id))
  })

  it('添加并自动消失', async () => {
    vi.useFakeTimers()
    const { result } = renderHook(() => useToasts())
    expect(result.current).toHaveLength(0)

    act(() => {
      toast('测试消息', 'success', 1000)
    })
    expect(result.current).toHaveLength(1)
    expect(result.current[0].message).toBe('测试消息')
    expect(result.current[0].type).toBe('success')

    act(() => {
      vi.advanceTimersByTime(1100)
    })
    // 先标记 leaving
    expect(result.current[0].leaving).toBe(true)

    act(() => {
      vi.advanceTimersByTime(200)
    })
    expect(result.current).toHaveLength(0)
    vi.useRealTimers()
  })

  it('手动 dismiss 立即触发离开动画', () => {
    const { result } = renderHook(() => useToasts())
    act(() => {
      toast('将被关闭', 'info', 10000)
    })
    const id = result.current[0].id
    act(() => {
      dismissToast(id)
    })
    expect(result.current[0].leaving).toBe(true)
  })
})

describe('app store', () => {
  it('tab 切换', () => {
    const { result } = renderHook(() => useAppState())
    act(() => {
      setTab('merge')
    })
    expect(result.current.tab).toBe('merge')
    act(() => {
      setTab('split')
    })
    expect(result.current.tab).toBe('split')
  })

  it('主题切换', () => {
    const { result } = renderHook(() => useAppState())
    const initial = result.current.theme
    act(() => {
      toggleTheme()
    })
    expect(result.current.theme).toBe(initial === 'dark' ? 'light' : 'dark')
    act(() => {
      toggleTheme()
    })
    expect(result.current.theme).toBe(initial)
  })
})
