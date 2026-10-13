import { useCallback, useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useToast } from '@/lib/toast'
import { CalendarClock, DatabaseBackup, Download, FileJson, FileSpreadsheet, HardDrive, Plus, RefreshCw, X } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { supabase } from '@/lib/supabase'
import { exportOfflineState } from '@/lib/offlineDb'
import { toDateKey } from '@/lib/dates'
import { reportError } from '@/lib/security'
import { ERROR_HINTS, friendlyError, knownErrorHint } from '@/lib/errorMessages'
import { getBackupSnapshotData, listBackupSnapshots, PHASE15_MISSING, takeBackupSnapshot, type BackupSnapshotInfo } from '@/services/adminService'
import { fetchAllPages } from '@/lib/paging'

type Props = { open: boolean; onClose: () => void; online: boolean; isAdmin: boolean }

/** Tablas operativas. Las que aún no existen (SQL de fases no ejecutado) se omiten. */
const TABLES = [
  'classrooms', 'students', 'guardians', 'student_guardians', 'school_settings',
  'attendance', 'presentation_controls', 'presentation_violations', 'notifications', 'alerts', 'attendance_closures',
  'student_absences', 'student_permissions', 'early_exits', 'authorized_pickups', 'school_calendar', 'level_schedules',
  'pension_payments',
] as const

const LAST_DOWNLOAD_KEY = 'tesla_last_backup_download'

type BackupData = Record<string, unknown[]>

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = filename; a.click()
  URL.revokeObjectURL(url)
}

function downloadJson(data: unknown, filename: string) {
  downloadBlob(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }), filename)
}

/** Un libro con una hoja por tabla; los objetos anidados se guardan como JSON en la celda. */
async function downloadExcel(data: BackupData, filename: string) {
  const XLSX = await import('xlsx')
  const book = XLSX.utils.book_new()
  for (const [table, rows] of Object.entries(data)) {
    const flat = rows.map((row) => Object.fromEntries(Object.entries(row as Record<string, unknown>).map(([k, v]) => [k, v !== null && typeof v === 'object' ? JSON.stringify(v) : v])))
    const sheet = flat.length ? XLSX.utils.json_to_sheet(flat) : XLSX.utils.aoa_to_sheet([['(sin registros)']])
    XLSX.utils.book_append_sheet(book, sheet, table.slice(0, 31))
  }
  XLSX.writeFile(book, filename)
}

function readLastDownload(): string | null {
  try { return localStorage.getItem(LAST_DOWNLOAD_KEY) } catch { return null }
}

function daysSince(iso: string | null) {
  if (!iso) return null
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)
}

function totalRows(counts: Record<string, number>) {
  return Object.values(counts).reduce((sum, n) => sum + (Number(n) || 0), 0)
}

export default function BackupCenter({ open, onClose, online, isAdmin }: Props) {
  const toast = useToast()
  const [loading, setLoading] = useState<string | null>(null)
  const [snapshots, setSnapshots] = useState<BackupSnapshotInfo[]>([])
  const [snapshotNote, setSnapshotNote] = useState('')
  const [lastDownload, setLastDownload] = useState<string | null>(() => readLastDownload())

  const loadSnapshots = useCallback(async () => {
    if (!isAdmin || !online) return
    setSnapshotNote('')
    try { setSnapshots(await listBackupSnapshots()) }
    catch (error) {
      reportError('BackupCenter', error)
      setSnapshotNote(error instanceof Error && error.message === PHASE15_MISSING ? PHASE15_MISSING : friendlyError(error, 'No se pudieron listar las copias automáticas.'))
    }
  }, [isAdmin, online])

  useEffect(() => { if (open) void loadSnapshots() }, [open, loadSnapshots])

  function rememberDownload() {
    const now = new Date().toISOString()
    try { localStorage.setItem(LAST_DOWNLOAD_KEY, now) } catch { /* sin almacenamiento: solo se pierde el recordatorio */ }
    setLastDownload(now)
  }

  async function fetchLiveData(): Promise<BackupData> {
    const data: BackupData = {}
    for (const table of TABLES) {
      // Por páginas: sin esto Supabase corta en 1000 filas y la copia saldría incompleta.
      const fetchTable = (orderBy: string | null) => fetchAllPages<unknown>((from, to) => {
        const query = supabase.from(table).select('*')
        return (orderBy ? query.order(orderBy) : query).range(from, to) as unknown as PromiseLike<{ data: unknown[] | null; error: unknown }>
      })
      try {
        data[table] = await fetchTable('id')
      } catch (error) {
        const code = (error as { code?: string } | null)?.code
        // Tabla sin columna "id" (p. ej. vínculos alumno-apoderado): se pide sin orden.
        if (code === '42703') { data[table] = await fetchTable(null); continue }
        // Tabla de una fase SQL que no se ejecutó: no hay nada que copiar.
        if (code === '42P01' || code === 'PGRST205' || knownErrorHint(error) === ERROR_HINTS.missingSql) continue
        throw error
      }
    }
    return data
  }

  async function exportLive(format: 'json' | 'excel') {
    if (!online) { toast.warning('Sin conexión', 'Necesitas Internet para descargar la copia.'); return }
    setLoading(`live-${format}`)
    try {
      const data = await fetchLiveData()
      const name = `tesla-copia-${toDateKey()}`
      if (format === 'json') downloadJson({ generatedAt: new Date().toISOString(), ...data }, `${name}.json`)
      else await downloadExcel(data, `${name}.xlsx`)
      rememberDownload()
      toast.success('Copia descargada', 'Guárdala fuera de este equipo (USB, Drive o correo).')
    } catch (error) {
      reportError('BackupCenter', error)
      toast.error('No se pudo generar la copia', friendlyError(error))
    } finally { setLoading(null) }
  }

  async function exportSnapshot(snapshot: BackupSnapshotInfo, format: 'json' | 'excel') {
    setLoading(`${snapshot.id}-${format}`)
    try {
      const data = await getBackupSnapshotData(snapshot.id)
      const name = `tesla-copia-${snapshot.takenAt.slice(0, 10)}-${snapshot.kind === 'AUTO' ? 'auto' : 'manual'}`
      if (format === 'json') downloadJson({ generatedAt: snapshot.takenAt, ...data }, `${name}.json`)
      else await downloadExcel(data, `${name}.xlsx`)
      rememberDownload()
    } catch (error) {
      reportError('BackupCenter', error)
      toast.error('No se pudo descargar la copia', friendlyError(error))
    } finally { setLoading(null) }
  }

  async function createSnapshot() {
    setLoading('create')
    try {
      await takeBackupSnapshot()
      toast.success('Copia creada en el servidor')
      await loadSnapshots()
    } catch (error) {
      reportError('BackupCenter', error)
      toast.error('No se pudo crear la copia', friendlyError(error))
    } finally { setLoading(null) }
  }

  async function exportLocalBackup() {
    const state = await exportOfflineState()
    downloadJson({ generatedAt: new Date().toISOString(), ...state }, `tesla-offline-${toDateKey()}.json`)
    toast.success('Estado offline exportado')
  }

  const downloadAge = daysSince(lastDownload)
  const latestAuto = snapshots.find((s) => s.kind === 'AUTO')
  const autoAge = daysSince(latestAuto?.takenAt ?? null)

  return <AnimatePresence>{open && (
    <motion.div data-screen-overlay className="fixed inset-0 z-[70] overflow-y-auto bg-slate-950/55 p-3 backdrop-blur-sm sm:p-6" onMouseDown={onClose} initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} transition={{duration:0.18}}>
    <motion.section data-screen className="mx-auto w-full max-w-2xl rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-slate-900" onMouseDown={(e)=>e.stopPropagation()} initial={{scale:0.94,opacity:0,y:12}} animate={{scale:1,opacity:1,y:0}} exit={{scale:0.96,opacity:0,y:8}} transition={{type:'spring',stiffness:380,damping:32}}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="flex items-center gap-2 text-2xl font-black"><DatabaseBackup size={23}/> Copias de seguridad</h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {downloadAge === null ? 'Este equipo nunca descargó una copia.' : downloadAge === 0 ? 'Última copia descargada en este equipo: hoy.' : `Última copia descargada en este equipo: hace ${downloadAge} día${downloadAge === 1 ? '' : 's'}.`}
          </p>
        </div>
        <Button variant="ghost" onClick={onClose} aria-label="Cerrar"><X size={20}/></Button>
      </div>

      <h3 className="mt-6 text-sm font-black">Descargar copia ahora (un clic)</h3>
      <div className="mt-2 grid gap-3 sm:grid-cols-2">
        <button onClick={()=>void exportLive('excel')} disabled={loading!==null||!online} className="rounded-2xl border border-slate-200 p-5 text-left hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:hover:bg-slate-800">
          <FileSpreadsheet size={22}/><p className="mt-3 font-black">{loading==='live-excel'?'Preparando...':'Excel'}</p><p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Una hoja por tabla. Fácil de abrir y revisar.</p>
        </button>
        <button onClick={()=>void exportLive('json')} disabled={loading!==null||!online} className="rounded-2xl border border-slate-200 p-5 text-left hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:hover:bg-slate-800">
          <FileJson size={22}/><p className="mt-3 font-black">{loading==='live-json'?'Preparando...':'JSON'}</p><p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Formato completo, útil para restaurar datos.</p>
        </button>
      </div>

      {isAdmin && (
        <>
          <div className="mt-6 flex items-center justify-between gap-2">
            <h3 className="flex items-center gap-2 text-sm font-black"><CalendarClock size={16}/> Copias automáticas en el servidor</h3>
            <div className="flex gap-1">
              <Button variant="ghost" className="min-h-9 px-2" onClick={()=>void loadSnapshots()} aria-label="Actualizar lista"><RefreshCw size={15}/></Button>
              <Button variant="outline" className="min-h-9 px-3 text-xs" disabled={loading!==null||!online||Boolean(snapshotNote)} onClick={()=>void createSnapshot()}><Plus className="mr-1" size={14}/> {loading==='create'?'Creando...':'Crear copia ahora'}</Button>
            </div>
          </div>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Se crea una cada día a la 1:00 a. m. y se guardan las últimas 7 (más las 5 últimas manuales). Protegen ante borrados o errores; para estar a salvo ante cualquier falla, descarga una de vez en cuando y guárdala fuera.</p>
          {snapshotNote ? (
            <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-300">{snapshotNote}</p>
          ) : snapshots.length === 0 ? (
            <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">Todavía no hay copias automáticas. La primera se creará esta noche, o pulsa "Crear copia ahora".</p>
          ) : (
            <>
              {autoAge !== null && autoAge > 1 && <p className="mt-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300">La última copia automática tiene {autoAge} días: la programación diaria podría estar detenida. Revisa la extensión pg_cron (ver phase15).</p>}
              <ul className="mt-3 space-y-2">
                {snapshots.map((snapshot) => (
                  <li key={snapshot.id} className="flex flex-col gap-2 rounded-xl border border-slate-200 p-3 dark:border-slate-700 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-sm font-bold">{new Date(snapshot.takenAt).toLocaleString('es-PE', { weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">{snapshot.kind === 'AUTO' ? 'Automática' : 'Manual'} · {totalRows(snapshot.rowCounts).toLocaleString('es-PE')} registros · {snapshot.rowCounts.students ?? 0} alumnos · {snapshot.rowCounts.attendance ?? 0} asistencias</p>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="outline" className="min-h-9 px-3 text-xs" disabled={loading!==null} onClick={()=>void exportSnapshot(snapshot,'excel')}><Download className="mr-1" size={14}/> Excel</Button>
                      <Button variant="outline" className="min-h-9 px-3 text-xs" disabled={loading!==null} onClick={()=>void exportSnapshot(snapshot,'json')}><Download className="mr-1" size={14}/> JSON</Button>
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      )}

      <button onClick={()=>void exportLocalBackup()} className="mt-6 flex w-full items-center gap-3 rounded-2xl border border-slate-200 p-4 text-left hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800">
        <HardDrive size={20} className="shrink-0"/>
        <span><span className="block text-sm font-black">Estado offline de este equipo</span><span className="block text-xs text-slate-500 dark:text-slate-400">Cola de cambios pendientes y conflictos. Útil si un celular no logra sincronizar.</span></span>
      </button>
    </motion.section>
    </motion.div>
  )}</AnimatePresence>
}
