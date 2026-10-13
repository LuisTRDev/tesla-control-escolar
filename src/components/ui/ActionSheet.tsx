import { useEffect, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion, useDragControls } from 'framer-motion'
import { X } from 'lucide-react'

export type SheetAction = {
  key: string
  label: string
  icon: ReactNode
  onSelect: () => void
  description?: string
  tone?: 'default' | 'sky' | 'orange' | 'emerald' | 'red'
  disabled?: boolean
}

type Props = {
  open: boolean
  onClose: () => void
  title: string
  subtitle?: string
  actions: SheetAction[]
}

const toneClass: Record<NonNullable<SheetAction['tone']>, string> = {
  default: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200',
  sky: 'bg-sky-100 text-sky-700 dark:bg-sky-950/60 dark:text-sky-300',
  orange: 'bg-orange-100 text-orange-700 dark:bg-orange-950/60 dark:text-orange-300',
  emerald: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300',
  red: 'bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-300',
}

/**
 * Menú de acciones estilo app nativa: en celular sube desde abajo (se cierra
 * tocando fuera, con la X o arrastrando la cabecera hacia abajo); en PC aparece centrado.
 * Se monta en <body> para no quedar recortado por la tarjeta que lo abre.
 */
export function ActionSheet({ open, onClose, title, subtitle, actions }: Props) {
  const dragControls = useDragControls()
  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[95] flex items-end justify-center bg-slate-950/55 backdrop-blur-[2px] sm:items-center sm:p-4"
          onMouseDown={onClose}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={title}
            className="max-h-[85dvh] w-full overflow-y-auto rounded-t-3xl border border-b-0 border-slate-200 bg-white pb-safe text-slate-950 shadow-2xl dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100 sm:max-w-md sm:rounded-3xl sm:border-b sm:pb-0"
            onMouseDown={(event) => event.stopPropagation()}
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 420, damping: 38 }}
            drag="y"
            dragListener={false}
            dragControls={dragControls}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.6 }}
            onDragEnd={(_, info) => { if (info.offset.y > 90 || info.velocity.y > 600) onClose() }}
          >
            <div className="sticky top-0 z-[1] touch-none bg-white px-5 pb-3 pt-2 dark:bg-slate-900" onPointerDown={(event) => dragControls.start(event)}>
              <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-slate-300 dark:bg-slate-700 sm:hidden" aria-hidden="true" />
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-base font-black">{title}</p>
                  {subtitle && <p className="mt-0.5 truncate text-xs font-semibold text-slate-500 dark:text-slate-400">{subtitle}</p>}
                </div>
                <button type="button" onClick={onClose} className="-mr-2 grid h-10 w-10 shrink-0 place-items-center rounded-full text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800" aria-label="Cerrar">
                  <X size={20} />
                </button>
              </div>
            </div>
            <div className="px-3 pb-4">
              {actions.map((action) => (
                <button
                  key={action.key}
                  type="button"
                  disabled={action.disabled}
                  onClick={() => { onClose(); action.onSelect() }}
                  className="flex min-h-14 w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition-colors hover:bg-slate-50 active:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-45 dark:hover:bg-slate-800/60 dark:active:bg-slate-800"
                >
                  <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${toneClass[action.tone ?? 'default']}`}>{action.icon}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[15px] font-bold">{action.label}</span>
                    {action.description && <span className="mt-0.5 block truncate text-xs font-medium text-slate-500 dark:text-slate-400">{action.description}</span>}
                  </span>
                </button>
              ))}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  )
}
