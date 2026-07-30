import { describe, it, expect } from 'vitest'
import { pushError, dismissError, clearErrors } from '../lib/panel-error'
import { usePanelErrors } from '../components/hooks/usePanelErrors'
import { renderHook, act } from '@testing-library/react'

describe('panel-error store', () => {
  it('pushError 添加错误，dismissError 移除', () => {
    clearErrors()
    const { result } = renderHook(() => usePanelErrors())
    expect(result.current.length).toBe(0)

    let id1 = 0
    act(() => {
      id1 = pushError({
        kind: 'decrypt',
        title: 'wrong-password',
        message: '密码错误',
      })
    })
    expect(result.current.length).toBe(1)
    expect(result.current[0].title).toBe('wrong-password')

    act(() => dismissError(id1))
    expect(result.current.length).toBe(0)
  })

  it('clearErrors 清空所有', () => {
    clearErrors()
    const { result } = renderHook(() => usePanelErrors())
    act(() => {
      pushError({ kind: 'wasm', title: 'w1', message: 'm1' })
      pushError({ kind: 'merge', title: 'm2', message: 'm2' })
    })
    expect(result.current.length).toBe(2)
    act(() => clearErrors())
    expect(result.current.length).toBe(0)
  })

  it('pushError 自动分配递增 id 和时间戳', () => {
    clearErrors()
    const { result } = renderHook(() => usePanelErrors())
    let id1 = 0, id2 = 0
    act(() => {
      id1 = pushError({ kind: 'io', title: 'a', message: 'a' })
      id2 = pushError({ kind: 'io', title: 'b', message: 'b' })
    })
    expect(id2).toBeGreaterThan(id1)
    expect(result.current[0].timestamp).toBeGreaterThan(0)
  })

  it('pushError 保留 fileName 与 diagnostics', () => {
    clearErrors()
    const { result } = renderHook(() => usePanelErrors())
    act(() => {
      pushError({
        kind: 'decrypt',
        title: 't',
        message: 'm',
        fileName: 'a.sc',
        diagnostics: 'kind: wrong-password',
      })
    })
    expect(result.current[0].fileName).toBe('a.sc')
    expect(result.current[0].diagnostics).toBe('kind: wrong-password')
  })
})