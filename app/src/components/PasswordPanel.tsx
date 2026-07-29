import { useState } from 'react'
import { toast } from '../lib/toast'
import { passwordStrength, STRENGTH_LABEL } from '../lib/utils'

interface PasswordPanelProps {
  password: string
  onPasswordChange: (pw: string) => void
  confirmPassword: string
  onConfirmChange: (pw: string) => void
  disabled?: boolean
}

export function PasswordPanel({
  password,
  onPasswordChange,
  confirmPassword,
  onConfirmChange,
  disabled = false,
}: PasswordPanelProps) {
  const [show, setShow] = useState(false)
  const strength = passwordStrength(password)
  const mismatch = confirmPassword.length > 0 && password !== confirmPassword

  return (
    <div className="border border-zinc-800 light:border-zinc-200 bg-zinc-900 light:bg-white p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-mono uppercase tracking-wider text-zinc-400">
          // 加密密码设置
        </h3>
        <button
          type="button"
          onClick={() => setShow((s) => !s)}
          className="text-xs text-zinc-500 hover:text-zinc-200 light:hover:text-zinc-700 font-mono transition-fast"
          aria-label={show ? '隐藏密码' : '显示密码'}
        >
          {show ? '隐藏' : '显示'}
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <label className="block">
          <span className="text-xs font-mono text-zinc-500 block mb-1.5">密码</span>
          <input
            type={show ? 'text' : 'password'}
            value={password}
            onChange={(e) => onPasswordChange(e.target.value)}
            disabled={disabled}
            placeholder="至少 8 位，建议混合大小写与符号"
            autoComplete="new-password"
            className="w-full bg-zinc-950 light:bg-zinc-50 border border-zinc-800 light:border-zinc-300 px-4 py-2 text-sm font-mono focus:outline-none focus:border-zinc-500 transition-fast disabled:opacity-50"
          />
        </label>
        <label className="block">
          <span className="text-xs font-mono text-zinc-500 block mb-1.5">确认密码</span>
          <input
            type={show ? 'text' : 'password'}
            value={confirmPassword}
            onChange={(e) => onConfirmChange(e.target.value)}
            disabled={disabled}
            placeholder="再次输入以确认"
            autoComplete="new-password"
            className={`w-full bg-zinc-950 light:bg-zinc-50 border px-4 py-2 text-sm font-mono focus:outline-none transition-fast disabled:opacity-50 ${
              mismatch
                ? 'border-red-500/60 focus:border-red-400'
                : 'border-zinc-800 light:border-zinc-300 focus:border-zinc-500'
            }`}
          />
        </label>
      </div>

      <div className="flex items-center justify-between text-xs font-mono">
        <div className="flex items-center gap-2">
          <span className="text-zinc-500">强度</span>
          <div className="flex gap-0.5" aria-label={`密码强度：${STRENGTH_LABEL[strength]}`}>
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
            {STRENGTH_LABEL[strength]}
          </span>
        </div>
        {mismatch && <span className="text-red-400">两次输入不一致</span>}
        {!mismatch && password.length > 0 && confirmPassword.length > 0 && (
          <span className="text-emerald-400">密码已匹配</span>
        )}
      </div>

      <p className="text-[11px] text-zinc-600 light:text-zinc-500 leading-relaxed">
        加密采用 SealGo XChaCha20-Poly1305 + Argon2id（64MB 内存, 3 轮）。密码丢失无法恢复文件，请妥善保管。
        <button
          type="button"
          onClick={() => toast('SealGo 格式：SC01 魔数 + 100B 头 + stanza + 64KB 分块加密', 'info')}
          className="ml-1 underline underline-offset-2 hover:text-zinc-400 transition-fast"
        >
          了解格式
        </button>
      </p>
    </div>
  )
}
