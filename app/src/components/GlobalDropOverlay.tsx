import { useAppState } from '../lib/store'
import type { AppTab } from '../lib/store'

export function GlobalDropOverlay({ currentTab }: { currentTab: AppTab }) {
  const { globalDragging } = useAppState()
  if (!globalDragging) return null

  return (
    <div
      className="fixed inset-0 z-50 bg-zinc-950/90 light:bg-white/90 backdrop-blur-sm grid place-items-center border-4 border-dashed border-zinc-400 light:border-zinc-500 m-4 drag-overlay-enter pointer-events-none"
      aria-hidden="true"
    >
      <div className="text-center space-y-3">
        <div className="w-16 h-16 mx-auto grid place-items-center border-2 border-zinc-300 light:border-zinc-600 text-zinc-200 light:text-zinc-700">
          <svg className="w-8 h-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
            <path d="M12 3v12M12 3l-4 4M12 3l4 4" />
            <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
          </svg>
        </div>
        <p className="font-mono text-sm text-zinc-200 light:text-zinc-800">
          释放文件即可{currentTab === 'split' ? '分割' : '追加合并'}
        </p>
        <p className="text-xs text-zinc-500 font-mono">
          当前模式：{currentTab === 'split' ? '文件分割' : '切片合并'}
        </p>
      </div>
    </div>
  )
}
