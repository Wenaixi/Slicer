import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './index.css'

// 在引入任何 Tailwind 类前同步初始主题（避免明暗闪烁）
const initialTheme = window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
document.documentElement.classList.add(initialTheme)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
