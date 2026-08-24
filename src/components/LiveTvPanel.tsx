import { useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  Activity, AlertTriangle, Clock3, Expand, LogIn, Minimize, ShieldAlert,
  TrendingUp, Users, Wifi, WifiOff, X,
} from 'lucide-react'
import type { AttendanceRecord, Classroom, PresentationRecord, Student } from '@/types'

type Props = {
  open: boolean
  onClose: () => void
  students: Student[]
  classrooms: Classroom[]
  attendanceRecords: AttendanceRecord[]
  presentationRecords: PresentationRecord[]
  today: string
  realtimeConnected: boolean
}

type IncidentEvent = {
  key: string
  studentId: string
  time: string
  labels: string[]
  severity: 'late' | 'presentation' | 'conduct'
}

const pad = (value: number) => String(value).padStart(2, '0')
const formatClock = (date: Date) => `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
const formatDate = (date: Date) => date.toLocaleDateString('es-PE', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })

function presentationLabels(record: PresentationRecord, attendanceLate: boolean) {
  const labels: string[] = []
  if (record.hairstyleViolation) labels.push('Peinado')
  if (record.uniformUsageViolation) labels.push('Uniforme incompleto')
  if (record.nonInstitutionalGarment) labels.push('Prenda no correspondiente')
  if (record.lateEntryViolation && !attendanceLate) labels.push('Tardanza')
  if (record.inappropriateConductViolation) labels.push('Conducta inapropiada')
  return labels
}

function incidenceCount(record: PresentationRecord, attendanceLate: boolean) {
  return presentationLabels(record, attendanceLate).length
}

export default function LiveTvPanel({
  open,
  onClose,
  students,
  classrooms,
  attendanceRecords,
  presentationRecords,
  today,
  realtimeConnected,
}: Props) {
  const [now, setNow] = useState(() => new Date())
  const [fullscreen, setFullscreen] = useState(Boolean(document.fullscreenElement))

  useEffect(() => {
    if (!open) return
    const timer = window.setInterval(() => setNow(new Date()), 1000)
    const handleFullscreen = () => setFullscreen(Boolean(document.fullscreenElement))
    document.addEventListener('fullscreenchange', handleFullscreen)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener('fullscreenchange', handleFullscreen)
    }
  }, [open])

  const data = useMemo(() => {
    const todayAttendance = attendanceRecords.filter((record) => record.date === today)
    const todayPresentation = presentationRecords.filter((record) => record.date === today && record.status === 'NON_COMPLIANT')
    const attendanceByStudent = new Map(todayAttendance.map((record) => [record.studentId, record]))
    const studentById = new Map(students.map((student) => [student.id, student]))
    const classroomById = new Map(classrooms.map((classroom) => [classroom.id, classroom]))

    const incidents: IncidentEvent[] = []

    for (const attendance of todayAttendance) {
      if (attendance.status !== 'LATE') continue
      incidents.push({
        key: `late-${attendance.id ?? attendance.studentId}`,
        studentId: attendance.studentId,
        time: attendance.time,
        labels: ['Tardanza'],
        severity: 'late',
      })
    }

    for (const record of todayPresentation) {
      const attendanceLate = attendanceByStudent.get(record.studentId)?.status === 'LATE'
      const labels = presentationLabels(record, attendanceLate)
      if (labels.length === 0) continue
      incidents.push({
        key: `presentation-${record.id ?? `${record.studentId}-${record.checkedAt}`}`,
        studentId: record.studentId,
        time: record.checkedAt || '00:00',
        labels,
        severity: record.inappropriateConductViolation ? 'conduct' : 'presentation',
      })
    }

    incidents.sort((a, b) => b.time.localeCompare(a.time))

    const typeCounts = new Map<string, number>()
    const studentCounts = new Map<string, number>()
    let totalIncidents = 0

    for (const event of incidents) {
      for (const label of event.labels) {
        typeCounts.set(label, (typeCounts.get(label) ?? 0) + 1)
        totalIncidents += 1
      }
      studentCounts.set(event.studentId, (studentCounts.get(event.studentId) ?? 0) + event.labels.length)
    }

    const topTypes = [...typeCounts.entries()]
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
      .slice(0, 5)

    const topStudents = [...studentCounts.entries()]
      .map(([studentId, count]) => ({ student: studentById.get(studentId), count }))
      .filter((item): item is { student: Student; count: number } => Boolean(item.student))
      .sort((a, b) => b.count - a.count || a.student.lastName.localeCompare(b.student.lastName))
      .slice(0, 5)

    const recentEntries = [...todayAttendance]
      .sort((a, b) => b.time.localeCompare(a.time))
      .slice(0, 7)
      .map((record) => ({ record, student: studentById.get(record.studentId) }))
      .filter((item): item is { record: AttendanceRecord; student: Student } => Boolean(item.student))

    const enrichedIncidents = incidents.slice(0, 10).map((event) => {
      const student = studentById.get(event.studentId)
      const classroom = student ? classroomById.get(student.classroomId) : undefined
      return { ...event, student, classroom }
    }).filter((item): item is IncidentEvent & { student: Student; classroom: Classroom | undefined } => Boolean(item.student))

    const onTime = todayAttendance.filter((record) => record.status === 'ON_TIME').length
    const late = todayAttendance.filter((record) => record.status === 'LATE').length
    const enteredStudentIds = new Set(todayAttendance.map((record) => record.studentId))

    return {
      entered: enteredStudentIds.size,
      onTime,
      late,
      pending: Math.max(0, students.length - enteredStudentIds.size),
      totalIncidents,
      recentEntries,
      enrichedIncidents,
      topTypes,
      topStudents,
      classroomById,
    }
  }, [attendanceRecords, classrooms, presentationRecords, students, today])

  if (!open) return null

  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen()
      else await document.documentElement.requestFullscreen()
    } catch {
      // Algunos televisores/navegadores bloquean Fullscreen API; el panel sigue utilizable.
    }
  }

  const maxType = Math.max(1, ...data.topTypes.map((item) => item.count))

  return (
    <section className="fixed inset-0 z-[100] overflow-y-auto bg-[#050b16] text-white">
      <div className="min-h-screen p-4 sm:p-6 xl:p-8">
        <header className="flex flex-col gap-5 border-b border-white/10 pb-5 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <div className="flex items-center gap-3">
              <div className="grid h-12 w-12 place-items-center rounded-2xl bg-blue-500/15 text-blue-300"><Activity size={25} /></div>
              <div>
                <p className="text-xs font-black uppercase tracking-[.24em] text-blue-300">Tesla Control Escolar</p>
                <h1 className="mt-1 text-2xl font-black tracking-tight sm:text-3xl">Panel de operación en vivo</h1>
              </div>
            </div>
            <p className="mt-3 capitalize text-sm font-semibold text-slate-400">{formatDate(now)}</p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className={`flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-black ${realtimeConnected ? 'border-emerald-400/20 bg-emerald-500/10 text-emerald-300' : 'border-amber-400/20 bg-amber-500/10 text-amber-300'}`}>
              {realtimeConnected ? <Wifi size={17} /> : <WifiOff size={17} />}
              {realtimeConnected ? 'Tiempo real conectado' : 'Reconectando…'}
            </div>
            <div className="rounded-xl border border-white/10 bg-white/5 px-5 py-2 font-mono text-2xl font-black tabular-nums text-slate-100">{formatClock(now)}</div>
            <button type="button" onClick={() => void toggleFullscreen()} className="grid h-11 w-11 place-items-center rounded-xl border border-white/10 bg-white/5 text-slate-300 hover:bg-white/10" aria-label="Pantalla completa">
              {fullscreen ? <Minimize size={20} /> : <Expand size={20} />}
            </button>
            <button type="button" onClick={onClose} className="grid h-11 w-11 place-items-center rounded-xl border border-white/10 bg-white/5 text-slate-300 hover:bg-white/10" aria-label="Cerrar panel"><X size={21} /></button>
          </div>
        </header>

        <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-5">
          <Metric icon={<Users size={22} />} label="Alumnos" value={students.length} />
          <Metric icon={<LogIn size={22} />} label="Ingresaron" value={data.entered} accent="emerald" />
          <Metric icon={<Clock3 size={22} />} label="A tiempo" value={data.onTime} accent="blue" />
          <Metric icon={<AlertTriangle size={22} />} label="Tardanzas" value={data.late} accent="amber" />
          <Metric icon={<Users size={22} />} label="Sin marcar" value={data.pending} accent="slate" />
        </div>

        <div className="mt-5 grid gap-5 2xl:grid-cols-[.8fr_1.35fr_.85fr]">
          <TvCard title="Últimos ingresos" subtitle="Movimientos registrados hoy" icon={<LogIn size={20} />}>
            <div className="space-y-2">
              {data.recentEntries.length === 0 ? <Empty text="Aún no hay ingresos registrados." /> : data.recentEntries.map(({ record, student }) => {
                const classroom = data.classroomById.get(student.classroomId)
                return <div key={record.id ?? `${student.id}-${record.time}`} className="flex items-center gap-3 rounded-2xl border border-white/7 bg-white/[.035] p-3">
                  <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${record.status === 'LATE' ? 'bg-amber-500/15 text-amber-300' : 'bg-emerald-500/15 text-emerald-300'}`}>{record.status === 'LATE' ? <AlertTriangle size={19}/> : <LogIn size={19}/>}</div>
                  <div className="min-w-0 flex-1"><p className="truncate font-black">{student.firstName} {student.lastName}</p><p className="mt-0.5 text-xs font-semibold text-slate-500">{classroom ? `${classroom.grade} ${classroom.section} · ${classroom.level}` : 'Aula'}</p></div>
                  <div className="text-right"><p className="font-mono text-lg font-black">{record.time}</p><p className={`text-[10px] font-black uppercase tracking-wider ${record.status === 'LATE' ? 'text-amber-300' : 'text-emerald-300'}`}>{record.status === 'LATE' ? 'Tardanza' : 'A tiempo'}</p></div>
                </div>
              })}
            </div>
          </TvCard>

          <TvCard title="Incidencias del día" subtitle={`${data.totalIncidents} incidencias registradas · actualización automática`} icon={<ShieldAlert size={20} />} strong>
            <div className="space-y-2">
              {data.enrichedIncidents.length === 0 ? <Empty text="No hay incidencias registradas hoy." /> : data.enrichedIncidents.map((event) => (
                <div key={event.key} className={`grid grid-cols-[auto_1fr_auto] items-center gap-3 rounded-2xl border p-3.5 ${event.severity === 'conduct' ? 'border-red-400/20 bg-red-500/[.07]' : event.severity === 'late' ? 'border-amber-400/20 bg-amber-500/[.07]' : 'border-orange-400/20 bg-orange-500/[.06]'}`}>
                  <div className={`grid h-11 w-11 place-items-center rounded-xl ${event.severity === 'conduct' ? 'bg-red-500/15 text-red-300' : event.severity === 'late' ? 'bg-amber-500/15 text-amber-300' : 'bg-orange-500/15 text-orange-300'}`}><AlertTriangle size={20}/></div>
                  <div className="min-w-0"><p className="truncate text-base font-black">{event.student.firstName} {event.student.lastName}</p><p className="mt-1 truncate text-sm font-bold text-slate-300">{event.labels.join(' · ')}</p><p className="mt-0.5 text-xs font-semibold text-slate-500">{event.classroom ? `${event.classroom.grade} ${event.classroom.section} · ${event.classroom.level}` : 'Aula no encontrada'}</p></div>
                  <div className="font-mono text-lg font-black tabular-nums text-slate-300">{event.time}</div>
                </div>
              ))}
            </div>
          </TvCard>

          <div className="space-y-5">
            <TvCard title="Top incidencias" subtitle="Tipos más repetidos hoy" icon={<TrendingUp size={20} />}>
              <div className="space-y-4">
                {data.topTypes.length === 0 ? <Empty text="Sin datos todavía." /> : data.topTypes.map((item) => (
                  <div key={item.label}>
                    <div className="mb-1.5 flex items-center justify-between gap-3 text-sm"><span className="font-bold text-slate-300">{item.label}</span><b className="text-lg">{item.count}</b></div>
                    <div className="h-2.5 overflow-hidden rounded-full bg-white/5"><div className="h-full rounded-full bg-amber-400" style={{ width: `${Math.max(8, (item.count / maxType) * 100)}%` }} /></div>
                  </div>
                ))}
              </div>
            </TvCard>

            <TvCard title="Alumnos con más incidencias" subtitle="Ranking del día" icon={<Users size={20} />}>
              <div className="space-y-2">
                {data.topStudents.length === 0 ? <Empty text="Sin incidencias hoy." /> : data.topStudents.map(({ student, count }, index) => {
                  const classroom = data.classroomById.get(student.classroomId)
                  return <div key={student.id} className="flex items-center gap-3 rounded-xl bg-white/[.035] px-3 py-2.5"><span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-white/[.06] text-sm font-black text-slate-400">{index + 1}</span><div className="min-w-0 flex-1"><p className="truncate text-sm font-black">{student.firstName} {student.lastName}</p><p className="text-[11px] font-semibold text-slate-500">{classroom ? `${classroom.grade} ${classroom.section}` : 'Aula'}</p></div><span className="rounded-lg bg-red-500/10 px-2.5 py-1 text-sm font-black text-red-300">{count}</span></div>
                })}
              </div>
            </TvCard>
          </div>
        </div>
      </div>
    </section>
  )
}

function Metric({ icon, label, value, accent = 'slate' }: { icon: ReactNode; label: string; value: number; accent?: 'slate' | 'emerald' | 'blue' | 'amber' }) {
  const accentClass = accent === 'emerald' ? 'text-emerald-300 bg-emerald-500/10' : accent === 'blue' ? 'text-blue-300 bg-blue-500/10' : accent === 'amber' ? 'text-amber-300 bg-amber-500/10' : 'text-slate-300 bg-white/5'
  return <div className="rounded-2xl border border-white/10 bg-white/[.035] p-4 xl:p-5"><div className={`inline-flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-black uppercase tracking-wider ${accentClass}`}>{icon}{label}</div><p className="mt-4 text-4xl font-black tabular-nums xl:text-5xl">{value}</p></div>
}

function TvCard({ title, subtitle, icon, children, strong = false }: { title: string; subtitle: string; icon: ReactNode; children: ReactNode; strong?: boolean }) {
  return <section className={`rounded-3xl border p-4 xl:p-5 ${strong ? 'border-blue-400/15 bg-blue-500/[.035]' : 'border-white/10 bg-white/[.025]'}`}><div className="mb-4 flex items-start gap-3"><div className="grid h-10 w-10 place-items-center rounded-xl bg-white/5 text-slate-300">{icon}</div><div><h2 className="text-lg font-black xl:text-xl">{title}</h2><p className="mt-0.5 text-xs font-semibold text-slate-500">{subtitle}</p></div></div>{children}</section>
}

function Empty({ text }: { text: string }) {
  return <div className="rounded-2xl border border-dashed border-white/10 px-4 py-8 text-center text-sm font-semibold text-slate-500">{text}</div>
}
