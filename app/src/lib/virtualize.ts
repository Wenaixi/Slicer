// 轻量虚拟滚动纯函数：给定 scrollTop / viewport / rowHeight 算出可视区窗口。
// 无副作用、可单测。React 副作用（监听 scroll、ResizeObserver）见
// components/hooks/useVirtualWindow.ts。

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
}

export interface ComputeVirtualWindowOptions {
  /** 原数组 */
  allItems: readonly unknown[]
  /** 当前 scrollTop */
  scrollTop: number
  /** 可视高度 */
  viewportHeight: number
  /** 每行高度 */
  rowHeight: number
  /** 上下各多渲染多少行做缓冲（防白边） */
  overscan?: number
}

export function computeVirtualWindow<T>({
  allItems,
  scrollTop,
  viewportHeight,
  rowHeight,
  overscan = 6,
}: ComputeVirtualWindowOptions): VirtualWindow<T> {
  const total = allItems.length
  const startIndex = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan)
  const endIndex = Math.min(
    total - 1,
    Math.ceil((scrollTop + viewportHeight) / rowHeight) + overscan - 1,
  )
  const items = (total === 0
    ? []
    : (allItems as T[]).slice(startIndex, endIndex + 1))
  const paddingTop = startIndex * rowHeight
  const paddingBottom = Math.max(0, (total - endIndex - 1) * rowHeight)

  return { items, startIndex, endIndex, paddingTop, paddingBottom, total }
}
