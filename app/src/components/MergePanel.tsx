import { useState, useEffect, useMemo, useCallback } from 'react'
import { useAppState } from '../lib/store'
import { DropZone } from './DropZone'
import { PasswordPanel } from './PasswordPanel'
import { ProgressBar } from './ProgressBar'
import { toast } from '../lib/toast'
import { formatBytes, downloadBlob } from '../lib/utils'
import { groupMergeFiles, fileDedupKey, type MergeGroup } from '../lib/merge'
import { pickSaveLocation, pickFolderAndCreateFile, supportsDirectorySave, supportsFsAccess } from '../lib/fs-access'
import { streamMerge, StreamMergeError } from '../lib/stream-merge'
import { kindLabel } from '../lib/decrypt-error'
import { detectArchiveKind, unzipAll, filterChunkEntries } from '../lib/archive'
import { useVirtualWindow } from '../lib/virtualize'

/** webkit 文件夹拖入：把目录里的所有文件递归拉平成 File[]。非 WebKit 静默返回 [f]。 */
async function flattenIfDirectory(file: File): Promise<File[]> {
  const w = file as File & { webkitGetAsEntry?: () => FileSystemEntry | null }
  if (typeof w.webkitGetAsEntry !== 'function') return [file]
  const entry = w.webkitGetAsEntry()
  if (!entry) return [file]
  if (!entry.isDirectory) return [file]
  const out: File[] = []
  // readEntries 是批量的，需要循环直到返回空
  const readAll = (r: FileSystemDirectoryReader): Promise<FileSystemEntry[]> =>
    new Promise((resolve) => {
      const acc: FileSystemEntry[] = []
      const pump = () => {
        r.readEntries((batch) => {
          if (batch.length === 0) resolve(acc)
          else {
            acc.push(...batch)
            pump()
          }
        }, () => resolve(acc))
      }
      pump()
    })
  const walk = async (e: FileSystemEntry, prefix: string): Promise<void> => {
    if (e.isFile) {
      const f = await new Promise<File>((resolve, reject) =>
        (e as FileSystemFileEntry).file(resolve, reject),
      )
      // 把原始相对路径拼进 name，保留命名信息
      const renamed = new File([f], prefix + f.name, { type: f.type })
      out.push(renamed)
    } else if (e.isDirectory) {
      const children = await readAll((e as FileSystemDirectoryEntry).createReader())
      for (const c of children) await walk(c, prefix + e.name + '/')
    }
  }
  const entries = await readAll((entry as FileSystemDirectoryEntry).createReader())
  for (const e of entries) await walk(e, '')
  return out
}

/**
 * 把入站文件列表展开：
 *  - .zip → 自动解压并把其中的切片文件加进队列
 *  - .7z  → 提示暂不支持
 *  - 普通文件 → 直接去重加入
 * 返回成功追加的文件数量
 */
async function expandIncoming(
  incoming: File[],
  setFiles: React.Dispatch<React.SetStateAction<File[]>>,
): Promise<number> {
  let added = 0
  const direct: File[] = []
  // 先把可能的目录条目展平
  const flat: File[] = []
  for (const f of incoming) flat.push(...(await flattenIfDirectory(f)))
  for (const f of flat) {
    const lower = f.name.toLowerCase()
    if (lower.endsWith('.zip') || lower.endsWith('.7z')) {
      // 读前 4 字节做魔数识别（避免误判）
      try {
        const head = new Uint8Array(await f.slice(0, 6).arrayBuffer())
        const kind = detectArchiveKind(head)
        if (kind === '7z') {
          toast(`「${f.name}」是 7z 格式，暂不支持，请改用 ZIP 重新打包`, 'error')
          continue
        }
        if (kind === 'zip') {
          const entries = await unzipAll(f)
          const chunks = filterChunkEntries(entries)
          if (chunks.length === 0) {
            toast(`「${f.name}」里没有识别到切片文件`, 'info')
            continue
          }
          // 保留 ZIP 内完整相对路径作为 name，让 groupMergeFiles 按目录前缀（= 原压缩包/文件夹）分组
          // 这样多个 ZIP 同时拖入时，同 baseName 的切片会跨 ZIP 合并进同一组
          const newFiles: File[] = chunks.map((c) => {
            // 把 ZIP 内的相对路径中的目录分隔符替换成 .，并前缀 ZIP 文件基名
            // 例如: archive.zip 里的 sub/a.part1 → archive.sub/a.part1（保留路径信息且不冲突）
            const flatName = c.name.replace(/\//g, '.')
            const file = new File([c.data.buffer as ArrayBuffer], flatName, {
              type: 'application/octet-stream',
            })
            return file
          })
          setFiles((prev) => {
            const seen = new Set(prev.map(fileDedupKey))
            const next = [...prev]
            for (const nf of newFiles) {
              const key = fileDedupKey(nf)
              if (!seen.has(key)) {
                seen.add(key)
                next.push(nf)
                added++
              }
            }
            return next
          })
          toast(`已从「${f.name}」解压 ${chunks.length} 个切片`, 'info')
          continue
        }
        // unknown：当作普通文件
        direct.push(f)
      } catch (err) {
        toast(
          `「${f.name}」处理失败：${err instanceof Error ? err.message : '未知错误'}`,
          'error',
        )
      }
    } else {
      direct.push(f)
    }
  }
  if (direct.length > 0) {
    setFiles((prev) => {
      const seen = new Set(prev.map(fileDedupKey))
      const next = [...prev]
      for (const f of direct) {
        const key = fileDedupKey(f)
        if (!seen.has(key)) {
          seen.add(key)
          next.push(f)
          added++
        }
      }
      return next
    })
  }
  return added
}

export function MergePanel() {
  const { tab } = useAppState()
  const [files, setFiles] = useState<File[]>([])
  const [password, setPassword] = useState('')
  const [decrypting, setDecrypting] = useState(false)
  const [progress, setProgress] = useState(0)
  const [progressLabel, setProgressLabel] = useState('')
  const [extracting, setExtracting] = useState(false)

  useEffect(() => {
    // 切片合并面板每次进入时清空密码（防误复用到其他文件）
    if (tab === 'merge') {
      setPassword('')
    }
  }, [tab])

  const groups: MergeGroup[] = useMemo(() => groupMergeFiles(files), [files])

  // 全局拖拽：window drop 事件路由到合并 Tab，自动展开 ZIP / 文件夹
  const handleGlobalDrop = useCallback(async (incoming: File[]) => {
    if (incoming.length === 0) return
    const expanded = await expandIncoming(incoming, setFiles)
    if (expanded > 0) toast(`已识别并追加 ${expanded} 个切片`, 'success')
  }, [])

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ files: File[] }>).detail
      if (tab === 'merge' && detail?.files) {
        setExtracting(true)
        handleGlobalDrop(detail.files).finally(() => setExtracting(false))
      }
    }
    window.addEventListener('slicer:global-drop', handler)
    return () => window.removeEventListener('slicer:global-drop', handler)
  }, [tab, handleGlobalDrop])

  if (tab !== 'merge') return null

  const addFiles = async (incoming: File[]) => {
    if (incoming.length === 0) return
    const added = await expandIncoming(incoming, setFiles)
    if (added === 0) toast('文件已在队列中（按名称+大小+时间去重）', 'info')
    else toast(`已识别并追加 ${added} 个切片`, 'success')
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

  const executeMerge = async (group: MergeGroup, mode: 'download' | 'saveFile' | 'saveToFolder') => {
    if (group.items.length === 0) return
    setDecrypting(true)
    setProgress(0)
    setProgressLabel(group.encrypted ? '解密中…' : '合并中…')

    let folderHandle: { write: (d: Blob | ArrayBuffer) => Promise<void>; close: () => Promise<void>; name: string; fullPath: string } | null = null
    if (mode === 'saveToFolder') {
      folderHandle = await pickFolderAndCreateFile(group.baseName)
      if (!folderHandle) {
        toast('当前浏览器不支持文件夹直写，已降级为保存文件', 'info')
      }
    }
    const useStreamingFolder = !!folderHandle
    // 选择了 saveFile 但浏览器支持 showSaveFilePicker 也走流式（直接写到目标文件）
    const useStreamingFile = mode === 'saveFile' || useStreamingFolder

    let fileHandle: { write: (d: Blob | ArrayBuffer) => Promise<void>; close: () => Promise<void>; name: string } | null = null
    if (mode === 'saveFile' && !useStreamingFolder) {
      fileHandle = await pickSaveLocation(group.baseName)
      if (!fileHandle) {
        // 不支持 pickSaveLocation，降级为内存下载
        toast('当前浏览器不支持保存到文件，已改为直接下载', 'info')
      }
    }
    const useDirectFile = !!fileHandle

    // 密码前置校验
    if (group.encrypted) {
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
    }

    const abortRef = { current: false }

    try {
      // 内存累积场景（不支持 FS Access 的浏览器走 download 模式）
      const memoryChunks: Blob[] = []
      let memoryBytes = 0

      const summary = await streamMerge(
        group.items.map((it) => ({ file: it.file, originalName: it.originalName })),
        {
          encrypted: group.encrypted,
          password,
          bytesTotal: group.totalSize,
        },
        {
          shouldAbort: () => abortRef.current,
          onPlainChunk: ({ index, blob }) => {
            // 优先级：folderHandle > fileHandle > 内存累积
            if (folderHandle) {
              void (async () => {
                try {
                  await folderHandle!.write(blob)
                } catch (err) {
                  console.error('写文件夹失败:', err)
                }
              })()
            } else if (fileHandle) {
              void (async () => {
                try {
                  await fileHandle!.write(blob)
                } catch (err) {
                  console.error('写文件失败:', err)
                }
              })()
            } else {
              memoryChunks.push(blob)
              memoryBytes += blob.size
            }
            void index
          },
          onProgress: ({ index, total, bytesDone, bytesTotal }) => {
            setProgressLabel(
              group.encrypted ? `解密 ${index}/${total}` : `合并 ${index}/${total}`,
            )
            setProgress(bytesTotal > 0 ? (bytesDone / bytesTotal) * 95 : (index / total) * 95)
          },
        },
      )

      // 等待所有 fire-and-forget 写盘完成，再关闭句柄
      if (folderHandle) {
        await folderHandle.close()
        setProgress(100)
        toast(
          `已逐块写入 ${folderHandle.fullPath} · ${formatBytes(summary.totalOutSize)}（流式，内存峰值 ≈ 单切片大小）`,
          'success',
        )
        return
      }
      if (fileHandle) {
        await fileHandle.close()
        setProgress(100)
        toast(`已逐块写入 ${fileHandle.name} · ${formatBytes(summary.totalOutSize)}`, 'success')
        return
      }

      // 内存模式：聚合下载
      const merged = new Blob(memoryChunks, { type: 'application/octet-stream' })
      memoryChunks.length = 0
      setProgress(100)
      downloadBlob(merged, group.baseName)
      toast(
        group.encrypted
          ? `解密并合并完成 · ${formatBytes(memoryBytes)}`
          : `合并完成 · ${formatBytes(memoryBytes)}`,
        'success',
      )
      void memoryBytes
      void useStreamingFile
      void useDirectFile
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        toast('已取消', 'info')
        return
      }
      // 解密错误分类提示：「密码错误 vs 文件损坏」
      if (err instanceof StreamMergeError) {
        const { classified, originalName } = err
        const label = kindLabel(classified.kind)
        // 用两条 toast：第一条强调类型，第二条给建议
        toast(`[${label}] ${originalName}: ${classified.message}`, 'error', 4500)
        if (classified.hint) {
          toast(classified.hint, 'info', 6000)
        }
        return
      }
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
        hint="支持分批多次追加；支持直接拖入 ZIP 压缩包（自动解压并识别切片）；支持多个 ZIP；7z 暂不支持请改用 ZIP"
        onFiles={addFiles}
        multiple
      />

      {extracting && (
        <div className="border border-blue-500/30 bg-blue-500/5 light:bg-blue-50 p-3 text-xs font-mono text-blue-400 light:text-blue-700 flex items-center gap-2">
          <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path d="M21 12a9 9 0 1 1-6.219-8.56" />
          </svg>
          正在解压 ZIP / 识别切片…
        </div>
      )}

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
              decryptMode
            />
          )}

          {/* 分组渲染 */}
          <div className="space-y-4">
            {groups.map((g, i) => (
              <div
                key={g.baseName + (g.encrypted ? '::enc' : '')}
                className="card-enter"
                style={{ animationDelay: `${Math.min(i * 40, 160)}ms` }}
              >
                <GroupCard
                  group={g}
                  onExecute={() => executeMerge(g, 'download')}
                  onSaveToFile={supportsFsAccess() ? () => executeMerge(g, 'saveFile') : undefined}
                  onSaveToFolder={supportsDirectorySave() ? () => executeMerge(g, 'saveToFolder') : undefined}
                  onRemoveGroup={() => removeGroup(g.baseName)}
                  onRemoveItem={(name) => removeFile(name)}
                  disabled={decrypting}
                />
              </div>
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
  onSaveToFile,
  onSaveToFolder,
  onRemoveGroup,
  onRemoveItem,
  disabled,
}: {
  group: MergeGroup
  onExecute: () => void
  onSaveToFile?: () => void
  onSaveToFolder?: () => void
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

        <div className="flex items-center gap-2 shrink-0 flex-wrap">
          <button
            onClick={onRemoveGroup}
            disabled={disabled}
            className="px-3 py-1.5 text-xs font-mono text-zinc-500 hover:text-zinc-200 light:hover:text-zinc-800 border border-zinc-800 light:border-zinc-300 transition-fast pressable disabled:opacity-50"
          >
            移除该组
          </button>
          {onSaveToFolder && (
            <button
              onClick={onSaveToFolder}
              disabled={disabled || group.items.length === 0}
              className={`px-3 py-1.5 text-xs font-mono border border-zinc-700 light:border-zinc-400 transition-fast pressable ${
                disabled || group.items.length === 0
                  ? 'text-zinc-500 cursor-not-allowed'
                  : 'text-zinc-200 light:text-zinc-700 hover:border-zinc-500'
              }`}
              title="流式写入用户选择的文件夹，内存峰值 ≈ 单切片大小（最适合加密大文件）"
            >
              保存到文件夹…
            </button>
          )}
          {onSaveToFile && (
            <button
              onClick={onSaveToFile}
              disabled={disabled || group.items.length === 0}
              className={`px-3 py-1.5 text-xs font-mono border border-zinc-700 light:border-zinc-400 transition-fast pressable ${
                disabled || group.items.length === 0
                  ? 'text-zinc-500 cursor-not-allowed'
                  : 'text-zinc-200 light:text-zinc-700 hover:border-zinc-500'
              }`}
              title="直接写入文件系统（需浏览器授权）"
            >
              保存到文件…
            </button>
          )}
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
        <GroupItemList group={group} disabled={disabled} onRemoveItem={onRemoveItem} />
      </div>
    </div>
  )
}

/** 组内切片列表：超过 30 行启用虚拟滚动（覆盖 500+ 切片组场景） */
function GroupItemList({
  group,
  disabled,
  onRemoveItem,
}: {
  group: MergeGroup
  disabled: boolean
  onRemoveItem: (name: string) => void
}) {
  const useVirtual = group.items.length > 30
  const virtual = useVirtualWindow(group.items, {
    rowHeight: 36,
    overscan: 6,
    viewportHeight: 192,
  })

  if (!useVirtual) {
    return (
      <>
        {group.items.map((it, idx) => (
          <GroupItemRow
            key={it.file.name + idx}
            item={it}
            idx={idx}
            disabled={disabled}
            onRemove={() => onRemoveItem(it.originalName)}
          />
        ))}
      </>
    )
  }
  return (
    <div
      ref={virtual.containerRef}
      className="max-h-48 overflow-y-auto space-y-0"
      style={{ contain: 'strict' }}
    >
      <div style={{ height: virtual.paddingTop }} />
      <div className="space-y-1">
        {virtual.items.map((it, i) => {
          const realIdx = virtual.startIndex + i
          return (
            <GroupItemRow
              key={it.file.name + realIdx}
              item={it}
              idx={realIdx}
              disabled={disabled}
              onRemove={() => onRemoveItem(it.originalName)}
            />
          )
        })}
      </div>
      <div style={{ height: virtual.paddingBottom }} />
    </div>
  )
}

function GroupItemRow({
  item,
  idx,
  disabled,
  onRemove,
}: {
  item: { file: File; originalName: string }
  idx: number
  disabled: boolean
  onRemove: () => void
}) {
  return (
    <div className="flex items-center justify-between px-3 py-2 border border-zinc-800 light:border-zinc-200 bg-zinc-950 light:bg-zinc-50 text-xs font-mono">
      <div className="flex items-center gap-2 min-w-0">
        <span className="text-zinc-500 shrink-0">#{idx + 1}</span>
        <span className="truncate">{item.originalName}</span>
        <span className="text-zinc-500 shrink-0">({formatBytes(item.file.size)})</span>
      </div>
      <button
        onClick={onRemove}
        disabled={disabled}
        className="text-zinc-500 hover:text-zinc-200 light:hover:text-zinc-700 font-bold px-2 transition-fast disabled:opacity-50"
        aria-label={`移除 ${item.originalName}`}
      >
        ✕
      </button>
    </div>
  )
}
