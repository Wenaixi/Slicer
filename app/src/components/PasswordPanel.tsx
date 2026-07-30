import { useState } from 'react'
import { toast } from '../lib/toast'
import { passwordStrength, strengthLabels } from '../lib/utils'
import { generatePassword } from '../lib/password-gen'
import { t } from '../lib/i18n'
import { useLocale } from './hooks/useLocale'

interface PasswordPanelProps {
  password: string
  onPasswordChange: (pw: string) => void
  confirmPassword: string
  onConfirmChange: (pw: string) => void
  disabled?: boolean
  /** 解密场景：无需确认框与强度提示 */
  decryptMode?: boolean
}

export function PasswordPanel({
  password,
  onPasswordChange,
  confirmPassword,
  onConfirmChange,
  disabled = false,
  decryptMode = false,
}: PasswordPanelProps) {
  const [show, setShow] = useState(false)
  const locale = useLocale()
  const strength = passwordStrength(password)
  const labels = strengthLabels(locale)
  const mismatch = !decryptMode && confirmPassword.length > 0 && password !== confirmPassword

  return (
    <div className="border border-zinc-800 light:border-zinc-200 bg-zinc-900 light:bg-white p-5 space-y-4 card-enter">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-mono uppercase tracking-wider text-zinc-400">
          {decryptMode ? t('password.title.decrypt') : t('password.title.encrypt')}
        </h3>
        <div className="flex items-center gap-3">
          {!decryptMode && (
            <button
              type="button"
              onClick={() => {
                const pw = generatePassword({ length: 16 })
                onPasswordChange(pw)
                onConfirmChange(pw)
                setShow(true)
                toast(t('password.generateDone'), 'success')
              }}
              className="text-xs text-zinc-500 hover:text-zinc-200 light:hover:text-zinc-700 font-mono transition-fast underline underline-offset-2"
              aria-label={t('password.generateAria')}
            >
              {t('password.generate')}
            </button>
          )}
          <button
            type="button"
            onClick={() => setShow((s) => !s)}
            className="text-xs text-zinc-500 hover:text-zinc-200 light:hover:text-zinc-700 font-mono transition-fast"
            aria-label={show ? t('password.toggleAria.hide') : t('password.toggleAria.show')}
          >
            {show ? t('password.hide') : t('password.show')}
          </button>
        </div>
      </div>

      <div className={`grid gap-4 ${decryptMode ? 'grid-cols-1' : 'grid-cols-1 md:grid-cols-2'}`}>
        <label className="block">
          <span className="text-xs font-mono text-zinc-500 block mb-1.5">{t('password.input')}</span>
          <input
            type={show ? 'text' : 'password'}
            value={password}
            onChange={(e) => onPasswordChange(e.target.value)}
            disabled={disabled}
            placeholder={decryptMode ? t('password.input.placeholder.decrypt') : t('password.input.placeholder.encrypt')}
            autoComplete={decryptMode ? 'current-password' : 'new-password'}
            className="w-full bg-zinc-950 light:bg-zinc-50 border border-zinc-800 light:border-zinc-300 px-4 py-2 text-sm font-mono focus:outline-none focus:border-zinc-500 transition-fast disabled:opacity-50"
          />
        </label>
        {!decryptMode && (
          <label className="block">
            <span className="text-xs font-mono text-zinc-500 block mb-1.5">{t('password.confirm')}</span>
            <input
              type={show ? 'text' : 'password'}
              value={confirmPassword}
              onChange={(e) => onConfirmChange(e.target.value)}
              disabled={disabled}
              placeholder={t('password.confirm.placeholder')}
              autoComplete="new-password"
              className={`w-full bg-zinc-950 light:bg-zinc-50 border px-4 py-2 text-sm font-mono focus:outline-none transition-fast disabled:opacity-50 ${
                mismatch
                  ? 'border-red-500/60 focus:border-red-400'
                  : 'border-zinc-800 light:border-zinc-300 focus:border-zinc-500'
              }`}
            />
          </label>
        )}
      </div>

      {!decryptMode && (
        <div className="flex items-center justify-between text-xs font-mono">
          <div className="flex items-center gap-2">
            <span className="text-zinc-500">{t('password.strength')}</span>
            <div className="flex gap-0.5" aria-label={t('password.strength.aria', { level: labels[strength] })}>
              {[0, 1, 2, 3].map((i) => (
                <span
                  key={i}
                  className={`h-1.5 w-6 transition-fast ${
                    i < strength
                      ? strength >= 3
                        ? 'bg-emerald-400'
                        : strength >= 2
                        ? 'bg-amber-400'
                        : 'bg-red-400'
                      : 'bg-zinc-800 light:bg-zinc-200'
                  }`}
                />
              ))}
            </div>
            <span className={strength >= 3 ? 'text-emerald-400' : strength >= 2 ? 'text-amber-400' : 'text-red-400'}>
              {labels[strength]}
            </span>
          </div>
          {mismatch && <span className="text-red-400">{t('password.mismatch')}</span>}
          {!mismatch && password.length > 0 && confirmPassword.length > 0 && (
            <span className="text-emerald-400">{t('password.matched')}</span>
          )}
        </div>
      )}

      <p className="text-[11px] text-zinc-600 light:text-zinc-500 leading-relaxed">
        {decryptMode ? t('password.body.decrypt') : t('password.body.encrypt')}
        <button
          type="button"
          onClick={() => toast(t('password.aboutToast'), 'info')}
          className="ml-1 underline underline-offset-2 hover:text-zinc-400 transition-fast"
        >
          {t('password.aboutBtn')}
        </button>
      </p>
    </div>
  )
}
