import type { ReactNode } from 'react'
import { useEffect, useState } from 'react'
import { Bell, CalendarCheck2, CheckCircle2, Clock3, Sparkles, TriangleAlert, Users, X } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { closeClassroomAttendance, getDailySchoolSummary, getSmartInsights, isAttendanceClosed, type DailySummary as Summary, type SmartInsight } from '@/services/phase6Service'
import type { Classroom } from '@/types'

type Props = {
  open: boolean
  onClose: () => void
  classrooms: Classroom[]
  currentClassroom: Classroom
  today: string
  onOpenAlerts: () => void
  refreshKey?: number
}

function metric(label: string, value: number, icon: ReactNode, className = '') {
  return <Card className="p-4"><div className="flex items-center justify-between"><p className="text-xs text-slate-500 dark:text-slate-400">{label}</p>{icon}</div><p className={`mt-2 text-2xl font-black ${className}`}>{value}</p></Card>
}

export default function DailySummary({ open, onClose, classrooms, currentClassroom, today, onOpenAlerts, refreshKey = 0 }: Props) {
  const [classroomId, setClassroomId] = useState<string | 'ALL'>(currentClassroom.id)
  const [summary, setSummary] = useState<Summary | null>(null)
  const [insights, setInsights] = useState<SmartInsight[]>([])
  const [closed, setClosed] = useState(false)
  const [loading, setLoading] = useState(false)
  const [closing, setClosing] = useState(false)
  const [error, setError] = useState('')

  async function load(silent = false) {
    if (!silent) setLoading(true); setError('')
    try {
      const selected = classroomId === 'ALL' ? null : classroomId
      const [summaryData, insightData, closure] = await Promise.all([
        getDailySchoolSummary(today, selected),
        getSmartInsights(selected),
        selected ? isAttendanceClosed(selected, today) : Promise.resolve(false),
      ])
      setSummary(summaryData); setInsights(insightData); setClosed(closure)
    } catch (err) {
      console.error(err); setError(err instanceof Error ? err.message : 'No se pudo generar el resumen diario.')
    } finally { if (!silent) setLoading(false) }
  }

  useEffect(() => { if (open) void load() }, [open, classroomId, today])
  useEffect(() => { if (open && refreshKey > 0) void load(true) }, [refreshKey])
  if (!open) return null

  async function closeAttendance() {
    if (classroomId === 'ALL' || closed) return
    const classroom = classrooms.find((item) => item.id === classroomId)
    if (!window.confirm(`¿Cerrar la asistencia de ${classroom?.grade ?? ''} ${classroom?.section ?? ''}? Los alumnos sin ingreso quedarán registrados como alertas de ausencia.`)) return
    setClosing(true); setError('')
    try { await closeClassroomAttendance(classroomId, today); await load() }
    catch (err) { console.error(err); setError(err instanceof Error ? err.message : 'No se pudo cerrar la asistencia.') }
    finally { setClosing(false) }
  }

  const presentPct = summary?.totalStudents ? Math.round((summary.present / summary.totalStudents) * 100) : 0

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/55 p-3 backdrop-blur-sm dark:bg-black/70 sm:p-6">
      <section className="mx-auto max-w-6xl overflow-hidden rounded-3xl border border-slate-200 bg-slate-50 shadow-2xl dark:border-slate-800 dark:bg-slate-950">
        <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 px-5 py-4 backdrop-blur dark:border-slate-800 dark:bg-slate-900/95 sm:px-7">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div><p className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.18em] text-blue-600 dark:text-blue-400"><Sparkles size={15}/> Automatización diaria</p><h2 className="mt-1 text-2xl font-black">Resumen y cierre de asistencia</h2><p className="mt-1 text-sm text-slate-500">{new Date(today + 'T12:00:00').toLocaleDateString('es-PE', { weekday:'long', day:'2-digit', month:'long', year:'numeric' })}</p></div>
            <div className="flex flex-wrap items-end gap-2">
              <label className="block min-w-60"><span className="mb-1.5 block text-[10px] font-black uppercase tracking-wider text-slate-400">Alcance</span><select value={classroomId} onChange={(e)=>setClassroomId(e.target.value)} className="h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm font-bold dark:border-slate-700 dark:bg-slate-950"><option value="ALL">Todo el colegio</option>{classrooms.map((item)=><option key={item.id} value={item.id}>{item.grade} {item.section} · {item.level}</option>)}</select></label>
              <Button variant="ghost" className="h-11 px-3" onClick={onClose}><X size={20}/></Button>
            </div>
          </div>
        </header>
        <div className="p-5 sm:p-7">
          {error && <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300">{error}</div>}
          {loading && <div className="mb-4 rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900">Calculando resumen...</div>}
          {summary && <>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              {metric('Alumnos', summary.totalStudents, <Users size={17} className="text-slate-400"/>)}
              {metric('Presentes', summary.present, <CheckCircle2 size={17} className="text-emerald-500"/>, 'text-emerald-700 dark:text-emerald-400')}
              {metric('Tardanzas', summary.late, <Clock3 size={17} className="text-amber-500"/>, 'text-amber-700 dark:text-amber-400')}
              {metric(closed ? 'Ausencias confirmadas' : 'Sin ingreso', summary.absent, <TriangleAlert size={17} className="text-violet-500"/>, 'text-violet-700 dark:text-violet-400')}
              {metric('A tiempo', summary.onTime, <CheckCircle2 size={17} className="text-emerald-500"/>)}
              {metric('Incidencias', summary.incidents, <TriangleAlert size={17} className="text-amber-500"/>)}
              {metric('Notificaciones', summary.notifications, <CalendarCheck2 size={17} className="text-blue-500"/>)}
              {metric('Alertas abiertas', summary.openAlerts, <Bell size={17} className="text-red-500"/>, summary.openAlerts ? 'text-red-600 dark:text-red-400' : '')}
            </div>

            <div className="mt-5 grid gap-4 lg:grid-cols-[.9fr_1.1fr]">
              <Card className="p-5">
                <p className="text-xs font-black uppercase tracking-wider text-slate-400">Estado de jornada</p>
                <div className="mt-4 flex items-end justify-between gap-4"><div><p className="text-4xl font-black">{presentPct}%</p><p className="mt-1 text-sm text-slate-500">asistencia registrada</p></div><span className={`rounded-xl px-3 py-2 text-sm font-black ${closed ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300' : 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300'}`}>{closed ? 'Asistencia cerrada' : 'En curso'}</span></div>
                <div className="mt-4 h-3 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800"><div className="h-full rounded-full bg-emerald-500" style={{width:`${Math.min(100,presentPct)}%`}}/></div>
                {classroomId !== 'ALL' && <Button className="mt-5 w-full" disabled={closed || closing} onClick={() => void closeAttendance()}><CalendarCheck2 className="mr-2" size={18}/>{closed ? 'Asistencia ya cerrada' : closing ? 'Cerrando...' : 'Cerrar asistencia del aula'}</Button>}
                {classroomId === 'ALL' && <p className="mt-4 rounded-xl bg-slate-100 p-3 text-xs text-slate-500 dark:bg-slate-800">Selecciona un aula concreta para cerrar su asistencia y generar alertas de ausencia.</p>}
              </Card>

              <Card className="p-5">
                <div className="flex items-center justify-between"><div><p className="text-xs font-black uppercase tracking-wider text-slate-400">Análisis automático</p><h3 className="mt-1 font-black">Qué requiere atención</h3></div><Sparkles className="text-blue-500" size={22}/></div>
                <div className="mt-4 space-y-3">{insights.map((item)=><div key={item.id} className={`rounded-xl border p-4 ${item.tone==='warning'?'border-amber-200 bg-amber-50 dark:border-amber-900/60 dark:bg-amber-950/30':item.tone==='positive'?'border-emerald-200 bg-emerald-50 dark:border-emerald-900/60 dark:bg-emerald-950/30':'border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-900'}`}><div className="flex items-start justify-between gap-3"><div><p className="font-black">{item.title}</p><p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{item.detail}</p></div>{item.value && <span className="text-lg font-black">{item.value}</span>}</div></div>)}</div>
                {summary.openAlerts > 0 && <Button variant="outline" className="mt-4 w-full" onClick={onOpenAlerts}><Bell className="mr-2" size={17}/> Revisar alertas</Button>}
              </Card>
            </div>
          </>}
        </div>
      </section>
    </div>
  )
}
