import { useRef, type ReactNode } from 'react'
import { motion, useMotionValue, useTransform } from 'framer-motion'
import { haptic } from '@/lib/haptics'
import { useMobileLayout } from '@/hooks/useMobileLayout'

export type SwipeAction = {
  label: string
  icon: ReactNode
  /** Color del fondo que se descubre al deslizar. */
  tone: 'emerald' | 'red' | 'slate' | 'sky'
  onTrigger: () => void
}

type Props = {
  /** Se activa al deslizar hacia la derecha. */
  right?: SwipeAction
  /** Se activa al deslizar hacia la izquierda. */
  left?: SwipeAction
  children: ReactNode
}

const TRIGGER_PX = 96
const MAX_PX = 140

const TONE: Record<SwipeAction['tone'], string> = {
  emerald: 'bg-emerald-600 text-white',
  red: 'bg-red-600 text-white',
  slate: 'bg-slate-600 text-white',
  sky: 'bg-sky-600 text-white',
}

/**
 * Deslizar una tarjeta para una acción rápida (solo celular). El fondo de color se descubre
 * con el dedo y la acción se ejecuta al soltar pasado el umbral; la tarjeta vuelve sola a su sitio.
 * Las mismas acciones siguen disponibles con botones: el gesto es un atajo, no la única vía.
 */
export function SwipeActions({ right, left, children }: Props) {
  const mobile = useMobileLayout()
  const x = useMotionValue(0)
  const crossed = useRef<'right' | 'left' | null>(null)
  const rightOpacity = useTransform(x, [0, TRIGGER_PX], [0.35, 1])
  const leftOpacity = useTransform(x, [-TRIGGER_PX, 0], [1, 0.35])
  const rightShown = useTransform(x, (value) => (value > 0 ? 1 : 0))
  const leftShown = useTransform(x, (value) => (value < 0 ? 1 : 0))

  if (!mobile || (!right && !left)) return <>{children}</>

  return (
    <div className="relative">
      {right && (
        <motion.div aria-hidden="true" style={{ opacity: rightShown }} className={`absolute inset-0 flex items-center justify-start rounded-2xl pl-6 ${TONE[right.tone]}`}>
          <motion.span style={{ opacity: rightOpacity }} className="flex items-center gap-2 text-sm font-black">{right.icon}{right.label}</motion.span>
        </motion.div>
      )}
      {left && (
        <motion.div aria-hidden="true" style={{ opacity: leftShown }} className={`absolute inset-0 flex items-center justify-end rounded-2xl pr-6 ${TONE[left.tone]}`}>
          <motion.span style={{ opacity: leftOpacity }} className="flex items-center gap-2 text-sm font-black">{left.label}{left.icon}</motion.span>
        </motion.div>
      )}
      <motion.div
        style={{ x, touchAction: 'pan-y' }}
        drag="x"
        dragDirectionLock
        dragConstraints={{ left: left ? -MAX_PX : 0, right: right ? MAX_PX : 0 }}
        dragElastic={0.12}
        dragSnapToOrigin
        dragTransition={{ bounceStiffness: 500, bounceDamping: 40 }}
        onDrag={(_, info) => {
          const side = info.offset.x >= TRIGGER_PX && right ? 'right' : info.offset.x <= -TRIGGER_PX && left ? 'left' : null
          if (side && crossed.current !== side) haptic('threshold')
          crossed.current = side
        }}
        onDragEnd={(_, info) => {
          const side = crossed.current
          crossed.current = null
          if (side === 'right' && right && info.offset.x >= TRIGGER_PX) right.onTrigger()
          else if (side === 'left' && left && info.offset.x <= -TRIGGER_PX) left.onTrigger()
        }}
        className="relative"
      >
        {children}
      </motion.div>
    </div>
  )
}
