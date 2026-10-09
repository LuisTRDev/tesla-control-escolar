import { useEffect, useMemo, useState, type DragEvent, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  Activity, AlertTriangle, BarChart3, CheckCircle2, Clock3, Expand,
  GripVertical, LayoutDashboard, LogIn, LogOut, Maximize2, Minimize,
  RotateCcw, Save, ShieldAlert, SlidersHorizontal, Users,
  Wifi, WifiOff, X, EyeOff, Plus, ChevronDown, ChevronUp,
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

type CardSize = 'sm' | 'md' | 'lg'
type CardKind =
  | 'metrics'
  | 'recentEntries'
  | 'lateStudents'
  | 'todayIncidents'
  | 'topIncidents'
  | 'topStudents'
  | 'attendanceSummary'
  | 'exitSummary'
  | 'presentationCompliance'
  | 'pendingStudents'
  | 'classroomSummary'
  | 'incidentsByClassroom'

 type LayoutCard = {
  id: string
  kind: CardKind
  size: CardSize
}

const STORAGE_KEY = 'tesla-live-tv-layout-v2'
const DEFAULT_LAYOUT: LayoutCard[] = [
  { id: 'metrics', kind: 'metrics', size: 'lg' },
  { id: 'recentEntries', kind: 'recentEntries', size: 'md' },
  { id: 'lateStudents', kind: 'lateStudents', size: 'md' },
  { id: 'todayIncidents', kind: 'todayIncidents', size: 'lg' },
  { id: 'topIncidents', kind: 'topIncidents', size: 'sm' },
  { id: 'topStudents', kind: 'topStudents', size: 'sm' },
]

const CATALOG: Array<{ kind: CardKind; title: string; description: string; defaultSize: CardSize }> = [
  { kind: 'metrics', title: 'Métricas generales', description: 'Resumen de alumnos, ingresos, tardanzas y pendientes.', defaultSize: 'lg' },
  { kind: 'recentEntries', title: 'Últimos ingresos', description: 'Últimos alumnos que registraron ingreso.', defaultSize: 'md' },
  { kind: 'lateStudents', title: 'Alumnos con tardanza', description: 'Lista completa del día, ordenada por hora.', defaultSize: 'md' },
  { kind: 'todayIncidents', title: 'Incidencias del día', description: 'Detalle de incidencias y conductas registradas.', defaultSize: 'lg' },
  { kind: 'topIncidents', title: 'Top incidencias', description: 'Tipos de incidencias más repetidos.', defaultSize: 'sm' },
  { kind: 'topStudents', title: 'Alumnos con más incidencias', description: 'Ranking del día.', defaultSize: 'sm' },
  { kind: 'attendanceSummary', title: 'Resumen de asistencia', description: 'A tiempo, tardanzas y porcentaje de ingreso.', defaultSize: 'sm' },
  { kind: 'exitSummary', title: 'Salidas registradas', description: 'Control de alumnos con salida registrada.', defaultSize: 'sm' },
  { kind: 'presentationCompliance', title: 'Cumplimiento de presentación', description: 'Cumplimiento y porcentaje de incidencias de presentación.', defaultSize: 'sm' },
  { kind: 'pendingStudents', title: 'Alumnos sin ingreso', description: 'Lista de alumnos pendientes de marcar.', defaultSize: 'md' },
  { kind: 'classroomSummary', title: 'Resumen por aula', description: 'Estado de asistencia por cada aula.', defaultSize: 'lg' },
  { kind: 'incidentsByClassroom', title: 'Incidencias por aula', description: 'Concentración de incidencias por sección.', defaultSize: 'md' },
]

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

function loadLayout(): LayoutCard[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_LAYOUT
    const parsed = JSON.parse(raw) as LayoutCard[]
    if (!Array.isArray(parsed) || parsed.length === 0) return DEFAULT_LAYOUT
    return parsed.filter((item) => CATALOG.some((card) => card.kind === item.kind && card.kind === item.kind))
      .map((item) => ({ id: String(item.id), kind: item.kind, size: item.size === 'sm' || item.size === 'lg' ? item.size : 'md' }))
  } catch {
    return DEFAULT_LAYOUT
  }
}

function sizeClass(size: CardSize) {
  if (size === 'sm') return 'col-span-12 xl:col-span-4'
  if (size === 'md') return 'col-span-12 xl:col-span-6'
  return 'col-span-12'
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
  const [editMode, setEditMode] = useState(false)
  const [layout, setLayout] = useState<LayoutCard[]>(() => loadLayout())
  const [draggedId, setDraggedId] = useState<string | null>(null)
  const [dropTargetId, setDropTargetId] = useState<string | null>(null)
  const [catalogOpen, setCatalogOpen] = useState(false)
  const [savedNotice, setSavedNotice] = useState(false)

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
    const enteredStudentIds = new Set(todayAttendance.map((record) => record.studentId))

    const incidents: IncidentEvent[] = []
    for (const attendance of todayAttendance) {
      if (attendance.status !== 'LATE') continue
      incidents.push({ key: `late-${attendance.id ?? attendance.studentId}`, studentId: attendance.studentId, time: attendance.time, labels: ['Tardanza'], severity: 'late' })
    }
    for (const record of todayPresentation) {
      const attendanceLate = attendanceByStudent.get(record.studentId)?.status === 'LATE'
      const labels = presentationLabels(record, attendanceLate)
      if (labels.length === 0) continue
      incidents.push({ key: `presentation-${record.id ?? `${record.studentId}-${record.checkedAt}`}`, studentId: record.studentId, time: record.checkedAt || '00:00', labels, severity: record.inappropriateConductViolation ? 'conduct' : 'presentation' })
    }
    incidents.sort((a, b) => b.time.localeCompare(a.time))

    const typeCounts = new Map<string, number>()
    const studentCounts = new Map<string, number>()
    const classroomCounts = new Map<string, number>()
    let totalIncidents = 0
    for (const event of incidents) {
      for (const label of event.labels) {
        typeCounts.set(label, (typeCounts.get(label) ?? 0) + 1)
        totalIncidents += 1
      }
      studentCounts.set(event.studentId, (studentCounts.get(event.studentId) ?? 0) + event.labels.length)
      const classroomId = studentById.get(event.studentId)?.classroomId
      if (classroomId) classroomCounts.set(classroomId, (classroomCounts.get(classroomId) ?? 0) + event.labels.length)
    }

    const topTypes = [...typeCounts.entries()].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label)).slice(0, 6)
    const topStudents = [...studentCounts.entries()].map(([studentId, count]) => ({ student: studentById.get(studentId), count })).filter((item): item is { student: Student; count: number } => Boolean(item.student)).sort((a, b) => b.count - a.count || a.student.lastName.localeCompare(b.student.lastName)).slice(0, 8)

    const recentEntries = [...todayAttendance]
      .sort((a, b) => b.time.localeCompare(a.time))
      .slice(0, 10)
      .map((record) => ({ record, student: studentById.get(record.studentId) }))
      .filter((item): item is { record: AttendanceRecord; student: Student } => Boolean(item.student))

    const lateStudents = [...todayAttendance]
      .filter((record) => record.status === 'LATE')
      .sort((a, b) => a.time.localeCompare(b.time))
      .map((record) => ({ record, student: studentById.get(record.studentId) }))
      .filter((item): item is { record: AttendanceRecord; student: Student } => Boolean(item.student))

    const pendingStudents = students
      .filter((student) => !enteredStudentIds.has(student.id))
      .map((student) => ({ student, classroom: classroomById.get(student.classroomId) }))
      .sort((a, b) => `${a.student.lastName} ${a.student.firstName}`.localeCompare(`${b.student.lastName} ${b.student.firstName}`))

    const enrichedIncidents = incidents.slice(0, 18).map((event) => {
      const student = studentById.get(event.studentId)
      const classroom = student ? classroomById.get(student.classroomId) : undefined
      return { ...event, student, classroom }
    }).filter((item): item is IncidentEvent & { student: Student; classroom: Classroom | undefined } => Boolean(item.student))

    const onTime = todayAttendance.filter((record) => record.status === 'ON_TIME').length
    const late = todayAttendance.filter((record) => record.status === 'LATE').length
    const entered = enteredStudentIds.size
    const exited = todayAttendance.filter((record) => Boolean(record.exitTime)).length
    const complianceChecked = todayPresentation.length
    const complianceOk = students.length > 0 ? Math.max(0, students.length - complianceChecked) : 0
    const attendancePercentage = students.length ? Math.round((entered / students.length) * 100) : 0
    const presentationPercentage = students.length ? Math.round((complianceOk / students.length) * 100) : 0

    const classroomSummary = classrooms.map((classroom) => {
      const classStudents = students.filter((student) => student.classroomId === classroom.id)
      const classIds = new Set(classStudents.map((student) => student.id))
      const records = todayAttendance.filter((record) => classIds.has(record.studentId))
      const classLate = records.filter((record) => record.status === 'LATE').length
      const classEntered = records.length
      return { classroom, total: classStudents.length, entered: classEntered, late: classLate, pending: Math.max(0, classStudents.length - classEntered) }
    }).sort((a, b) => a.classroom.level.localeCompare(b.classroom.level) || a.classroom.grade.localeCompare(b.classroom.grade) || a.classroom.section.localeCompare(b.classroom.section))

    const incidentsByClassroom = classrooms.map((classroom) => ({ classroom, count: classroomCounts.get(classroom.id) ?? 0 })).sort((a, b) => b.count - a.count || a.classroom.grade.localeCompare(b.classroom.grade)).slice(0, 10)

    return {
      entered, onTime, late, pending: Math.max(0, students.length - entered), exited,
      complianceChecked, complianceOk, attendancePercentage, presentationPercentage,
      totalIncidents, recentEntries, lateStudents, pendingStudents, enrichedIncidents,
      topTypes, topStudents, classroomById, classroomSummary, incidentsByClassroom,
    }
  }, [attendanceRecords, classrooms, presentationRecords, students, today])

  useEffect(() => {
    if (editMode) localStorage.setItem(STORAGE_KEY, JSON.stringify(layout))
  }, [editMode, layout])

  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen()
      else await document.documentElement.requestFullscreen()
    } catch {
      // Algunos televisores/navegadores bloquean Fullscreen API.
    }
  }

  function saveLayout() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(layout))
    setSavedNotice(true)
    window.setTimeout(() => setSavedNotice(false), 1800)
    setEditMode(false)
    setCatalogOpen(false)
  }

  function resetLayout() {
    setLayout(DEFAULT_LAYOUT)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(DEFAULT_LAYOUT))
  }

  function addCard(kind: CardKind) {
    if (layout.some((item) => item.kind === kind)) return
    const catalogCard = CATALOG.find((item) => item.kind === kind)
    if (!catalogCard) return
    setLayout((current) => [...current, { id: `${kind}-${Date.now()}`, kind, size: catalogCard.defaultSize }])
  }

  function removeCard(id: string) {
    setLayout((current) => current.filter((item) => item.id !== id))
  }

  function cycleSize(id: string) {
    setLayout((current) => current.map((item) => {
      if (item.id !== id) return item
      const next: CardSize = item.size === 'sm' ? 'md' : item.size === 'md' ? 'lg' : 'sm'
      return { ...item, size: next }
    }))
  }

  function onDragStart(event: DragEvent<HTMLDivElement>, id: string) {
    if (!editMode) return
    setDraggedId(id)
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', id)
  }

  function onDragEnter(event: DragEvent<HTMLDivElement>, targetId: string) {
    event.preventDefault()
    if (!editMode || !draggedId || draggedId === targetId) return
    setDropTargetId(targetId)
  }

  function onDragOver(event: DragEvent<HTMLDivElement>) {
    if (!editMode) return
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
  }

  function onDrop(event: DragEvent<HTMLDivElement>, targetId: string) {
    event.preventDefault()
    if (!editMode || !draggedId || draggedId === targetId) return
    setLayout((current) => {
      const sourceIndex = current.findIndex((item) => item.id === draggedId)
      const targetIndex = current.findIndex((item) => item.id === targetId)
      if (sourceIndex < 0 || targetIndex < 0) return current
      const next = [...current]
      const [moved] = next.splice(sourceIndex, 1)
      next.splice(targetIndex, 0, moved)
      return next
    })
    setDraggedId(null)
    setDropTargetId(null)
  }

  function onDragEnd() {
    setDraggedId(null)
    setDropTargetId(null)
  }

  const activeKinds = new Set(layout.map((item) => item.kind))

  return (
    <AnimatePresence>
      {open && (
        <motion.section
          className="fixed inset-0 z-[100] overflow-y-auto bg-[#050b16] text-white"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
        >
          <div className="min-h-screen p-4 sm:p-6 xl:p-8">
            <header className="flex flex-col gap-5 border-b border-white/10 pb-5 xl:flex-row xl:items-center xl:justify-between">
              <div>
                <div className="flex items-center gap-3">
                  <div className="grid h-12 w-12 place-items-center rounded-2xl bg-brand-gold/15 text-brand-gold"><Activity size={25} /></div>
                  <div>
                    <p className="text-xs font-black uppercase tracking-[.24em] text-brand-gold">Tesla Control Escolar</p>
                    <h1 className="mt-1 text-2xl font-black tracking-tight sm:text-3xl">Panel de operación en vivo</h1>
                  </div>
                </div>
                <p className="mt-3 capitalize text-sm font-semibold text-slate-400">{formatDate(now)}</p>
              </div>

              <div className="flex flex-wrap items-center gap-2.5">
                <div className={`flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-black ${realtimeConnected ? 'border-emerald-400/20 bg-emerald-500/10 text-emerald-300' : 'border-amber-400/20 bg-amber-500/10 text-amber-300'}`}>
                  {realtimeConnected ? <Wifi size={17} /> : <WifiOff size={17} />}
                  {realtimeConnected ? 'Tiempo real conectado' : 'Reconectando…'}
                </div>
                <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 font-mono text-2xl font-black tabular-nums text-slate-100">{formatClock(now)}</div>
                <motion.button whileTap={{ scale: 0.96 }} type="button" onClick={() => setEditMode((value) => !value)} className={`grid h-11 w-11 place-items-center rounded-xl border ${editMode ? 'border-brand-gold/50 bg-brand-gold/15 text-brand-gold' : 'border-white/10 bg-white/5 text-slate-300 hover:bg-white/10'}`} aria-label="Personalizar panel">
                  <SlidersHorizontal size={19} />
                </motion.button>
                <motion.button whileTap={{ scale: 0.96 }} type="button" onClick={() => void toggleFullscreen()} className="grid h-11 w-11 place-items-center rounded-xl border border-white/10 bg-white/5 text-slate-300 hover:bg-white/10" aria-label="Pantalla completa">
                  {fullscreen ? <Minimize size={20} /> : <Expand size={20} />}
                </motion.button>
                <motion.button whileTap={{ scale: 0.96 }} type="button" onClick={onClose} className="grid h-11 w-11 place-items-center rounded-xl border border-white/10 bg-white/5 text-slate-300 hover:bg-white/10" aria-label="Cerrar panel"><X size={21} /></motion.button>
              </div>
            </header>

            <AnimatePresence>
              {editMode && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                  className="mt-5 overflow-hidden rounded-3xl border border-brand-gold/20 bg-gradient-to-r from-brand-gold/[.10] via-white/[.04] to-transparent"
                >
                  <div className="flex flex-col gap-4 p-4 sm:p-5 xl:flex-row xl:items-center xl:justify-between">
                    <div className="flex items-start gap-3">
                      <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-brand-gold/15 text-brand-gold"><GripVertical size={20} /></div>
                      <div>
                        <p className="font-black">Personaliza tu panel</p>
                        <p className="mt-1 max-w-2xl text-sm font-medium text-slate-400">Arrastra cualquier tarjeta para cambiar su posición. Usa el tamaño para hacer una tarjeta de ancho completo y colocarla debajo o encima de otra.</p>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button type="button" onClick={() => setCatalogOpen((value) => !value)} className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-black text-slate-200 hover:bg-white/10"><Plus size={16} /> Añadir tarjeta {catalogOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}</button>
                      <button type="button" onClick={resetLayout} className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-black text-slate-300 hover:bg-white/10"><RotateCcw size={16} /> Restablecer</button>
                      <button type="button" onClick={saveLayout} className="inline-flex items-center gap-2 rounded-xl bg-brand-gold px-4 py-2.5 text-sm font-black text-slate-950 shadow-lg shadow-brand-gold/10 hover:brightness-105"><Save size={16} /> Guardar</button>
                    </div>
                  </div>

                  <AnimatePresence>
                    {catalogOpen && (
                      <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }} className="border-t border-white/10">
                        <div className="grid gap-2 p-4 sm:grid-cols-2 xl:grid-cols-3">
                          {CATALOG.filter((card) => !activeKinds.has(card.kind)).map((card) => (
                            <button key={card.kind} type="button" onClick={() => addCard(card.kind)} className="group rounded-2xl border border-white/8 bg-white/[.035] p-4 text-left transition hover:-translate-y-0.5 hover:border-brand-gold/20 hover:bg-white/[.06]">
                              <div className="flex items-start gap-3">
                                <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white/5 text-brand-gold"><LayoutDashboard size={18} /></div>
                                <div className="min-w-0"><p className="font-black text-slate-100">{card.title}</p><p className="mt-1 text-xs leading-5 text-slate-500">{card.description}</p></div>
                              </div>
                            </button>
                          ))}
                          {CATALOG.every((card) => activeKinds.has(card.kind)) && <div className="rounded-2xl border border-dashed border-white/10 px-4 py-6 text-center text-sm font-semibold text-slate-500 sm:col-span-2 xl:col-span-3">Todas las tarjetas disponibles ya están agregadas.</div>}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              )}
            </AnimatePresence>

            <motion.div layout className="mt-6 grid grid-cols-12 gap-4 xl:gap-5">
              <AnimatePresence initial={false} mode="popLayout">
                {layout.map((item) => {
                  const catalog = CATALOG.find((card) => card.kind === item.kind)
                  return (
                    <motion.div
                      key={item.id}
                      layout
                      transition={{ layout: { duration: 0.34, ease: [0.22, 1, 0.36, 1] } }}
                      className={`${sizeClass(item.size)} relative min-w-0`}
                      draggable={editMode}
                      onDragStart={(event) => onDragStart(event as unknown as DragEvent<HTMLDivElement>, item.id)}
                      onDragEnter={(event) => onDragEnter(event as unknown as DragEvent<HTMLDivElement>, item.id)}
                      onDragOver={(event) => onDragOver(event as unknown as DragEvent<HTMLDivElement>)}
                      onDrop={(event) => onDrop(event as unknown as DragEvent<HTMLDivElement>, item.id)}
                      onDragEnd={onDragEnd}
                    >
                      {editMode && (
                        <motion.div
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          className={`pointer-events-none absolute inset-1 z-20 rounded-[28px] border-2 border-dashed ${dropTargetId === item.id ? 'border-brand-gold/80 bg-brand-gold/[.05]' : 'border-white/10'}`}
                        />
                      )}
                      {editMode && (
                        <div className="absolute right-3 top-3 z-30 flex items-center gap-1.5 rounded-xl border border-white/10 bg-[#081120]/95 p-1.5 shadow-2xl backdrop-blur-xl">
                          <button type="button" title="Arrastrar" className="grid h-8 w-8 cursor-grab place-items-center rounded-lg text-slate-400 hover:bg-white/10 hover:text-white"><GripVertical size={16} /></button>
                          <button type="button" title={`Cambiar tamaño: ${item.size.toUpperCase()}`} onClick={() => cycleSize(item.id)} className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 hover:bg-white/10 hover:text-white"><Maximize2 size={15} /></button>
                          <button type="button" title="Quitar tarjeta" onClick={() => removeCard(item.id)} className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 hover:bg-red-500/15 hover:text-red-300"><EyeOff size={15} /></button>
                        </div>
                      )}
                      {renderCard(item.kind, data, students.length)}
                      {editMode && <span className="absolute bottom-3 left-3 z-30 rounded-lg bg-black/35 px-2 py-1 text-[10px] font-black uppercase tracking-wider text-slate-400 backdrop-blur">{catalog?.title}</span>}
                    </motion.div>
                  )
                })}
              </AnimatePresence>
            </motion.div>

            <AnimatePresence>
              {savedNotice && (
                <motion.div initial={{ opacity: 0, y: 12, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 12, scale: 0.98 }} transition={{ duration: 0.2 }} className="fixed bottom-6 right-6 z-[120] flex items-center gap-2 rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-3 text-sm font-black text-emerald-300 shadow-2xl backdrop-blur-xl"><CheckCircle2 size={17} /> Distribución guardada</motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.section>
      )}
    </AnimatePresence>
  )
}

type PanelData = ReturnType<typeof buildPanelDataShape>

function buildPanelDataShape() {
  return {
    entered: 0, onTime: 0, late: 0, pending: 0, exited: 0, complianceChecked: 0, complianceOk: 0,
    attendancePercentage: 0, presentationPercentage: 0, totalIncidents: 0, recentEntries: [] as Array<{ record: AttendanceRecord; student: Student }>,
    lateStudents: [] as Array<{ record: AttendanceRecord; student: Student }>, pendingStudents: [] as Array<{ student: Student; classroom: Classroom | undefined }>,
    enrichedIncidents: [] as Array<IncidentEvent & { student: Student; classroom: Classroom | undefined }>,
    topTypes: [] as Array<{ label: string; count: number }>, topStudents: [] as Array<{ student: Student; count: number }>,
    classroomById: new Map<string, Classroom>(), classroomSummary: [] as Array<{ classroom: Classroom; total: number; entered: number; late: number; pending: number }>,
    incidentsByClassroom: [] as Array<{ classroom: Classroom; count: number }>,
  }
}

function renderCard(kind: CardKind, data: PanelData, totalStudents: number) {
  switch (kind) {
    case 'metrics':
      return <MetricStrip data={data} totalStudents={totalStudents} />
    case 'recentEntries':
      return <TvCard title="Últimos ingresos" subtitle="Movimientos registrados hoy" icon={<LogIn size={20} />}><div className="space-y-2">{data.recentEntries.length === 0 ? <Empty text="Aún no hay ingresos registrados." /> : data.recentEntries.map(({ record, student }) => <StudentRow key={record.id ?? `${student.id}-${record.time}`} student={student} classroom={data.classroomById.get(student.classroomId)} time={record.time} status={record.status} icon={record.status === 'LATE' ? <AlertTriangle size={18} /> : <LogIn size={18} />} />)}</div></TvCard>
    case 'lateStudents':
      return <TvCard title="Alumnos con tardanza" subtitle={`${data.lateStudents.length} registrados hoy`} icon={<Clock3 size={20} />} strong><div className="max-h-[30rem] space-y-2 overflow-auto pr-1">{data.lateStudents.length === 0 ? <Empty text="No hay tardanzas registradas hoy." /> : data.lateStudents.map(({ record, student }) => <StudentRow key={record.id ?? `${student.id}-${record.time}`} student={student} classroom={data.classroomById.get(student.classroomId)} time={record.time} status="LATE" icon={<AlertTriangle size={18} />} />)}</div></TvCard>
    case 'todayIncidents':
      return <TvCard title="Incidencias del día" subtitle={`${data.totalIncidents} incidencias registradas · actualización automática`} icon={<ShieldAlert size={20} />} strong><div className="max-h-[34rem] space-y-2 overflow-auto pr-1">{data.enrichedIncidents.length === 0 ? <Empty text="No hay incidencias registradas hoy." /> : data.enrichedIncidents.map((event) => <div key={event.key} className={`grid grid-cols-[auto_1fr_auto] items-center gap-3 rounded-2xl border p-3.5 ${event.severity === 'conduct' ? 'border-red-400/20 bg-red-500/[.07]' : event.severity === 'late' ? 'border-amber-400/20 bg-amber-500/[.07]' : 'border-orange-400/20 bg-orange-500/[.06]'}`}><div className={`grid h-11 w-11 place-items-center rounded-xl ${event.severity === 'conduct' ? 'bg-red-500/15 text-red-300' : event.severity === 'late' ? 'bg-amber-500/15 text-amber-300' : 'bg-orange-500/15 text-orange-300'}`}><AlertTriangle size={20}/></div><div className="min-w-0"><p className="truncate text-base font-black">{event.student.firstName} {event.student.lastName}</p><p className="mt-1 truncate text-sm font-bold text-slate-300">{event.labels.join(' · ')}</p><p className="mt-0.5 text-xs font-semibold text-slate-500">{event.classroom ? `${event.classroom.grade} ${event.classroom.section} · ${event.classroom.level}` : 'Aula no encontrada'}</p></div><div className="font-mono text-lg font-black tabular-nums text-slate-300">{event.time}</div></div>)}</div></TvCard>
    case 'topIncidents':
      return <TvCard title="Top incidencias" subtitle="Tipos más repetidos hoy" icon={<BarChart3 size={20} />}><div className="space-y-4">{data.topTypes.length === 0 ? <Empty text="Sin datos todavía." /> : data.topTypes.map((item) => <div key={item.label}><div className="mb-1.5 flex items-center justify-between gap-3 text-sm"><span className="font-bold text-slate-300">{item.label}</span><b className="text-lg">{item.count}</b></div><div className="h-2.5 overflow-hidden rounded-full bg-white/5"><motion.div initial={{ width: 0 }} animate={{ width: `${Math.max(8, (item.count / Math.max(1, ...data.topTypes.map((entry) => entry.count))) * 100)}%` }} transition={{ duration: .45, ease: [0.22, 1, 0.36, 1] }} className="h-full rounded-full bg-amber-400" /></div></div>)}</div></TvCard>
    case 'topStudents':
      return <TvCard title="Alumnos con más incidencias" subtitle="Ranking del día" icon={<Users size={20} />}><div className="space-y-2">{data.topStudents.length === 0 ? <Empty text="Sin incidencias hoy." /> : data.topStudents.map(({ student, count }, index) => <div key={student.id} className="flex items-center gap-3 rounded-xl bg-white/[.035] px-3 py-2.5"><span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-white/[.06] text-sm font-black text-slate-400">{index + 1}</span><div className="min-w-0 flex-1"><p className="truncate text-sm font-black">{student.firstName} {student.lastName}</p><p className="text-[11px] font-semibold text-slate-500">{data.classroomById.get(student.classroomId)?.grade ?? 'Aula'} {data.classroomById.get(student.classroomId)?.section ?? ''}</p></div><span className="rounded-lg bg-red-500/10 px-2.5 py-1 text-sm font-black text-red-300">{count}</span></div>)}</div></TvCard>
    case 'attendanceSummary':
      return <TvCard title="Resumen de asistencia" subtitle="Estado del día" icon={<BarChart3 size={20} />}><div className="grid grid-cols-2 gap-3"><MiniStat label="Ingresaron" value={data.entered} /> <MiniStat label="A tiempo" value={data.onTime} /> <MiniStat label="Tardanzas" value={data.late} /> <MiniStat label="Cobertura" value={`${data.attendancePercentage}%`} /></div></TvCard>
    case 'exitSummary':
      return <TvCard title="Salidas registradas" subtitle="Control de salida" icon={<LogOut size={20} />}><div className="flex items-end justify-between gap-4"><div><p className="text-4xl font-black tabular-nums">{data.exited}</p><p className="mt-1 text-xs font-bold uppercase tracking-widest text-slate-500">de {data.entered} ingresados</p></div><div className="rounded-2xl bg-white/5 p-4 text-emerald-300"><LogOut size={30} /></div></div></TvCard>
    case 'presentationCompliance':
      return <TvCard title="Cumplimiento de presentación" subtitle="Control del reglamento" icon={<CheckCircle2 size={20} />}><div className="flex items-center gap-5"><div className="relative grid h-24 w-24 shrink-0 place-items-center rounded-full" style={{ background: `conic-gradient(#d4a94f ${data.presentationPercentage * 3.6}deg, rgba(255,255,255,.07) 0deg)` }}><div className="grid h-16 w-16 place-items-center rounded-full bg-[#09111e] text-lg font-black">{data.presentationPercentage}%</div></div><div><p className="text-2xl font-black">{data.complianceOk}</p><p className="text-sm font-semibold text-slate-500">sin incidencias de presentación</p><p className="mt-2 text-xs font-bold text-slate-500">{data.complianceChecked} registros con incumplimiento</p></div></div></TvCard>
    case 'pendingStudents':
      return <TvCard title="Alumnos sin ingreso" subtitle={`${data.pendingStudents.length} pendientes de marcar`} icon={<Users size={20} />}><div className="max-h-[30rem] space-y-2 overflow-auto pr-1">{data.pendingStudents.length === 0 ? <Empty text="Todos los alumnos tienen registro de ingreso." /> : data.pendingStudents.map(({ student, classroom }) => <div key={student.id} className="flex items-center gap-3 rounded-2xl border border-white/7 bg-white/[.035] p-3"><div className="grid h-9 w-9 place-items-center rounded-xl bg-white/5 text-slate-400"><Clock3 size={17}/></div><div className="min-w-0 flex-1"><p className="truncate font-black">{student.firstName} {student.lastName}</p><p className="text-xs font-semibold text-slate-500">{classroom ? `${classroom.grade} ${classroom.section}` : 'Aula'}</p></div><span className="rounded-full bg-white/5 px-2 py-1 text-[10px] font-black uppercase tracking-wider text-slate-400">Pendiente</span></div>)}</div></TvCard>
    case 'classroomSummary':
      return <TvCard title="Resumen por aula" subtitle="Visión completa del colegio" icon={<LayoutDashboard size={20} />}><div className="grid max-h-[34rem] gap-2 overflow-auto pr-1 sm:grid-cols-2">{data.classroomSummary.map(({ classroom, total, entered, late, pending }) => <div key={classroom.id} className="rounded-2xl border border-white/7 bg-white/[.035] p-3.5"><div className="flex items-center justify-between gap-3"><div><p className="font-black">{classroom.grade} {classroom.section}</p><p className="text-[11px] font-semibold text-slate-500">{classroom.level}</p></div><span className="rounded-lg bg-white/5 px-2 py-1 text-xs font-black">{entered}/{total}</span></div><div className="mt-3 grid grid-cols-3 gap-2 text-center text-[11px]"><div className="rounded-xl bg-emerald-500/8 px-2 py-2"><b className="block text-emerald-300">{Math.max(0, entered - late)}</b><span className="text-slate-500">a tiempo</span></div><div className="rounded-xl bg-amber-500/8 px-2 py-2"><b className="block text-amber-300">{late}</b><span className="text-slate-500">tarde</span></div><div className="rounded-xl bg-white/5 px-2 py-2"><b className="block text-slate-300">{pending}</b><span className="text-slate-500">pend.</span></div></div></div>)}</div></TvCard>
    case 'incidentsByClassroom':
      return <TvCard title="Incidencias por aula" subtitle="Dónde se concentran hoy" icon={<ShieldAlert size={20} />}><div className="space-y-2">{data.incidentsByClassroom.length === 0 ? <Empty text="Sin incidencias por aula." /> : data.incidentsByClassroom.map(({ classroom, count }) => <div key={classroom.id} className="flex items-center gap-3 rounded-xl bg-white/[.035] px-3 py-3"><div className="min-w-0 flex-1"><p className="truncate font-black">{classroom.grade} {classroom.section}</p><p className="text-[11px] font-semibold text-slate-500">{classroom.level}</p></div><span className={`rounded-lg px-2.5 py-1 text-sm font-black ${count ? 'bg-amber-500/10 text-amber-300' : 'bg-white/5 text-slate-500'}`}>{count}</span></div>)}</div></TvCard>
  }
}

function MetricStrip({ data, totalStudents }: { data: PanelData; totalStudents: number }) {
  return <div className="grid grid-cols-2 gap-3 md:grid-cols-5 xl:grid-cols-5"><Metric icon={<Users size={21} />} label="Alumnos" value={totalStudents} /><Metric icon={<LogIn size={21} />} label="Ingresaron" value={data.entered} accent="emerald" /><Metric icon={<Clock3 size={21} />} label="A tiempo" value={data.onTime} accent="blue" /><Metric icon={<AlertTriangle size={21} />} label="Tardanzas" value={data.late} accent="amber" /><Metric icon={<Users size={21} />} label="Sin marcar" value={data.pending} accent="slate" /></div>
}

function StudentRow({ student, classroom, time, status, icon }: { student: Student; classroom?: Classroom; time: string; status: 'ON_TIME' | 'LATE'; icon: ReactNode }) {
  return <div className="flex items-center gap-3 rounded-2xl border border-white/7 bg-white/[.035] p-3"><div className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${status === 'LATE' ? 'bg-amber-500/15 text-amber-300' : 'bg-emerald-500/15 text-emerald-300'}`}>{icon}</div><div className="min-w-0 flex-1"><p className="truncate font-black">{student.firstName} {student.lastName}</p><p className="mt-0.5 text-xs font-semibold text-slate-500">{classroom ? `${classroom.grade} ${classroom.section} · ${classroom.level}` : 'Aula'}</p></div><div className="text-right"><p className="font-mono text-lg font-black">{time}</p><p className={`text-[10px] font-black uppercase tracking-wider ${status === 'LATE' ? 'text-amber-300' : 'text-emerald-300'}`}>{status === 'LATE' ? 'Tardanza' : 'A tiempo'}</p></div></div>
}

function Metric({ icon, label, value, accent = 'slate' }: { icon: ReactNode; label: string; value: number; accent?: 'slate' | 'emerald' | 'blue' | 'amber' }) {
  const accentClass = accent === 'emerald' ? 'text-emerald-300 bg-emerald-500/10' : accent === 'blue' ? 'text-brand-gold bg-brand-gold/10' : accent === 'amber' ? 'text-amber-300 bg-amber-500/10' : 'text-slate-300 bg-white/5'
  return <div className="rounded-2xl border border-white/10 bg-white/[.035] p-4 xl:p-5"><div className={`inline-flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-black uppercase tracking-wider ${accentClass}`}>{icon}{label}</div><p className="mt-4 text-4xl font-black tabular-nums xl:text-5xl">{value}</p></div>
}

function MiniStat({ label, value }: { label: string; value: number | string }) {
  return <div className="rounded-2xl bg-white/[.035] p-3"><p className="text-xl font-black tabular-nums">{value}</p><p className="mt-1 text-[11px] font-black uppercase tracking-widest text-slate-500">{label}</p></div>
}

function TvCard({ title, subtitle, icon, children, strong = false }: { title: string; subtitle: string; icon: ReactNode; children: ReactNode; strong?: boolean }) {
  return <section className={`h-full rounded-3xl border p-4 xl:p-5 ${strong ? 'border-brand-gold/15 bg-brand-gold/[.035]' : 'border-white/10 bg-white/[.025]'}`}><div className="mb-4 flex items-start gap-3"><div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white/5 text-slate-300">{icon}</div><div className="min-w-0"><h2 className="text-lg font-black xl:text-xl">{title}</h2><p className="mt-0.5 text-xs font-semibold text-slate-500">{subtitle}</p></div></div>{children}</section>
}

function Empty({ text }: { text: string }) {
  return <div className="rounded-2xl border border-dashed border-white/10 px-4 py-8 text-center text-sm font-semibold text-slate-500">{text}</div>
}
