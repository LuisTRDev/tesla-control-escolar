import { useCallback, useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Activity, ChevronDown, RefreshCw, Trash2, Users, WifiOff, X } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { useToast } from '@/lib/toast'
import { reportError } from '@/lib/security'
import { friendlyError } from '@/lib/errorMessages'
import { clearAppErrors, getAppErrors, groupAppErrors, type AppErrorRecord } from '@/services/adminService'

type Props = { open: boolean; onClose: () => void; onSeen?: () => void }

const RANGES = [
  { id: '1', label: 'Últimas 24 h', days: 1 },
  { id: '7', label: 'Últimos 7 días', days: 7 },
  { id: '30', label: 'Últimos 30 días', days: 30 },
] as const

function since(days: number) {
  return new Date(Date.now() - days * 86_400_000).toISOString()
}

function when(iso: string) {
  return new Date(iso).toLocaleString('es-PE', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
}

/** Navegador y equipo en pocas palabras, para saber si un error es de un celular en particular. */
function deviceLabel(details: Record<string, unknown>) {
  const ua = typeof details.user_agent === 'string' ? details.user_agent : ''
  if (!ua) return 'Equipo desconocido'
  const os = /android/i.test(ua) ? 'Android' : /iphone|ipad/i.test(ua) ? 'iPhone/iPad' : /windows/i.test(ua) ? 'Windows' : /mac os/i.test(ua) ? 'Mac' : /linux/i.test(ua) ? 'Linux' : 'Otro'
  const browser = /edg\//i.test(ua) ? 'Edge' : /chrome\//i.test(ua) ? 'Chrome' : /firefox\//i.test(ua) ? 'Firefox' : /safari\//i.test(ua) ? 'Safari' : 'Navegador'
  return `${browser} en ${os}`
}

function ErrorSample({ item }: { item: AppErrorRecord }) {
  const details = item.details
  return (
    <div className="mt-3 space-y-1 rounded-xl bg-slate-100 p-3 text-xs text-slate-700 dark:bg-slate-800 dark:text-slate-200">
      <p><b>Último:</b> {when(item.createdAt)} · {deviceLabel(details)}{details.online === false ? ' · sin conexión' : ''}</p>
      <p><b>Acción:</b> {item.action}{item.errorCode ? ` · código ${item.errorCode}` : ''}</p>
      {typeof details.url === 'string' && <p className="break-all"><b>Pantalla:</b> {details.url}</p>}
      {typeof details.supabase_hint === 'string' && <p><b>Pista de la base:</b> {details.supabase_hint}</p>}
      {typeof details.stack === 'string' && (
        <details>
          <summary className="cursor-pointer font-bold">Detalle técnico (para el desarrollador)</summary>
          <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-all text-[11px]">{details.stack}</pre>
        </details>
      )}
    </div>
  )
}

export default function ErrorMonitor({ open, onClose, onSeen }: Props) {
  const toast = useToast()
  const [range, setRange] = useState<(typeof RANGES)[number]['id']>('7')
  const [errors, setErrors] = useState<AppErrorRecord[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [expanded, setExpanded] = useState<string | null>(null)

  const days = RANGES.find((item) => item.id === range)?.days ?? 7
  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      setErrors(await getAppErrors(since(days)))
      onSeen?.()
    } catch (err) {
      reportError('ErrorMonitor', err)
      setError(friendlyError(err, 'No se pudo cargar el monitoreo.'))
    } finally {
      setLoading(false)
    }
  }, [days, onSeen])

  useEffect(() => { if (open) void load() }, [open, load])

  const groups = useMemo(() => groupAppErrors(errors), [errors])
  const affectedUsers = useMemo(() => new Set(errors.map((e) => e.userId).filter(Boolean)).size, [errors])
  const offlineShare = errors.length ? Math.round((errors.filter((e) => e.details.online === false).length / errors.length) * 100) : 0

  async function clearOld() {
    if (!confirm('¿Borrar todos los errores registrados hasta ahora? Hazlo después de revisarlos o corregirlos; los nuevos seguirán apareciendo.')) return
    try {
      await clearAppErrors(new Date().toISOString())
      toast.success('Errores borrados')
      await load()
    } catch (err) {
      toast.error('No se pudieron borrar', friendlyError(err))
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div data-screen-overlay className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/55 p-3 backdrop-blur-sm dark:bg-black/70 sm:p-6" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}>
          <motion.section data-screen className="mx-auto max-w-5xl overflow-hidden rounded-3xl border border-slate-200 bg-slate-50 shadow-2xl dark:border-slate-800 dark:bg-slate-950" initial={{ scale: 0.96, opacity: 0, y: 12 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.97, opacity: 0, y: 8 }} transition={{ type: 'spring', stiffness: 380, damping: 32 }}>
            <header className="border-b border-slate-200 bg-white px-5 py-5 dark:border-slate-800 dark:bg-slate-900 sm:px-7">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <p className="flex items-center gap-2 text-xs font-black uppercase tracking-[.18em] text-slate-500 dark:text-slate-400"><Activity size={15} /> Producción</p>
                  <h2 className="mt-1 text-2xl font-black">Monitoreo de errores</h2>
                  <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Fallas que ocurrieron en los equipos de los auxiliares, aunque nadie las haya reportado. Los cortes de Internet no se cuentan como error.</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <select value={range} onChange={(e) => setRange(e.target.value as typeof range)} className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
                    {RANGES.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
                  </select>
                  <Button variant="outline" onClick={() => void load()}><RefreshCw className={`mr-2 ${loading ? 'animate-spin' : ''}`} size={16} /> Actualizar</Button>
                  <Button variant="ghost" onClick={onClose} aria-label="Cerrar"><X size={20} /></Button>
                </div>
              </div>
            </header>

            <div className="p-5 sm:p-7">
              {error && <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300">{error}</div>}

              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <Card className="p-4"><p className="text-xs text-slate-500 dark:text-slate-400">Errores</p><p className="mt-1 text-2xl font-black">{errors.length}</p></Card>
                <Card className="p-4"><p className="text-xs text-slate-500 dark:text-slate-400">Problemas distintos</p><p className="mt-1 text-2xl font-black">{groups.length}</p></Card>
                <Card className="p-4"><p className="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400"><Users size={13} /> Usuarios afectados</p><p className="mt-1 text-2xl font-black">{affectedUsers}</p></Card>
                <Card className="p-4"><p className="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400"><WifiOff size={13} /> Con mala señal</p><p className="mt-1 text-2xl font-black">{offlineShare}%</p></Card>
              </div>

              <div className="mt-5 flex items-center justify-between gap-2">
                <h3 className="text-sm font-black">Problemas, del más frecuente al menos frecuente</h3>
                {errors.length > 0 && <Button variant="ghost" className="min-h-9 px-3 text-xs text-red-700 dark:text-red-300" onClick={() => void clearOld()}><Trash2 className="mr-1.5" size={14} /> Borrar revisados</Button>}
              </div>

              <div className="mt-3 space-y-2">
                {!loading && !error && groups.length === 0 && (
                  <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">Sin errores en este período. 🎉</div>
                )}
                {groups.map((group) => (
                  <Card key={group.key} className="p-4">
                    <button type="button" className="flex w-full items-start gap-3 text-left" onClick={() => setExpanded((curr) => (curr === group.key ? null : group.key))} aria-expanded={expanded === group.key}>
                      <span className={`grid h-10 min-w-10 shrink-0 place-items-center rounded-xl px-2 text-sm font-black ${group.count >= 10 ? 'bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-300' : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200'}`}>{group.count}×</span>
                      <span className="min-w-0 flex-1">
                        <span className="block break-words text-sm font-bold">{group.message}</span>
                        <span className="mt-0.5 block text-xs text-slate-500 dark:text-slate-400">{group.module} · {group.users} usuario{group.users === 1 ? '' : 's'} · último {when(group.lastAt)}</span>
                      </span>
                      <ChevronDown className={`mt-2 shrink-0 text-slate-400 transition-transform ${expanded === group.key ? 'rotate-180' : ''}`} size={18} />
                    </button>
                    {expanded === group.key && <ErrorSample item={group.sample} />}
                  </Card>
                ))}
              </div>
            </div>
          </motion.section>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
