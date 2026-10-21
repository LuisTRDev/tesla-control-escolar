import { memo, useEffect, useState } from 'react'

const pad = (value: number) => String(value).padStart(2, '0')
const formatClock = (date: Date) => `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
const formatDate = (date: Date) => date.toLocaleDateString('es-PE', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })

/** Reloj con su propio estado: solo él se repinta cada segundo, no todo el panel. Se detiene con la pantalla en segundo plano. */
export function useNow(intervalMs: number, active: boolean) {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    if (!active) return
    const tick = () => { if (!document.hidden) setNow(new Date()) }
    tick()
    const timer = window.setInterval(tick, intervalMs)
    document.addEventListener('visibilitychange', tick)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', tick)
    }
  }, [intervalMs, active])
  return now
}

export const LiveClock = memo(function LiveClock({ active, className, withSeconds = true }: { active: boolean; className?: string; withSeconds?: boolean }) {
  const now = useNow(1000, active)
  const text = formatClock(now)
  return <div className={className}>{withSeconds ? text : text.slice(0, 5)}</div>
})

export const LiveDate = memo(function LiveDate({ active, className }: { active: boolean; className?: string }) {
  const now = useNow(30_000, active)
  return <p className={className}>{formatDate(now)}</p>
})

/** "Actualizado hace 12 s": se recalcula cada 5 s a partir del último cambio de datos. */
export const UpdatedAgo = memo(function UpdatedAgo({ since, active, className }: { since: number; active: boolean; className?: string }) {
  const now = useNow(5000, active)
  const seconds = Math.max(0, Math.round((now.getTime() - since) / 1000))
  const label = seconds < 10 ? 'ahora' : seconds < 60 ? `hace ${seconds} s` : `hace ${Math.floor(seconds / 60)} min`
  return <span className={className}>Último cambio {label}</span>
})
