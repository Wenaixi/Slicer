import { useState } from 'react'
import { toast } from '../lib/toast'
import { passwordStrength, STRENGTH_LABEL } from '../lib/utils'
import { generatePassword } from '../lib/password-gen'

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
  const strength = passwordStrength(password)
  const mismatch = !decryptMode && confirmPassword.length > 0 && password !== confirmPassword

  return (
    <div className="border border-zinc-800 light:border-zinc-200 bg-zinc-900 light:bg-white p-5 space-y-4 card-enter">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-mono uppercase tracking-wider text-zinc-400">
          {decryptMode ? '// 解密密码' : '// 加密密码设置'}
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
                toast('已生成强随机密码（仅保存在内存，请自行记录）', 'success')
              }}
              className="text-xs text-zinc-500 hover:text-zinc-200 light:hover:text-zinc-700 font-mono transition-fast underline underline-offset-2"
              aria-label="生成强随机密码"
            >
              生成强密码
            </button>
          )}
          <button
            type="button"
            onClick={() => setShow((s) => !s)}
            className="text-xs text-zinc-500 hover:text-zinc-200 light:hover:text-zinc-700 font-mono transition-fast"
            aria-label={show ? '隐藏密码' : '显示密码'}
          >
            {show ? '隐藏' : '显示'}
          </button>
        </div>
      </div>

      <div className={`grid gap-4 ${decryptMode ? 'grid-cols-1' : 'grid-cols-1 md:grid-cols-2'}`}>
        <label className="block">
          <span className="text-xs font-mono text-zinc-500 block mb-1.5">密码</span>
          <input
            type={show ? 'text' : 'password'}
            value={password}
            onChange={(e) => onPasswordChange(e.target.value)}
            disabled={disabled}
            placeholder={decryptMode ? '输入加密时设置的密码' : '至少 8 位，建议混合大小写与符号'}
            autoComplete={decryptMode ? 'current-password' : 'new-password'}
            className="w-full bg-zinc-950 light:bg-zinc-50 border border-zinc-800 light:border-zinc-300 px-4 py-2 text-sm font-mono focus:outline-none focus:border-zinc-500 transition-fast disabled:opacity-50"
          />
        </label>
        {!decryptMode && (
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
        )}
      </div>

      {!decryptMode && (
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
      )}

      <p className="text-[11px] text-zinc-600 light:text-zinc-500 leading-relaxed">
        {decryptMode
          ? '输入密码后将对每个 .sc 切片用 Argon2id 重新派生密钥并解密。密码错误会立即报错。'
          : '加密采用 SealGo XChaCha20-Poly1305 + Argon2id（64MB 内存, 3 轮）。密码丢失无法恢复文件，请妥善保管。'}
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
