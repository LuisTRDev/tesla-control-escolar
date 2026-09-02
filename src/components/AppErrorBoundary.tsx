import React from 'react'
import { logApplicationError } from '@/services/errorLogger'

type Props = { children: React.ReactNode }
type State = { hasError: boolean }

export default class AppErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false }

  static getDerivedStateFromError(): State {
    return { hasError: true }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    void logApplicationError({
      module: 'React',
      action: 'ErrorBoundary',
      error,
      metadata: { componentStack: info.componentStack },
    })
  }

  render() {
    if (!this.state.hasError) return this.props.children

    return (
      <main className="grid min-h-screen place-items-center bg-slate-950 px-6 text-white">
        <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-8 text-center shadow-2xl">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-slate-400">Tesla Control Escolar</p>
          <h1 className="mt-3 text-2xl font-black">Ocurrió un error inesperado</h1>
          <p className="mt-3 text-sm leading-6 text-slate-400">
            El error fue registrado. Puedes recargar la aplicación para continuar.
          </p>
          <button
            type="button"
            className="mt-6 rounded-xl bg-white px-4 py-2 text-sm font-bold text-slate-900"
            onClick={() => window.location.reload()}
          >
            Recargar Tesla
          </button>
        </div>
      </main>
    )
  }
}
