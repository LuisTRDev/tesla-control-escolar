import { useEffect, useMemo, useState } from 'react'
import { BarChart3, CalendarDays, Download, FileSpreadsheet, FileText, RefreshCw, TriangleAlert, Users, X } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { getAdvancedReport, exportAdvancedReportExcel, exportAdvancedReportPdf, type AdvancedReport } from '@/services/reportService'
import type { Classroom } from '@/types'

type Props = {
  open: boolean
  onClose: () => void
  classrooms: Classroom[]
  refreshKey?: number
}

type Preset = 'TODAY' | 'WEEK' | 'MONTH' | 'CUSTOM'
type DetailTab = 'ATTENDANCE' | 'INCIDENTS' | 'NOTIFICATIONS'

function iso(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function presetRange(preset: Preset) {
  const now = new Date()
  if (preset === 'TODAY') return { from: iso(now), to: iso(now) }
  if (preset === 'WEEK') {
    const start = new Date(now)
    const day = (now.getDay() + 6) % 7
    start.setDate(now.getDate() - day)
    return { from: iso(start), to: iso(now) }
  }
  const start = new Date(now.getFullYear(), now.getMonth(), 1)
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0)
  return { from: iso(start), to: iso(end) }
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

  if (!open) return null

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

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/60 p-3 backdrop-blur-sm dark:bg-black/75 sm:p-6">
      <section className="mx-auto max-w-7xl overflow-hidden rounded-3xl border border-slate-200 bg-slate-50 shadow-2xl dark:border-slate-800 dark:bg-slate-950">
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
              <div className="mt-5 flex flex-wrap justify-end gap-2"><Button variant="outline" onClick={() => exportAdvancedReportPdf(report)}><FileText className="mr-2" size={17} />PDF</Button><Button variant="outline" onClick={() => exportAdvancedReportExcel(report)}><FileSpreadsheet className="mr-2" size={17} />Excel</Button></div>

              <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4 xl:grid-cols-7">
                {[
                  ['Alumnos', report.summary.totalStudents, ''], ['Ingresos', report.summary.totalEntries, ''], ['A tiempo', report.summary.onTime, 'text-emerald-600 dark:text-emerald-400'], ['Tardanzas', report.summary.late, 'text-amber-600 dark:text-amber-400'], ['Incidencias', report.summary.presentationIncidents, 'text-orange-600 dark:text-orange-400'], ['Notificaciones', report.summary.notifications, 'text-brand-navy dark:text-brand-gold'], ['Reincidentes', report.summary.repeatOffenders, 'text-rose-600 dark:text-rose-400'],
                ].map(([label, value, cls]) => <Card key={String(label)} className="p-4"><p className="text-xs text-slate-500 dark:text-slate-400">{label}</p><p className={`mt-1 text-2xl font-black ${cls}`}>{value}</p></Card>)}
              </div>

              <div className="mt-4 grid gap-4 lg:grid-cols-2">
                <Card className="p-5"><div className="flex items-center gap-2"><BarChart3 size={18} /><h3 className="font-black">Incumplimientos por tipo</h3></div><div className="mt-6 space-y-4">{report.violations.length === 0 ? <p className="text-sm text-slate-500">Sin incidencias en el periodo.</p> : report.violations.map((item) => <div key={item.type}><div className="mb-1.5 flex justify-between text-sm"><span>{item.label}</span><b>{item.total}</b></div><div className="h-3 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800"><div className="h-full rounded-full bg-amber-500" style={{ width: `${(item.total / maxViolation) * 100}%` }} /></div></div>)}</div></Card>
                <Card className="p-5"><div className="flex items-center gap-2"><Users size={18} /><h3 className="font-black">Top reincidencias</h3></div><div className="mt-4 space-y-2">{report.repeatOffenders.length === 0 ? <p className="text-sm text-slate-500">Sin reincidencias en el periodo.</p> : report.repeatOffenders.map((item, index) => <div key={item.studentId} className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-800 dark:bg-slate-900"><div><p className="text-sm font-black">{index + 1}. {item.studentName}</p><p className="text-xs text-slate-500">{classroomNames.get(item.classroomId) ?? 'Aula'}</p></div><span className="rounded-lg bg-rose-100 px-2.5 py-1 text-sm font-black text-rose-700 dark:bg-rose-950/50 dark:text-rose-300">{item.notificationCount}</span></div>)}</div></Card>
              </div>

              <Card className="mt-4 p-5"><div className="flex items-center gap-2"><CalendarDays size={18} /><h3 className="font-black">Evolución diaria</h3></div><p className="mt-1 text-xs text-slate-500">Verde: a tiempo · Ámbar: tardanzas · Rojo: incidencias.</p><div className="mt-6 overflow-x-auto"><div className="flex min-w-max items-end gap-3" style={{ height: 190 }}>{report.dailyTrend.map((item) => <div key={item.date} className="flex h-full w-14 flex-col justify-end"><div className="flex flex-1 items-end justify-center gap-1"><div title={`A tiempo: ${item.onTime}`} className="w-3 rounded-t bg-emerald-500" style={{ height: `${Math.max(item.onTime ? 4 : 0, (item.onTime / maxTrend) * 135)}px` }} /><div title={`Tardanzas: ${item.late}`} className="w-3 rounded-t bg-amber-500" style={{ height: `${Math.max(item.late ? 4 : 0, (item.late / maxTrend) * 135)}px` }} /><div title={`Incidencias: ${item.incidents}`} className="w-3 rounded-t bg-rose-500" style={{ height: `${Math.max(item.incidents ? 4 : 0, (item.incidents / maxTrend) * 135)}px` }} /></div><p className="mt-2 text-center text-[10px] text-slate-500">{prettyDate(item.date)}</p></div>)}</div></div></Card>

              <Card className="mt-4 overflow-hidden"><div className="border-b border-slate-200 p-4 dark:border-slate-800"><div className="flex flex-wrap gap-2">{([['ATTENDANCE', `Asistencia (${report.attendanceDetails.length})`], ['INCIDENTS', `Incidencias (${report.incidentDetails.length})`], ['NOTIFICATIONS', `Notificaciones (${report.notificationDetails.length})`]] as const).map(([id, label]) => <button key={id} onClick={() => setDetailTab(id)} className={`rounded-xl px-3 py-2 text-xs font-black ${detailTab === id ? 'bg-slate-950 text-white dark:bg-white dark:text-slate-950' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'}`}>{label}</button>)}</div></div><div className="max-h-[430px] overflow-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead className="sticky top-0 bg-slate-100 text-xs uppercase text-slate-500 dark:bg-slate-900"><tr><th className="px-4 py-3">Alumno</th><th className="px-4 py-3">Aula</th><th className="px-4 py-3">Fecha</th>{detailTab === 'ATTENDANCE' ? <><th className="px-4 py-3">Hora</th><th className="px-4 py-3">Estado</th></> : detailTab === 'INCIDENTS' ? <><th className="px-4 py-3">Incumplimientos</th><th className="px-4 py-3">Observación</th></> : <><th className="px-4 py-3">N°</th><th className="px-4 py-3">Tipo</th></>}</tr></thead><tbody className="divide-y divide-slate-100 dark:divide-slate-800">{detailTab === 'ATTENDANCE' && report.attendanceDetails.map((item, i) => <tr key={`${item.studentName}-${item.date}-${i}`}><td className="px-4 py-3 font-semibold">{item.studentName}</td><td className="px-4 py-3">{item.classroom}</td><td className="px-4 py-3">{item.date}</td><td className="px-4 py-3">{item.time}</td><td className="px-4 py-3">{item.status === 'LATE' ? 'Tardanza' : 'A tiempo'}</td></tr>)}{detailTab === 'INCIDENTS' && report.incidentDetails.map((item, i) => <tr key={`${item.studentName}-${item.date}-${i}`}><td className="px-4 py-3 font-semibold">{item.studentName}</td><td className="px-4 py-3">{item.classroom}</td><td className="px-4 py-3">{item.date}</td><td className="px-4 py-3">{item.violations}</td><td className="max-w-xs px-4 py-3">{item.observation || '—'}</td></tr>)}{detailTab === 'NOTIFICATIONS' && report.notificationDetails.map((item, i) => <tr key={`${item.studentName}-${item.date}-${i}`}><td className="px-4 py-3 font-semibold">{item.studentName}</td><td className="px-4 py-3">{item.classroom}</td><td className="px-4 py-3">{item.date}</td><td className="px-4 py-3 font-black">{item.notificationNumber}</td><td className="px-4 py-3">{item.notificationType}</td></tr>)}</tbody></table></div></Card>
            </>
          )}
        </div>
      </section>
    </div>
  )
}
