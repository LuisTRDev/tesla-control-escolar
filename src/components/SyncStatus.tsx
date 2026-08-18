import { Cloud, CloudOff, RefreshCw, Smartphone } from 'lucide-react'
import { Button } from '@/components/ui/Button'

type Props = {
  online: boolean
  syncing: boolean
  pending: number
  lastSync: string | null
  onSync: () => void
  installAvailable?: boolean
  onInstall?: () => void
}

function lastSyncLabel(value: string | null) {
  if (!value) return 'Aún sin sincronizar'
  const date = new Date(value)
  return `Última sync ${date.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' })}`
}

export default function SyncStatus({ online, syncing, pending, lastSync, onSync, installAvailable=false, onInstall }: Props) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={onSync}
        disabled={!online || syncing}
        className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-bold transition ${online
          ? pending > 0
            ? 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-300'
            : 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-300'
          : 'border-slate-300 bg-slate-100 text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300'}`}
      >
        {online ? <Cloud size={15} /> : <CloudOff size={15} />}
        <span>{online ? (pending ? `${pending} pendiente${pending === 1 ? '' : 's'}` : 'Todo sincronizado') : `Offline · ${pending} pendiente${pending === 1 ? '' : 's'}`}</span>
        {syncing && <RefreshCw size={14} className="animate-spin" />}
      </button>
      <span className="hidden text-[10px] font-semibold text-slate-400 xl:inline">{lastSyncLabel(lastSync)}</span>
      {installAvailable && onInstall && (
        <Button variant="outline" className="h-9 px-3 text-xs" onClick={onInstall}>
          <Smartphone className="mr-1.5" size={14} /> Instalar app
        </Button>
      )}
    </div>
  )
}
