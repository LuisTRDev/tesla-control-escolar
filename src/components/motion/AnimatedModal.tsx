import { AnimatePresence, motion } from 'framer-motion'
import type { ReactNode } from 'react'

type Props = {
  open: boolean
  onClose: () => void
  children: ReactNode
  maxWidth?: string
  align?: 'center' | 'end'
}

const spring = { type: 'spring' as const, stiffness: 380, damping: 32, mass: 0.9 }

/**
 * Reemplaza el patrón `{open && <div className="fixed inset-0 ...">}` que
 * antes aparecía/desaparecía de golpe. Con esto, el fondo se desvanece y el
 * panel entra/sale con un resorte real (Framer Motion), incluida la
 * animación de SALIDA — que antes no existía, el modal simplemente se
 * desmontaba sin transición.
 */
export function AnimatedModal({ open, onClose, children, maxWidth = 'max-w-xl', align = 'center' }: Props) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className={`fixed inset-0 z-50 flex ${align === 'end' ? 'justify-end' : 'items-center justify-center'} overflow-y-auto bg-slate-950/55 p-3 backdrop-blur-sm dark:bg-black/70 sm:p-6`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          onMouseDown={onClose}
        >
          <motion.div
            className={`w-full ${maxWidth}`}
            initial={align === 'end' ? { x: 40, opacity: 0 } : { scale: 0.94, opacity: 0, y: 12 }}
            animate={align === 'end' ? { x: 0, opacity: 1 } : { scale: 1, opacity: 1, y: 0 }}
            exit={align === 'end' ? { x: 40, opacity: 0 } : { scale: 0.96, opacity: 0, y: 8 }}
            transition={spring}
            onMouseDown={(e) => e.stopPropagation()}
          >
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

/** Fila/tarjeta con "magic move": cuando la lista se filtra o reordena, los
 * elementos se deslizan a su nueva posición en vez de saltar de golpe. */
export const MotionRow = motion.div

export const listItemSpring = spring
