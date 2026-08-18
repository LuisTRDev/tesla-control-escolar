import { useEffect, useMemo, useState } from 'react'
import {
  Check, ChevronDown, BarChart3, CalendarDays, ClipboardCheck, Clock3, Download, Edit3, FileText,
  LogOut, Monitor, Moon, RotateCcw, Search, Settings, Settings2, Shirt, Sun, TriangleAlert, Volume2, X, BookOpen,
} from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import Dashboard from '@/components/Dashboard'
import { Input } from '@/components/ui/Input'
import {
  MAX_NOTIFICATIONS_PER_PAGE,
  downloadMultiNotificationPdf,
  downloadMultiNotificationWord,
  downloadNotificationPdf,
  downloadNotificationWord,
  type NotificationPrintData,
} from '@/lib/notification'
import { getCurrentTime, getPreferences, getTodayKey, resetPreferences, savePreferences, type UserPreferences } from '@/lib/storage'
import {
  deleteAttendanceForDate, deletePresentationForDate, getAttendanceRange, getEntryLimit, getPresentationRange, getStudents,
  recalculateAttendanceForDate, registerAttendance, saveEntryLimit, savePresentation as savePresentationRemote,
} from '@/services/schoolService'
import {
  ensureNotificationForPresentation,
  getNotificationLabel,
  getNotifications,
} from '@/services/notificationService'
import type {
  AttendanceFilter, AttendanceRecord, Classroom, NotificationRecord, PresentationFilter,
  PresentationRecord, PresentationStatus, Student,
} from '@/types'

type Props = {
  userName: string
  userRole: string
  classrooms: Classroom[]
  classroom: Classroom
  onClassroomChange: (classroom: Classroom) => void
  onLogout: () => void
}

const attendanceFilters: Array<{ id: AttendanceFilter; label: string }> = [
  { id: 'ALL', label: 'Todos' }, { id: 'ON_TIME', label: 'A tiempo' }, { id: 'LATE', label: 'Tardanza' }, { id: 'PENDING', label: 'Pendientes' },
]
const presentationFilters: Array<{ id: PresentationFilter; label: string }> = [
  { id: 'ALL', label: 'Todos' }, { id: 'COMPLIANT', label: 'Conforme' }, { id: 'NON_COMPLIANT', label: 'Con incumplimiento' }, { id: 'PENDING', label: 'Sin revisar' },
]

type PresentationDraft = { status: PresentationStatus | null; hairstyleViolation: boolean; uniformUsageViolation: boolean; nonInstitutionalGarment: boolean; otherViolation: boolean; otherDescription: string }
const emptyPresentationDraft: PresentationDraft = { status: null, hairstyleViolation: false, uniformUsageViolation: false, nonInstitutionalGarment: false, otherViolation: false, otherDescription: '' }
function getViolationCount(record?: PresentationRecord) {
  if (!record || record.status !== 'NON_COMPLIANT') return 0
  return [record.hairstyleViolation, record.uniformUsageViolation, record.nonInstitutionalGarment, record.otherViolation].filter(Boolean).length
}
function monthRange() {
  const now = new Date(); const y = now.getFullYear(); const m = now.getMonth();
  const fmt=(d:Date)=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
  return { from: fmt(new Date(y,m,1)), to: fmt(new Date(y,m+1,0)) }
}

export default function Attendance({ userName, userRole, classrooms, classroom, onClassroomChange, onLogout }: Props) {
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<AttendanceFilter>('ALL')
  const [presentationFilter, setPresentationFilter] = useState<PresentationFilter>('ALL')
  const [students, setStudents] = useState<Student[]>([])
  const [records, setRecords] = useState<AttendanceRecord[]>([])
  const [presentationRecords, setPresentationRecords] = useState<PresentationRecord[]>([])
  const [notifications, setNotifications] = useState<NotificationRecord[]>([])
  const [entryLimit, setEntryLimit] = useState('07:45')
  const [loadingData, setLoadingData] = useState(true)
  const [dataError, setDataError] = useState('')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [dashboardOpen, setDashboardOpen] = useState(false)
  const [now, setNow] = useState(() => new Date())
  const [presentationStudent, setPresentationStudent] = useState<Student | null>(null)
  const [notificationStudent, setNotificationStudent] = useState<Student | null>(null)
  const [multiNotificationOpen, setMultiNotificationOpen] = useState(false)
  const [selectedNotificationIds, setSelectedNotificationIds] = useState<string[]>([])
  const [notificationSearch, setNotificationSearch] = useState('')
  const [historyStudent, setHistoryStudent] = useState<Student | null>(null)
  const [presentationDraft, setPresentationDraft] = useState<PresentationDraft>(emptyPresentationDraft)
  const [preferences, setPreferences] = useState<UserPreferences>(() => getPreferences())
  const today = getTodayKey()
  const [systemDark, setSystemDark] = useState(() => window.matchMedia('(prefers-color-scheme: dark)').matches)
  const darkMode = preferences.theme === 'dark' || (preferences.theme === 'system' && systemDark)
  const sizeClass = preferences.interfaceSize === 'large' ? 'text-[17px]' : ''

  async function reloadData() {
    setLoadingData(true); setDataError('')
    try {
      const range = monthRange()
      const [studentData, attendanceData, presentationData, notificationData, limit] = await Promise.all([
        getStudents(),
        getAttendanceRange(range.from, range.to),
        getPresentationRange(range.from, range.to),
        getNotifications(),
        getEntryLimit(),
      ])
      setStudents(studentData)
      setRecords(attendanceData)
      setPresentationRecords(presentationData)
      setNotifications(notificationData)
      setEntryLimit(limit)
    } catch (error) {
      console.error(error); setDataError(error instanceof Error ? error.message : 'No se pudieron cargar los datos de Supabase.')
    } finally { setLoadingData(false) }
  }

  useEffect(() => { void reloadData() }, [])
  useEffect(() => { document.documentElement.classList.toggle('dark', darkMode); return () => document.documentElement.classList.remove('dark') }, [darkMode])
  useEffect(() => { const media=window.matchMedia('(prefers-color-scheme: dark)'); const update=(e:MediaQueryListEvent)=>setSystemDark(e.matches); media.addEventListener('change',update); return()=>media.removeEventListener('change',update) }, [])
  useEffect(() => { const timer=window.setInterval(()=>setNow(new Date()),1000); return()=>window.clearInterval(timer) }, [])

  const formattedClock = now.toLocaleTimeString('es-PE',{hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:true})
  const formattedDate = now.toLocaleDateString('es-PE',{weekday:'short',day:'2-digit',month:'short',year:'numeric'})
  function updatePreferences(next: UserPreferences) { setPreferences(savePreferences(next)) }
  function playConfirmation() {
    if (!preferences.soundEnabled) return
    try { const AudioCtx=window.AudioContext || (window as typeof window & {webkitAudioContext?:typeof AudioContext}).webkitAudioContext; if(!AudioCtx)return; const ctx=new AudioCtx(); const osc=ctx.createOscillator(); const gain=ctx.createGain(); osc.frequency.value=720; gain.gain.setValueAtTime(.05,ctx.currentTime); gain.gain.exponentialRampToValueAtTime(.001,ctx.currentTime+.12); osc.connect(gain); gain.connect(ctx.destination); osc.start(); osc.stop(ctx.currentTime+.12) } catch {}
  }

  const classroomStudents = useMemo(() => students.filter((student)=>student.classroomId===classroom.id), [students,classroom.id])
  const todayRecords = records.filter((r)=>r.date===today)
  const todayPresentationRecords = presentationRecords.filter((r)=>r.date===today)
  const classroomRecords=todayRecords.filter((r)=>classroomStudents.some((s)=>s.id===r.studentId))
  const classroomPresentationRecords=todayPresentationRecords.filter((r)=>classroomStudents.some((s)=>s.id===r.studentId))
  const onTimeCount=classroomRecords.filter((r)=>r.status==='ON_TIME').length
  const lateCount=classroomRecords.filter((r)=>r.status==='LATE').length
  const pendingCount=classroomStudents.length-classroomRecords.length
  const compliantCount=classroomPresentationRecords.filter((r)=>r.status==='COMPLIANT').length
  const nonCompliantCount=classroomPresentationRecords.filter((r)=>r.status==='NON_COMPLIANT').length
  const presentationPendingCount=classroomStudents.length-classroomPresentationRecords.length
  const filtered=classroomStudents.filter((student)=>{
    if(!`${student.firstName} ${student.lastName}`.toLowerCase().includes(query.toLowerCase())) return false
    const attendance=todayRecords.find((i)=>i.studentId===student.id)
    if(filter==='ON_TIME'&&attendance?.status!=='ON_TIME')return false; if(filter==='LATE'&&attendance?.status!=='LATE')return false; if(filter==='PENDING'&&attendance)return false
    const presentation=todayPresentationRecords.find((i)=>i.studentId===student.id)
    if(presentationFilter==='COMPLIANT'&&presentation?.status!=='COMPLIANT')return false; if(presentationFilter==='NON_COMPLIANT'&&presentation?.status!=='NON_COMPLIANT')return false; if(presentationFilter==='PENDING'&&presentation)return false
    return true
  })

  async function mark(studentId:string) {
    try { const rec=await registerAttendance(studentId,entryLimit,today,getCurrentTime()); setRecords((curr)=>[...curr.filter((r)=>!(r.studentId===studentId&&r.date===today)),rec]); playConfirmation() }
    catch(error){ console.error(error); setDataError(error instanceof Error?error.message:'No se pudo registrar la entrada.') }
  }
  async function resetToday() {
    if(!confirm('¿Borrar los registros de ingreso y presentación de hoy?')) return
    try {
      await Promise.all([deleteAttendanceForDate(today), deletePresentationForDate(today)])
      setRecords((r) => r.filter((x) => x.date !== today))
      setPresentationRecords((r) => r.filter((x) => x.date !== today))
      setNotifications((items) => items.filter((item) => item.date !== today))
    }
    catch(error){ console.error(error); setDataError(error instanceof Error?error.message:'No se pudo reiniciar el día.') }
  }
  function changeClassroom(classroomId:string){ const selected=classrooms.find((i)=>i.id===classroomId); if(!selected)return; setQuery('');setFilter('ALL');setPresentationFilter('ALL');onClassroomChange(selected); if(preferences.rememberClassroom)updatePreferences({...preferences,lastClassroomId:selected.id}) }
  async function updateEntryLimit(value:string){
    setEntryLimit(value)
    try { await saveEntryLimit(value); await recalculateAttendanceForDate(today,value); const range=monthRange(); setRecords(await getAttendanceRange(range.from,range.to)) }
    catch(error){ console.error(error); setDataError(error instanceof Error?error.message:'No se pudo actualizar la hora límite.') }
  }
  function openPresentation(student:Student){ const existing=todayPresentationRecords.find((i)=>i.studentId===student.id); setPresentationStudent(student); setPresentationDraft(existing?{status:existing.status,hairstyleViolation:existing.hairstyleViolation,uniformUsageViolation:existing.uniformUsageViolation,nonInstitutionalGarment:existing.nonInstitutionalGarment,otherViolation:existing.otherViolation,otherDescription:existing.otherDescription}:emptyPresentationDraft) }
  function setPresentationMode(status:PresentationStatus){ if(status==='COMPLIANT'){setPresentationDraft({...emptyPresentationDraft,status:'COMPLIANT'});return} setPresentationDraft((c)=>({...c,status:'NON_COMPLIANT'})) }
  async function savePresentation(){
    if(!presentationStudent||!presentationDraft.status)return
    if(presentationDraft.status==='NON_COMPLIANT'){ const has=presentationDraft.hairstyleViolation||presentationDraft.uniformUsageViolation||presentationDraft.nonInstitutionalGarment||presentationDraft.otherViolation; if(!has)return; if(presentationDraft.otherViolation&&!presentationDraft.otherDescription.trim())return }
    const currentStudent = presentationStudent
    const record:PresentationRecord={studentId:currentStudent.id,date:today,status:presentationDraft.status,hairstyleViolation:presentationDraft.status==='NON_COMPLIANT'&&presentationDraft.hairstyleViolation,uniformUsageViolation:presentationDraft.status==='NON_COMPLIANT'&&presentationDraft.uniformUsageViolation,nonInstitutionalGarment:presentationDraft.status==='NON_COMPLIANT'&&presentationDraft.nonInstitutionalGarment,otherViolation:presentationDraft.status==='NON_COMPLIANT'&&presentationDraft.otherViolation,otherDescription:presentationDraft.status==='NON_COMPLIANT'&&presentationDraft.otherViolation?presentationDraft.otherDescription.trim():'',checkedAt:getCurrentTime()}

    try {
      const saved = await savePresentationRemote(record)
      setPresentationRecords((curr) => [
        ...curr.filter((r) => !(r.studentId === record.studentId && r.date === record.date)),
        saved,
      ])
      setPresentationStudent(null)
      setPresentationDraft(emptyPresentationDraft)
      playConfirmation()

      if (saved.status === 'NON_COMPLIANT') {
        try {
          const notification = await ensureNotificationForPresentation(saved)
          setNotifications((curr) => [notification, ...curr.filter((item) => item.id !== notification.id)])
          setNotificationStudent(currentStudent)
        } catch (notificationError) {
          console.error(notificationError)
          setDataError(notificationError instanceof Error
            ? `La presentación se guardó, pero no se pudo registrar la reincidencia: ${notificationError.message}`
            : 'La presentación se guardó, pero no se pudo registrar la reincidencia.')
        }
      }
    }
    catch(error){console.error(error);setDataError(error instanceof Error?error.message:'No se pudo guardar la presentación.')}
  }
  const hasSelectedViolation=presentationDraft.hairstyleViolation||presentationDraft.uniformUsageViolation||presentationDraft.nonInstitutionalGarment||presentationDraft.otherViolation
  const presentationSaveDisabled=!presentationDraft.status||(presentationDraft.status==='NON_COMPLIANT'&&!hasSelectedViolation)||(presentationDraft.status==='NON_COMPLIANT'&&presentationDraft.otherViolation&&!presentationDraft.otherDescription.trim())

  function getNotificationNumber(studentId: string, date: string, presentationId?: string): 1 | 2 | 3 {
    if (presentationId) {
      const exact = notifications.find((item) => item.presentationControlId === presentationId)
      if (exact) return exact.notificationNumber
    }

    // Fallback para controles antiguos todavía no migrados a notifications.
    const prior = notifications.filter((item) => item.studentId === studentId && item.date <= date)
    if (prior.length) return prior.sort((a, b) => b.date.localeCompare(a.date))[0].notificationNumber
    return 1
  }

  function buildNotificationData(student: Student, record: PresentationRecord): NotificationPrintData | null {
    const studentClassroom = classrooms.find((item) => item.id === student.classroomId)
    if (!studentClassroom) return null
    return {
      student,
      classroom: studentClassroom,
      record,
      notificationNumber: getNotificationNumber(student.id, record.date, record.id),
    }
  }

  function studentNotificationStats(studentId: string) {
    const history = notifications
      .filter((item) => item.studentId === studentId)
      .sort((a, b) => b.date.localeCompare(a.date) || b.generatedAt.localeCompare(a.generatedAt))
    return {
      total: history.length,
      latest: history[0],
      history,
    }
  }

  async function openNotification(student: Student) {
    const record = todayPresentationRecords.find((item) => item.studentId === student.id && item.status === 'NON_COMPLIANT')
    if (!record) return

    if (record.id && !notifications.some((item) => item.presentationControlId === record.id)) {
      try {
        const notification = await ensureNotificationForPresentation(record)
        setNotifications((curr) => [notification, ...curr.filter((item) => item.id !== notification.id)])
      } catch (error) {
        console.error(error)
        setDataError(error instanceof Error ? error.message : 'No se pudo registrar la reincidencia.')
        return
      }
    }

    setNotificationStudent(student)
  }

  const notificationCandidates = students.filter((student) => {
    const record = todayPresentationRecords.find((item) => item.studentId === student.id && item.status === 'NON_COMPLIANT')
    if (!record) return false
    const classroomInfo = classrooms.find((item) => item.id === student.classroomId)
    const haystack = `${student.firstName} ${student.lastName} ${classroomInfo?.grade ?? ''} ${classroomInfo?.section ?? ''} ${classroomInfo?.level ?? ''}`.toLowerCase()
    return haystack.includes(notificationSearch.toLowerCase())
  })

  const selectedNotificationData = selectedNotificationIds
    .map((studentId) => {
      const student = students.find((item) => item.id === studentId)
      const record = todayPresentationRecords.find((item) => item.studentId === studentId && item.status === 'NON_COMPLIANT')
      return student && record ? buildNotificationData(student, record) : null
    })
    .filter((item): item is NotificationPrintData => Boolean(item))

  function toggleNotificationStudent(studentId: string) {
    setSelectedNotificationIds((current) => {
      if (current.includes(studentId)) return current.filter((id) => id !== studentId)
      if (current.length >= MAX_NOTIFICATIONS_PER_PAGE) return current
      return [...current, studentId]
    })
  }

  async function openMultiNotification() {
    setSelectedNotificationIds([])
    setNotificationSearch('')

    try {
      const missing = todayPresentationRecords.filter((record) =>
        record.status === 'NON_COMPLIANT' &&
        record.id &&
        !notifications.some((item) => item.presentationControlId === record.id),
      )

      if (missing.length) {
        const created = await Promise.all(missing.map((record) => ensureNotificationForPresentation(record)))
        setNotifications((current) => {
          const createdIds = new Set(created.map((item) => item.id))
          return [...created, ...current.filter((item) => !createdIds.has(item.id))]
        })
      }

      setMultiNotificationOpen(true)
    } catch (error) {
      console.error(error)
      setDataError(error instanceof Error ? error.message : 'No se pudieron preparar las notificaciones.')
    }
  }

  return (
    <main className={`${sizeClass} min-h-screen bg-slate-50 text-slate-950 transition-colors duration-200 dark:bg-slate-950 dark:text-slate-100`}>
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 backdrop-blur dark:border-slate-800 dark:bg-slate-950/95">
        <div className="mx-auto max-w-5xl px-5 py-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-slate-400">Tesla</p>
              <h1 className="text-lg font-black">Control Escolar</h1>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{userName} · {userRole}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="hidden min-w-[190px] rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-right leading-tight dark:border-slate-800 dark:bg-slate-900 md:block">
                <p className="flex items-center justify-end gap-1.5 text-sm font-black tabular-nums"><Clock3 size={15} /> {formattedClock}</p>
                <p className="mt-0.5 flex items-center justify-end gap-1 text-[11px] capitalize text-slate-500 dark:text-slate-400"><CalendarDays size={12} /> {formattedDate}</p>
              </div>
              <Button variant="outline" onClick={() => setDashboardOpen(true)} aria-label="Dashboard">
                <BarChart3 className="mr-2" size={18} />
                Dashboard
              </Button>
              <Button variant="outline" onClick={() => void openMultiNotification()} aria-label="Multinotificación">
                <FileText className="mr-2" size={18} />
                Notificaciones
              </Button>
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
        {dataError && <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300">{dataError}</div>}
        {loadingData && <div className="mb-4 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">Sincronizando datos con Supabase...</div>}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 text-slate-950 shadow-sm transition-colors dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Control diario</p>
              <h2 className="mt-1 text-2xl font-black tracking-tight">Lista de alumnos</h2>
              <p className="mt-1 max-w-xl text-sm text-slate-500 dark:text-slate-400">
                Registra la llegada, detecta tardanzas y controla la presentación institucional desde una sola vista.
              </p>
              <div className="mt-3 inline-flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 md:hidden dark:border-slate-800 dark:bg-slate-950/70">
                <Clock3 size={16} className="text-slate-400" />
                <div>
                  <p className="text-sm font-black tabular-nums">{formattedClock}</p>
                  <p className="text-[11px] capitalize text-slate-500 dark:text-slate-400">{formattedDate}</p>
                </div>
              </div>
            </div>

            <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-end lg:w-auto">
              <label className="block w-full sm:w-56 sm:shrink-0">
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

              <label className="block w-full sm:w-40 sm:shrink-0">
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
            const recurrence = studentNotificationStats(student.id)

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
                    <div className="flex flex-wrap items-center gap-2">
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

                      {recurrence.total > 0 && recurrence.latest && (
                        <span className="rounded-lg bg-amber-100 px-2.5 py-1 text-xs font-black text-amber-800 dark:bg-amber-950/60 dark:text-amber-300">
                          Reincidencias: {recurrence.total} · {getNotificationLabel(recurrence.latest.notificationNumber)}
                        </span>
                      )}
                    </div>

                    <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
                      <Button variant="ghost" className="w-full sm:w-auto" onClick={() => setHistoryStudent(student)}>
                        <BookOpen className="mr-2" size={17} /> Historial
                      </Button>
                      {presentation?.status === 'NON_COMPLIANT' && (
                        <Button variant="outline" className="w-full sm:w-auto" onClick={() => void openNotification(student)}>
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
        const notificationData = buildNotificationData(notificationStudent, notificationRecord)
        if (!notificationData) return null
        return (
          <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/50 p-4 backdrop-blur-[1px] dark:bg-black/65" onMouseDown={() => setNotificationStudent(null)}>
            <section className="w-full max-w-xl rounded-2xl border border-slate-200 bg-white p-5 text-slate-950 shadow-2xl dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100 sm:p-6" onMouseDown={(event) => event.stopPropagation()}>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-bold uppercase tracking-widest text-slate-400">Ficha individual · 1/3 A4</p>
                  <h2 className="mt-1 text-xl font-black">Notificación a padres de familia</h2>
                  <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">PDF y Word en formato físico de 210 × 99 mm.</p>
                </div>
                <Button variant="ghost" onClick={() => setNotificationStudent(null)} aria-label="Cerrar"><X size={20} /></Button>
              </div>

              <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm dark:border-slate-700 dark:bg-slate-950/60">
                <div className="grid gap-2 sm:grid-cols-2">
                  <p><span className="font-black">Estudiante:</span> {notificationStudent.firstName} {notificationStudent.lastName}</p>
                  <p><span className="font-black">Grado:</span> {notificationData.classroom.grade} {notificationData.classroom.section} · {notificationData.classroom.level}</p>
                  <p><span className="font-black">Tutor(a):</span> {notificationData.classroom.tutorName}</p>
                  <p><span className="font-black">Apoderado:</span> {notificationStudent.guardianName}</p>
                  <p><span className="font-black">DNI:</span> {notificationStudent.guardianDni || 'Sin DNI registrado'}</p>
                  <p><span className="font-black">Nivel:</span> {getNotificationLabel(notificationData.notificationNumber)}</p>
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
                <Button onClick={() => downloadNotificationPdf(notificationStudent, notificationData.classroom, notificationRecord, notificationData.notificationNumber)}>
                  <Download className="mr-2" size={18} /> Descargar PDF
                </Button>
                <Button variant="outline" onClick={() => void downloadNotificationWord(notificationStudent, notificationData.classroom, notificationRecord, notificationData.notificationNumber)}>
                  <FileText className="mr-2" size={18} /> Descargar Word
                </Button>
              </div>
            </section>
          </div>
        )
      })()}

      {multiNotificationOpen && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/55 p-4 backdrop-blur-[1px] dark:bg-black/70" onMouseDown={() => setMultiNotificationOpen(false)}>
          <section className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white text-slate-950 shadow-2xl dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100" onMouseDown={(event) => event.stopPropagation()}>
            <div className="flex items-start justify-between gap-4 border-b border-slate-200 p-5 dark:border-slate-800 sm:p-6">
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-slate-400">Impresión optimizada</p>
                <h2 className="mt-1 text-xl font-black">Multinotificación</h2>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Selecciona hasta 3 estudiantes. Se generará una hoja A4 vertical con una ficha de 210 × 99 mm por alumno.</p>
              </div>
              <Button variant="ghost" onClick={() => setMultiNotificationOpen(false)} aria-label="Cerrar"><X size={20} /></Button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 sm:p-6">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="relative flex-1">
                  <Search className="absolute left-4 top-3.5 text-slate-400" size={20} />
                  <Input className="pl-12" placeholder="Buscar por alumno, grado o aula..." value={notificationSearch} onChange={(event) => setNotificationSearch(event.target.value)} />
                </div>
                <div className={`rounded-xl px-4 py-2 text-sm font-black ${selectedNotificationIds.length === MAX_NOTIFICATIONS_PER_PAGE ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300' : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200'}`}>
                  {selectedNotificationIds.length} / {MAX_NOTIFICATIONS_PER_PAGE} seleccionados
                </div>
              </div>

              <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">Solo aparecen estudiantes que tienen un incumplimiento registrado hoy. Puedes combinar alumnos de distintas aulas.</p>

              <div className="mt-4 space-y-2">
                {notificationCandidates.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-slate-300 p-7 text-center text-sm text-slate-500 dark:border-slate-700">No hay alumnos con incidencias que coincidan con la búsqueda.</div>
                ) : notificationCandidates.map((student) => {
                  const studentClassroom = classrooms.find((item) => item.id === student.classroomId)
                  const checked = selectedNotificationIds.includes(student.id)
                  const disabled = !checked && selectedNotificationIds.length >= MAX_NOTIFICATIONS_PER_PAGE
                  return (
                    <label key={student.id} className={`flex cursor-pointer items-center gap-4 rounded-xl border p-4 transition-colors ${checked ? 'border-slate-950 bg-slate-50 dark:border-slate-200 dark:bg-slate-800' : 'border-slate-200 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/70'} ${disabled ? 'cursor-not-allowed opacity-50' : ''}`}>
                      <input type="checkbox" className="h-5 w-5" checked={checked} disabled={disabled} onChange={() => toggleNotificationStudent(student.id)} />
                      <div className="min-w-0 flex-1">
                        <p className="font-black">{student.firstName} {student.lastName}</p>
                        <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{studentClassroom ? `${studentClassroom.grade} ${studentClassroom.section} · ${studentClassroom.level}` : 'Aula no encontrada'} · Apoderado: {student.guardianName}</p>
                      </div>
                      <span className="text-xs font-bold text-amber-700 dark:text-amber-300">{getNotificationNumber(student.id, today, todayPresentationRecords.find((item) => item.studentId === student.id)?.id)}.ª</span>
                    </label>
                  )
                })}
              </div>

              {selectedNotificationIds.length >= MAX_NOTIFICATIONS_PER_PAGE && (
                <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-300">Máximo 3 estudiantes por hoja. Quita uno para seleccionar otro.</div>
              )}
            </div>

            <div className="border-t border-slate-200 p-5 dark:border-slate-800 sm:p-6">
              <div className="grid gap-2 sm:grid-cols-2">
                <Button disabled={selectedNotificationData.length === 0} onClick={() => downloadMultiNotificationPdf(selectedNotificationData)}>
                  <Download className="mr-2" size={18} /> Generar PDF A4
                </Button>
                <Button variant="outline" disabled={selectedNotificationData.length === 0} onClick={() => void downloadMultiNotificationWord(selectedNotificationData)}>
                  <FileText className="mr-2" size={18} /> Generar Word A4
                </Button>
              </div>
              <p className="mt-3 text-center text-xs text-slate-500 dark:text-slate-400">Si eliges 1 o 2 alumnos, los espacios restantes quedan vacíos para conservar el formato de corte.</p>
            </div>
          </section>
        </div>
      )}

      {historyStudent && (() => {
        const attendanceHistory = records.filter((r) => r.studentId === historyStudent.id).sort((a,b) => b.date.localeCompare(a.date))
        const presentationHistory = presentationRecords.filter((r) => r.studentId === historyStudent.id).sort((a,b) => b.date.localeCompare(a.date))
        const notificationHistory = notifications
          .filter((item) => item.studentId === historyStudent.id)
          .sort((a,b) => b.date.localeCompare(a.date) || b.generatedAt.localeCompare(a.generatedAt))
        const lateTotal = attendanceHistory.filter((r) => r.status === 'LATE').length
        const incidentTotal = presentationHistory.filter((r) => r.status === 'NON_COMPLIANT').length
        const dates = Array.from(new Set([...attendanceHistory.map(r => r.date), ...presentationHistory.map(r => r.date)])).sort((a,b) => b.localeCompare(a))
        return (
          <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/50 p-4 backdrop-blur-[1px] dark:bg-black/65" onMouseDown={() => setHistoryStudent(null)}>
            <section className="max-h-[88vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl dark:border-slate-800 dark:bg-slate-900 sm:p-6" onMouseDown={(e) => e.stopPropagation()}>
              <div className="flex items-start justify-between gap-4">
                <div><p className="text-xs font-bold uppercase tracking-widest text-slate-400">Historial mensual</p><h2 className="mt-1 text-xl font-black">{historyStudent.firstName} {historyStudent.lastName}</h2><p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Datos persistentes almacenados en PostgreSQL.</p></div>
                <Button variant="ghost" onClick={() => setHistoryStudent(null)}><X size={20}/></Button>
              </div>
              <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Card className="p-4"><p className="text-xs text-slate-500">Ingresos</p><p className="mt-1 text-2xl font-black">{attendanceHistory.length}</p></Card>
                <Card className="p-4"><p className="text-xs text-slate-500">Tardanzas</p><p className="mt-1 text-2xl font-black text-amber-600">{lateTotal}</p></Card>
                <Card className="p-4"><p className="text-xs text-slate-500">Incidencias</p><p className="mt-1 text-2xl font-black text-amber-600">{incidentTotal}</p></Card>
                <Card className="p-4"><p className="text-xs text-slate-500">Reincidencias</p><p className="mt-1 text-2xl font-black text-rose-600">{notificationHistory.length}</p></Card>
              </div>
              <div className="mt-5 space-y-3">
                {dates.length === 0 ? <div className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500 dark:border-slate-700">Aún no hay historial este mes.</div> : dates.map((date) => {
                  const att = attendanceHistory.find(r => r.date === date)
                  const pre = presentationHistory.find(r => r.date === date)
                  return <div key={date} className="rounded-xl border border-slate-200 p-4 dark:border-slate-800">
                    <p className="font-black">{new Date(date + 'T12:00:00').toLocaleDateString('es-PE', { day:'2-digit', month:'long', year:'numeric' })}</p>
                    <div className="mt-2 grid gap-2 text-sm sm:grid-cols-2">
                      <p><b>Ingreso:</b> {att ? `${att.time} · ${att.status === 'ON_TIME' ? 'A tiempo' : 'Tardanza'}` : 'Sin registro'}</p>
                      <p><b>Presentación:</b> {pre ? (pre.status === 'COMPLIANT' ? 'Conforme' : `${getViolationCount(pre)} incidencia(s)`) : 'Sin revisar'}</p>
                    </div>
                  </div>
                })}
              </div>

              <div className="mt-7 border-t border-slate-200 pt-5 dark:border-slate-800">
                <div className="flex items-end justify-between gap-3">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-widest text-slate-400">Reincidencias</p>
                    <h3 className="mt-1 font-black">Historial de notificaciones</h3>
                  </div>
                  {notificationHistory[0] && (
                    <span className="rounded-lg bg-amber-100 px-3 py-1.5 text-xs font-black text-amber-800 dark:bg-amber-950/60 dark:text-amber-300">
                      Nivel actual: {getNotificationLabel(notificationHistory[0].notificationNumber)}
                    </span>
                  )}
                </div>

                <div className="mt-3 space-y-2">
                  {notificationHistory.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-slate-300 p-5 text-center text-sm text-slate-500 dark:border-slate-700">
                      El alumno aún no tiene notificaciones registradas.
                    </div>
                  ) : notificationHistory.map((item) => (
                    <div key={item.id} className="flex flex-col gap-1 rounded-xl border border-slate-200 px-4 py-3 dark:border-slate-800 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="font-black">{getNotificationLabel(item.notificationNumber)}</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">Registro #{item.id}</p>
                      </div>
                      <p className="text-sm font-bold text-slate-600 dark:text-slate-300">
                        {new Date(item.date + 'T12:00:00').toLocaleDateString('es-PE', { day:'2-digit', month:'long', year:'numeric' })}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </section>
          </div>
        )
      })()}

      <Dashboard
        open={dashboardOpen}
        classroom={classroom}
        onClose={() => setDashboardOpen(false)}
        onClassroomChange={changeClassroom}
        classrooms={classrooms}
        students={students}
        attendanceRecords={records}
        presentationRecords={presentationRecords}
        today={today}
        now={now}
      />

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
