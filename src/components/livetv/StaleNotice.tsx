import { memo } from 'react'
import { WifiOff } from 'lucide-react'
import { useNow } from './LiveClock'

// Con el tiempo real caído un rato se considera que los datos pueden estar viejos.
const STALE_AFTER_MS = 90_000

function ageLabel(ms: number) {
  const seconds = Math.max(0, Math.round(ms / 1000))
  if (seconds < 60) return `${seconds} s`
  const minutes = Math.floor(seconds / 60)
  return minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)} h ${minutes % 60} min`
}

/** Avisa cuando lo que se ve puede estar desactualizado: sin internet, o con el tiempo real caído y sin cambios hace rato. */
export const StaleNotice = memo(function StaleNotice({ since, online, realtimeConnected, active, className = '' }: { since: number; online: boolean; realtimeConnected: boolean; active: boolean; className?: string }) {
  const now = useNow(5000, active)
  const age = now.getTime() - since
  const message = !online
    ? `Sin conexión a Internet. Los datos son de hace ${ageLabel(age)}.`
    : !realtimeConnected && age > STALE_AFTER_MS
      ? `Tiempo real desconectado. Los datos son de hace ${ageLabel(age)}.`
      : ''
  if (!message) return null
  return (
    <div role="status" className={`flex items-center gap-2 rounded-xl border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-xs font-bold text-amber-200 sm:text-sm ${className}`}>
      <WifiOff size={16} className="shrink-0" />
      <span>{message}</span>
    </div>
  )
})
