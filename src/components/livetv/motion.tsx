import { memo, useEffect, useMemo, type ReactNode } from 'react'
import { motion, useMotionTemplate, useReducedMotion, useSpring } from 'framer-motion'

const DIGITS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]
const LINE = 1.1 // alto de cada dígito, en em

function Digit({ digit }: { digit: number }) {
  return (
    <span aria-hidden="true" className="relative inline-block overflow-hidden align-bottom" style={{ width: '1ch', height: `${LINE}em` }}>
      <motion.span
        className="absolute left-0 top-0 flex flex-col"
        initial={{ y: 0 }}
        animate={{ y: `${-digit * LINE}em` }}
        transition={{ type: 'spring', stiffness: 150, damping: 20, mass: 0.9 }}
      >
        {DIGITS.map((item) => <span key={item} className="block text-center" style={{ height: `${LINE}em`, lineHeight: `${LINE}em` }}>{item}</span>)}
      </motion.span>
    </span>
  )
}

/**
 * Cifra tipo odómetro: cada dígito es una cinta 0-9 que rueda hasta su valor, así que al subir
 * una tardanza se ve girar la última cifra. Los lectores de pantalla reciben el número normal.
 */
export const Odometer = memo(function Odometer({ value, suffix = '', className = '' }: { value: number; suffix?: string; className?: string }) {
  const reduced = useReducedMotion()
  const safe = Math.max(0, Math.round(value))
  const digits = String(safe).split('')
  if (reduced) return <span className={`tabular-nums ${className}`}>{safe}{suffix}</span>
  return (
    <span className={`inline-flex items-baseline tabular-nums ${className}`}>
      <span className="sr-only">{safe}{suffix}</span>
      {digits.map((digit, index) => <Digit key={digits.length - index} digit={Number(digit)} />)}
      {suffix && <span aria-hidden="true">{suffix}</span>}
    </span>
  )
})

/** Icono de conexión con un aro que se expande cada vez que llegan datos nuevos (como un radar). */
export const LivePulse = memo(function LivePulse({ pulseKey, active, children }: { pulseKey: number; active: boolean; children: ReactNode }) {
  const reduced = useReducedMotion()
  return (
    <span className="relative grid place-items-center">
      {active && !reduced && <motion.span key={pulseKey} aria-hidden="true" className="absolute inset-0 rounded-full border border-current" initial={{ scale: 1, opacity: 0.7 }} animate={{ scale: 2.6, opacity: 0 }} transition={{ duration: 1.2, ease: 'easeOut' }} />}
      {children}
    </span>
  )
})

/** Hilo fino bajo el encabezado que avanza durante el minuto actual: un reloj de arena silencioso. */
export const MinuteSweep = memo(function MinuteSweep({ className = '' }: { className?: string }) {
  // Se sincroniza con los segundos del reloj en el momento de montarse; la deriva en un minuto es imperceptible.
  const offset = useMemo(() => -new Date().getSeconds(), [])
  return (
    <span aria-hidden="true" className={`pointer-events-none absolute bottom-0 left-0 right-0 h-px overflow-hidden ${className}`}>
      <span className="block h-full origin-left animate-liveProgress bg-gradient-to-r from-sky-400/0 via-sky-400/60 to-sky-300 motion-reduce:animate-none" style={{ animationDuration: '60s', animationIterationCount: 'infinite', animationTimingFunction: 'linear', animationDelay: `${offset}s`, animationFillMode: 'none' }} />
    </span>
  )
})

/** Anillo de porcentaje que se llena con un resorte suave al cargar o cambiar el valor. */
export const ProgressRing = memo(function ProgressRing({ percent, label }: { percent: number; label: string }) {
  const degrees = useSpring(0, { stiffness: 55, damping: 16 })
  useEffect(() => { degrees.set(Math.max(0, Math.min(100, percent)) * 3.6) }, [degrees, percent])
  const background = useMotionTemplate`conic-gradient(#d4a94f ${degrees}deg, rgba(255,255,255,.07) 0deg)`
  return (
    <motion.div className="relative grid h-24 w-24 shrink-0 place-items-center rounded-full" style={{ background }}>
      <div className="grid h-16 w-16 place-items-center rounded-full bg-[#09111e] text-lg font-black">{label}</div>
    </motion.div>
  )
})
