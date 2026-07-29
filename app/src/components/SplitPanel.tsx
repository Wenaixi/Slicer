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

interface ChunkResult {
  name: string
  blob: Blob
  size: number
  index: number
  encrypted: boolean
}

export function SplitPanel() {
  const { tab } = useAppState()
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
  const abortRef = useRef(false)

  // 重置进度与中止标记当文件或选项变化
  useEffect(() => {
    abortRef.current = false
  }, [file, options.encrypt])

  useEffect(() => {
    // 从 sessionStorage 拉取上次中断的进度
    const saved = loadProgress()
    if (saved && saved.fileSize === file?.size && saved.options.sizeValue === options.sizeValue) {
      setResumableSaved(saved)
    } else {
      setResumableSaved(null)
    }
  }, [file?.size, options.sizeValue])

  const resumeInterrupt = () => {
    if (!resumableSaved) return
    setCompletedIndices(new Set(resumableSaved.completedIndices))
    setResumeMode(true)
    setResumableSaved(null)
    toast(`已恢复进度：续传 ${resumableSaved.completedIndices.length} 个已完成切片之后的余下部分`, 'info')
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
    toast(`已加载 ${files[0].name}`, 'success')
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
    toast(`已加载 ${files[0].name}`, 'success')
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
      toast('请确认密码：至少 8 位且两次输入一致', 'error')
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
        } catch (err) {
          if (err instanceof DOMException && err.name === 'AbortError') return
          throw err
        }
      } else {
        toast('当前浏览器不支持目录选择，已降级为内存模式', 'info')
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
        toast(`探测到 ${resumePlan.completedIndices.length} 个已完成切片，跳过续传`, 'info')
      } else {
        toast('未发现可续传切片，从头开始', 'info')
      }
    }

    setProcessing(true)
    setProgress(0)
    setResults([])
    abortRef.current = false

    const completedSet = new Set<number>(completedIndices)
    const startTime = Date.now()
    let lastSave = 0

    const chunks: ChunkResult[] = []
    try {
      const summary = await streamSplit(
        file,
        options,
        {
          shouldAbort: () => abortRef.current,
          onChunk: (chunk) => {
            // 直写磁盘：立即落盘，不驻留内存
            if (dirHandle) {
              void (async () => {
                try {
                  const handle = await (dirHandle as unknown as {
                    getFileHandle: (n: string, opts: { create: boolean }) => Promise<FileSystemFileHandle>
                  }).getFileHandle(chunk.name, { create: true })
                  const writable = await (handle as unknown as { createWritable: () => Promise<{ write: (b: Blob | ArrayBuffer) => Promise<void>; close: () => Promise<void> }> }).createWritable()
                  await writable.write(chunk.blob)
                  await writable.close()
                } catch (err) {
                  console.error('写磁盘失败:', err)
                }
              })()
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
              lastSave = now
            }
          },
          onProgress: (p) => {
            setProgress((p.bytesDone / Math.max(1, p.bytesTotal)) * 100)
            setProgressLabel(
              p.phase === 'derive'
                ? 'Argon2id 派生密钥…'
                : p.phase === 'encrypt'
                ? `加密切片 ${p.index}/${p.total}`
                : p.phase === 'skip'
                ? `跳过已完成 ${p.index}/${p.total}`
                : `切片 ${p.index}/${p.total}`,
            )
          },
        },
        { skipIndices },
      )

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
        toast(`已取消（已保存 ${completedSet.size} 个切片进度，下次可续传）`, 'info')
        return
      }
      setResults(chunks)
      // 完成时清空进度
      clearProgress()
      setCompletedIndices(new Set())
      setResumeMode(false)
      toast(
        dirHandle
          ? `已逐切片写入磁盘（${summary.totalParts} 个${summary.skippedParts ? `，跳过 ${summary.skippedParts} 个续传切片` : ''}）`
          : `已分割为 ${summary.totalParts} 个切片${summary.encrypted ? '（已加密）' : ''}${summary.skippedParts ? `（跳过 ${summary.skippedParts} 个续传切片）` : ''}`,
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
        toast(`已取消（已保存 ${completedSet.size} 个切片进度，下次可续传）`, 'info')
        return
      }
      console.error(err)
      toast(err instanceof Error ? err.message : '分割失败', 'error')
    } finally {
      setProcessing(false)
    }
  }

  // 打包下载：按顺序拼接所有切片 Blob（纯前端零依赖，适合切片数 < 500 场景）
  const downloadBundle = () => {
    if (results.length === 0) return
    const bundle = new Blob(results.map((r) => r.blob), { type: 'application/octet-stream' })
    downloadBlob(bundle, `${file!.name}.sliced.bundle`)
    toast(`已打包下载 ${results.length} 个切片（按顺序拼接，解压前请记录命名规范）`, 'success')
  }

  /** 打包 ZIP 下载：把切片按命名规范塞进单一 ZIP，便于传输与归档 */
  const downloadZip = async () => {
    if (results.length === 0) return
    toast('正在打包 ZIP…', 'info')
    // 逐块读 arrayBuffer 避免 Blob → Uint8Array 类型转换问题
    const entries = await Promise.all(
      results.map(async (r) => ({
        name: r.name,
        data: new Uint8Array(await r.blob.arrayBuffer()),
        size: r.blob.size,
      })),
    )
    const zipped = packAsZip(entries)
    downloadBlob(zipped, suggestedZipName(file!.name))
    toast(`已打包为 ZIP（${results.length} 个切片）`, 'success')
  }

  const downloadChunk = (idx: number) => {
    const target = results[idx]
    if (!target) return
    downloadBlob(target.blob, target.name)
  }

  const downloadAll = () => {
    results.forEach((_, i) => {
      setTimeout(() => downloadChunk(i), i * 200)
    })
    toast(`开始下载 ${results.length} 个切片`, 'info')
  }

  const totalOutSize = results.reduce((a, b) => a + b.size, 0)

  return (
    <section className="space-y-6">
      {!file ? (
        <DropZone
          title="拖拽单文件到此处"
          hint="支持任意格式：视频、镜像、文档包。纯本地处理，零上传。"
          onFiles={handleFile}
        />
      ) : (
        <>
          {/* 续传恢复条 */}
          {resumableSaved && (
            <div className="border border-blue-500/30 bg-blue-500/5 light:bg-blue-50 p-3 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs font-mono">
              <div className="flex items-center gap-2 text-blue-400 light:text-blue-700">
                <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8M21 3v5h-5" />
                </svg>
                <span>
                  检测到上次未完成的「{resumableSaved.fileName}」分割进度
                  · 已完成 {resumableSaved.completedIndices.length} 个切片
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={resumeInterrupt}
                  className="px-3 py-1.5 bg-blue-500/20 text-blue-300 light:text-blue-800 border border-blue-500/40 hover:bg-blue-500/30 transition-fast pressable"
                >
                  续传
                </button>
                <button
                  onClick={startFreshSplit}
                  className="px-3 py-1.5 text-zinc-400 light:text-zinc-600 border border-zinc-800 light:border-zinc-300 hover:border-zinc-600 transition-fast pressable"
                >
                  重新开始
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
                <strong>大文件提示</strong>：当前文件 {formatBytes(file.size)}。切片将全部驻留内存，建议确保可用内存 ≥ {formatBytes(file.size * 1.5)}。
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
              // 分割参数
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <ModeCard
                active={options.mode === 'size'}
                onClick={() => setOptions((o) => ({ ...o, mode: 'size' }))}
                title="按单文件大小"
                desc="指定每个切片的最大容量"
              />
              <ModeCard
                active={options.mode === 'count'}
                onClick={() => setOptions((o) => ({ ...o, mode: 'count' }))}
                title="按目标份数"
                desc="自动均分为固定数量"
              />
            </div>

            {options.mode === 'size' ? (
              <div className="space-y-2">
                <label className="text-xs font-mono text-zinc-500 block">单个切片大小</label>
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
                <label className="text-xs font-mono text-zinc-500 block">切片份数</label>
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
              <label className="text-xs font-mono text-zinc-500 block">命名规范</label>
              <select
                value={options.naming}
                onChange={(e) =>
                  setOptions((o) => ({ ...o, naming: e.target.value as SplitOptions['naming'] }))
                }
                className="w-full bg-zinc-950 light:bg-zinc-50 border border-zinc-800 light:border-zinc-300 px-4 py-2 text-sm font-mono focus:outline-none focus:border-zinc-500 transition-fast"
              >
                <option value="part">原文件名.ext.part1（通用标准）</option>
                <option value="number">原文件名.ext.001（分卷档案）</option>
                <option value="infix">原文件名_part1.ext（保留后缀）</option>
              </select>
            </div>

            {/* 预览 */}
            <div className="border-t border-zinc-800 light:border-zinc-200 pt-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 font-mono text-xs">
              <span>
                预计 <strong className="text-zinc-100 light:text-zinc-900">{plan.totalParts}</strong> 个切片
              </span>
              <span>
                单个约 <strong className="text-zinc-100 light:text-zinc-900">{formatBytes(plan.chunkSize)}</strong>
              </span>
              <span className="text-zinc-500">
                预计耗时 <strong className="text-zinc-300 light:text-zinc-700">{formatEstimateSeconds(estimateEncryptSeconds(file.size, options.encrypt))}</strong>
                {options.encrypt && '（含 Argon2 派生 ~1s）'}
              </span>
              {options.encrypt && (
                <span className="text-zinc-500">
                  加密后总大小 ≈ <strong className="text-zinc-300 light:text-zinc-700">{formatBytes(totalOutSizeApprox)}</strong>（含头部 + 标签）
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
              <span className="text-sm font-semibold">直写磁盘（流式下载，低内存占用）</span>
            </label>
            <p className="text-xs font-mono text-zinc-500 pl-7">
              通过 File System Access API 选择一个文件夹，切片将立即落盘不驻留浏览器内存，适合超大文件。中断后下次打开同一文件可选择「续传」跳过已完成切片。
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
              <span className="text-sm font-semibold">启用 SealGo 加密（需要密码）</span>
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
              {processing ? '处理中…' : options.encrypt ? '加密并分割' : '立即分割'}
            </button>
            {processing && (
              <button
                onClick={() => {
                  abortRef.current = true
                }}
                className="w-full py-2 text-xs font-mono text-zinc-400 hover:text-zinc-200 light:hover:text-zinc-700 border border-zinc-800 light:border-zinc-300 transition-fast pressable"
              >
                取消任务
              </button>
            )}
          </div>

          {processing && (
            <ProgressBar value={progress} label={progressLabel} detail={`${progress.toFixed(1)}%`} />
          )}

          {/* 结果 */}
          {results.length > 0 && !processing && (
            <div className="border border-zinc-800 light:border-zinc-200 bg-zinc-900 light:bg-white p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-mono uppercase tracking-wider flex items-center gap-2">
                  <span className="w-2 h-2 bg-emerald-400 pulse-dot" />
                  分割完成（共 {results.length} 个，{formatBytes(totalOutSize)}）
                </h3>
                <div className="flex items-center gap-2">
                  <button
                    onClick={downloadZip}
                    className="px-3 py-1.5 text-xs font-mono border border-zinc-800 light:border-zinc-300 text-zinc-300 light:text-zinc-700 hover:border-zinc-600 transition-fast pressable"
                    title="把所有切片打包成单个 ZIP 文件（合并端可直接拖入 ZIP 自动解压）"
                  >
                    打包 ZIP
                  </button>
                  <button
                    onClick={downloadBundle}
                    className="px-3 py-1.5 text-xs font-mono border border-zinc-800 light:border-zinc-300 text-zinc-300 light:text-zinc-700 hover:border-zinc-600 transition-fast pressable"
                    title="按顺序拼接为单文件下载"
                  >
                    打包下载
                  </button>
                  <button
                    onClick={downloadAll}
                    className="px-4 py-1.5 text-xs font-mono font-bold bg-zinc-100 text-zinc-950 light:bg-zinc-900 light:text-zinc-50 pressable transition-fast"
                  >
                    逐个下载全部
                  </button>
                </div>
              </div>
              <div className="max-h-80 overflow-y-auto space-y-1.5 pr-1">
                {results.map((c, i) => (
                  <div
                    key={c.name + i}
                    className="flex items-center justify-between px-3 py-2 border border-zinc-800 light:border-zinc-200 bg-zinc-950 light:bg-zinc-50 text-xs font-mono"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="px-1.5 py-0.5 bg-zinc-800 light:bg-zinc-200 text-zinc-400 text-[10px] shrink-0">
                        #{c.index}
                      </span>
                      <span className="truncate">{c.name}</span>
                      <span className="text-zinc-500 shrink-0">({formatBytes(c.size)})</span>
                      {c.encrypted && (
                        <span className="px-1.5 py-0.5 bg-amber-500/10 text-amber-400 border border-amber-500/20 text-[10px] shrink-0">
                          加密
                        </span>
                      )}
                    </div>
                    <button
                      onClick={() => downloadChunk(i)}
                      className="ml-2 px-3 py-1 border border-zinc-800 light:border-zinc-300 hover:border-zinc-600 text-zinc-300 light:text-zinc-700 transition-fast pressable shrink-0"
                    >
                      下载
                    </button>
                  </div>
                ))}
              </div>
            </div>
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
