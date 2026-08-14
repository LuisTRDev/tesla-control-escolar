import { useEffect, useMemo, useState } from 'react'
import {
  Check,
  ChevronDown,
  ClipboardCheck,
  Clock3,
  Download,
  Edit3,
  FileText,
  LogOut,
  Monitor,
  Moon,
  RotateCcw,
  Search,
  Settings,
  Settings2,
  Shirt,
  Sun,
  TriangleAlert,
  Volume2,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { classrooms } from '@/data/classrooms'
import { downloadNotificationPdf, downloadNotificationWord } from '@/lib/notification'
import { students } from '@/data/students'
import {
  clearTodayAttendance,
  clearTodayPresentation,
  getAttendance,
  getCurrentTime,
  getEntryLimit,
  getPreferences,
  getPresentationRecords,
  getTodayKey,
  recalculateTodayAttendance,
  registerAttendance,
  resetPreferences,
  saveEntryLimit,
  savePreferences,
  savePresentationRecord,
  type UserPreferences,
} from '@/lib/storage'
import type {
  AttendanceFilter,
  AttendanceRecord,
  Classroom,
  PresentationFilter,
  PresentationRecord,
  PresentationStatus,
  Student,
} from '@/types'

type Props = {
  userName: string
  classroom: Classroom
  onClassroomChange: (classroom: Classroom) => void
  onLogout: () => void
}

const attendanceFilters: Array<{ id: AttendanceFilter; label: string }> = [
  { id: 'ALL', label: 'Todos' },
  { id: 'ON_TIME', label: 'A tiempo' },
  { id: 'LATE', label: 'Tardanza' },
  { id: 'PENDING', label: 'Pendientes' },
]

const presentationFilters: Array<{ id: PresentationFilter; label: string }> = [
  { id: 'ALL', label: 'Todos' },
  { id: 'COMPLIANT', label: 'Conforme' },
  { id: 'NON_COMPLIANT', label: 'Con incumplimiento' },
  { id: 'PENDING', label: 'Sin revisar' },
]

type PresentationDraft = {
  status: PresentationStatus | null
  hairstyleViolation: boolean
  uniformUsageViolation: boolean
  nonInstitutionalGarment: boolean
  otherViolation: boolean
  otherDescription: string
}

const emptyPresentationDraft: PresentationDraft = {
  status: null,
  hairstyleViolation: false,
  uniformUsageViolation: false,
  nonInstitutionalGarment: false,
  otherViolation: false,
  otherDescription: '',
}

function getViolationCount(record?: PresentationRecord) {
  if (!record || record.status !== 'NON_COMPLIANT') return 0
  return [
    record.hairstyleViolation,
    record.uniformUsageViolation,
    record.nonInstitutionalGarment,
    record.otherViolation,
  ].filter(Boolean).length
}

export default function Attendance({ userName, classroom, onClassroomChange, onLogout }: Props) {
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<AttendanceFilter>('ALL')
  const [presentationFilter, setPresentationFilter] = useState<PresentationFilter>('ALL')
  const [records, setRecords] = useState<AttendanceRecord[]>(() => getAttendance())
  const [presentationRecords, setPresentationRecords] = useState<PresentationRecord[]>(() => getPresentationRecords())
  const [entryLimit, setEntryLimit] = useState(() => getEntryLimit())
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [presentationStudent, setPresentationStudent] = useState<Student | null>(null)
  const [notificationStudent, setNotificationStudent] = useState<Student | null>(null)
  const [presentationDraft, setPresentationDraft] = useState<PresentationDraft>(emptyPresentationDraft)
  const [preferences, setPreferences] = useState<UserPreferences>(() => getPreferences())
  const today = getTodayKey()

  const [systemDark, setSystemDark] = useState(() => window.matchMedia('(prefers-color-scheme: dark)').matches)
  const darkMode = preferences.theme === 'dark' || (preferences.theme === 'system' && systemDark)
  const sizeClass = preferences.interfaceSize === 'large' ? 'text-[17px]' : ''

  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode)
    return () => document.documentElement.classList.remove('dark')
  }, [darkMode])

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const update = (event: MediaQueryListEvent) => setSystemDark(event.matches)
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])

  function updatePreferences(next: UserPreferences) {
    setPreferences(savePreferences(next))
  }

  function playConfirmation() {
    if (!preferences.soundEnabled) return
    try {
      const AudioCtx = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (!AudioCtx) return
      const ctx = new AudioCtx()
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.frequency.value = 720
      gain.gain.setValueAtTime(0.05, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12)
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start()
      osc.stop(ctx.currentTime + 0.12)
    } catch {
      // El sonido es una preferencia opcional.
    }
  }

  const classroomStudents = useMemo(
    () => students.filter((student) => student.classroomId === classroom.id),
    [classroom.id],
  )

  const todayRecords = records.filter((record) => record.date === today)
  const todayPresentationRecords = presentationRecords.filter((record) => record.date === today)

  const classroomRecords = todayRecords.filter((record) =>
    classroomStudents.some((student) => student.id === record.studentId),
  )

  const classroomPresentationRecords = todayPresentationRecords.filter((record) =>
    classroomStudents.some((student) => student.id === record.studentId),
  )

  const onTimeCount = classroomRecords.filter((record) => record.status === 'ON_TIME').length
  const lateCount = classroomRecords.filter((record) => record.status === 'LATE').length
  const presentCount = classroomRecords.length
  const pendingCount = classroomStudents.length - presentCount

  const compliantCount = classroomPresentationRecords.filter((record) => record.status === 'COMPLIANT').length
  const nonCompliantCount = classroomPresentationRecords.filter((record) => record.status === 'NON_COMPLIANT').length
  const presentationPendingCount = classroomStudents.length - classroomPresentationRecords.length

  const filtered = classroomStudents.filter((student) => {
    const nameMatches = `${student.firstName} ${student.lastName}`
      .toLowerCase()
      .includes(query.toLowerCase())
    if (!nameMatches) return false

    const attendance = todayRecords.find((item) => item.studentId === student.id)
    if (filter === 'ON_TIME' && attendance?.status !== 'ON_TIME') return false
    if (filter === 'LATE' && attendance?.status !== 'LATE') return false
    if (filter === 'PENDING' && attendance) return false

    const presentation = todayPresentationRecords.find((item) => item.studentId === student.id)
    if (presentationFilter === 'COMPLIANT' && presentation?.status !== 'COMPLIANT') return false
    if (presentationFilter === 'NON_COMPLIANT' && presentation?.status !== 'NON_COMPLIANT') return false
    if (presentationFilter === 'PENDING' && presentation) return false

    return true
  })

  function mark(studentId: string) {
    setRecords(registerAttendance(studentId, entryLimit))
    playConfirmation()
  }

  function resetToday() {
    if (confirm('¿Borrar los registros de ingreso y presentación de hoy?')) {
      setRecords(clearTodayAttendance())
      setPresentationRecords(clearTodayPresentation())
    }
  }

  function changeClassroom(classroomId: string) {
    const selected = classrooms.find((item) => item.id === classroomId)
    if (!selected) return
    setQuery('')
    setFilter('ALL')
    setPresentationFilter('ALL')
    onClassroomChange(selected)
    if (preferences.rememberClassroom) {
      updatePreferences({ ...preferences, lastClassroomId: selected.id })
    }
  }

  function updateEntryLimit(value: string) {
    setEntryLimit(value)
    saveEntryLimit(value)
    setRecords(recalculateTodayAttendance(value))
  }

  function openPresentation(student: Student) {
    const existing = todayPresentationRecords.find((item) => item.studentId === student.id)
    setPresentationStudent(student)
    setPresentationDraft(existing ? {
      status: existing.status,
      hairstyleViolation: existing.hairstyleViolation,
      uniformUsageViolation: existing.uniformUsageViolation,
      nonInstitutionalGarment: existing.nonInstitutionalGarment,
      otherViolation: existing.otherViolation,
      otherDescription: existing.otherDescription,
    } : emptyPresentationDraft)
  }

  function setPresentationMode(status: PresentationStatus) {
    if (status === 'COMPLIANT') {
      setPresentationDraft({ ...emptyPresentationDraft, status: 'COMPLIANT' })
      return
    }
    setPresentationDraft((current) => ({ ...current, status: 'NON_COMPLIANT' }))
  }

  function savePresentation() {
    if (!presentationStudent || !presentationDraft.status) return

    if (presentationDraft.status === 'NON_COMPLIANT') {
      const hasViolation = presentationDraft.hairstyleViolation
        || presentationDraft.uniformUsageViolation
        || presentationDraft.nonInstitutionalGarment
        || presentationDraft.otherViolation
      if (!hasViolation) return
      if (presentationDraft.otherViolation && !presentationDraft.otherDescription.trim()) return
    }

    const record: PresentationRecord = {
      studentId: presentationStudent.id,
      date: today,
      status: presentationDraft.status,
      hairstyleViolation: presentationDraft.status === 'NON_COMPLIANT' && presentationDraft.hairstyleViolation,
      uniformUsageViolation: presentationDraft.status === 'NON_COMPLIANT' && presentationDraft.uniformUsageViolation,
      nonInstitutionalGarment: presentationDraft.status === 'NON_COMPLIANT' && presentationDraft.nonInstitutionalGarment,
      otherViolation: presentationDraft.status === 'NON_COMPLIANT' && presentationDraft.otherViolation,
      otherDescription: presentationDraft.status === 'NON_COMPLIANT' && presentationDraft.otherViolation
        ? presentationDraft.otherDescription.trim()
        : '',
      checkedAt: getCurrentTime(),
    }

    setPresentationRecords(savePresentationRecord(record))
    setPresentationStudent(null)
    setPresentationDraft(emptyPresentationDraft)
    if (record.status === 'NON_COMPLIANT') setNotificationStudent(presentationStudent)
    playConfirmation()
  }

  const hasSelectedViolation = presentationDraft.hairstyleViolation
    || presentationDraft.uniformUsageViolation
    || presentationDraft.nonInstitutionalGarment
    || presentationDraft.otherViolation

  const presentationSaveDisabled = !presentationDraft.status
    || (presentationDraft.status === 'NON_COMPLIANT' && !hasSelectedViolation)
    || (presentationDraft.status === 'NON_COMPLIANT'
      && presentationDraft.otherViolation
      && !presentationDraft.otherDescription.trim())

  return (
    <main className={`${sizeClass} min-h-screen bg-slate-50 text-slate-950 transition-colors duration-200 dark:bg-slate-950 dark:text-slate-100`}>
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 backdrop-blur dark:border-slate-800 dark:bg-slate-950/95">
        <div className="mx-auto max-w-5xl px-5 py-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-slate-400">Tesla</p>
              <h1 className="text-lg font-black">Control Escolar</h1>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">Auxiliar: {userName}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => setSettingsOpen(true)} aria-label="Configuración">
                <Settings className="mr-2" size={18} />
                Configuración
              </Button>
              <Button variant="outline" onClick={resetToday}>
                <RotateCcw className="mr-2" size={17} />
                Reiniciar hoy
              </Button>
              <Button variant="ghost" onClick={onLogout}>
                <LogOut className="mr-2" size={18} />
                Salir
              </Button>
            </div>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-5xl px-5 py-6">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 text-slate-950 shadow-sm transition-colors dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Control diario</p>
              <h2 className="mt-1 text-2xl font-black tracking-tight">Lista de alumnos</h2>
              <p className="mt-1 max-w-xl text-sm text-slate-500 dark:text-slate-400">
                Registra la llegada, detecta tardanzas y controla la presentación institucional desde una sola vista.
              </p>
            </div>

            <div className="grid w-full gap-4 sm:grid-cols-2 lg:w-auto">
              <label className="block sm:w-56">
                <span className="mb-2 block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Aula</span>
                <div className="relative">
                  <select
                    className="h-12 w-full appearance-none rounded-xl border border-slate-300 bg-white px-4 pr-10 text-sm font-semibold text-slate-900 outline-none transition-colors focus:border-slate-500 focus:ring-2 focus:ring-slate-200 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:focus:ring-slate-800"
                    value={classroom.id}
                    onChange={(event) => changeClassroom(event.target.value)}
                  >
                    {classrooms.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.grade} {item.section} · {item.level}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-3 top-3.5 text-slate-400" size={20} />
                </div>
              </label>

              <label className="block sm:w-40">
                <span className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  <Settings2 size={14} /> Hora límite
                </span>
                <Input
                  type="time"
                  value={entryLimit}
                  onChange={(event) => updateEntryLimit(event.target.value)}
                  className="font-bold"
                />
              </label>
            </div>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-slate-400">{classroom.level}</p>
            <h3 className="text-2xl font-black">{classroom.grade} {classroom.section}</h3>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm text-slate-600 transition-colors dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
            Hora límite: <span className="font-black text-slate-950 dark:text-slate-100">{entryLimit}</span>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Card className="p-4">
            <p className="text-xs text-slate-500 dark:text-slate-400">Alumnos</p>
            <p className="mt-1 text-2xl font-black">{classroomStudents.length}</p>
          </Card>
          <Card className="p-4">
            <p className="text-xs text-slate-500 dark:text-slate-400">A tiempo</p>
            <p className="mt-1 text-2xl font-black text-emerald-700 dark:text-emerald-400">{onTimeCount}</p>
          </Card>
          <Card className="p-4">
            <p className="text-xs text-slate-500 dark:text-slate-400">Tardanzas</p>
            <p className="mt-1 text-2xl font-black text-amber-700 dark:text-amber-400">{lateCount}</p>
          </Card>
          <Card className="p-4">
            <p className="text-xs text-slate-500 dark:text-slate-400">Pendientes</p>
            <p className="mt-1 text-2xl font-black">{pendingCount}</p>
          </Card>
        </div>

        <Card className="mt-3 p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="flex items-center gap-2 text-sm font-black"><Shirt size={17} /> Presentación institucional</p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Estado del control de presentación para el aula seleccionada.</p>
            </div>
            <div className="flex flex-wrap gap-2 text-sm">
              <span className="rounded-lg bg-emerald-50 px-3 py-1.5 font-bold text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">{compliantCount} conformes</span>
              <span className="rounded-lg bg-amber-50 px-3 py-1.5 font-bold text-amber-700 dark:bg-amber-950/45 dark:text-amber-300">{nonCompliantCount} con incidencia</span>
              <span className="rounded-lg bg-slate-100 px-3 py-1.5 font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">{presentationPendingCount} sin revisar</span>
            </div>
          </div>
        </Card>

        <div className="mt-6 grid gap-3 lg:grid-cols-[1fr_auto] lg:items-center">
          <div className="relative">
            <Search className="absolute left-4 top-3.5 text-slate-400" size={20} />
            <Input
              className="pl-12"
              placeholder={`Buscar alumno en ${classroom.grade} ${classroom.section}...`}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="flex gap-2 overflow-x-auto pb-1 sm:pb-0">
              {attendanceFilters.map((item) => (
                <Button
                  key={item.id}
                  variant={filter === item.id ? 'default' : 'outline'}
                  className="whitespace-nowrap"
                  onClick={() => setFilter(item.id)}
                >
                  {item.label}
                </Button>
              ))}
            </div>
            <label className="relative min-w-48">
              <select
                value={presentationFilter}
                onChange={(event) => setPresentationFilter(event.target.value as PresentationFilter)}
                className="h-11 w-full appearance-none rounded-xl border border-slate-300 bg-white px-3 pr-9 text-sm font-semibold text-slate-900 outline-none transition-colors dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              >
                {presentationFilters.map((item) => (
                  <option key={item.id} value={item.id}>Presentación: {item.label}</option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-3 top-3 text-slate-400" size={18} />
            </label>
          </div>
        </div>

        <div className="mt-5 space-y-3">
          {filtered.map((student) => {
            const record = todayRecords.find((item) => item.studentId === student.id)
            const presentation = todayPresentationRecords.find((item) => item.studentId === student.id)
            const violations = getViolationCount(presentation)

            return (
              <Card key={student.id} className="p-4 sm:p-5">
                <div className="flex flex-col gap-4">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
                    <div className="flex-1">
                      <h3 className="font-bold">{student.firstName} {student.lastName}</h3>
                      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{classroom.grade} {classroom.section} · {classroom.level}</p>
                    </div>

                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                      {record ? (
                        record.status === 'ON_TIME' ? (
                          <div className="flex min-w-44 items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 font-bold text-emerald-700 dark:border-emerald-900/70 dark:bg-emerald-950/50 dark:text-emerald-300">
                            <Check size={18} />
                            {record.time} · A tiempo
                          </div>
                        ) : (
                          <div className="flex min-w-44 items-center justify-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 font-bold text-amber-700 dark:border-amber-900/70 dark:bg-amber-950/45 dark:text-amber-300">
                            <TriangleAlert size={18} />
                            {record.time} · Tardanza
                          </div>
                        )
                      ) : (
                        <Button className="w-full sm:w-auto" onClick={() => mark(student.id)}>
                          <Clock3 className="mr-2" size={18} />
                          Marcar entrada
                        </Button>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-col gap-3 border-t border-slate-100 pt-3 dark:border-slate-800 sm:flex-row sm:items-center sm:justify-between">
                    {presentation?.status === 'COMPLIANT' ? (
                      <div className="flex items-center gap-2 text-sm font-bold text-emerald-700 dark:text-emerald-300">
                        <ClipboardCheck size={18} /> Presentación: Conforme · {presentation.checkedAt}
                      </div>
                    ) : presentation?.status === 'NON_COMPLIANT' ? (
                      <div className="flex items-center gap-2 text-sm font-bold text-amber-700 dark:text-amber-300">
                        <TriangleAlert size={18} /> Presentación: {violations} {violations === 1 ? 'incidencia' : 'incidencias'} · {presentation.checkedAt}
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 text-sm font-semibold text-slate-500 dark:text-slate-400">
                        <Shirt size={18} /> Presentación: Sin revisar
                      </div>
                    )}

                    <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
                      {presentation?.status === 'NON_COMPLIANT' && (
                        <Button variant="outline" className="w-full sm:w-auto" onClick={() => setNotificationStudent(student)}>
                          <FileText className="mr-2" size={17} /> Notificación
                        </Button>
                      )}
                      <Button variant="outline" className="w-full sm:w-auto" onClick={() => openPresentation(student)}>
                        {presentation ? <Edit3 className="mr-2" size={17} /> : <ClipboardCheck className="mr-2" size={17} />}
                        {presentation ? 'Editar control' : 'Revisar presentación'}
                      </Button>
                    </div>
                  </div>
                </div>
              </Card>
            )
          })}

          {filtered.length === 0 && (
            <div className="py-12 text-center text-sm text-slate-500 dark:text-slate-400">No hay alumnos que coincidan con estos filtros.</div>
          )}
        </div>
      </section>

      {presentationStudent && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/50 p-4 backdrop-blur-[1px] dark:bg-black/65" onMouseDown={() => setPresentationStudent(null)}>
          <section
            className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-slate-200 bg-white p-5 text-slate-950 shadow-2xl dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100 sm:p-6"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-slate-400">Control de presentación</p>
                <h2 className="mt-1 text-xl font-black">{presentationStudent.firstName} {presentationStudent.lastName}</h2>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{classroom.grade} {classroom.section} · {classroom.level}</p>
              </div>
              <Button variant="ghost" onClick={() => setPresentationStudent(null)} aria-label="Cerrar"><X size={20} /></Button>
            </div>

            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => setPresentationMode('COMPLIANT')}
                className={`rounded-2xl border p-4 text-left transition ${presentationDraft.status === 'COMPLIANT'
                  ? 'border-emerald-500 bg-emerald-50 ring-2 ring-emerald-100 dark:border-emerald-500 dark:bg-emerald-950/40 dark:ring-emerald-950'
                  : 'border-slate-200 bg-slate-50 hover:border-slate-300 dark:border-slate-700 dark:bg-slate-950/60 dark:hover:border-slate-600'}`}
              >
                <span className="flex items-center gap-2 font-black text-emerald-700 dark:text-emerald-300"><Check size={19} /> Todo conforme</span>
                <span className="mt-1 block text-sm text-slate-500 dark:text-slate-400">El alumno fue revisado y no presenta incidencias.</span>
              </button>

              <button
                type="button"
                onClick={() => setPresentationMode('NON_COMPLIANT')}
                className={`rounded-2xl border p-4 text-left transition ${presentationDraft.status === 'NON_COMPLIANT'
                  ? 'border-amber-500 bg-amber-50 ring-2 ring-amber-100 dark:border-amber-500 dark:bg-amber-950/35 dark:ring-amber-950'
                  : 'border-slate-200 bg-slate-50 hover:border-slate-300 dark:border-slate-700 dark:bg-slate-950/60 dark:hover:border-slate-600'}`}
              >
                <span className="flex items-center gap-2 font-black text-amber-700 dark:text-amber-300"><TriangleAlert size={19} /> Registrar incumplimiento</span>
                <span className="mt-1 block text-sm text-slate-500 dark:text-slate-400">Selecciona una o varias disposiciones incumplidas.</span>
              </button>
            </div>

            {presentationDraft.status === 'NON_COMPLIANT' && (
              <div className="mt-6 space-y-3">
                <p className="text-sm font-black">Incumplimientos institucionales</p>
                {[
                  ['hairstyleViolation', 'Peinado no acorde con las disposiciones institucionales.'],
                  ['uniformUsageViolation', 'Uso inadecuado o incompleto del uniforme.'],
                  ['nonInstitutionalGarment', 'Prenda no correspondiente al uniforme institucional.'],
                  ['otherViolation', 'Otro.'],
                ].map(([key, label]) => (
                  <label key={key} className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 transition-colors hover:border-slate-300 dark:border-slate-700 dark:bg-slate-950/60 dark:hover:border-slate-600">
                    <input
                      type="checkbox"
                      className="mt-0.5 h-5 w-5 shrink-0 accent-slate-950 dark:accent-slate-100"
                      checked={Boolean(presentationDraft[key as keyof PresentationDraft])}
                      onChange={(event) => setPresentationDraft((current) => ({
                        ...current,
                        [key]: event.target.checked,
                        ...(key === 'otherViolation' && !event.target.checked ? { otherDescription: '' } : {}),
                      }))}
                    />
                    <span className="text-sm font-semibold leading-6">{label}</span>
                  </label>
                ))}

                {presentationDraft.otherViolation && (
                  <label className="block rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-950/50">
                    <span className="text-sm font-black">Especifique el incumplimiento</span>
                    <textarea
                      value={presentationDraft.otherDescription}
                      onChange={(event) => setPresentationDraft((current) => ({ ...current, otherDescription: event.target.value }))}
                      placeholder="Escriba qué disposición se incumplió..."
                      rows={3}
                      className="mt-2 w-full resize-none rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition-colors focus:border-slate-500 focus:ring-2 focus:ring-slate-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:focus:ring-slate-800"
                    />
                    {!presentationDraft.otherDescription.trim() && (
                      <span className="mt-1 block text-xs font-semibold text-amber-700 dark:text-amber-300">Este campo es obligatorio al seleccionar “Otro”.</span>
                    )}
                  </label>
                )}
              </div>
            )}

            <div className="mt-7 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button variant="outline" onClick={() => setPresentationStudent(null)}>Cancelar</Button>
              <Button disabled={presentationSaveDisabled} onClick={savePresentation}>
                <ClipboardCheck className="mr-2" size={18} /> Guardar control
              </Button>
            </div>
          </section>
        </div>
      )}

      {notificationStudent && (() => {
        const notificationRecord = todayPresentationRecords.find((item) => item.studentId === notificationStudent.id && item.status === 'NON_COMPLIANT')
        if (!notificationRecord) return null
        return (
          <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/50 p-4 backdrop-blur-[1px] dark:bg-black/65" onMouseDown={() => setNotificationStudent(null)}>
            <section className="w-full max-w-xl rounded-2xl border border-slate-200 bg-white p-5 text-slate-950 shadow-2xl dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100 sm:p-6" onMouseDown={(event) => event.stopPropagation()}>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-bold uppercase tracking-widest text-slate-400">Documento personalizado</p>
                  <h2 className="mt-1 text-xl font-black">Notificación a padres de familia</h2>
                  <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Lista para descargar e imprimir.</p>
                </div>
                <Button variant="ghost" onClick={() => setNotificationStudent(null)} aria-label="Cerrar"><X size={20} /></Button>
              </div>

              <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm dark:border-slate-700 dark:bg-slate-950/60">
                <div className="grid gap-2 sm:grid-cols-2">
                  <p><span className="font-black">Estudiante:</span> {notificationStudent.firstName} {notificationStudent.lastName}</p>
                  <p><span className="font-black">Grado:</span> {classroom.grade} {classroom.section} · {classroom.level}</p>
                  <p><span className="font-black">Tutor(a) del aula:</span> {classroom.tutorName}</p>
                  <p><span className="font-black">Apoderado:</span> {notificationStudent.guardianName}</p>
                  <p><span className="font-black">DNI apoderado:</span> {notificationStudent.guardianDni}</p>
                  <p><span className="font-black">Fecha:</span> {notificationRecord.date}</p>
                </div>
                <div className="mt-4 border-t border-slate-200 pt-4 dark:border-slate-700">
                  <p className="font-black">Incumplimientos marcados</p>
                  <ul className="mt-2 space-y-1 text-slate-600 dark:text-slate-300">
                    {notificationRecord.hairstyleViolation && <li>• Peinado no acorde con las disposiciones institucionales.</li>}
                    {notificationRecord.uniformUsageViolation && <li>• Uso inadecuado o incompleto del uniforme.</li>}
                    {notificationRecord.nonInstitutionalGarment && <li>• Prenda no correspondiente al uniforme institucional.</li>}
                    {notificationRecord.otherViolation && <li>• Otro: {notificationRecord.otherDescription}</li>}
                  </ul>
                </div>
              </div>

              <div className="mt-6 grid gap-2 sm:grid-cols-2">
                <Button onClick={() => downloadNotificationPdf(notificationStudent, classroom, notificationRecord)}>
                  <Download className="mr-2" size={18} /> Descargar PDF
                </Button>
                <Button variant="outline" onClick={() => void downloadNotificationWord(notificationStudent, classroom, notificationRecord)}>
                  <FileText className="mr-2" size={18} /> Descargar Word
                </Button>
              </div>
            </section>
          </div>
        )
      })()}

      {settingsOpen && (
        <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/45 backdrop-blur-[1px] dark:bg-black/55" onMouseDown={() => setSettingsOpen(false)}>
          <aside
            className="h-full w-full max-w-md overflow-y-auto border-l border-slate-200 bg-white p-6 text-slate-950 shadow-2xl transition-colors dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-slate-400">Preferencias</p>
                <h2 className="text-2xl font-black">Configuración</h2>
              </div>
              <Button variant="ghost" onClick={() => setSettingsOpen(false)} aria-label="Cerrar"><X size={20} /></Button>
            </div>

            <div className="mt-8 space-y-8">
              <section>
                <h3 className="font-black">Apariencia</h3>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Elige cómo quieres ver el sistema.</p>
                <div className="mt-3 grid grid-cols-3 gap-2">
                  {[
                    { id: 'light' as const, label: 'Claro', icon: Sun },
                    { id: 'dark' as const, label: 'Oscuro', icon: Moon },
                    { id: 'system' as const, label: 'Sistema', icon: Monitor },
                  ].map((option) => {
                    const Icon = option.icon
                    return (
                      <Button
                        key={option.id}
                        variant={preferences.theme === option.id ? 'default' : 'outline'}
                        onClick={() => updatePreferences({ ...preferences, theme: option.id })}
                      >
                        <Icon className="mr-2" size={16} />{option.label}
                      </Button>
                    )
                  })}
                </div>
              </section>

              <section>
                <h3 className="font-black">Interfaz</h3>
                <label className="mt-3 block text-sm font-semibold">Tamaño de interfaz</label>
                <select
                  className="mt-2 h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-slate-900 outline-none transition-colors focus:border-slate-500 focus:ring-2 focus:ring-slate-200 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:focus:ring-slate-800"
                  value={preferences.interfaceSize}
                  onChange={(e) => updatePreferences({ ...preferences, interfaceSize: e.target.value as 'normal' | 'large' })}
                >
                  <option value="normal">Normal</option>
                  <option value="large">Grande</option>
                </select>
                <label className="mt-4 flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 p-4 transition-colors dark:border-slate-700 dark:bg-slate-950/60">
                  <span className="flex items-center gap-3">
                    <Volume2 size={19} />
                    <span>
                      <b className="block">Sonido al registrar</b>
                      <small className="text-slate-500 dark:text-slate-400">Confirmación breve al guardar una acción</small>
                    </span>
                  </span>
                  <input type="checkbox" checked={preferences.soundEnabled} onChange={(e) => updatePreferences({ ...preferences, soundEnabled: e.target.checked })} className="h-5 w-5" />
                </label>
              </section>

              <section>
                <h3 className="font-black">Aula</h3>
                <label className="mt-3 flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 p-4 transition-colors dark:border-slate-700 dark:bg-slate-950/60">
                  <span>
                    <b className="block">Recordar última aula</b>
                    <small className="text-slate-500 dark:text-slate-400">Abrir la próxima vez en el aula utilizada</small>
                  </span>
                  <input
                    type="checkbox"
                    checked={preferences.rememberClassroom}
                    onChange={(e) => updatePreferences({
                      ...preferences,
                      rememberClassroom: e.target.checked,
                      lastClassroomId: e.target.checked ? classroom.id : null,
                    })}
                    className="h-5 w-5"
                  />
                </label>
              </section>

              <Button variant="outline" className="w-full" onClick={() => { const next = resetPreferences(); setPreferences(next) }}>
                <RotateCcw className="mr-2" size={17} /> Restablecer preferencias
              </Button>
            </div>
          </aside>
        </div>
      )}
    </main>
  )
}
