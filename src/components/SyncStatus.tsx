import { AlertTriangle, Cloud, CloudOff, RefreshCw, Smartphone } from 'lucide-react'
import { Button } from '@/components/ui/Button'

type Props = {
  online: boolean
  syncing: boolean
  pending: number
  lastSync: string | null
  failing?: number
  conflicts?: number
  /** Abre el panel de sincronización (pendientes, errores, conflictos). */
  onOpen: () => void
  installAvailable?: boolean
  onInstall?: () => void
}

function lastSyncLabel(value: string | null) {
  if (!value) return 'Aún sin sincronizar'
  const date = new Date(value)
  return `Última sync ${date.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' })}`
}

export default function SyncStatus({ online, syncing, pending, lastSync, failing = 0, conflicts = 0, onOpen, installAvailable=false, onInstall }: Props) {
  const label = online
    ? failing > 0 ? `${failing} con error` : pending ? `${pending} pendiente${pending === 1 ? '' : 's'}` : 'Todo sincronizado'
    : `Offline · ${pending} pendiente${pending === 1 ? '' : 's'}`
  // En celular la cabecera es angosta: solo lo esencial.
  const shortLabel = online
    ? failing > 0 ? `${failing} error` : pending ? `${pending} pend.` : 'Al día'
    : `Offline${pending ? ` · ${pending}` : ''}`
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={onOpen}
        title="Ver cambios pendientes, errores y conflictos de sincronización"
        className={`relative flex h-10 items-center gap-1.5 whitespace-nowrap rounded-xl border px-2.5 text-xs font-bold transition active:scale-95 sm:gap-2 sm:px-3 ${online
          ? failing > 0
            ? 'border-red-200 bg-red-50 text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300'
            : pending > 0
            ? 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-300'
            : 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-300'
          : 'border-slate-300 bg-slate-100 text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300'}`}
      >
        {failing > 0 ? <AlertTriangle size={15} /> : online ? <Cloud size={15} /> : <CloudOff size={15} />}
        <span className="sm:hidden">{shortLabel}</span><span className="hidden sm:inline">{label}</span>
        {conflicts > 0 && <span className="rounded-full bg-sky-600 px-1.5 text-[10px] font-black text-white" title="Conflictos resueltos por revisar">{conflicts}</span>}
        {syncing && <RefreshCw size={14} className="animate-spin" />}
      </button>
      <span className="hidden text-[10px] font-semibold text-slate-500 dark:text-slate-400 xl:inline">{lastSyncLabel(lastSync)}</span>
      {installAvailable && onInstall && (
        <Button variant="outline" className="h-10 min-h-10 px-2.5 text-xs sm:px-3" onClick={onInstall} aria-label="Instalar app">
          <Smartphone className="sm:mr-1.5" size={14} /><span className="hidden sm:inline">Instalar app</span>
        </Button>
      )}
    </div>
  )
}
