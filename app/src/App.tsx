import { useEffect } from 'react'
import { initSealGo } from './lib/sealgo'
import { ToastStack } from './components/ToastStack'
import { Header } from './components/Header'
import { TabBar } from './components/TabBar'
import { SplitPanel } from './components/SplitPanel'
import { MergePanel } from './components/MergePanel'
import { Footer } from './components/Footer'
import { useAppState } from './lib/store'

export default function App() {
  const { theme } = useAppState()

  useEffect(() => {
    // 应用主题类名到根 html
    document.documentElement.classList.remove('light', 'dark')
    document.documentElement.classList.add(theme)
  }, [theme])

  useEffect(() => {
    // 启动期预热 SealGo WASM（用户切到加密时不会阻塞 UI）
    initSealGo().catch((err) => {
      console.error('SealGo WASM 初始化失败:', err)
    })
  }, [])

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 light:bg-zinc-50 light:text-zinc-900 transition-colors">
      <Header />
      <main className="max-w-6xl mx-auto px-4 py-8 md:py-12">
        <TabBar />
        <SplitPanel />
        <MergePanel />
        <Footer />
      </main>
      <ToastStack />
    </div>
  )
}
