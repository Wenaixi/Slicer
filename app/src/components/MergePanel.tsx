import { useState, useEffect, useMemo, useCallback } from 'react'
import { useAppState } from '../lib/store'
import { DropZone } from './DropZone'
import { PasswordPanel } from './PasswordPanel'
import { ProgressBar } from './ProgressBar'
import { toast } from '../lib/toast'
import { formatBytes, downloadBlob, nextFrame } from '../lib/utils'
import { groupMergeFiles, fileDedupKey, type MergeGroup } from '../lib/merge'
import {
  isSealGoFile,
  decryptChunkWithPassword,
} from '../lib/crypto'

export function MergePanel() {
  const { tab } = useAppState()
  const [files, setFiles] = useState<File[]>([])
  const [password, setPassword] = useState('')
  const [decrypting, setDecrypting] = useState(false)
  const [progress, setProgress] = useState(0)
  const [progressLabel, setProgressLabel] = useState('')

  useEffect(() => {
    // 切片合并面板每次进入时清空密码（防误复用到其他文件）
    if (tab === 'merge') {
      setPassword('')
    }
  }, [tab])

  const groups: MergeGroup[] = useMemo(() => groupMergeFiles(files), [files])

  // 全局拖拽：window drop 事件路由到合并 Tab
  const handleGlobalDrop = useCallback((incoming: File[]) => {
    if (incoming.length === 0) return
    const seen = new Set(files.map(fileDedupKey))
    let added = 0
    for (const f of incoming) {
      const key = fileDedupKey(f)
      if (!seen.has(key)) {
        seen.add(key)
        added++
      }
    }
    setFiles((prev) => {
      const next = [...prev]
      for (const f of incoming) {
        const key = fileDedupKey(f)
        if (!next.some((x) => fileDedupKey(x) === key)) next.push(f)
      }
      return next
    })
    if (added > 0) toast(`已追加 ${added} 个切片`, 'success')
  }, [files])

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ files: File[] }>).detail
      if (tab === 'merge' && detail?.files) handleGlobalDrop(detail.files)
    }
    window.addEventListener('slicer:global-drop', handler)
    return () => window.removeEventListener('slicer:global-drop', handler)
  }, [tab, handleGlobalDrop])

  if (tab !== 'merge') return null

  const addFiles = (incoming: File[]) => {
    if (incoming.length === 0) return
    setFiles((prev) => {
      const seen = new Set(prev.map(fileDedupKey))
      const next = [...prev]
      let added = 0
      for (const f of incoming) {
        const key = fileDedupKey(f)
        if (!seen.has(key)) {
          seen.add(key)
          next.push(f)
          added++
        }
      }
      if (added > 0) toast(`已追加 ${added} 个切片`, 'success')
      else toast('文件已在队列中（按名称+大小+时间去重）', 'info')
      return next
    })
  }

  const removeFile = (name: string) => {
    setFiles((prev) => prev.filter((f) => f.name !== name))
  }

  const clearAll = () => {
    setFiles([])
    setPassword('')
  }

  const removeGroup = (baseName: string) => {
    setFiles((prev) =>
      prev.filter((f) => {
        // 单个文件归组后判断 baseName 是否属于目标组
        const g = groupMergeFiles([f])
        return g.length === 0 || g[0].baseName !== baseName
      }),
    )
  }

  const executeMerge = async (group: MergeGroup) => {
    if (group.items.length === 0) return
    setDecrypting(true)
    setProgress(0)
    setProgressLabel(group.encrypted ? '解密中…' : '合并中…')

    try {
      if (!group.encrypted) {
        // 未加密：零拷贝 Blob 合并，秒级完成
        const merged = new Blob(
          group.items.map((it) => it.file),
          { type: 'application/octet-stream' },
        )
        setProgress(100)
        downloadBlob(merged, group.baseName)
        toast(`合并完成 · ${formatBytes(merged.size)}`, 'success')
        return
      }

      // 加密：逐切片解密 + 拼接。密码错误时任意切片抛错即中止。
      if (!password) {
        toast('请先输入密码', 'error')
        setDecrypting(false)
        return
      }
      if (password.length < 8) {
        toast('密码至少 8 位', 'error')
        setDecrypting(false)
        return
      }

      const chunks: BlobPart[] = []
      for (let i = 0; i < group.items.length; i++) {
        const item = group.items[i]
        setProgressLabel(`解密 ${i + 1}/${group.items.length}`)
        setProgress((i / group.items.length) * 90)
        const bytes = new Uint8Array(await item.file.arrayBuffer())
        if (!isSealGoFile(bytes)) {
          throw new Error(`${item.originalName} 不是合法的 SealGo 加密文件`)
        }
        const plain = await decryptChunkWithPassword(bytes, password)
        chunks.push(new Uint8Array(plain))
        await nextFrame()
      }
      const merged = new Blob(chunks, { type: 'application/octet-stream' })
      setProgress(100)
      downloadBlob(merged, group.baseName)
      toast(`解密并合并完成 · ${formatBytes(merged.size)}`, 'success')
    } catch (err) {
      const msg = err instanceof Error ? err.message : '合并失败'
      toast(msg, 'error')
    } finally {
      setDecrypting(false)
    }
  }

  const encryptedGroup = groups.find((g) => g.encrypted)

  return (
    <section className="space-y-6">
      <DropZone
        title="拖拽切片文件到此处"
        hint="支持分批多次追加；按文件名特征自动归组排序"
        onFiles={addFiles}
        multiple
      />

      {files.length > 0 && (
        <>
          <div className="border border-zinc-800 light:border-zinc-200 bg-zinc-900 light:bg-white p-4 flex flex-col sm:flex-row items-center justify-between gap-3 transition-fast">
            <div className="flex items-center gap-2 font-mono text-xs">
              <span className="w-2 h-2 bg-emerald-400 pulse-dot" />
              <span className="font-bold">已载入 {files.length} 个切片</span>
              <span className="text-zinc-500">· 可继续拖入更多</span>
            </div>
            <button
              onClick={clearAll}
              className="text-xs font-mono text-zinc-500 hover:text-zinc-200 light:hover:text-zinc-700 underline underline-offset-2 transition-fast"
            >
              清空
            </button>
          </div>

          {/* 密码框：仅当存在加密组时显示 */}
          {encryptedGroup && (
            <PasswordPanel
              password={password}
              onPasswordChange={setPassword}
              confirmPassword={password}
              onConfirmChange={() => {}}
              disabled={decrypting}
            />
          )}

          {/* 分组渲染 */}
          <div className="space-y-4">
            {groups.map((g) => (
              <GroupCard
                key={g.baseName + (g.encrypted ? '::enc' : '')}
                group={g}
                onExecute={() => executeMerge(g)}
                onRemoveGroup={() => removeGroup(g.baseName)}
                onRemoveItem={(name) => removeFile(name)}
                disabled={decrypting}
              />
            ))}
          </div>

          {decrypting && (
            <ProgressBar value={progress} label={progressLabel} detail={`${progress.toFixed(1)}%`} />
          )}
        </>
      )}
    </section>
  )
}

function GroupCard({
  group,
  onExecute,
  onRemoveGroup,
  onRemoveItem,
  disabled,
}: {
  group: MergeGroup
  onExecute: () => void
  onRemoveGroup: () => void
  onRemoveItem: (name: string) => void
  disabled: boolean
}) {
  const needsPassword = group.encrypted

  return (
    <div className="border border-zinc-800 light:border-zinc-200 bg-zinc-900 light:bg-white p-5 space-y-4 transition-fast">
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-3 border-b border-zinc-800 light:border-zinc-200 pb-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-bold font-mono text-sm truncate">{group.baseName}</h3>
            {!group.sequential && (
              <span className="px-2 py-0.5 bg-amber-500/10 text-amber-400 border border-amber-500/30 text-[10px] font-mono">
                非连续
              </span>
            )}
            {group.sequential && group.items.length > 1 && (
              <span className="px-2 py-0.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 text-[10px] font-mono">
                序号完整
              </span>
            )}
            {group.encrypted && (
              <span className="px-2 py-0.5 bg-blue-500/10 text-blue-400 border border-blue-500/30 text-[10px] font-mono">
                加密
              </span>
            )}
          </div>
          <p className="text-xs font-mono text-zinc-500 mt-1">
            {group.items.length} 个切片 · 合计 {formatBytes(group.totalSize)}
            {group.missing.length > 0 && ` · 缺失 #${group.missing.slice(0, 5).join(', #')}${group.missing.length > 5 ? '…' : ''}`}
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={onRemoveGroup}
            disabled={disabled}
            className="px-3 py-1.5 text-xs font-mono text-zinc-500 hover:text-zinc-200 light:hover:text-zinc-800 border border-zinc-800 light:border-zinc-300 transition-fast pressable disabled:opacity-50"
          >
            移除该组
          </button>
          <button
            onClick={onExecute}
            disabled={disabled || group.items.length === 0}
            className={`px-5 py-2 text-xs font-mono font-bold transition-fast pressable ${
              disabled || group.items.length === 0
                ? 'bg-zinc-800 text-zinc-500 cursor-not-allowed'
                : 'bg-zinc-100 text-zinc-950 light:bg-zinc-900 light:text-zinc-50'
            }`}
          >
            {needsPassword ? '解密并合并下载' : '合并并下载'}
          </button>
        </div>
      </div>

      <div className="max-h-48 overflow-y-auto pr-1 space-y-1">
        {group.items.map((it, idx) => (
          <div
            key={it.file.name + idx}
            className="flex items-center justify-between px-3 py-2 border border-zinc-800 light:border-zinc-200 bg-zinc-950 light:bg-zinc-50 text-xs font-mono"
          >
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-zinc-500 shrink-0">#{idx + 1}</span>
              <span className="truncate">{it.originalName}</span>
              <span className="text-zinc-500 shrink-0">({formatBytes(it.file.size)})</span>
            </div>
            <button
              onClick={() => onRemoveItem(it.originalName)}
              disabled={disabled}
              className="text-zinc-500 hover:text-zinc-200 light:hover:text-zinc-700 font-bold px-2 transition-fast disabled:opacity-50"
              aria-label={`移除 ${it.originalName}`}
            >
              ✕
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
