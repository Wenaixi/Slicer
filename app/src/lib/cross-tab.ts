// 跨标签进度共享：BroadcastChannel 同步「分割进行中 / 续传状态」给同源其他 Tab。
// 不存浏览器存储，仅靠 channel，页面关闭即释放；channel 不可用时静默降级。
// 同时在 sessionStorage 缓存最近一条事件，新订阅者可以 state replay 拿到当前进度。

export interface CrossTabProgressEvent {
  kind: 'split-start' | 'split-progress' | 'split-done' | 'split-abort' | 'split-resume'
  fileName: string
  fileSize: number
  completedIndices: number[]
  totalParts: number
  timestamp: number
}

type Listener = (e: CrossTabProgressEvent) => void

const CHANNEL_NAME = 'slicer:split-progress'
/** sessionStorage key:仅缓存最近一条 split-progress 用于新订阅者补发。 */
export const LAST_EVENT_KEY = 'slicer:split-progress:last'

let channel: BroadcastChannel | null = null
let listeners = new Set<Listener>()

function getChannel(): BroadcastChannel | null {
  if (typeof window === 'undefined') return null
  if (!('BroadcastChannel' in window)) return null
  if (!channel) {
    channel = new BroadcastChannel(CHANNEL_NAME)
    channel.onmessage = (ev: MessageEvent<CrossTabProgressEvent>) => {
      listeners.forEach((l) => l(ev.data))
    }
  }
  return channel
}

/** 从 sessionStorage 读最近一条事件(state replay 专用) */
function readLastEvent(): CrossTabProgressEvent | null {
  if (typeof sessionStorage === 'undefined') return null
  try {
    const raw = sessionStorage.getItem(LAST_EVENT_KEY)
    if (!raw) return null
    return JSON.parse(raw) as CrossTabProgressEvent
  } catch {
    return null
  }
}

/** 发送进度到同域其他 Tab；支持 BroadcastChannel 才生效。
 *  同步把最近一条 split-progress 写入 sessionStorage(供后续订阅者补发)。 */
export function broadcastProgress(e: CrossTabProgressEvent): void {
  const c = getChannel()
  if (c) {
    try {
      c.postMessage(e)
    } catch {
      // 序列化失败（如循环引用）：静默忽略
    }
  }
  if (typeof sessionStorage !== 'undefined' && e.kind === 'split-progress') {
    try {
      sessionStorage.setItem(LAST_EVENT_KEY, JSON.stringify(e))
    } catch {
      // 配额超限 / 隐私模式：忽略
    }
  }
}

/** 订阅同域其他 Tab 的进度；返回退订函数。
 *  注册时立即从 sessionStorage 补发最近一条 split-progress(state replay)。 */
export function subscribeProgress(listener: Listener): () => void {
  getChannel()
  listeners.add(listener)
  const last = readLastEvent()
  if (last) listener(last)
  return () => listeners.delete(listener)
}