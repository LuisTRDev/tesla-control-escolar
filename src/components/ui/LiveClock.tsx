import { useEffect, useState } from 'react'

/**
 * Reloj con segundos que se redibuja solo a sí mismo. Antes el tic de cada
 * segundo vivía en Attendance y redibujaba la lista completa de alumnos.
 */
export function LiveClock({ className }: { className?: string }) {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000)
    return () => window.clearInterval(timer)
  }, [])
  return <p className={className}>{now.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true })}</p>
}
