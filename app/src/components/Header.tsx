import { toggleTheme } from '../lib/store'
import { useAppState } from './hooks/useAppState'
import { toggleLocale, t } from '../lib/i18n'
import { useLocale } from './hooks/useLocale'

export function Header() {
  const { theme, tab } = useAppState()
  useLocale() // 订阅语言变化触发重渲染
  return (
    <header className="border-b border-zinc-800 light:border-zinc-200 bg-zinc-950/60 light:bg-white/60 backdrop-blur supports-[backdrop-filter]:bg-zinc-950/40 light:supports-[backdrop-filter]:bg-white/40">
      <div className="max-w-6xl mx-auto px-4 py-4 flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 grid place-items-center bg-zinc-100 text-zinc-950 light:bg-zinc-900 light:text-zinc-50 font-mono font-black text-base">
            //
          </div>
          <div>
            <h1 className="text-lg md:text-xl font-extrabold tracking-display font-display uppercase leading-none">
              Slicer
              <span className="ml-2 text-[10px] font-normal px-1.5 py-0.5 border border-zinc-700 light:border-zinc-300 text-zinc-400 align-middle font-mono">
                WASM
              </span>
            </h1>
            <p className="text-[11px] text-zinc-500 mt-1 flex flex-wrap items-center gap-2">
              <span className="font-mono uppercase tracking-wider">纯本地</span>
              <span className="opacity-50">·</span>
              <span className="font-mono uppercase tracking-wider">SealGo XChaCha20</span>
              <span className="opacity-50">·</span>
              <span className="font-mono uppercase tracking-wider hidden sm:inline">
                ← / → 切模式
              </span>
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <div className="flex items-center gap-2 text-xs font-mono text-zinc-500" aria-hidden="true">
            <span>{t('header.shortcut')}</span>
            <kbd className="px-1.5 py-0.5 border border-zinc-700 light:border-zinc-300">Q</kbd>
            <kbd className="px-1.5 py-0.5 border border-zinc-700 light:border-zinc-300">W</kbd>
            <span className="opacity-50">/</span>
            <kbd className="px-1.5 py-0.5 border border-zinc-700 light:border-zinc-300">←</kbd>
            <kbd className="px-1.5 py-0.5 border border-zinc-700 light:border-zinc-300">→</kbd>
            <span className="ml-1 text-zinc-400">
              {t('header.current')}: {tab === 'split' ? t('header.split') : t('header.merge')}
            </span>
          </div>
          <button
            onClick={toggleLocale}
            className="px-3 py-1.5 border border-zinc-800 hover:border-zinc-600 light:border-zinc-300 light:hover:border-zinc-500 transition-fast pressable font-mono text-xs"
            aria-label={t('header.aria.toggleLanguage')}
          >
            {t('header.locale')}
          </button>
          <button
            onClick={toggleTheme}
            className="px-3 py-1.5 border border-zinc-800 hover:border-zinc-600 light:border-zinc-300 light:hover:border-zinc-500 transition-fast pressable font-mono flex items-center gap-2 text-xs"
            aria-label={theme === 'dark' ? t('header.aria.toggleTheme.dark') : t('header.aria.toggleTheme.light')}
          >
            {theme === 'dark' ? (
              <>
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <circle cx="12" cy="12" r="4" />
                  <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
                </svg>
                {t('header.theme.dark')}
              </>
            ) : (
              <>
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                </svg>
                {t('header.theme.light')}
              </>
            )}
          </button>
        </div>
      </div>
    </header>
  )
}
