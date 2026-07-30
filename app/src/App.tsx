import { useEffect, useRef } from 'react'
import { initSealGo } from './lib/sealgo'
import { ToastStack } from './components/ToastStack'
import { ErrorStack } from './components/ErrorStack'
import { Header } from './components/Header'
import { TabBar } from './components/TabBar'
import { SplitPanel } from './components/SplitPanel'
import { MergePanel } from './components/MergePanel'
import { Footer } from './components/Footer'
import { GlobalDropOverlay } from './components/GlobalDropOverlay'
import { ErrorBoundary } from './components/ErrorBoundary'
import { useAppState } from './components/hooks/useAppState'
import { setTab, setGlobalDragging } from './lib/store'
import { toast } from './lib/toast'
import { pushError } from './lib/panel-error'

export default function App() {
  const { theme, tab } = useAppState()
  const dragCounterRef = useRef(0)

  useEffect(() => {
    document.documentElement.classList.remove('light', 'dark')
    document.documentElement.classList.add(theme)
  }, [theme])

  useEffect(() => {
    initSealGo().catch((err) => {
      console.error('SealGo WASM 初始化失败:', err)
      toast('SealGo 加密引擎加载失败，加密功能不可用', 'error')
      pushError({
        kind: 'wasm',
        title: 'SealGo WASM 加载失败',
        message: err instanceof Error ? err.message : String(err),
        hint: '请确认 public/wasm/SealGo.wasm 与 wasm_exec.js 存在；刷新页面重试。',
        diagnostics: err instanceof Error && err.stack ? err.stack : String(err),
      })
    })
  }, [])

  // 键盘快捷键：S/M 会与浏览器内置（保存网页/查找）冲突，改用 Q/W；
  // 左右方向键仍可切换 Tab；输入框聚焦时忽略。
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      const inForm = !!target && (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT'
      )
      if (inForm) return
      if (e.altKey || e.ctrlKey || e.metaKey) return
      if (e.key === 'ArrowLeft' || e.key.toLowerCase() === 'q') {
        setTab('split')
      } else if (e.key === 'ArrowRight' || e.key.toLowerCase() === 'w') {
        setTab('merge')
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // 全屏拖拽：window 级 dragenter/dragleave/drop，dragCounter 防闪烁
  useEffect(() => {
    const onDragEnter = (e: DragEvent) => {
      e.preventDefault()
      dragCounterRef.current++
      setGlobalDragging(true)
    }
    const onDragOver = (e: DragEvent) => e.preventDefault()
    const onDragLeave = (e: DragEvent) => {
      e.preventDefault()
      dragCounterRef.current = Math.max(0, dragCounterRef.current - 1)
      if (dragCounterRef.current === 0) setGlobalDragging(false)
    }
    const onDrop = (e: DragEvent) => {
      e.preventDefault()
      dragCounterRef.current = 0
      setGlobalDragging(false)
      const files = e.dataTransfer?.files ? Array.from(e.dataTransfer.files) : []
      if (files.length > 0) {
        window.dispatchEvent(
          new CustomEvent('slicer:global-drop', { detail: { files } }),
        )
      }
    }
    window.addEventListener('dragenter', onDragEnter)
    window.addEventListener('dragover', onDragOver)
    window.addEventListener('dragleave', onDragLeave)
    window.addEventListener('drop', onDrop)
    return () => {
      window.removeEventListener('dragenter', onDragEnter)
      window.removeEventListener('dragover', onDragOver)
      window.removeEventListener('dragleave', onDragLeave)
      window.removeEventListener('drop', onDrop)
    }
  }, [])

  return (
    <ErrorBoundary>
      <div className="min-h-screen bg-zinc-950 text-zinc-100 light:bg-zinc-50 light:text-zinc-900 transition-colors">
        <Header />
        <main className="max-w-6xl mx-auto px-4 py-8 md:py-12">
          <TabBar />
          <SplitPanel />
          <MergePanel />
          <Footer />
        </main>
        <GlobalDropOverlay currentTab={tab} />
        <ToastStack />
        <ErrorStack />
      </div>
    </ErrorBoundary>
  )
}
