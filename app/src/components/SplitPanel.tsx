import { useState, useRef, useEffect, useCallback } from 'react'
import { useAppState } from '../lib/store'
import { DropZone } from './DropZone'
import { FileCard } from './FileCard'
import { PasswordPanel } from './PasswordPanel'
import { ProgressBar } from './ProgressBar'
import { toast } from '../lib/toast'
import { formatBytes, downloadBlob } from '../lib/utils'
import { estimateEncryptSeconds, formatEstimateSeconds } from '../lib/perf'
import { streamSplit, estimateEncryptedSize } from '../lib/stream-split'
import { DEFAULT_SPLIT_OPTIONS, computeChunkPlan, type SplitOptions } from '../lib/split'
import { packAsZip, suggestedZipName } from '../lib/archive'
import {
  probeResumePlan,
  saveProgress,
  loadProgress,
  clearProgress,
  type SplitProgress,
} from '../lib/resume'
import { broadcastProgress, subscribeProgress, type CrossTabProgressEvent } from '../lib/cross-tab'
import { createMeter, recordChunk, estimateEtaSeconds, type ProgressMeter } from '../lib/progress-meter'
import { useVirtualWindow } from '../lib/virtualize'
import { useLocale, t } from '../lib/i18n'

interface ChunkResult {
  name: string
  blob: Blob
  size: number
  index: number
  encrypted: boolean
}

/**
 * 序列化"会改变切片生成方案"的 options 字段（剥离 password）。
 * 用作 useEffect 依赖等价键：只有 key 变化时才重新检查 saved progress。
 */
function optionsKey(opts: SplitOptions): string {
  return `${opts.mode}|${opts.sizeValue}|${opts.sizeUnit}|${opts.countValue}|${opts.naming}|${opts.encrypt}`
}

/**
 * 合并本轮新生成的 results 与磁盘上已存在的切片（续传场景）。
 * 续传模式下，results 只含本轮新产生的切片；被跳过的切片只在 dirHandle 里。
 * 按 name 去重，按 index 升序排，保证 bundle/zip/download 完整且按序。
 */
async function collectAllChunks(
  results: ChunkResult[],
  dirHandle: FileSystemDirectoryHandle | null,
  resumeMode: boolean,
): Promise<ChunkResult[]> {
  if (!resumeMode || !dirHandle) return results
  // results 已有切片按 name → result 索引
  const byName = new Map<string, ChunkResult>()
  for (const r of results) byName.set(r.name, r)
  // 从磁盘补齐被跳过的切片
  try {
    for await (const [name] of (dirHandle as unknown as {
      entries: () => AsyncIterable<[string, unknown]>
    }).entries()) {
      if (byName.has(name)) continue
      const handle = await (dirHandle as unknown as {
        getFileHandle: (n: string, opts?: { create?: boolean }) => Promise<FileSystemFileHandle>
      }).getFileHandle(name)
      const file = await (handle as unknown as { getFile: () => Promise<File> }).getFile()
      if (file.size <= 0) continue
      // 解析 index 用于排序
      const idxMatch = name.match(/part(\d+)|.(\d{3,4})(?:\.sc)?$/)
      const idx = idxMatch ? parseInt(idxMatch[1] || idxMatch[2], 10) : 0
      byName.set(name, {
        name,
        blob: file,
        size: file.size,
        index: Number.isFinite(idx) ? idx : 0,
        encrypted: name.endsWith('.sc'),
      })
    }
  } catch {
    // 读磁盘失败时降级为只导出本轮切片
    return results
  }
  return [...byName.values()].sort((a, b) => a.index - b.index)
}

export function SplitPanel() {
  const { tab } = useAppState()
  useLocale() // 订阅语言切换触发重渲染
  const [file, setFile] = useState<File | null>(null)
  const [options, setOptions] = useState<SplitOptions>(DEFAULT_SPLIT_OPTIONS)
  const [confirmPw, setConfirmPw] = useState('')
  const [processing, setProcessing] = useState(false)
  const [progress, setProgress] = useState(0)
  const [progressLabel, setProgressLabel] = useState('')
  const [results, setResults] = useState<ChunkResult[]>([])
  const [directToDisk, setDirectToDisk] = useState(false)
  const [resumeMode, setResumeMode] = useState(false)
  const [completedIndices, setCompletedIndices] = useState<Set<number>>(new Set())
  const [resumableSaved, setResumableSaved] = useState<SplitProgress | null>(null)
  const [crossTabEvent, setCrossTabEvent] = useState<CrossTabProgressEvent | null>(null)
  const [meter, setMeter] = useState<ProgressMeter | null>(null)
  const abortRef = useRef(false)
  // 直写磁盘的目录句柄：executeSplit 选完目录后保留，下载 manifest 时仍可读取
  const dirHandleRef = useRef<FileSystemDirectoryHandle | null>(null)

  // 重置进度与中止标记当文件或选项变化
  useEffect(() => {
    abortRef.current = false
  }, [file, options.encrypt])

  useEffect(() => {
    // 从 sessionStorage 拉取上次中断的进度
    // 依赖完整 options（除 password 外）—— 改命名规范/单位/计数/模式/加密开关都视为新方案，
    // 旧 progress 不可复用
    const saved = loadProgress()
    if (saved && saved.fileSize === file?.size && optionsKey(saved.options) === optionsKey(options)) {
      setResumableSaved(saved)
    } else {
      setResumableSaved(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file?.size, options.mode, options.sizeValue, options.sizeUnit, options.countValue, options.naming, options.encrypt])

  // 订阅其他 Tab 的分割进度（跨标签实时同步）
  useEffect(() => {
    const unsub = subscribeProgress((e) => {
      setCrossTabEvent(e)
      // 其他 Tab 完成/取消时清掉提示
      if (e.kind === 'split-done' || e.kind === 'split-abort') {
        // 事件已存进 state 即可，组件里再判断是否显示
      }
    })
    return unsub
  }, [])

  const resumeInterrupt = () => {
    if (!resumableSaved) return
    setCompletedIndices(new Set(resumableSaved.completedIndices))
    setResumeMode(true)
    setResumableSaved(null)
    toast(`${t('split.toast.resumeFound')} ${resumableSaved.completedIndices.length} ${t('split.toast.resumeSkip')}`, 'info')
  }

  const startFreshSplit = () => {
    clearProgress()
    setResumableSaved(null)
    setCompletedIndices(new Set())
    setResumeMode(false)
  }

  // 全局拖拽：window drop 事件路由到当前 Tab
  const handleGlobalDrop = useCallback((files: File[]) => {
    if (files.length === 0) return
    setFile(files[0])
    setResults([])
    toast(`${t('split.toast.loaded')} ${files[0].name}`, 'success')
  }, [])

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ files: File[] }>).detail
      if (tab === 'split' && detail?.files) handleGlobalDrop(detail.files)
    }
    window.addEventListener('slicer:global-drop', handler)
    return () => window.removeEventListener('slicer:global-drop', handler)
  }, [tab, handleGlobalDrop])

  if (tab !== 'split') return null

  const plan = file
    ? computeChunkPlan(file.size, options)
    : { chunkSize: 0, totalParts: 0 }

  const totalOutSizeApprox = options.encrypt && file
    ? estimateEncryptedSize(file.size, plan.chunkSize)
    : file?.size ?? 0

  const canExecute =
    !!file &&
    !processing &&
    (!options.encrypt || (options.password.length >= 8 && options.password === confirmPw))

  const handleFile = (files: File[]) => {
    if (files.length === 0) return
    setFile(files[0])
    setResults([])
    toast(`${t('split.toast.loaded')} ${files[0].name}`, 'success')
  }

  const reset = () => {
    setFile(null)
    setResults([])
    setOptions(DEFAULT_SPLIT_OPTIONS)
    setConfirmPw('')
    setProgress(0)
  }

  const executeSplit = async () => {
    if (!file || processing) return
    if (options.encrypt && (options.password.length < 8 || options.password !== confirmPw)) {
      toast(t('split.toast.confirmPassword'), 'error')
      return
    }

    // 直写磁盘 + 续传：用户先选目录
    let dirHandle: FileSystemDirectoryHandle | null = null
    const useDirectWrite = directToDisk || resumeMode
    if (useDirectWrite && typeof window !== 'undefined') {
      const picker = (window as Window & {
        showDirectoryPicker?: (opts?: { mode?: 'read' | 'readwrite' }) => Promise<FileSystemDirectoryHandle>
      }).showDirectoryPicker
      if (typeof picker === 'function') {
        try {
          dirHandle = await picker({ mode: 'readwrite' })
          dirHandleRef.current = dirHandle
        } catch (err) {
          if (err instanceof DOMException && err.name === 'AbortError') return
          throw err
        }
      } else {
        toast(t('split.toast.noDir'), 'info')
        if (directToDisk) setDirectToDisk(false)
        if (resumeMode) setResumeMode(false)
      }
    }

    // 续传：探测目录里已完成的切片
    let skipIndices: Set<number> | undefined
    if (dirHandle && resumeMode) {
      const resumePlan = await probeResumePlan(dirHandle, file.name, options, plan.totalParts)
      if (resumePlan.resumable) {
        skipIndices = new Set(resumePlan.completedIndices)
        toast(`${t('split.toast.resumeFound')} ${resumePlan.completedIndices.length} ${t('split.toast.resumeSkip')}`, 'info')
      } else {
        toast(t('split.toast.resumeNone'), 'info')
      }
    }

    setProcessing(true)
    setProgress(0)
    setResults([])
    abortRef.current = false

    const completedSet = new Set<number>(completedIndices)
    const startTime = Date.now()
    let lastSave = 0
    const totalParts = plan.totalParts
    let meterState = createMeter(file.size)
    setMeter(meterState)

    // 启动时把进度广播给其他 Tab
    broadcastProgress({
      kind: resumeMode ? 'split-resume' : 'split-start',
      fileName: file.name,
      fileSize: file.size,
      completedIndices: [...completedSet],
      totalParts,
      timestamp: Date.now(),
    })

    const chunks: ChunkResult[] = []
    // 直写磁盘的写盘 Promise 收集：streamSplit 完成后统一 await allSettled，
    // 让任意写盘错误都能被外层 catch 捕获（避免 onChunk 改 async 后仍吞错）
    const writePromises: Promise<void>[] = []
    try {
      const summary = await streamSplit(
        file,
        options,
        {
          shouldAbort: () => abortRef.current,
          onChunk: async (chunk) => {
            // 直写磁盘：把写盘 promise 收集起来，循环结束后统一等待
            if (dirHandle) {
              const p = (async () => {
                const handle = await (dirHandle as unknown as {
                  getFileHandle: (n: string, opts: { create: boolean }) => Promise<FileSystemFileHandle>
                }).getFileHandle(chunk.name, { create: true })
                const writable = await (handle as unknown as { createWritable: () => Promise<{ write: (b: Blob | ArrayBuffer) => Promise<void>; close: () => Promise<void> }> }).createWritable()
                await writable.write(chunk.blob)
                await writable.close()
              })()
              writePromises.push(p)
            }
            chunks.push({
              name: chunk.name,
              blob: chunk.blob,
              size: chunk.blob.size,
              index: chunk.index,
              encrypted: options.encrypt,
            })
            // 续传进度：每 4 切片持久化一次（避免 sessionStorage 抖动）
            completedSet.add(chunk.index)
            const now = Date.now()
            if (now - lastSave > 500) {
              saveProgress({
                fileName: file.name,
                fileSize: file.size,
                options,
                completedIndices: [...completedSet],
                startedAt: startTime,
                updatedAt: now,
              })
              // 同步广播到其他 Tab
              broadcastProgress({
                kind: 'split-progress',
                fileName: file.name,
                fileSize: file.size,
                completedIndices: [...completedSet],
                totalParts,
                timestamp: now,
              })
              lastSave = now
            }
          },
          onProgress: (p) => {
            setProgress((p.bytesDone / Math.max(1, p.bytesTotal)) * 100)
            setProgressLabel(
              p.phase === 'derive'
                ? t('split.phase.derive')
                : p.phase === 'encrypt'
                ? `${t('split.phase.encrypt')} ${p.index}/${p.total}`
                : p.phase === 'skip'
                ? `${t('split.phase.skip')} ${p.index}/${p.total}`
                : `${t('split.phase.slice')} ${p.index}/${p.total}`,
            )
            // 仪表采样（每切片一次）
            meterState = recordChunk(meterState, p.phase === 'skip' ? 0 : (p.bytesDone - meterState.bytesDone), { skipped: p.phase === 'skip' })
            setMeter(meterState)
          },
        },
        { skipIndices },
      )

      // 等待所有写盘操作完成（直写磁盘模式）：任一失败上抛给外层 catch
      const writeResults = await Promise.allSettled(writePromises)
      const writeFailures = writeResults.filter((r): r is PromiseRejectedResult => r.status === 'rejected')
      if (writeFailures.length > 0) {
        throw writeFailures[0].reason
      }

      if (abortRef.current) {
        // 中断：保留进度供下次续传
        saveProgress({
          fileName: file.name,
          fileSize: file.size,
          options,
          completedIndices: [...completedSet],
          startedAt: startTime,
          updatedAt: Date.now(),
        })
        broadcastProgress({
          kind: 'split-abort',
          fileName: file.name,
          fileSize: file.size,
          completedIndices: [...completedSet],
          totalParts,
          timestamp: Date.now(),
        })
        toast(`${t('split.toast.abortSave')} ${completedSet.size} ${t('split.toast.abortNext')}`, 'info')
        return
      }
      setResults(chunks)
      // 完成时清空进度
      clearProgress()
      setCompletedIndices(new Set())
      setResumeMode(false)
      broadcastProgress({
        kind: 'split-done',
        fileName: file.name,
        fileSize: file.size,
        completedIndices: [...completedSet],
        totalParts,
        timestamp: Date.now(),
      })
      toast(
        dirHandle
          ? `${t('split.toast.wroteDir')}${summary.totalParts}${summary.skippedParts ? `${t('split.toast.wroteDirSkip')} ${summary.skippedParts}` : ''})`
          : `${t('split.toast.splitDone')} ${summary.totalParts} ${t('split.preview.chunks')}${summary.encrypted ? t('split.toast.splitEncrypted') : ''}${summary.skippedParts ? `${t('split.toast.wroteDirSkip')} ${summary.skippedParts}` : ''}`,
        'success',
      )
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        saveProgress({
          fileName: file.name,
          fileSize: file.size,
          options,
          completedIndices: [...completedSet],
          startedAt: startTime,
          updatedAt: Date.now(),
        })
        toast(`${t('split.toast.abortSave')} ${completedSet.size} ${t('split.toast.abortNext')}`, 'info')
        return
      }
      console.error(err)
      toast(err instanceof Error ? err.message : '分割失败', 'error')
    } finally {
      setProcessing(false)
    }
  }

  // 打包下载：按顺序拼接所有切片 Blob（纯前端零依赖，适合切片数 < 500 场景）
  const downloadBundle = async () => {
    if (results.length === 0) return
    // 续传模式：从磁盘补齐被跳过的切片，保证 bundle 完整
    const full = await collectAllChunks(results, dirHandleRef.current, resumeMode)
    const bundle = new Blob(full.map((r) => r.blob), { type: 'application/octet-stream' })
    downloadBlob(bundle, `${file!.name}.sliced.bundle`)
    toast(`${t('split.toast.bundleDone')} ${full.length} ${t('split.preview.chunks')}${t('split.toast.bundleHint')}`, 'success')
  }

  /** 打包 ZIP 下载：把切片按命名规范塞进单一 ZIP，便于传输与归档 */
  const downloadZip = async () => {
    if (results.length === 0) return
    toast(t('split.toast.zipPacking'), 'info')
    // 续传模式：从磁盘补齐被跳过的切片，保证 ZIP 完整
    const full = await collectAllChunks(results, dirHandleRef.current, resumeMode)
    // 逐块读 arrayBuffer 避免 Blob → Uint8Array 类型转换问题
    const entries = await Promise.all(
      full.map(async (r) => ({
        name: r.name,
        data: new Uint8Array(await r.blob.arrayBuffer()),
        size: r.blob.size,
      })),
    )
    const zipped = packAsZip(entries)
    downloadBlob(zipped, suggestedZipName(file!.name))
    toast(`${t('split.toast.zipDone')}（${full.length} ${t('split.preview.chunks')}）`, 'success')
  }

  const downloadChunk = (idx: number) => {
    const target = results[idx]
    if (!target) return
    downloadBlob(target.blob, target.name)
  }

  const downloadAll = async () => {
    if (results.length === 0) return
    // 续传模式：先按 index 排序后逐个下载（磁盘已有的走 dirHandle，未跳过的走 results）
    const full = await collectAllChunks(results, dirHandleRef.current, resumeMode)
    full.forEach((r, i) => {
      setTimeout(() => downloadBlob(r.blob, r.name), i * 200)
    })
    toast(`${t('split.toast.downloadAll')} ${full.length} ${t('split.preview.chunks')}`, 'info')
  }

  const totalOutSize = results.reduce((a, b) => a + b.size, 0)

  return (
    <section className="space-y-6">
      {!file ? (
        <DropZone
          title={t('split.drop.title')}
          hint={t('split.drop.hint')}
          onFiles={handleFile}
        />
      ) : (
        <>
          {/* 跨标签进度共享提示：其他 Tab 正在分割同一文件 */}
          {crossTabEvent && crossTabEvent.fileSize === file.size && crossTabEvent.fileName === file.name && !processing && (
            <div className="border border-blue-500/30 bg-blue-500/5 light:bg-blue-50 p-3 text-xs font-mono text-blue-400 light:text-blue-700 flex items-center gap-2">
              <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8M21 3v5h-5" />
              </svg>
              <span>
                {t('split.crossTab.msg')} · {t('split.meter.handled')} {crossTabEvent.completedIndices.length}/{crossTabEvent.totalParts}
                {crossTabEvent.kind === 'split-done' && ` · ${t('split.crossTab.done')}`}
                {crossTabEvent.kind === 'split-abort' && ` · ${t('split.crossTab.abort')}`}
              </span>
            </div>
          )}

          {/* 续传恢复条 */}
          {resumableSaved && (
            <div className="border border-blue-500/30 bg-blue-500/5 light:bg-blue-50 p-3 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs font-mono">
              <div className="flex items-center gap-2 text-blue-400 light:text-blue-700">
                <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8M21 3v5h-5" />
                </svg>
                <span>
                  {t('split.resume.banner', { name: resumableSaved.fileName })}
                  · {t('split.resume.completed')} {resumableSaved.completedIndices.length} {t('split.resume.chunks')}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={resumeInterrupt}
                  className="px-3 py-1.5 bg-blue-500/20 text-blue-300 light:text-blue-800 border border-blue-500/40 hover:bg-blue-500/30 transition-fast pressable"
                >
                  {t('split.resume.btn')}
                </button>
                <button
                  onClick={startFreshSplit}
                  className="px-3 py-1.5 text-zinc-400 light:text-zinc-600 border border-zinc-800 light:border-zinc-300 hover:border-zinc-600 transition-fast pressable"
                >
                  {t('split.resume.fresh')}
                </button>
              </div>
            </div>
          )}

          {/* 内存警告 */}
          {file.size > 500 * 1024 * 1024 && !directToDisk && (
            <div className="border border-amber-500/30 bg-amber-500/5 light:bg-amber-50 p-3 text-xs font-mono text-amber-400 light:text-amber-700 flex items-start gap-2">
              <svg className="w-4 h-4 shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path d="M12 9v4M12 17h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              </svg>
              <div>
                <strong>{t('split.warnLarge.title')}</strong>：{t('split.warnLarge.body', { size: formatBytes(file.size), minMem: formatBytes(file.size * 1.5) })}
              </div>
            </div>
          )}

          <FileCard
            name={file.name}
            size={file.size}
            onRemove={reset}
          />

          {/* 分割参数 */}
          <div className="border border-zinc-800 light:border-zinc-200 bg-zinc-900 light:bg-white p-5 space-y-5">
            <h3 className="text-xs font-mono uppercase tracking-wider text-zinc-400">
              {t('split.params')}
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <ModeCard
                active={options.mode === 'size'}
                onClick={() => setOptions((o) => ({ ...o, mode: 'size' }))}
                title={t('split.mode.size')}
                desc={t('split.mode.size.desc')}
              />
              <ModeCard
                active={options.mode === 'count'}
                onClick={() => setOptions((o) => ({ ...o, mode: 'count' }))}
                title={t('split.mode.count')}
                desc={t('split.mode.count.desc')}
              />
            </div>

            {options.mode === 'size' ? (
              <div className="space-y-2">
                <label className="text-xs font-mono text-zinc-500 block">{t('split.size.label')}</label>
                <div className="flex gap-2">
                  <input
                    type="number"
                    min={0.01}
                    step="any"
                    value={options.sizeValue}
                    onChange={(e) =>
                      setOptions((o) => ({ ...o, sizeValue: parseFloat(e.target.value) || 1 }))
                    }
                    className="flex-1 bg-zinc-950 light:bg-zinc-50 border border-zinc-800 light:border-zinc-300 px-4 py-2 text-sm font-mono focus:outline-none focus:border-zinc-500 transition-fast"
                  />
                  <select
                    value={options.sizeUnit}
                    onChange={(e) =>
                      setOptions((o) => ({ ...o, sizeUnit: e.target.value as SplitOptions['sizeUnit'] }))
                    }
                    className="bg-zinc-950 light:bg-zinc-50 border border-zinc-800 light:border-zinc-300 px-3 py-2 text-sm font-mono focus:outline-none focus:border-zinc-500 transition-fast"
                  >
                    <option value="KB">KB</option>
                    <option value="MB">MB</option>
                    <option value="GB">GB</option>
                  </select>
                </div>
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {[
                    { v: 10, u: 'MB' as const, label: '10MB' },
                    { v: 25, u: 'MB' as const, label: '25MB' },
                    { v: 100, u: 'MB' as const, label: '100MB' },
                    { v: 1, u: 'GB' as const, label: '1GB' },
                  ].map((p) => (
                    <button
                      key={p.label}
                      onClick={() => setOptions((o) => ({ ...o, sizeValue: p.v, sizeUnit: p.u }))}
                      className="px-2.5 py-1 text-xs font-mono border border-zinc-800 light:border-zinc-300 text-zinc-400 hover:text-zinc-100 light:hover:text-zinc-800 hover:border-zinc-600 transition-fast pressable"
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <label className="text-xs font-mono text-zinc-500 block">{t('split.count.label')}</label>
                <input
                  type="number"
                  min={2}
                  max={999}
                  value={options.countValue}
                  onChange={(e) =>
                    setOptions((o) => ({ ...o, countValue: parseInt(e.target.value) || 2 }))
                  }
                  className="w-full bg-zinc-950 light:bg-zinc-50 border border-zinc-800 light:border-zinc-300 px-4 py-2 text-sm font-mono focus:outline-none focus:border-zinc-500 transition-fast"
                />
              </div>
            )}

            <div className="space-y-2">
              <label className="text-xs font-mono text-zinc-500 block">{t('split.naming.label')}</label>
              <select
                value={options.naming}
                onChange={(e) =>
                  setOptions((o) => ({ ...o, naming: e.target.value as SplitOptions['naming'] }))
                }
                className="w-full bg-zinc-950 light:bg-zinc-50 border border-zinc-800 light:border-zinc-300 px-4 py-2 text-sm font-mono focus:outline-none focus:border-zinc-500 transition-fast"
              >
                <option value="part">{t('split.naming.part')}</option>
                <option value="number">{t('split.naming.number')}</option>
                <option value="infix">{t('split.naming.infix')}</option>
              </select>
            </div>

            {/* 预览 */}
            <div className="border-t border-zinc-800 light:border-zinc-200 pt-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 font-mono text-xs">
              <span>
                {t('split.preview.parts')} <strong className="text-zinc-100 light:text-zinc-900">{plan.totalParts}</strong> {t('split.preview.chunks')}
              </span>
              <span>
                {t('split.preview.per')} <strong className="text-zinc-100 light:text-zinc-900">{formatBytes(plan.chunkSize)}</strong>
              </span>
              <span className="text-zinc-500">
                {t('split.preview.eta')} <strong className="text-zinc-300 light:text-zinc-700">{formatEstimateSeconds(estimateEncryptSeconds(file.size, options.encrypt))}</strong>
                {options.encrypt && t('split.preview.argon')}
              </span>
              {options.encrypt && (
                <span className="text-zinc-500">
                  {t('split.preview.encryptedTotal')} <strong className="text-zinc-300 light:text-zinc-700">{formatBytes(totalOutSizeApprox)}</strong>{t('split.preview.header')}
                </span>
              )}
            </div>
          </div>

          {/* 直写磁盘开关 */}
          <div className="space-y-2">
            <label className="flex items-center gap-3 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={directToDisk}
                onChange={(e) => setDirectToDisk(e.target.checked)}
                disabled={processing}
                className="w-4 h-4 accent-zinc-100"
              />
              <span className="text-sm font-semibold">{t('split.directToDisk')}</span>
            </label>
            <p className="text-xs font-mono text-zinc-500 pl-7">
              {t('split.directToDisk.hint')}
            </p>
          </div>

          {/* 加密选项 */}
          <div className="space-y-4">
            <label className="flex items-center gap-3 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={options.encrypt}
                onChange={(e) => setOptions((o) => ({ ...o, encrypt: e.target.checked }))}
                className="w-4 h-4 accent-zinc-100"
              />
              <span className="text-sm font-semibold">{t('split.encrypt')}</span>
            </label>
            {options.encrypt && (
              <PasswordPanel
                password={options.password}
                onPasswordChange={(pw) => setOptions((o) => ({ ...o, password: pw }))}
                confirmPassword={confirmPw}
                onConfirmChange={setConfirmPw}
                disabled={processing}
              />
            )}
          </div>

          {/* 执行按钮 */}
          <div className="space-y-3">
            <button
              onClick={executeSplit}
              disabled={!canExecute}
              className={`w-full py-3.5 font-bold text-sm transition-fast pressable flex items-center justify-center gap-2 ${
                canExecute
                  ? 'bg-zinc-100 text-zinc-950 hover:bg-white light:bg-zinc-900 light:text-zinc-50 light:hover:bg-zinc-800'
                  : 'bg-zinc-800 text-zinc-500 cursor-not-allowed'
              }`}
            >
              {processing ? t('split.execute.processing') : options.encrypt ? t('split.execute.splitEncrypt') : t('split.execute.split')}
            </button>
            {processing && (
              <button
                onClick={() => {
                  abortRef.current = true
                }}
                className="w-full py-2 text-xs font-mono text-zinc-400 hover:text-zinc-200 light:hover:text-zinc-700 border border-zinc-800 light:border-zinc-300 transition-fast pressable"
              >
                {t('split.execute.cancel')}
              </button>
            )}
          </div>

          {processing && (
            <>
              <ProgressBar value={progress} label={progressLabel} detail={`${progress.toFixed(1)}%`} />
              {meter && (
                <div className="border border-zinc-800 light:border-zinc-200 bg-zinc-900 light:bg-white p-3 grid grid-cols-2 md:grid-cols-4 gap-3 text-xs font-mono">
                  <div>
                    <div className="text-zinc-500">{t('split.meter.throughput')}</div>
                    <div className="text-zinc-100 light:text-zinc-900 font-bold">{meter.mbps.toFixed(1)} MB/s</div>
                  </div>
                  <div>
                    <div className="text-zinc-500">{t('split.meter.eta')}</div>
                    <div className="text-zinc-100 light:text-zinc-900 font-bold">
                      {(() => {
                        const eta = estimateEtaSeconds(meter)
                        if (eta === null) return t('split.meter.calculating')
                        if (eta < 60) return `${eta.toFixed(0)}s`
                        return `${Math.floor(eta / 60)}m ${Math.floor(eta % 60)}s`
                      })()}
                    </div>
                  </div>
                  <div>
                    <div className="text-zinc-500">{t('split.meter.handled')}</div>
                    <div className="text-zinc-100 light:text-zinc-900 font-bold">{meter.handledParts} / {plan.totalParts}</div>
                  </div>
                  <div>
                    <div className="text-zinc-500">{t('split.meter.skipped')}</div>
                    <div className="text-zinc-100 light:text-zinc-900 font-bold">{meter.skippedParts}</div>
                  </div>
                </div>
              )}
            </>
          )}

          {/* 结果 */}
          {results.length > 0 && !processing && (
            <VirtualizedResultList
              results={results}
              totalOutSize={totalOutSize}
              onDownloadZip={downloadZip}
              onDownloadBundle={downloadBundle}
              onDownloadAll={downloadAll}
              onDownloadChunk={downloadChunk}
            />
          )}
        </>
      )}
    </section>
  )
}

function ModeCard({
  active,
  onClick,
  title,
  desc,
}: {
  active: boolean
  onClick: () => void
  title: string
  desc: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-left p-4 border transition-fast pressable ${
        active
          ? 'border-zinc-400 light:border-zinc-600 bg-zinc-950 light:bg-zinc-50'
          : 'border-zinc-800 light:border-zinc-200 bg-zinc-900/40 light:bg-white hover:border-zinc-700'
      }`}
      aria-pressed={active}
    >
      <div className="flex items-center gap-2">
        <span
          className={`w-2 h-2 border ${
            active ? 'bg-zinc-100 light:bg-zinc-900 border-zinc-100 light:border-zinc-900' : 'border-zinc-600'
          }`}
        />
        <span className="text-sm font-bold">{title}</span>
      </div>
      <p className="text-xs text-zinc-500 mt-1">{desc}</p>
    </button>
  )
}

/** 结果列表虚拟化：超过阈值（80）时启用 useVirtualWindow 只渲染可视区；小列表直接渲染 */
function VirtualizedResultList({
  results,
  totalOutSize,
  onDownloadZip,
  onDownloadBundle,
  onDownloadAll,
  onDownloadChunk,
}: {
  results: ChunkResult[]
  totalOutSize: number
  onDownloadZip: () => void
  onDownloadBundle: () => void
  onDownloadAll: () => void
  onDownloadChunk: (idx: number) => void
}) {
  const useVirtual = results.length > 80
  const virtual = useVirtualWindow(results, {
    rowHeight: 44, // 大致行高
    overscan: 8,
    viewportHeight: 320,
  })

  return (
    <div className="border border-zinc-800 light:border-zinc-200 bg-zinc-900 light:bg-white p-5 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <h3 className="text-sm font-mono uppercase tracking-wider flex items-center gap-2">
          <span className="w-2 h-2 bg-emerald-400 pulse-dot" />
          {t('split.result.title')}（{t('split.result.total')} {results.length} {t('split.preview.chunks')}，{formatBytes(totalOutSize)}）
          {useVirtual && (
            <span className="text-[10px] text-zinc-500 font-normal">
              · {t('split.virtual')} {virtual.endIndex - virtual.startIndex + 1} {t('split.virtual.lines')}
            </span>
          )}
        </h3>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={onDownloadZip}
            className="px-3 py-1.5 text-xs font-mono border border-zinc-800 light:border-zinc-300 text-zinc-300 light:text-zinc-700 hover:border-zinc-600 transition-fast pressable"
            title="把所有切片打包成单个 ZIP 文件（合并端可直接拖入 ZIP 自动解压）"
          >
            {t('split.result.zip')}
          </button>
          <button
            onClick={onDownloadBundle}
            className="px-3 py-1.5 text-xs font-mono border border-zinc-800 light:border-zinc-300 text-zinc-300 light:text-zinc-700 hover:border-zinc-600 transition-fast pressable"
            title="按顺序拼接为单文件下载"
          >
            {t('split.result.bundle')}
          </button>
          <button
            onClick={onDownloadAll}
            className="px-4 py-1.5 text-xs font-mono font-bold bg-zinc-100 text-zinc-950 light:bg-zinc-900 light:text-zinc-50 pressable transition-fast"
          >
            {t('split.result.all')}
          </button>
        </div>
      </div>

      {useVirtual ? (
        <div
          ref={virtual.containerRef}
          className="h-80 overflow-y-auto space-y-0 pr-1"
          style={{ contain: 'strict' }}
        >
          <div style={{ height: virtual.paddingTop }} />
          <div className="space-y-1.5">
            {virtual.items.map((c, i) => {
              const realIdx = virtual.startIndex + i
              return (
                <ResultRow
                  key={c.name + realIdx}
                  chunk={c}
                  onDownload={() => onDownloadChunk(realIdx)}
                />
              )
            })}
          </div>
          <div style={{ height: virtual.paddingBottom }} />
        </div>
      ) : (
        <div className="max-h-80 overflow-y-auto space-y-1.5 pr-1">
          {results.map((c, i) => (
            <ResultRow
              key={c.name + i}
              chunk={c}
              onDownload={() => onDownloadChunk(i)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function ResultRow({
  chunk,
  onDownload,
}: {
  chunk: ChunkResult
  onDownload: () => void
}) {
  return (
    <div className="flex items-center justify-between px-3 py-2 border border-zinc-800 light:border-zinc-200 bg-zinc-950 light:bg-zinc-50 text-xs font-mono">
      <div className="flex items-center gap-2 min-w-0">
        <span className="px-1.5 py-0.5 bg-zinc-800 light:bg-zinc-200 text-zinc-400 text-[10px] shrink-0">
          #{chunk.index}
        </span>
        <span className="truncate">{chunk.name}</span>
        <span className="text-zinc-500 shrink-0">({formatBytes(chunk.size)})</span>
        {chunk.encrypted && (
          <span className="px-1.5 py-0.5 bg-amber-500/10 text-amber-400 border border-amber-500/20 text-[10px] shrink-0">
            加密
          </span>
        )}
      </div>
      <button
        onClick={onDownload}
        className="ml-2 px-3 py-1 border border-zinc-800 light:border-zinc-300 hover:border-zinc-600 text-zinc-300 light:text-zinc-700 transition-fast pressable shrink-0"
      >
        {t('split.result.download')}
      </button>
    </div>
  )
}
