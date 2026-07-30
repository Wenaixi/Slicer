import { useAppState, setTab } from '../lib/store'
import { useLocale, t } from '../lib/i18n'

export function TabBar() {
  const { tab } = useAppState()
  useLocale()

  const btnBase =
    'px-6 py-3 font-mono text-sm border-b-2 transition-fast flex items-center gap-2'

  return (
    <div className="flex border-b border-zinc-800 light:border-zinc-200 mb-6 overflow-x-auto">
      <button
        onClick={() => setTab('split')}
        className={`${btnBase} ${
          tab === 'split'
            ? 'border-zinc-100 text-zinc-100 light:border-zinc-900 light:text-zinc-900 font-bold'
            : 'border-transparent text-zinc-500 hover:text-zinc-300 light:hover:text-zinc-700'
        }`}
        aria-pressed={tab === 'split'}
      >
        <TabIcon kind="split" />
        {t('header.split')}
        <span className="text-[10px] opacity-60 font-normal uppercase">[ Q ]</span>
      </button>
      <button
        onClick={() => setTab('merge')}
        className={`${btnBase} ${
          tab === 'merge'
            ? 'border-zinc-100 text-zinc-100 light:border-zinc-900 light:text-zinc-900 font-bold'
            : 'border-transparent text-zinc-500 hover:text-zinc-300 light:hover:text-zinc-700'
        }`}
        aria-pressed={tab === 'merge'}
      >
        <TabIcon kind="merge" />
        {t('header.merge')}
        <span className="text-[10px] opacity-60 font-normal uppercase">[ W ]</span>
      </button>
    </div>
  )
}

function TabIcon({ kind }: { kind: 'split' | 'merge' }) {
  if (kind === 'split') {
    return (
      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
        <path d="M8 7h12M8 7a2 2 0 1 0-4 0v10a2 2 0 0 0 4 0M8 7a2 2 0 0 1 4 0v10a2 2 0 0 1-4 0M16 7a2 2 0 1 0 0 4h2a2 2 0 0 0 0-4" />
      </svg>
    )
  }
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M4 6h6v12H4zM14 6h6v12h-6z" />
    </svg>
  )
}
