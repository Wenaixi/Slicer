import { useToasts } from './hooks/useToasts'
import { dismissToast } from '../lib/toast'

export function ToastStack() {
  const toasts = useToasts()

  return (
    <div
      className="fixed bottom-6 right-6 z-50 flex flex-col gap-2 items-end pointer-events-none"
      aria-live="polite"
      aria-atomic="false"
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`toast-item pointer-events-auto px-4 py-2.5 border shadow-2xl text-xs font-mono max-w-sm flex items-center gap-2 ${
            t.leaving ? 'toast-leave' : 'toast-enter'
          } ${
            t.type === 'error'
              ? 'border-red-500/30 bg-red-950 text-red-100 light:bg-red-50 light:text-red-900 light:border-red-300'
              : t.type === 'success'
              ? 'border-emerald-500/30 bg-emerald-950 text-emerald-100 light:bg-emerald-50 light:text-emerald-900 light:border-emerald-300'
              : 'border-zinc-700 bg-zinc-900 text-zinc-100 light:border-zinc-300 light:bg-white light:text-zinc-900'
          }`}
          role={t.type === 'error' ? 'alert' : 'status'}
          onClick={() => dismissToast(t.id)}
        >
          {t.type === 'success' && (
            <svg className="w-3.5 h-3.5 text-emerald-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path d="M20 6 9 17l-5-5" />
            </svg>
          )}
          {t.type === 'error' && (
            <svg className="w-3.5 h-3.5 text-red-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <circle cx="12" cy="12" r="10" />
              <path d="M12 8v4M12 16h.01" />
            </svg>
          )}
          {t.type === 'info' && (
            <svg className="w-3.5 h-3.5 text-zinc-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <circle cx="12" cy="12" r="10" />
              <path d="M12 16v-4M12 8h.01" />
            </svg>
          )}
          <span>{t.message}</span>
        </div>
      ))}
    </div>
  )
}
