import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { BarChart3, CalendarDays, Check, Download, FileSpreadsheet, FileText, RefreshCw, TriangleAlert, Users, X } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { getAdvancedReport, exportAdvancedReportExcel, exportAdvancedReportPdf, type AdvancedReport, type ReportExportFilters } from '@/services/reportService'
import { addDaysToKey, monthRangeKeys, toDateKey } from '@/lib/dates'
import type { Classroom } from '@/types'

type Props = {
  open: boolean
  onClose: () => void
  classrooms: Classroom[]
  refreshKey?: number
}

type Preset = 'TODAY' | 'WEEK' | 'MONTH' | 'CUSTOM'
type DetailTab = 'ATTENDANCE' | 'INCIDENTS' | 'NOTIFICATIONS'

function presetRange(preset: Preset) {
  const now = new Date()
  const today = toDateKey(now)
  if (preset === 'TODAY') return { from: today, to: today }
  if (preset === 'WEEK') {
    const daysSinceMonday = (now.getDay() + 6) % 7
    return { from: addDaysToKey(today, -daysSinceMonday), to: today }
  }
  return monthRangeKeys(now)
}

function prettyDate(value: string) {
  return new Date(`${value}T12:00:00`).toLocaleDateString('es-PE', { day: '2-digit', month: 'short' })
}

export default function AdvancedReports({ open, onClose, classrooms, refreshKey = 0 }: Props) {
  const initial = presetRange('MONTH')
  const [preset, setPreset] = useState<Preset>('MONTH')
  const [from, setFrom] = useState(initial.from)
  const [to, setTo] = useState(initial.to)
  const [classroomId, setClassroomId] = useState('ALL')
  const [report, setReport] = useState<AdvancedReport | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [detailTab, setDetailTab] = useState<DetailTab>('ATTENDANCE')
  const [attendanceStatusFilter, setAttendanceStatusFilter] = useState<'ALL' | 'ON_TIME' | 'LATE'>('ALL')
  const [activeMetric, setActiveMetric] = useState<string | null>(null)
  const [exportOpen, setExportOpen] = useState(false)
  const [exportFilters, setExportFilters] = useState<ReportExportFilters>({
    late: true,
    onTime: false,
    incidents: true,
    notifications: true,
    repeatOffenders: true,
  })
  const detailsRef = useRef<HTMLDivElement | null>(null)
  const repeatOffendersRef = useRef<HTMLDivElement | null>(null)

  function goToDetail(metric: string, tab: DetailTab, statusFilter: 'ALL' | 'ON_TIME' | 'LATE' = 'ALL') {
    setActiveMetric(metric)
    setDetailTab(tab)
    setAttendanceStatusFilter(statusFilter)
    requestAnimationFrame(() => detailsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
  }

  function goToRepeatOffenders() {
    setActiveMetric('REPEAT')
    requestAnimationFrame(() => repeatOffendersRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
  }

  async function loadReport(silent = false) {
    if (!from || !to || from > to) {
      setError('Selecciona un rango de fechas válido.')
      return
    }
    if (!silent) setLoading(true)
    setError('')
    try {
      setReport(await getAdvancedReport(from, to, classroomId === 'ALL' ? null : classroomId))
    } catch (err) {
      console.error(err)
      setError(err instanceof Error ? err.message : 'No se pudo generar el reporte.')
    } finally {
      if (!silent) setLoading(false)
    }
  }

  useEffect(() => {
    if (open) void loadReport()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  useEffect(() => {
    if (open && refreshKey > 0) void loadReport(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey])

  const classroomNames = useMemo(
    () => new Map(classrooms.map((item) => [item.id, `${item.grade} ${item.section} · ${item.level}`])),
    [classrooms],
  )

  function selectPreset(next: Preset) {
    setPreset(next)
    if (next !== 'CUSTOM') {
      const range = presetRange(next)
      setFrom(range.from)
      setTo(range.to)
    }
  }

  const maxViolation = Math.max(1, ...(report?.violations.map((item) => item.total) ?? [1]))
  const maxTrend = Math.max(1, ...(report?.dailyTrend.flatMap((item) => [item.onTime, item.late, item.incidents]) ?? [1]))
  const selectedExportCount = Object.values(exportFilters).filter(Boolean).length

  function toggleExportFilter(key: keyof ReportExportFilters) {
    setExportFilters((current) => ({ ...current, [key]: !current[key] }))
  }

  function selectAllExportFilters() {
    setExportFilters({ late: true, onTime: true, incidents: true, notifications: true, repeatOffenders: true })
  }

  function clearExportFilters() {
    setExportFilters({ late: false, onTime: false, incidents: false, notifications: false, repeatOffenders: false })
  }

  return (
    <AnimatePresence>{open && (
    <motion.div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/60 p-3 backdrop-blur-sm dark:bg-black/75 sm:p-6" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} transition={{duration:0.18}}>
      <motion.section className="mx-auto max-w-7xl overflow-hidden rounded-3xl border border-slate-200 bg-slate-50 shadow-2xl dark:border-slate-800 dark:bg-slate-950" initial={{scale:0.96,opacity:0,y:12}} animate={{scale:1,opacity:1,y:0}} exit={{scale:0.97,opacity:0,y:8}} transition={{type:'spring',stiffness:380,damping:32}}>
        <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 px-5 py-4 backdrop-blur dark:border-slate-800 dark:bg-slate-900/95 sm:px-7">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <p className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.18em] text-slate-400"><BarChart3 size={15} /> Fase 5.3</p>
              <h2 className="mt-1 text-2xl font-black">Reportes avanzados</h2>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Asistencia, incumplimientos, notificaciones y reincidencias desde PostgreSQL.</p>
            </div>
            <Button variant="ghost" onClick={onClose} className="self-end xl:self-auto"><X size={20} /></Button>
          </div>
        </header>

        <div className="p-5 sm:p-7">
          <Card className="p-4 sm:p-5">
            <div className="flex flex-wrap gap-2">
              {([['TODAY', 'Hoy'], ['WEEK', 'Esta semana'], ['MONTH', 'Este mes'], ['CUSTOM', 'Personalizado']] as const).map(([id, label]) => (
                <button key={id} onClick={() => selectPreset(id)} className={`rounded-xl px-3 py-2 text-xs font-black transition ${preset === id ? 'bg-slate-950 text-white dark:bg-white dark:text-slate-950' : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'}`}>{label}</button>
              ))}
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-[180px_180px_260px_auto] xl:items-end">
              <label className="block"><span className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-500">Desde</span><input type="date" value={from} onChange={(e) => { setPreset('CUSTOM'); setFrom(e.target.value) }} className="h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm font-bold outline-none dark:border-slate-700 dark:bg-slate-950" /></label>
              <label className="block"><span className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-500">Hasta</span><input type="date" value={to} onChange={(e) => { setPreset('CUSTOM'); setTo(e.target.value) }} className="h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm font-bold outline-none dark:border-slate-700 dark:bg-slate-950" /></label>
              <label className="block"><span className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-500">Aula</span><select value={classroomId} onChange={(e) => setClassroomId(e.target.value)} className="h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm font-bold outline-none dark:border-slate-700 dark:bg-slate-950"><option value="ALL">Todas las aulas</option>{classrooms.map((item) => <option key={item.id} value={item.id}>{item.grade} {item.section} · {item.level}</option>)}</select></label>
              <Button onClick={() => void loadReport()} disabled={loading} className="h-11"><RefreshCw className={`mr-2 ${loading ? 'animate-spin' : ''}`} size={17} />{loading ? 'Generando...' : 'Aplicar filtros'}</Button>
            </div>
          </Card>

          {error && <div className="mt-4 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300"><TriangleAlert size={18} className="mt-0.5 shrink-0" />{error}</div>}

          {report && (
            <>
              <div className="mt-5 flex flex-wrap justify-end gap-2"><Button variant="outline" onClick={() => setExportOpen(true)}><Download className="mr-2" size={17} />Configurar descarga</Button></div>

              <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4 xl:grid-cols-7">
                <Card className="p-4"><p className="text-xs text-slate-500 dark:text-slate-400">Alumnos</p><p className="mt-1 text-2xl font-black">{report.summary.totalStudents}</p></Card>
                <button type="button" onClick={() => goToDetail('ENTRIES', 'ATTENDANCE', 'ALL')} className="text-left">
                  <Card className={`p-4 transition-colors hover:border-brand-gold ${activeMetric === 'ENTRIES' ? 'border-brand-gold bg-brand-gold/5' : ''}`}><p className="text-xs text-slate-500 dark:text-slate-400">Ingresos</p><p className="mt-1 text-2xl font-black">{report.summary.totalEntries}</p></Card>
                </button>
                <button type="button" onClick={() => goToDetail('ON_TIME', 'ATTENDANCE', 'ON_TIME')} className="text-left">
                  <Card className={`p-4 transition-colors hover:border-emerald-400 ${activeMetric === 'ON_TIME' ? 'border-emerald-400 bg-emerald-50 dark:bg-emerald-950/20' : ''}`}><p className="text-xs text-slate-500 dark:text-slate-400">A tiempo</p><p className="mt-1 text-2xl font-black text-emerald-600 dark:text-emerald-400">{report.summary.onTime}</p></Card>
                </button>
                <button type="button" onClick={() => goToDetail('LATE', 'ATTENDANCE', 'LATE')} className="text-left">
                  <Card className={`p-4 transition-colors hover:border-amber-400 ${activeMetric === 'LATE' ? 'border-amber-400 bg-amber-50 dark:bg-amber-950/20' : ''}`}><p className="text-xs text-slate-500 dark:text-slate-400">Tardanzas</p><p className="mt-1 text-2xl font-black text-amber-600 dark:text-amber-400">{report.summary.late}</p></Card>
                </button>
                <button type="button" onClick={() => goToDetail('INCIDENTS', 'INCIDENTS')} className="text-left">
                  <Card className={`p-4 transition-colors hover:border-orange-400 ${activeMetric === 'INCIDENTS' ? 'border-orange-400 bg-orange-50 dark:bg-orange-950/20' : ''}`}><p className="text-xs text-slate-500 dark:text-slate-400">Incidencias</p><p className="mt-1 text-2xl font-black text-orange-600 dark:text-orange-400">{report.summary.presentationIncidents}</p></Card>
                </button>
                <button type="button" onClick={() => goToDetail('NOTIFICATIONS', 'NOTIFICATIONS')} className="text-left">
                  <Card className={`p-4 transition-colors hover:border-brand-gold ${activeMetric === 'NOTIFICATIONS' ? 'border-brand-gold bg-brand-gold/5' : ''}`}><p className="text-xs text-slate-500 dark:text-slate-400">Notificaciones</p><p className="mt-1 text-2xl font-black text-brand-navy dark:text-brand-gold">{report.summary.notifications}</p></Card>
                </button>
                <button type="button" onClick={goToRepeatOffenders} className="text-left">
                  <Card className={`p-4 transition-colors hover:border-rose-400 ${activeMetric === 'REPEAT' ? 'border-rose-400 bg-rose-50 dark:bg-rose-950/20' : ''}`}><p className="text-xs text-slate-500 dark:text-slate-400">Reincidentes</p><p className="mt-1 text-2xl font-black text-rose-600 dark:text-rose-400">{report.summary.repeatOffenders}</p></Card>
                </button>
              </div>

              <div className="mt-4 grid gap-4 lg:grid-cols-2">
                <Card className="p-5"><div className="flex items-center gap-2"><BarChart3 size={18} /><h3 className="font-black">Incumplimientos por tipo</h3></div><div className="mt-6 space-y-4">{report.violations.length === 0 ? <p className="text-sm text-slate-500">Sin incidencias en el periodo.</p> : report.violations.map((item) => <div key={item.type}><div className="mb-1.5 flex justify-between text-sm"><span>{item.label}</span><b>{item.total}</b></div><div className="h-3 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800"><div className="h-full rounded-full bg-amber-500" style={{ width: `${(item.total / maxViolation) * 100}%` }} /></div></div>)}</div></Card>
                <Card ref={repeatOffendersRef} className={`p-5 transition-shadow ${activeMetric === 'REPEAT' ? 'ring-2 ring-rose-300' : ''}`}><div className="flex items-center gap-2"><Users size={18} /><h3 className="font-black">Top reincidencias</h3></div><div className="mt-4 space-y-2">{report.repeatOffenders.length === 0 ? <p className="text-sm text-slate-500">Sin reincidencias en el periodo.</p> : report.repeatOffenders.map((item, index) => <div key={item.studentId} className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-800 dark:bg-slate-900"><div><p className="text-sm font-black">{index + 1}. {item.studentName}</p><p className="text-xs text-slate-500">{classroomNames.get(item.classroomId) ?? 'Aula'}</p></div><span className="rounded-lg bg-rose-100 px-2.5 py-1 text-sm font-black text-rose-700 dark:bg-rose-950/50 dark:text-rose-300">{item.notificationCount}</span></div>)}</div></Card>
              </div>

              <Card className="mt-4 p-5"><div className="flex items-center gap-2"><CalendarDays size={18} /><h3 className="font-black">Evolución diaria</h3></div><p className="mt-1 text-xs text-slate-500">Verde: a tiempo · Ámbar: tardanzas · Rojo: incidencias.</p><div className="mt-6 overflow-x-auto"><div className="flex min-w-max items-end gap-3" style={{ height: 190 }}>{report.dailyTrend.map((item) => <div key={item.date} className="flex h-full w-14 flex-col justify-end"><div className="flex flex-1 items-end justify-center gap-1"><div title={`A tiempo: ${item.onTime}`} className="w-3 rounded-t bg-emerald-500" style={{ height: `${Math.max(item.onTime ? 4 : 0, (item.onTime / maxTrend) * 135)}px` }} /><div title={`Tardanzas: ${item.late}`} className="w-3 rounded-t bg-amber-500" style={{ height: `${Math.max(item.late ? 4 : 0, (item.late / maxTrend) * 135)}px` }} /><div title={`Incidencias: ${item.incidents}`} className="w-3 rounded-t bg-rose-500" style={{ height: `${Math.max(item.incidents ? 4 : 0, (item.incidents / maxTrend) * 135)}px` }} /></div><p className="mt-2 text-center text-[10px] text-slate-500">{prettyDate(item.date)}</p></div>)}</div></div></Card>

              <Card ref={detailsRef} className="mt-4 overflow-hidden"><div className="border-b border-slate-200 p-4 dark:border-slate-800"><div className="flex flex-wrap items-center gap-2">{([['ATTENDANCE', `Asistencia (${report.attendanceDetails.length})`], ['INCIDENTS', `Incidencias (${report.incidentDetails.length})`], ['NOTIFICATIONS', `Notificaciones (${report.notificationDetails.length})`]] as const).map(([id, label]) => <button key={id} onClick={() => { setDetailTab(id); setActiveMetric(null) }} className={`rounded-xl px-3 py-2 text-xs font-black ${detailTab === id ? 'bg-slate-950 text-white dark:bg-white dark:text-slate-950' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'}`}>{label}</button>)}{detailTab === 'ATTENDANCE' && attendanceStatusFilter !== 'ALL' && <button onClick={() => setAttendanceStatusFilter('ALL')} className="rounded-xl bg-brand-gold/15 px-3 py-2 text-xs font-black text-brand-navy dark:text-brand-gold">Filtrando: {attendanceStatusFilter === 'ON_TIME' ? 'A tiempo' : 'Tardanzas'} ✕</button>}</div></div><div className="max-h-[430px] overflow-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead className="sticky top-0 bg-slate-100 text-xs uppercase text-slate-500 dark:bg-slate-900"><tr><th className="px-4 py-3">Alumno</th><th className="px-4 py-3">Aula</th><th className="px-4 py-3">Fecha</th>{detailTab === 'ATTENDANCE' ? <><th className="px-4 py-3">Hora</th><th className="px-4 py-3">Estado</th></> : detailTab === 'INCIDENTS' ? <><th className="px-4 py-3">Incumplimientos</th><th className="px-4 py-3">Observación</th></> : <><th className="px-4 py-3">N°</th><th className="px-4 py-3">Tipo</th></>}</tr></thead><tbody className="divide-y divide-slate-100 dark:divide-slate-800">{detailTab === 'ATTENDANCE' && report.attendanceDetails.filter((item) => attendanceStatusFilter === 'ALL' || item.status === attendanceStatusFilter).map((item, i) => <tr key={`${item.studentName}-${item.date}-${i}`}><td className="px-4 py-3 font-semibold">{item.studentName}</td><td className="px-4 py-3">{item.classroom}</td><td className="px-4 py-3">{item.date}</td><td className="px-4 py-3">{item.time}</td><td className="px-4 py-3">{item.status === 'LATE' ? 'Tardanza' : 'A tiempo'}</td></tr>)}{detailTab === 'INCIDENTS' && report.incidentDetails.map((item, i) => <tr key={`${item.studentName}-${item.date}-${i}`}><td className="px-4 py-3 font-semibold">{item.studentName}</td><td className="px-4 py-3">{item.classroom}</td><td className="px-4 py-3">{item.date}</td><td className="px-4 py-3">{item.violations}</td><td className="max-w-xs px-4 py-3">{item.observation || '—'}</td></tr>)}{detailTab === 'NOTIFICATIONS' && report.notificationDetails.map((item, i) => <tr key={`${item.studentName}-${item.date}-${i}`}><td className="px-4 py-3 font-semibold">{item.studentName}</td><td className="px-4 py-3">{item.classroom}</td><td className="px-4 py-3">{item.date}</td><td className="px-4 py-3 font-black">{item.notificationNumber}</td><td className="px-4 py-3">{item.notificationType}</td></tr>)}</tbody></table></div></Card>

              <AnimatePresence>
                {exportOpen && (
                  <motion.div
                    className="fixed inset-0 z-[80] grid place-items-center bg-slate-950/60 p-4 backdrop-blur-sm"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                  >
                    <motion.div
                      className="w-full max-w-lg rounded-3xl border border-slate-200 bg-white p-5 shadow-2xl dark:border-slate-800 dark:bg-slate-900"
                      initial={{ opacity: 0, y: 12, scale: 0.98 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 8, scale: 0.98 }}
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">Exportación personalizada</p>
                          <h3 className="mt-1 text-xl font-black">¿Qué quieres descargar?</h3>
                          <p className="mt-1 text-sm text-slate-500">Combina uno o varios tipos de información del periodo y aula seleccionados.</p>
                        </div>
                        <Button variant="ghost" onClick={() => setExportOpen(false)} aria-label="Cerrar"><X size={20} /></Button>
                      </div>

                      <div className="mt-5 flex flex-wrap gap-2">
                        <button type="button" onClick={selectAllExportFilters} className="rounded-xl bg-slate-100 px-3 py-2 text-xs font-black dark:bg-slate-800">Seleccionar todo</button>
                        <button type="button" onClick={clearExportFilters} className="rounded-xl bg-slate-100 px-3 py-2 text-xs font-black text-slate-600 dark:bg-slate-800 dark:text-slate-300">Limpiar</button>
                        <span className="ml-auto self-center text-xs font-bold text-slate-400">{selectedExportCount} seleccionados</span>
                      </div>

                      <div className="mt-4 space-y-2">
                        {([
                          ['late', 'Alumnos con tardanza', 'Solo ingresos marcados como tardanza'],
                          ['onTime', 'Alumnos a tiempo', 'Solo ingresos dentro del horario'],
                          ['incidents', 'Incidencias', 'Incumplimientos de presentación y conducta'],
                          ['notifications', 'Notificaciones', 'Notificaciones generadas durante el periodo'],
                          ['repeatOffenders', 'Reincidencias', 'Alumnos con mayor recurrencia'],
                        ] as const).map(([key, label, description]) => (
                          <button
                            key={key}
                            type="button"
                            onClick={() => toggleExportFilter(key)}
                            className={`flex w-full items-center gap-3 rounded-2xl border p-3 text-left transition ${exportFilters[key] ? 'border-brand-gold bg-brand-gold/5' : 'border-slate-200 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/60'}`}
                          >
                            <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg border ${exportFilters[key] ? 'border-brand-gold bg-brand-gold text-brand-navy' : 'border-slate-300 dark:border-slate-700'}`}>
                              {exportFilters[key] && <Check size={16} />}
                            </span>
                            <span className="min-w-0"><span className="block text-sm font-black">{label}</span><span className="block text-xs text-slate-500">{description}</span></span>
                          </button>
                        ))}
                      </div>

                      <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-end">
                        <Button variant="outline" onClick={() => setExportOpen(false)}>Cancelar</Button>
                        <Button disabled={selectedExportCount === 0} onClick={() => { exportAdvancedReportPdf(report, exportFilters); setExportOpen(false) }}><FileText className="mr-2" size={16} />PDF</Button>
                        <Button disabled={selectedExportCount === 0} onClick={() => { exportAdvancedReportExcel(report, exportFilters); setExportOpen(false) }}><FileSpreadsheet className="mr-2" size={16} />Excel</Button>
                      </div>
                    </motion.div>
                  </motion.div>
                )}
              </AnimatePresence>
            </>
          )}
        </div>
      </motion.section>
    </motion.div>
    )}</AnimatePresence>
  )
}
