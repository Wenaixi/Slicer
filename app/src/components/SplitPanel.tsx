import { useState, useRef, useEffect } from 'react'
import { useAppState } from '../lib/store'
import { DropZone } from './DropZone'
import { FileCard } from './FileCard'
import { PasswordPanel } from './PasswordPanel'
import { ProgressBar } from './ProgressBar'
import { toast } from '../lib/toast'
import { formatBytes, downloadBlob, nextFrame } from '../lib/utils'
import {
  DEFAULT_SPLIT_OPTIONS,
  computeChunkPlan,
  buildChunkName,
  encryptedChunkName,
  type SplitOptions,
} from '../lib/split'
import {
  generateSalt,
  deriveKeyFromPassword,
  encryptChunkWithKey,
} from '../lib/crypto'

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
  const abortRef = useRef(false)

  // 重置进度与中止标记当文件或选项变化
  useEffect(() => {
    abortRef.current = false
  }, [file, options.encrypt])

  if (tab !== 'split') return null

  const plan = file
    ? computeChunkPlan(file.size, options)
    : { chunkSize: 0, totalParts: 0 }

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

    setProcessing(true)
    setProgress(0)
    setResults([])
    abortRef.current = false

    try {
      const { chunkSize, totalParts } = computeChunkPlan(file.size, options)

      // 加密：先派生密钥（Argon2id 耗时操作，一次性完成）
      let fileKey: Uint8Array | null = null
      let salt: Uint8Array | null = null
      if (options.encrypt) {
        setProgressLabel('Argon2id 派生密钥…')
        salt = await generateSalt()
        fileKey = await deriveKeyFromPassword(options.password, salt)
        await nextFrame()
      }

      const chunks: ChunkResult[] = []
      let start = 0
      let index = 1

      while (start < file.size) {
        if (abortRef.current) {
          toast('已取消分割', 'info')
          setProcessing(false)
          return
        }

        const end = Math.min(start + chunkSize, file.size)
        const blob = file.slice(start, end)
        const bytes = new Uint8Array(await blob.arrayBuffer())

        let outName = buildChunkName(file.name, index, totalParts, options.naming)
        let outBlob: Blob

        if (options.encrypt && fileKey && salt) {
          const cipher = await encryptChunkWithKey(bytes, fileKey, salt)
          outName = encryptedChunkName(outName)
          // 显式转成 ArrayBuffer，规避 SharedArrayBuffer 类型不兼容
          outBlob = new Blob([cipher.slice().buffer as ArrayBuffer], { type: 'application/octet-stream' })
        } else {
          outBlob = new Blob([bytes.slice().buffer as ArrayBuffer], { type: 'application/octet-stream' })
        }

        chunks.push({
          name: outName,
          blob: outBlob,
          size: outBlob.size,
          index,
          encrypted: options.encrypt,
        })

        start = end
        index++
        const pct = (start / file.size) * 100
        setProgress(pct)
        setProgressLabel(`切片 ${index - 1}/${totalParts}`)
        await nextFrame() // 让出主线程，保持 UI 响应
      }

      // 用完立即擦除密钥
      if (fileKey) fileKey.fill(0)

      setResults(chunks)
      toast(`已分割为 ${chunks.length} 个切片${options.encrypt ? '（已加密）' : ''}`, 'success')
    } catch (err) {
      console.error(err)
      toast(err instanceof Error ? err.message : '分割失败', 'error')
    } finally {
      setProcessing(false)
    }
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
            <div className="border-t border-zinc-800 light:border-zinc-200 pt-4 flex items-center justify-between font-mono text-xs">
              <span>
                预计 <strong className="text-zinc-100 light:text-zinc-900">{plan.totalParts}</strong> 个切片
              </span>
              <span>
                单个约 <strong className="text-zinc-100 light:text-zinc-900">{formatBytes(plan.chunkSize)}</strong>
              </span>
            </div>
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
                <button
                  onClick={downloadAll}
                  className="px-4 py-1.5 text-xs font-mono font-bold bg-zinc-100 text-zinc-950 light:bg-zinc-900 light:text-zinc-50 pressable transition-fast"
                >
                  逐个下载全部
                </button>
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
