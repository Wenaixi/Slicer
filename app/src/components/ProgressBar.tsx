import { t } from '../lib/i18n'

interface ProgressBarProps {
  /** 0-100 */
  value: number
  label?: string
  detail?: string
}

export function ProgressBar({ value, label, detail }: ProgressBarProps) {
  const clamped = Math.max(0, Math.min(100, value))
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs font-mono text-zinc-500">
        <span>{label ?? t('progress.fallback')}</span>
        <span>{detail ?? `${clamped.toFixed(0)}%`}</span>
      </div>
      <div
        className="h-1.5 bg-zinc-800 light:bg-zinc-200 overflow-hidden"
        role="progressbar"
        aria-valuenow={Math.round(clamped)}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className="h-full bg-zinc-100 light:bg-zinc-900 progress-animated transition-[width] duration-200"
          style={{ width: `${clamped}%` }}
        />
      </div>
    </div>
  )
}
