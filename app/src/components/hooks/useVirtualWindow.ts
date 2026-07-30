// 虚拟滚动 React hook wrapper：监听容器 scroll + ResizeObserver，
// 把副作用与状态合并后交给 lib/virtualize 的纯函数 computeVirtualWindow 计算。
// 纯逻辑层不带 React 依赖，本文件位于 components/hooks/。

import { useEffect, useRef, useState, type RefObject } from 'react';
import {
  computeVirtualWindow,
  type VirtualWindow,
} from '../../lib/virtualize';

export interface UseVirtualWindowOptions {
  /** 每行高度（px，等宽列表最准） */
  rowHeight: number
  /** 上下各多渲染多少行做缓冲（防白边） */
  overscan?: number
  /** 可视高度（px）。若不传则读取容器 clientHeight。 */
  viewportHeight?: number
}

export interface UseVirtualWindowResult<T> extends Omit<VirtualWindow<T>, never> {
  /** 挂载到滚动容器上（scroll 监听） */
  containerRef: RefObject<HTMLDivElement | null>
}

export function useVirtualWindow<T>(
  allItems: T[],
  { rowHeight, overscan = 6, viewportHeight }: UseVirtualWindowOptions,
): UseVirtualWindowResult<T> {
  const containerRef = useRef<HTMLDivElement>(null)
  const [scrollTop, setScrollTop] = useState(0)
  const [viewport, setViewport] = useState(viewportHeight ?? 320)

  useEffect(() => {
    if (viewportHeight !== undefined) {
      setViewport(viewportHeight)
      return
    }
    const el = containerRef.current
    if (!el) return
    setViewport(el.clientHeight || 320)
    const ro = new ResizeObserver(() => setViewport(el.clientHeight || 320))
    ro.observe(el)
    return () => ro.disconnect()
  }, [viewportHeight])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    let raf = 0
    const onScroll = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => setScrollTop(el.scrollTop))
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      cancelAnimationFrame(raf)
      el.removeEventListener('scroll', onScroll)
    }
  }, [])

  const window = computeVirtualWindow<T>({
    allItems,
    scrollTop,
    viewportHeight: viewport,
    rowHeight,
    overscan,
  })

  return { ...window, containerRef }
}
