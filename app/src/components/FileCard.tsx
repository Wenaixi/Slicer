import { formatBytes, fileExtBadge } from '../lib/utils'
import { t } from '../lib/i18n'

interface FileCardProps {
  name: string
  size: number
  onRemove?: () => void
  actionLabel?: string
  onAction?: () => void
  children?: React.ReactNode
}

export function FileCard({ name, size, onRemove, actionLabel, onAction, children }: FileCardProps) {
  return (
    <div className="border border-zinc-800 light:border-zinc-200 bg-zinc-900 light:bg-white p-4 flex flex-col md:flex-row md:items-center justify-between gap-3 transition-fast">
      <div className="flex items-center gap-3 min-w-0">
        <span className="px-2 py-1 border border-zinc-700 light:border-zinc-300 font-mono text-[10px] font-bold uppercase shrink-0">
          {fileExtBadge(name)}
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold truncate">{name}</p>
          <p className="text-xs font-mono text-zinc-500">{formatBytes(size)}</p>
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {children}
        {actionLabel && onAction && (
          <button
            onClick={onAction}
            className="px-3 py-1.5 text-xs font-mono bg-zinc-100 text-zinc-950 light:bg-zinc-900 light:text-zinc-50 pressable transition-fast"
          >
            {actionLabel}
          </button>
        )}
        {onRemove && (
          <button
            onClick={onRemove}
            className="px-3 py-1.5 text-xs font-mono text-zinc-500 hover:text-zinc-200 light:hover:text-zinc-700 underline underline-offset-2 transition-fast"
          >
            {t('fileCard.remove')}
          </button>
        )}
      </div>
    </div>
  )
}
