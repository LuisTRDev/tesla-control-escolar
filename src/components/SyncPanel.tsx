import { useCallback, useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { AlertTriangle, CheckCircle2, Cloud, CloudOff, Download, GitMerge, RefreshCw, RotateCcw, Trash2, X } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { useToast } from '@/lib/toast'
import { reportError } from '@/lib/security'
import { friendlyError } from '@/lib/errorMessages'
import { toDateKey } from '@/lib/dates'
import {
  clearSyncConflicts, exportOfflineState, getSyncConflicts, listPendingOperations, removePendingOperation, type SyncQueueItem,
} from '@/lib/offlineDb'
import { CONFLICT_KIND_LABELS, describeConflict, type SyncConflict } from '@/lib/syncConflicts'
import type { NetworkSyncState } from '@/hooks/useNetworkSync'
import type { Classroom, Student } from '@/types'

type Props = {
  open: boolean
  onClose: () => void
  sync: NetworkSyncState
  students: Student[]
  classrooms: Classroom[]
}

const TYPE_LABELS: Record<SyncQueueItem['type'], string> = {
  ATTENDANCE_UPSERT: 'Entrada',
  ATTENDANCE_EXIT_UPSERT: 'Salida',
  PRESENTATION_UPSERT: 'Presentación',
}

function shortDateTime(iso: string) {
  const date = new Date(iso)
  return date.toLocaleString('es-PE', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
}

function operationDetail(item: SyncQueueItem) {
  const p = item.payload
  if (item.type === 'ATTENDANCE_UPSERT') return `${String(p.time ?? '').slice(0, 5)} · ${p.status === 'LATE' ? 'tardanza' : 'a tiempo'}`
  if (item.type === 'ATTENDANCE_EXIT_UPSERT') return `${String(p.exitTime ?? '').slice(0, 5)}`
  return p.status === 'NON_COMPLIANT' ? 'con incidencia' : 'conforme'
}

function downloadJson(data: unknown, filename: string) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = filename; a.click()
  URL.revokeObjectURL(url)
}

export default function SyncPanel({ open, onClose, sync, students, classrooms }: Props) {
  const toast = useToast()
  const [items, setItems] = useState<SyncQueueItem[]>([])
  const [conflicts, setConflicts] = useState<SyncConflict[]>([])

  const load = useCallback(async () => {
    try {
      const [queue, conflictList] = await Promise.all([listPendingOperations(), getSyncConflicts()])
      setItems(queue)
      setConflicts(conflictList)
    } catch (error) {
      reportError('SyncPanel', error)
    }
  }, [])

  useEffect(() => {
    if (!open) return
    void load()
    const update = () => { void load() }
    window.addEventListener('tesla-sync-queue-changed', update)
    return () => window.removeEventListener('tesla-sync-queue-changed', update)
  }, [open, load])

  const studentMap = useMemo(() => new Map(students.map((s) => [s.id, s])), [students])
  const classroomMap = useMemo(() => new Map(classrooms.map((c) => [c.id, c])), [classrooms])

  function studentLabel(studentId: string) {
    const student = studentMap.get(studentId)
    if (!student) return { name: `Alumno #${studentId}`, room: '' }
    const room = classroomMap.get(student.classroomId)
    return { name: `${student.lastName}, ${student.firstName}`, room: room ? `${room.grade} ${room.section} · ${room.level}` : '' }
  }

  async function discard(item: SyncQueueItem) {
    const { name } = studentLabel(String(item.payload.studentId ?? ''))
    if (!confirm(`¿Descartar la ${TYPE_LABELS[item.type].toLowerCase()} pendiente de ${name}? No se enviará al servidor y no se puede recuperar.`)) return
    try {
      await removePendingOperation(item.id)
      toast.info('Operación descartada')
    } catch (error) {
      toast.error('No se pudo descartar', friendlyError(error))
    }
  }

  async function exportQueue() {
    const state = await exportOfflineState()
    downloadJson({ generatedAt: new Date().toISOString(), ...state, conflicts }, `tesla-cola-${toDateKey()}.json`)
  }

  const failing = items.filter((item) => item.lastError)
  const waiting = items.filter((item) => !item.lastError)

  function renderItem(item: SyncQueueItem) {
    const { name, room } = studentLabel(String(item.payload.studentId ?? ''))
    return (
      <li key={item.id} className={`rounded-xl border p-3 ${item.lastError ? 'border-red-200 bg-red-50 dark:border-red-900/60 dark:bg-red-950/30' : 'border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900'}`}>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <p className="truncate text-sm font-bold">
              <span className="mr-2 rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px] font-black uppercase text-slate-700 dark:bg-slate-800 dark:text-slate-200">{TYPE_LABELS[item.type]}</span>
              {name}
            </p>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              {room && `${room} · `}{String(item.payload.date ?? '')} · {operationDetail(item)} · guardado {shortDateTime(item.createdAt)}
            </p>
            {item.lastError && (
              <p className="mt-1.5 text-xs font-semibold text-red-700 dark:text-red-300">
                {item.retryCount} intento{item.retryCount === 1 ? '' : 's'} fallido{item.retryCount === 1 ? '' : 's'}: {item.lastError}
              </p>
            )}
          </div>
          <div className="flex shrink-0 gap-2">
            <Button variant="outline" className="min-h-9 px-3 text-xs" disabled={!sync.online || sync.syncing} onClick={() => void sync.retry([item.id])}>
              <RotateCcw className="mr-1.5" size={14} /> Reintentar
            </Button>
            <Button variant="ghost" className="min-h-9 px-3 text-xs text-red-700 hover:bg-red-50 dark:text-red-300 dark:hover:bg-red-950/40" onClick={() => void discard(item)} aria-label="Descartar operación">
              <Trash2 size={14} />
            </Button>
          </div>
        </div>
      </li>
    )
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-[70] overflow-y-auto bg-slate-950/55 p-3 backdrop-blur-sm sm:p-6" onMouseDown={onClose} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}>
          <motion.section className="mx-auto w-full max-w-2xl rounded-3xl border border-slate-200 bg-slate-50 shadow-2xl dark:border-slate-800 dark:bg-slate-950" onMouseDown={(e) => e.stopPropagation()} initial={{ scale: 0.96, opacity: 0, y: 12 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.97, opacity: 0, y: 8 }} transition={{ type: 'spring', stiffness: 380, damping: 32 }}>
            <header className="flex items-start justify-between gap-4 rounded-t-3xl border-b border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
              <div>
                <p className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">
                  {sync.online ? <Cloud size={15} /> : <CloudOff size={15} />} {sync.online ? 'En línea' : 'Sin conexión'}
                </p>
                <h2 className="mt-1 text-2xl font-black">Sincronización</h2>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                  {sync.lastSync ? `Última sincronización completa: ${shortDateTime(sync.lastSync)}` : 'Este equipo aún no completó una sincronización.'}
                </p>
              </div>
              <Button variant="ghost" onClick={onClose} aria-label="Cerrar"><X size={20} /></Button>
            </header>

            <div className="space-y-5 p-5">
              <div className="flex flex-wrap gap-2">
                <Button disabled={!sync.online || sync.syncing || items.length === 0} onClick={() => void sync.syncNow()}>
                  <RefreshCw className={`mr-2 ${sync.syncing ? 'animate-spin' : ''}`} size={16} /> {sync.syncing ? 'Sincronizando...' : 'Sincronizar ahora'}
                </Button>
                <Button variant="outline" onClick={() => void exportQueue()} disabled={items.length === 0 && conflicts.length === 0}>
                  <Download className="mr-2" size={16} /> Descargar copia de la cola
                </Button>
              </div>

              {!sync.online && items.length > 0 && (
                <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-300">
                  Sin Internet: los cambios están guardados en este equipo y se enviarán solos al recuperar la conexión. No cierres sesión ni borres los datos del navegador.
                </p>
              )}

              {items.length === 0 ? (
                <Card className="flex items-center gap-3 p-4">
                  <CheckCircle2 className="shrink-0 text-emerald-600 dark:text-emerald-400" size={22} />
                  <p className="text-sm font-semibold">No hay cambios pendientes: todo lo marcado en este equipo ya está en el servidor.</p>
                </Card>
              ) : (
                <>
                  {failing.length > 0 && (
                    <section>
                      <h3 className="mb-2 flex items-center gap-2 text-sm font-black text-red-700 dark:text-red-300"><AlertTriangle size={16} /> Con error ({failing.length})</h3>
                      <p className="mb-2 text-xs text-slate-500 dark:text-slate-400">Se reintentan solos cada 15 segundos. Si el error dice qué corregir, corrígelo y pulsa Reintentar; si el registro ya no sirve, descártalo.</p>
                      <ul className="space-y-2">{failing.map(renderItem)}</ul>
                    </section>
                  )}
                  {waiting.length > 0 && (
                    <section>
                      <h3 className="mb-2 text-sm font-black">En espera ({waiting.length})</h3>
                      <ul className="space-y-2">{waiting.map(renderItem)}</ul>
                    </section>
                  )}
                </>
              )}

              <section>
                <div className="mb-2 flex items-center justify-between gap-2">
                  <h3 className="flex items-center gap-2 text-sm font-black"><GitMerge size={16} /> Conflictos resueltos ({conflicts.length})</h3>
                  {conflicts.length > 0 && <Button variant="ghost" className="min-h-9 px-3 text-xs" onClick={() => void clearSyncConflicts()}>Marcar como revisados</Button>}
                </div>
                <p className="mb-2 text-xs text-slate-500 dark:text-slate-400">
                  Ocurren cuando otro equipo registró al mismo alumno mientras este estaba sin conexión. Se guarda la hora más temprana y nunca se pierde una incidencia de presentación.
                </p>
                {conflicts.length === 0 ? (
                  <p className="text-sm text-slate-500 dark:text-slate-400">Sin conflictos.</p>
                ) : (
                  <ul className="space-y-2">
                    {conflicts.map((conflict) => {
                      const { name, room } = studentLabel(conflict.studentId)
                      return (
                        <li key={conflict.id} className="rounded-xl border border-sky-200 bg-sky-50 p-3 text-sm dark:border-sky-900/60 dark:bg-sky-950/30">
                          <p className="font-bold">{CONFLICT_KIND_LABELS[conflict.kind]} · {name}</p>
                          <p className="text-xs text-slate-500 dark:text-slate-400">{room && `${room} · `}{conflict.date} · resuelto {shortDateTime(conflict.at)}</p>
                          <p className="mt-1 text-slate-700 dark:text-slate-200">{describeConflict(conflict)}</p>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </section>
            </div>
          </motion.section>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
