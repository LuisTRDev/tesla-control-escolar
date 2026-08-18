import { useState } from 'react'
import { BarChart3, ChevronDown, Clock3, Shirt, Users, X } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import type { AttendanceRecord, Classroom, PresentationRecord, Student } from '@/types'

type Props = {
  open: boolean
  classroom: Classroom
  classrooms: Classroom[]
  students: Student[]
  onClose: () => void
  onClassroomChange: (classroomId: string) => void
  attendanceRecords: AttendanceRecord[]
  presentationRecords: PresentationRecord[]
  today: string
  now: Date
}

type DonutItem = { label: string; value: number; color: string }

function formatDate(date: Date) {
  return date.toLocaleDateString('es-PE', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  })
}

function formatTime(date: Date) {
  return date.toLocaleTimeString('es-PE', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  })
}

function DonutChart({ items, centerLabel }: { items: DonutItem[]; centerLabel: string }) {
  const total = items.reduce((sum, item) => sum + item.value, 0)
  let current = 0
  const stops = items.map((item) => {
    const start = total === 0 ? 0 : (current / total) * 360
    current += item.value
    const end = total === 0 ? 0 : (current / total) * 360
    return `${item.color} ${start}deg ${end}deg`
  })
  const background = total === 0 ? '#e2e8f0' : `conic-gradient(${stops.join(', ')})`

  return (
    <div className="flex flex-col items-center gap-5 sm:flex-row sm:justify-center">
      <div className="relative h-44 w-44 shrink-0 rounded-full" style={{ background }}>
        <div className="absolute inset-[26px] grid place-items-center rounded-full bg-white text-center shadow-inner dark:bg-slate-900">
          <div>
            <p className="text-3xl font-black">{total}</p>
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">{centerLabel}</p>
          </div>
        </div>
      </div>
      <div className="w-full max-w-xs space-y-2">
        {items.map((item) => (
          <div key={item.label} className="flex items-center justify-between gap-4 rounded-lg px-2 py-1.5 text-sm">
            <span className="flex items-center gap-2 text-slate-600 dark:text-slate-300">
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.color }} />
              {item.label}
            </span>
            <b>{item.value}</b>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function Dashboard({
  open,
  classroom,
  classrooms,
  students,
  onClose,
  onClassroomChange,
  attendanceRecords,
  presentationRecords,
  today,
  now,
}: Props) {
  const [period, setPeriod] = useState<'TODAY' | 'MONTH'>('TODAY')
  if (!open) return null

  const monthPrefix = today.slice(0, 7)
  const inPeriod = (date: string) => period === 'TODAY' ? date === today : date.startsWith(monthPrefix)
  const classroomStudents = students.filter((student) => student.classroomId === classroom.id)
  const studentIds = new Set(classroomStudents.map((student) => student.id))
  const todayAttendance = attendanceRecords.filter((record) => inPeriod(record.date) && studentIds.has(record.studentId))
  const todayPresentation = presentationRecords.filter((record) => inPeriod(record.date) && studentIds.has(record.studentId))

  const onTime = todayAttendance.filter((record) => record.status === 'ON_TIME').length
  const late = todayAttendance.filter((record) => record.status === 'LATE').length
  const pending = period === 'TODAY' ? Math.max(0, classroomStudents.length - todayAttendance.length) : 0

  const compliant = todayPresentation.filter((record) => record.status === 'COMPLIANT').length
  const nonCompliant = todayPresentation.filter((record) => record.status === 'NON_COMPLIANT').length
  const presentationPending = period === 'TODAY' ? Math.max(0, classroomStudents.length - todayPresentation.length) : 0

  const attendanceData: DonutItem[] = [
    { label: 'A tiempo', value: onTime, color: '#10b981' },
    { label: 'Tardanza', value: late, color: '#f59e0b' },
    { label: 'Pendientes', value: pending, color: '#94a3b8' },
  ]

  const presentationData: DonutItem[] = [
    { label: 'Conforme', value: compliant, color: '#10b981' },
    { label: 'Incumplimiento', value: nonCompliant, color: '#f59e0b' },
    { label: 'Sin revisar', value: presentationPending, color: '#94a3b8' },
  ]

  const violationData = [
    { name: 'Peinado', value: todayPresentation.filter((record) => record.hairstyleViolation).length },
    { name: 'Uniforme', value: todayPresentation.filter((record) => record.uniformUsageViolation).length },
    { name: 'Prenda', value: todayPresentation.filter((record) => record.nonInstitutionalGarment).length },
    { name: 'Otro', value: todayPresentation.filter((record) => record.otherViolation).length },
  ]
  const maxViolation = Math.max(1, ...violationData.map((item) => item.value))

  const studentsWithIncidents = classroomStudents
    .map((student) => ({
      student,
      record: todayPresentation.find((record) => record.studentId === student.id && record.status === 'NON_COMPLIANT'),
    }))
    .filter((item) => item.record)

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/55 p-3 backdrop-blur-sm dark:bg-black/70 sm:p-6">
      <section className="mx-auto max-w-6xl rounded-3xl border border-slate-200 bg-slate-50 shadow-2xl dark:border-slate-800 dark:bg-slate-950">
        <div className="sticky top-0 z-10 rounded-t-3xl border-b border-slate-200 bg-white/95 px-5 py-4 backdrop-blur dark:border-slate-800 dark:bg-slate-900/95 sm:px-7">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.18em] text-slate-400">
                <BarChart3 size={15} /> Dashboard {period === 'TODAY' ? 'diario' : 'mensual'}
              </p>
              <h2 className="mt-1 text-2xl font-black tracking-tight text-slate-950 dark:text-slate-100">Métricas por aula</h2>
              <p className="mt-1 text-sm capitalize text-slate-500 dark:text-slate-400">{formatDate(now)} · {formatTime(now)}</p>
            </div>

            <div className="flex flex-wrap items-end gap-2">
              <label className="block w-full sm:w-40">
                <span className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Periodo</span>
                <select value={period} onChange={(e) => setPeriod(e.target.value as 'TODAY' | 'MONTH')} className="h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm font-bold text-slate-900 outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100">
                  <option value="TODAY">Hoy</option><option value="MONTH">Este mes</option>
                </select>
              </label>
              <label className="block w-full sm:w-64">
                <span className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Aula</span>
                <div className="relative">
                  <select
                    value={classroom.id}
                    onChange={(event) => onClassroomChange(event.target.value)}
                    className="h-11 w-full appearance-none rounded-xl border border-slate-300 bg-white px-3 pr-9 text-sm font-bold text-slate-900 outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  >
                    {classrooms.map((item) => (
                      <option key={item.id} value={item.id}>{item.grade} {item.section} · {item.level}</option>
                    ))}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-3 top-3 text-slate-400" size={18} />
                </div>
              </label>
              <Button variant="ghost" onClick={onClose} aria-label="Cerrar dashboard" className="h-11 px-3"><X size={20} /></Button>
            </div>
          </div>
        </div>

        <div className="p-5 sm:p-7">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
            <Card className="p-4"><p className="text-xs text-slate-500 dark:text-slate-400">Alumnos</p><p className="mt-1 text-2xl font-black">{classroomStudents.length}</p></Card>
            <Card className="p-4"><p className="text-xs text-slate-500 dark:text-slate-400">A tiempo</p><p className="mt-1 text-2xl font-black text-emerald-700 dark:text-emerald-400">{onTime}</p></Card>
            <Card className="p-4"><p className="text-xs text-slate-500 dark:text-slate-400">Tardanzas</p><p className="mt-1 text-2xl font-black text-amber-700 dark:text-amber-400">{late}</p></Card>
            <Card className="p-4"><p className="text-xs text-slate-500 dark:text-slate-400">Pendientes</p><p className="mt-1 text-2xl font-black">{pending}</p></Card>
            <Card className="p-4"><p className="text-xs text-slate-500 dark:text-slate-400">Incumplimientos</p><p className="mt-1 text-2xl font-black text-amber-700 dark:text-amber-400">{nonCompliant}</p></Card>
            <Card className="p-4"><p className="text-xs text-slate-500 dark:text-slate-400">Sin revisar</p><p className="mt-1 text-2xl font-black">{presentationPending}</p></Card>
          </div>

          <div className="mt-5 grid gap-4 lg:grid-cols-2">
            <Card className="p-5">
              <div className="flex items-center gap-2"><Clock3 size={18} /><h3 className="font-black">Asistencia del periodo</h3></div>
              <div className="mt-6"><DonutChart items={attendanceData} centerLabel="registros" /></div>
            </Card>

            <Card className="p-5">
              <div className="flex items-center gap-2"><Shirt size={18} /><h3 className="font-black">Presentación personal</h3></div>
              <div className="mt-6"><DonutChart items={presentationData} centerLabel="revisiones" /></div>
            </Card>
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-[1.15fr_.85fr]">
            <Card className="p-5">
              <div className="flex items-center gap-2"><BarChart3 size={18} /><h3 className="font-black">Tipos de incumplimiento</h3></div>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Cantidad registrada en el periodo seleccionado.</p>
              <div className="mt-6 space-y-4">
                {violationData.map((item) => (
                  <div key={item.name}>
                    <div className="mb-1.5 flex items-center justify-between text-sm"><span>{item.name}</span><b>{item.value}</b></div>
                    <div className="h-3 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                      <div className="h-full rounded-full bg-amber-500 transition-all" style={{ width: `${(item.value / maxViolation) * 100}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </Card>

            <Card className="p-5">
              <div className="flex items-center gap-2"><Users size={18} /><h3 className="font-black">Alumnos con incidencias</h3></div>
              <div className="mt-4 max-h-72 space-y-3 overflow-y-auto pr-1">
                {studentsWithIncidents.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-slate-300 p-5 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">No hay incumplimientos registrados en el periodo.</div>
                ) : studentsWithIncidents.map(({ student, record }) => (
                  <div key={student.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900">
                    <p className="font-black">{student.firstName} {student.lastName}</p>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                      {[
                        record?.hairstyleViolation && 'Peinado',
                        record?.uniformUsageViolation && 'Uniforme',
                        record?.nonInstitutionalGarment && 'Prenda',
                        record?.otherViolation && 'Otro',
                      ].filter(Boolean).join(' · ')}
                    </p>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        </div>
      </section>
    </div>
  )
}
