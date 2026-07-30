import { Component, type ReactNode } from 'react'
import { t } from '../lib/i18n'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
  error?: Error
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: unknown) {
    console.error('Slicer 渲染异常:', error, info)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-zinc-950 text-zinc-100 grid place-items-center p-8">
          <div className="max-w-md text-center space-y-4">
            <div className="w-12 h-12 mx-auto grid place-items-center border-2 border-red-500/50 text-red-400 font-mono font-bold">
              !
            </div>
            <h1 className="text-lg font-bold">{t('errorBoundary.title')}</h1>
            <p className="text-sm text-zinc-400 font-mono break-all">
              {this.state.error?.message ?? t('errorBoundary.unknown')}
            </p>
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 bg-zinc-100 text-zinc-950 font-mono text-sm pressable transition-fast"
            >
              {t('errorBoundary.reload')}
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
