// 面板级错误兜底卡片：把 pushError 收集到的严重错误以常驻卡片形式展示。
// 用户可复制诊断信息（含堆栈/分类/文件元数据）反馈给开发者，或关闭忽略。

import { useState } from 'react'
import { usePanelErrors } from './hooks/usePanelErrors'
import { dismissError, type PanelError } from '../lib/panel-error'
import { t } from '../lib/i18n'
import { useLocale } from './hooks/useLocale'

const KIND_COLOR: Record<PanelError['kind'], string> = {
  decrypt: 'border-red-500/40 bg-red-500/5 text-red-300 light:text-red-700',
  merge: 'border-amber-500/40 bg-amber-500/5 text-amber-300 light:text-amber-700',
  wasm: 'border-red-500/40 bg-red-500/5 text-red-300 light:text-red-700',
  split: 'border-amber-500/40 bg-amber-500/5 text-amber-300 light:text-amber-700',
  io: 'border-blue-500/40 bg-blue-500/5 text-blue-300 light:text-blue-700',
}

const KIND_LABEL_KEY: Record<PanelError['kind'], string> = {
  decrypt: 'error.kind.decrypt',
  merge: 'error.kind.merge',
  wasm: 'error.kind.wasm',
  split: 'error.kind.split',
  io: 'error.kind.io',
}

export function ErrorStack() {
  useLocale()
  const errors = usePanelErrors()
  if (errors.length === 0) return null
  return (
    <div className="fixed bottom-4 left-4 z-40 max-w-md space-y-2">
      {errors.map((e) => (
        <ErrorCard key={e.id} error={e} onDismiss={() => dismissError(e.id)} />
      ))}
    </div>
  )
}

function ErrorCard({ error, onDismiss }: { error: PanelError; onDismiss: () => void }) {
  const [copied, setCopied] = useState(false)
  const color = KIND_COLOR[error.kind]
  const kindLabel = t(KIND_LABEL_KEY[error.kind])

  const copyDiagnostics = async () => {
    const text = [
      `[${kindLabel}] ${error.title}`,
      `Message: ${error.message}`,
      error.fileName ? `File: ${error.fileName}` : '',
      error.diagnostics ? `\nDiagnostics:\n${error.diagnostics}` : '',
      `Timestamp: ${new Date(error.timestamp).toISOString()}`,
    ]
      .filter(Boolean)
      .join('\n')
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // clipboard 失败：忽略（可能权限问题）
    }
  }

  return (
    <div className={`border p-3 space-y-2 font-mono text-xs ${color} card-enter`} role="alert">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="font-bold">
            [{kindLabel}] {error.title}
          </div>
          <div className="mt-1 opacity-90 break-words">{error.message}</div>
          {error.hint && (
            <div className="mt-1 opacity-70 italic break-words">{error.hint}</div>
          )}
          {error.fileName && (
            <div className="mt-1 opacity-60 break-words">file: {error.fileName}</div>
          )}
        </div>
        <button
          onClick={onDismiss}
          className="shrink-0 px-2 py-1 hover:opacity-70 transition-fast"
          aria-label={t('error.dismiss')}
        >
          ✕
        </button>
      </div>
      {error.diagnostics && (
        <button
          onClick={copyDiagnostics}
          className="px-2 py-1 border border-current opacity-70 hover:opacity-100 transition-fast text-[10px]"
        >
          {copied ? t('error.copied') : t('error.copyDiagnostics')}
        </button>
      )}
    </div>
  )
}