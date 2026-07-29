// 跨标签进度共享：BroadcastChannel 同步「分割进行中 / 续传状态」给同源其他 Tab。
// 不存浏览器存储，仅靠 channel，页面关闭即释放；channel 不可用时静默降级。

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

/** 发送进度到同域其他 Tab；支持 BroadcastChannel 才生效 */
export function broadcastProgress(e: CrossTabProgressEvent): void {
  const c = getChannel()
  if (!c) return
  try {
    c.postMessage(e)
  } catch {
    // 序列化失败（如循环引用）：静默忽略
  }
}

/** 订阅同域其他 Tab 的进度；返回退订函数 */
export function subscribeProgress(listener: Listener): () => void {
  getChannel()
  listeners.add(listener)
  return () => listeners.delete(listener)
}