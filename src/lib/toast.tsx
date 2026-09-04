import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react'
import { CheckCircle2, Info, TriangleAlert, X, XCircle } from 'lucide-react'

type ToastVariant = 'success' | 'error' | 'info' | 'warning'
type ToastItem = { id: number; title: string; description?: string; variant: ToastVariant; leaving?: boolean }

type ToastInput = { title: string; description?: string; variant?: ToastVariant; duration?: number }

type ToastContextValue = { show: (toast: ToastInput) => void }

const ToastContext = createContext<ToastContextValue | null>(null)

const ICONS: Record<ToastVariant, ReactNode> = {
  success: <CheckCircle2 size={20} className="text-emerald-500" />,
  error: <XCircle size={20} className="text-red-500" />,
  warning: <TriangleAlert size={20} className="text-amber-500" />,
  info: <Info size={20} className="text-blue-500" />,
}

const BORDERS: Record<ToastVariant, string> = {
  success: 'border-emerald-200 dark:border-emerald-900/60',
  error: 'border-red-200 dark:border-red-900/60',
  warning: 'border-amber-200 dark:border-amber-900/60',
  info: 'border-blue-200 dark:border-blue-900/60',
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const idRef = useRef(0)

  const dismiss = useCallback((id: number) => {
    setToasts((curr) => curr.map((t) => (t.id === id ? { ...t, leaving: true } : t)))
    setTimeout(() => setToasts((curr) => curr.filter((t) => t.id !== id)), 200)
  }, [])

  const show = useCallback((toast: ToastInput) => {
    const id = ++idRef.current
    const variant = toast.variant ?? 'info'
    setToasts((curr) => [...curr, { id, title: toast.title, description: toast.description, variant }])
    const duration = toast.duration ?? (variant === 'error' ? 6000 : 3200)
    setTimeout(() => dismiss(id), duration)
  }, [dismiss])

  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 top-4 z-[200] flex flex-col items-center gap-2 px-4 sm:items-end sm:right-4 sm:left-auto">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-2xl border bg-white p-4 shadow-lg dark:bg-slate-900 ${BORDERS[t.variant]} ${t.leaving ? 'animate-toastOut' : 'animate-toastIn'}`}
          >
            <span className="mt-0.5 shrink-0">{ICONS[t.variant]}</span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-slate-900 dark:text-slate-100">{t.title}</p>
              {t.description && <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{t.description}</p>}
            </div>
            <button
              type="button"
              onClick={() => dismiss(t.id)}
              className="shrink-0 rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800"
              aria-label="Cerrar aviso"
            >
              <X size={16} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

/** Uso: const toast = useToast(); toast.success('Asistencia registrada'); */
export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast debe usarse dentro de <ToastProvider>')
  return {
    show: ctx.show,
    success: (title: string, description?: string) => ctx.show({ title, description, variant: 'success' }),
    error: (title: string, description?: string) => ctx.show({ title, description, variant: 'error' }),
    warning: (title: string, description?: string) => ctx.show({ title, description, variant: 'warning' }),
    info: (title: string, description?: string) => ctx.show({ title, description, variant: 'info' }),
  }
}
