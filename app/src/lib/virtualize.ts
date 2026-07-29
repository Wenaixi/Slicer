// 轻量虚拟滚动：只渲染可视区 + 上下缓冲带的行，500+ 切片场景不掉帧。
// 无第三方依赖，纯 React hook。

import { useEffect, useRef, useState } from 'react'

export interface VirtualWindow<T> {
  /** 需要渲染的子数组（原数组的切片） */
  items: T[]
  /** 原数组中 items[0] 对应的下标 */
  startIndex: number
  /** 原数组中 items[items.length-1] 对应的下标（含） */
  endIndex: number
  /** 上方占位高度（px） */
  paddingTop: number
  /** 下方占位高度（px） */
  paddingBottom: number
  /** 总行数（= 原数组 length） */
  total: number
  /** 挂载到滚动容器上（scroll 监听） */
  containerRef: React.RefObject<HTMLDivElement | null>
}

export interface VirtualizeOptions {
  /** 每行高度（px，等宽列表最准） */
  rowHeight: number
  /** 上下各多渲染多少行做缓冲（防白边） */
  overscan?: number
  /** 可视高度（px）。若不传则读取容器 clientHeight。 */
  viewportHeight?: number
}

export function useVirtualWindow<T>(
  allItems: T[],
  { rowHeight, overscan = 6, viewportHeight }: VirtualizeOptions,
): VirtualWindow<T> {
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

  const total = allItems.length
  const startIndex = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan)
  const endIndex = Math.min(
    total - 1,
    Math.ceil((scrollTop + viewport) / rowHeight) + overscan - 1,
  )
  const items = total === 0 ? [] : allItems.slice(startIndex, endIndex + 1)
  const paddingTop = startIndex * rowHeight
  const paddingBottom = Math.max(0, (total - endIndex - 1) * rowHeight)

  return {
    items,
    startIndex,
    endIndex,
    paddingTop,
    paddingBottom,
    total,
    containerRef,
  }
}