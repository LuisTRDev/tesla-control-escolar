import { RefreshCw, Sparkles, X } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { usePwaUpdate } from '@/hooks/usePwaUpdate'

export default function PwaUpdateNotice() {
  const { updateAvailable, updating, updateNow, dismiss } = usePwaUpdate()

  if (!updateAvailable) return null

  return (
    <div className="fixed bottom-4 left-4 right-4 z-[100] sm:left-auto sm:right-5 sm:w-[390px]">
      <div className="overflow-hidden rounded-2xl border border-brand-gold/30 bg-white shadow-2xl shadow-slate-950/20 dark:border-brand-navyDeep/60 dark:bg-slate-950">
        <div className="flex items-start gap-3 p-4">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-navy text-white">
            <Sparkles size={19} />
          </div>

          <div className="min-w-0 flex-1">
            <p className="text-sm font-black text-slate-950 dark:text-white">
              Nueva versión disponible
            </p>
            <p className="mt-1 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
              Hay mejoras listas para Tesla Control Escolar. Tu trabajo no se interrumpirá hasta que elijas actualizar.
            </p>
          </div>

          <button
            type="button"
            onClick={dismiss}
            disabled={updating}
            aria-label="Recordar más tarde"
            className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 disabled:opacity-40 dark:hover:bg-slate-800 dark:hover:text-white"
          >
            <X size={17} />
          </button>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-slate-100 bg-slate-50/70 px-4 py-3 dark:border-slate-800 dark:bg-slate-900/60">
          <Button
            type="button"
            variant="outline"
            className="h-9 px-3 text-xs"
            onClick={dismiss}
            disabled={updating}
          >
            Más tarde
          </Button>

          <Button
            type="button"
            className="h-9 bg-brand-navy px-3 text-xs text-white hover:bg-brand-gold"
            onClick={() => void updateNow()}
            disabled={updating}
          >
            <RefreshCw className={`mr-1.5 ${updating ? 'animate-spin' : ''}`} size={14} />
            {updating ? 'Actualizando...' : 'Actualizar ahora'}
          </Button>
        </div>
      </div>
    </div>
  )
}
