import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowLeft, BarChart3, ChevronDown, Clock3, Shirt, Users, X } from 'lucide-react'
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
  type DrillCategory = 'ALL' | 'ON_TIME' | 'LATE' | 'ATTENDANCE_PENDING' | 'NON_COMPLIANT' | 'PRESENTATION_PENDING'
  const [drill, setDrill] = useState<DrillCategory | null>(null)
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
    { name: 'Tardanza', value: todayPresentation.filter((record) => record.lateEntryViolation).length },
    { name: 'Conducta', value: todayPresentation.filter((record) => record.inappropriateConductViolation).length },
  ]
  const maxViolation = Math.max(1, ...violationData.map((item) => item.value))

  const studentsWithIncidents = classroomStudents
    .map((student) => ({
      student,
      record: todayPresentation.find((record) => record.studentId === student.id && record.status === 'NON_COMPLIANT'),
    }))
    .filter((item) => item.record)

  const drillMeta: Record<DrillCategory, { title: string; empty: string }> = {
    ALL: { title: 'Alumnos del aula', empty: 'Esta aula no tiene alumnos registrados.' },
    ON_TIME: { title: 'Alumnos a tiempo', empty: 'Nadie marcó ingreso a tiempo en este periodo.' },
    LATE: { title: 'Alumnos con tardanza', empty: 'No hay tardanzas registradas en este periodo.' },
    ATTENDANCE_PENDING: { title: 'Alumnos con asistencia pendiente', empty: 'Todos los alumnos ya tienen asistencia registrada.' },
    NON_COMPLIANT: { title: 'Alumnos con incumplimiento', empty: 'No hay incumplimientos registrados en este periodo.' },
    PRESENTATION_PENDING: { title: 'Alumnos sin revisar presentación', empty: 'Todos los alumnos ya fueron revisados.' },
  }

  function getDrillList(category: DrillCategory): { student: Student; detail: string }[] {
    switch (category) {
      case 'ALL':
        return classroomStudents.map((student) => ({ student, detail: '' }))
      case 'ON_TIME':
        return classroomStudents
          .map((student) => ({ student, record: todayAttendance.find((r) => r.studentId === student.id && r.status === 'ON_TIME') }))
          .filter((item): item is { student: Student; record: AttendanceRecord } => Boolean(item.record))
          .map(({ student, record }) => ({ student, detail: `Ingreso: ${record.time?.slice(0, 5) ?? '—'}` }))
      case 'LATE':
        return classroomStudents
          .map((student) => ({ student, record: todayAttendance.find((r) => r.studentId === student.id && r.status === 'LATE') }))
          .filter((item): item is { student: Student; record: AttendanceRecord } => Boolean(item.record))
          .map(({ student, record }) => ({ student, detail: `Ingreso: ${record.time?.slice(0, 5) ?? '—'}` }))
      case 'ATTENDANCE_PENDING':
        return classroomStudents
          .filter((student) => !todayAttendance.some((r) => r.studentId === student.id))
          .map((student) => ({ student, detail: 'Sin asistencia registrada' }))
      case 'NON_COMPLIANT':
        return studentsWithIncidents.map(({ student, record }) => ({
          student,
          detail: [
            record?.hairstyleViolation && 'Peinado',
            record?.uniformUsageViolation && 'Uniforme',
            record?.nonInstitutionalGarment && 'Prenda',
            record?.lateEntryViolation && 'Tardanza',
            record?.inappropriateConductViolation && 'Conducta',
          ].filter(Boolean).join(' · ') || 'Incumplimiento registrado',
        }))
      case 'PRESENTATION_PENDING':
        return classroomStudents
          .filter((student) => !todayPresentation.some((r) => r.studentId === student.id))
          .map((student) => ({ student, detail: 'Sin revisar' }))
    }
  }

  function changeClassroomAndReset(id: string) {
    setDrill(null)
    onClassroomChange(id)
  }

  function changePeriodAndReset(value: 'TODAY' | 'MONTH') {
    setDrill(null)
    setPeriod(value)
  }

  return (
    <AnimatePresence>{open && (
    <motion.div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/55 p-3 backdrop-blur-sm dark:bg-black/70 sm:p-6" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} transition={{duration:0.18}}>
      <motion.section className="mx-auto max-w-6xl rounded-3xl border border-slate-200 bg-slate-50 shadow-2xl dark:border-slate-800 dark:bg-slate-950" initial={{scale:0.96,opacity:0,y:12}} animate={{scale:1,opacity:1,y:0}} exit={{scale:0.97,opacity:0,y:8}} transition={{type:'spring',stiffness:380,damping:32}}>
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
                <select value={period} onChange={(e) => changePeriodAndReset(e.target.value as 'TODAY' | 'MONTH')} className="h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm font-bold text-slate-900 outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100">
                  <option value="TODAY">Hoy</option><option value="MONTH">Este mes</option>
                </select>
              </label>
              <label className="block w-full sm:w-64">
                <span className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Aula</span>
                <div className="relative">
                  <select
                    value={classroom.id}
                    onChange={(event) => changeClassroomAndReset(event.target.value)}
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
            <button type="button" onClick={() => setDrill('ALL')} className="text-left"><Card className="p-4 transition-colors hover:border-brand-gold hover:bg-brand-gold/5"><p className="text-xs text-slate-500 dark:text-slate-400">Alumnos</p><p className="mt-1 text-2xl font-black">{classroomStudents.length}</p></Card></button>
            <button type="button" onClick={() => setDrill('ON_TIME')} className="text-left"><Card className="p-4 transition-colors hover:border-brand-gold hover:bg-brand-gold/5"><p className="text-xs text-slate-500 dark:text-slate-400">A tiempo</p><p className="mt-1 text-2xl font-black text-emerald-700 dark:text-emerald-400">{onTime}</p></Card></button>
            <button type="button" onClick={() => setDrill('LATE')} className="text-left"><Card className="p-4 transition-colors hover:border-brand-gold hover:bg-brand-gold/5"><p className="text-xs text-slate-500 dark:text-slate-400">Tardanzas</p><p className="mt-1 text-2xl font-black text-amber-700 dark:text-amber-400">{late}</p></Card></button>
            <button type="button" onClick={() => setDrill('ATTENDANCE_PENDING')} className="text-left"><Card className="p-4 transition-colors hover:border-brand-gold hover:bg-brand-gold/5"><p className="text-xs text-slate-500 dark:text-slate-400">Pendientes</p><p className="mt-1 text-2xl font-black">{pending}</p></Card></button>
            <button type="button" onClick={() => setDrill('NON_COMPLIANT')} className="text-left"><Card className="p-4 transition-colors hover:border-brand-gold hover:bg-brand-gold/5"><p className="text-xs text-slate-500 dark:text-slate-400">Incumplimientos</p><p className="mt-1 text-2xl font-black text-amber-700 dark:text-amber-400">{nonCompliant}</p></Card></button>
            <button type="button" onClick={() => setDrill('PRESENTATION_PENDING')} className="text-left"><Card className="p-4 transition-colors hover:border-brand-gold hover:bg-brand-gold/5"><p className="text-xs text-slate-500 dark:text-slate-400">Sin revisar</p><p className="mt-1 text-2xl font-black">{presentationPending}</p></Card></button>
          </div>

          <AnimatePresence mode="wait">
            {drill ? (
              <motion.div
                key="drill"
                initial={{ opacity: 0, x: 16 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -16 }}
                transition={{ duration: 0.22, ease: [0.2, 0.8, 0.25, 1] }}
              >
                <Card className="mt-4 p-5">
                  <div className="flex items-center gap-3">
                    <Button variant="outline" className="h-9 px-3" onClick={() => setDrill(null)}>
                      <ArrowLeft className="mr-1.5" size={16} /> Volver
                    </Button>
                    <div>
                      <h3 className="font-black">{drillMeta[drill].title}</h3>
                      <p className="text-xs text-slate-500 dark:text-slate-400">{classroom.grade} {classroom.section} · {classroom.level}</p>
                    </div>
                  </div>
                  <div className="mt-4 max-h-[50vh] space-y-2 overflow-y-auto pr-1">
                    {(() => {
                      const list = getDrillList(drill)
                      if (list.length === 0) {
                        return <div className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">{drillMeta[drill].empty}</div>
                      }
                      return list.map(({ student, detail }) => (
                        <div key={student.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-900">
                          <p className="font-black">{student.firstName} {student.lastName}</p>
                          {detail && <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">{detail}</p>}
                        </div>
                      ))
                    })()}
                  </div>
                </Card>
              </motion.div>
            ) : (
              <motion.div
                key="charts"
                initial={{ opacity: 0, x: -16 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 16 }}
                transition={{ duration: 0.22, ease: [0.2, 0.8, 0.25, 1] }}
              >
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
                        record?.lateEntryViolation && 'Tardanza',
                        record?.inappropriateConductViolation && 'Conducta',
                      ].filter(Boolean).join(' · ')}
                    </p>
                  </div>
                ))}
              </div>
            </Card>
          </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.section>
    </motion.div>
    )}</AnimatePresence>
  )
}
