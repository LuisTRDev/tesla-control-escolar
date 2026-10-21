import { useEffect, useRef, type ReactNode } from 'react'
import { AnimatePresence, motion, useDragControls } from 'framer-motion'
import { X } from 'lucide-react'
import { useBackClose } from '@/lib/backClose'

type Props = {
  open: boolean
  onClose: () => void
  title: string
  subtitle?: string
  children: ReactNode
}

/** Hoja inferior oscura del panel en vivo: se cierra tocando fuera, con la X, arrastrando hacia abajo o con "atrás". */
export function LiveSheet({ open, onClose, title, subtitle, children }: Props) {
  const dragControls = useDragControls()
  const dialogRef = useRef<HTMLDivElement>(null)
  useBackClose(open, onClose)
  // Teclado y lectores de pantalla: el foco pasa a la hoja al abrirla y Escape la cierra.
  const closeRef = useRef(onClose)
  useEffect(() => { closeRef.current = onClose })
  useEffect(() => {
    if (!open) return
    dialogRef.current?.focus()
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') closeRef.current() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[130] flex items-end justify-center bg-black/60 backdrop-blur-[2px]"
          onMouseDown={onClose}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
        >
          <motion.div
            ref={dialogRef}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-label={title}
            className="max-h-[85dvh] w-full overflow-y-auto outline-none rounded-t-3xl border border-b-0 border-white/10 bg-[#0b1626] pb-[calc(1rem+env(safe-area-inset-bottom))] text-white shadow-2xl sm:max-w-md"
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
            <div className="sticky top-0 z-[1] touch-none bg-[#0b1626] px-5 pb-3 pt-2" onPointerDown={(event) => dragControls.start(event)}>
              <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-white/20" aria-hidden="true" />
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-base font-black">{title}</p>
                  {subtitle && <p className="mt-0.5 truncate text-xs font-semibold text-slate-400">{subtitle}</p>}
                </div>
                <button type="button" onClick={onClose} className="-mr-2 grid h-10 w-10 shrink-0 place-items-center rounded-full text-slate-400 hover:bg-white/10" aria-label="Cerrar"><X size={20} /></button>
              </div>
            </div>
            <div className="px-4">{children}</div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
