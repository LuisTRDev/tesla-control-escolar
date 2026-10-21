import { useEffect, useState } from 'react'
import { getTodayKey } from '@/lib/storage'

/**
 * Fecha de hoy ('YYYY-MM-DD', hora local) que se actualiza sola al pasar la medianoche.
 * Una pantalla que queda abierta toda la noche (la TV del patio) pasa al día nuevo sin recargar.
 * Se revisa cada 30 s y al volver a la pestaña, porque el navegador pausa los temporizadores en segundo plano.
 */
export function useTodayKey() {
  const [today, setToday] = useState(getTodayKey)
  useEffect(() => {
    const update = () => setToday((current) => {
      const next = getTodayKey()
      return next === current ? current : next
    })
    const timer = window.setInterval(update, 30_000)
    document.addEventListener('visibilitychange', update)
    window.addEventListener('focus', update)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', update)
      window.removeEventListener('focus', update)
    }
  }, [])
  return today
}
