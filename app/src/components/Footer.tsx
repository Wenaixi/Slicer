import { t } from '../lib/i18n'
import { useLocale } from './hooks/useLocale'

export function Footer() {
  useLocale()
  return (
    <footer className="mt-16 pt-8 border-t border-zinc-800/60 light:border-zinc-200 grid grid-cols-1 md:grid-cols-3 gap-6 text-[11px] text-zinc-500 light:text-zinc-500 font-mono">
      <div className="flex items-start gap-3">
        <span className="font-bold text-zinc-300 light:text-zinc-700">01.</span>
        <p>
          <strong className="text-zinc-200 light:text-zinc-800">{t('footer.01.title')}</strong>
          ：{t('footer.01.body')}
        </p>
      </div>
      <div className="flex items-start gap-3">
        <span className="font-bold text-zinc-300 light:text-zinc-700">02.</span>
        <p>
          <strong className="text-zinc-200 light:text-zinc-800">{t('footer.02.title')}</strong>
          ：{t('footer.02.body')}
        </p>
      </div>
      <div className="flex items-start gap-3">
        <span className="font-bold text-zinc-300 light:text-zinc-700">03.</span>
        <p>
          <strong className="text-zinc-200 light:text-zinc-800">{t('footer.03.title')}</strong>
          ：{t('footer.03.body')}
        </p>
      </div>
    </footer>
  )
}
