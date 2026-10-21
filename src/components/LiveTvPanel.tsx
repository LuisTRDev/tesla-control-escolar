import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent, type KeyboardEvent, type ReactNode, type TouchEvent } from 'react'
import { AnimatePresence, MotionConfig, motion } from 'framer-motion'
import {
  Activity, AlertTriangle, BarChart3, CheckCircle2, Clock3, Expand,
  GripVertical, LayoutDashboard, LogIn, LogOut, Maximize2, Minimize,
  RotateCcw, Save, ShieldAlert, SlidersHorizontal, Users,
  Wifi, WifiOff, X, EyeOff, Plus, ChevronDown, ChevronUp, ArrowUp, ArrowDown, MoreHorizontal, RefreshCw, Sun, Type, Vibrate,
} from 'lucide-react'
import type { AttendanceRecord, Classroom, PresentationRecord, Student } from '@/types'
import { useWakeLock } from '@/lib/nativeFeatures'
import { entryTimeLabel } from '@/lib/displayLabels'
import { LiveClock, LiveDate, UpdatedAgo } from '@/components/livetv/LiveClock'
import { LiveSheet } from '@/components/livetv/LiveSheet'
import { FilteredStudentList } from '@/components/livetv/FilteredStudentList'
import { StudentSheetBody } from '@/components/livetv/StudentSheetBody'
import { useMobileLayout } from '@/hooks/useMobileLayout'

type Props = {
  open: boolean
  onClose: () => void
  students: Student[]
  classrooms: Classroom[]
  attendanceRecords: AttendanceRecord[]
  presentationRecords: PresentationRecord[]
  today: string
  realtimeConnected: boolean
  /** Vuelve a pedir los datos al servidor (botón y gesto de jalar para refrescar). */
  onRefresh?: () => Promise<void>
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
  | 'lateByGrade'
  | 'lateByPrimaria'
  | 'lateBySecundaria'
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
const MOBILE_STORAGE_KEY = 'tesla-live-tv-layout-mobile-v1'
const DEFAULT_LAYOUT: LayoutCard[] = [
  { id: 'metrics', kind: 'metrics', size: 'lg' },
  { id: 'recentEntries', kind: 'recentEntries', size: 'md' },
  { id: 'lateStudents', kind: 'lateStudents', size: 'md' },
  { id: 'todayIncidents', kind: 'todayIncidents', size: 'lg' },
  { id: 'topIncidents', kind: 'topIncidents', size: 'sm' },
  { id: 'topStudents', kind: 'topStudents', size: 'sm' },
]
// En celular lo primero son las tardanzas; las cifras generales ya van fijas arriba.
const MOBILE_DEFAULT_LAYOUT: LayoutCard[] = [
  { id: 'lateByGrade', kind: 'lateByGrade', size: 'lg' },
  { id: 'attendanceSummary', kind: 'attendanceSummary', size: 'md' },
  { id: 'recentEntries', kind: 'recentEntries', size: 'md' },
  { id: 'todayIncidents', kind: 'todayIncidents', size: 'lg' },
  { id: 'pendingStudents', kind: 'pendingStudents', size: 'md' },
  { id: 'classroomSummary', kind: 'classroomSummary', size: 'lg' },
]

type TabId = 'tardanzas' | 'resumen' | 'incidencias' | 'pendientes' | 'aulas'
const TABS: Array<{ id: TabId; label: string; icon: typeof Clock3; kinds: CardKind[] }> = [
  { id: 'tardanzas', label: 'Tardanzas', icon: Clock3, kinds: ['lateByGrade', 'lateByPrimaria', 'lateBySecundaria', 'lateStudents'] },
  { id: 'resumen', label: 'Resumen', icon: BarChart3, kinds: ['metrics', 'attendanceSummary', 'recentEntries', 'exitSummary', 'presentationCompliance'] },
  { id: 'incidencias', label: 'Incidencias', icon: ShieldAlert, kinds: ['todayIncidents', 'topIncidents', 'topStudents', 'incidentsByClassroom'] },
  { id: 'pendientes', label: 'Pendientes', icon: Users, kinds: ['pendingStudents'] },
  { id: 'aulas', label: 'Aulas', icon: LayoutDashboard, kinds: ['classroomSummary'] },
]
const tabOfKind = (kind: CardKind): TabId => TABS.find((item) => item.kinds.includes(kind))?.id ?? 'resumen'

const CATALOG: Array<{ kind: CardKind; title: string; description: string; defaultSize: CardSize }> = [
  { kind: 'metrics', title: 'Métricas generales', description: 'Resumen de alumnos, ingresos, tardanzas y pendientes.', defaultSize: 'lg' },
  { kind: 'recentEntries', title: 'Últimos ingresos', description: 'Últimos alumnos que registraron ingreso.', defaultSize: 'md' },
  { kind: 'lateStudents', title: 'Alumnos con tardanza', description: 'Lista completa del día, ordenada por hora.', defaultSize: 'md' },
  { kind: 'lateByGrade', title: 'Tardanzas por nivel y grado', description: 'Primaria y secundaria por separado, agrupadas por grado y año.', defaultSize: 'lg' },
  { kind: 'lateByPrimaria', title: 'Tardanzas de primaria', description: 'Solo primaria, agrupada por grado.', defaultSize: 'md' },
  { kind: 'lateBySecundaria', title: 'Tardanzas de secundaria', description: 'Solo secundaria, agrupada por año.', defaultSize: 'md' },
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

type SelectStudent = (studentId: string) => void

/** En celular tocar una fila abre la ficha del alumno; en TV las filas no son interactivas. */
const TAP_CLASS = 'cursor-pointer active:bg-white/10'
function tap(onSelect: SelectStudent | undefined, studentId: string) {
  if (!onSelect) return {}
  return {
    role: 'button' as const,
    tabIndex: 0,
    onClick: () => onSelect(studentId),
    onKeyDown: (event: KeyboardEvent<HTMLElement>) => {
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelect(studentId) }
    },
  }
}

const PREFS_KEY = 'tesla-live-tv-prefs-v1'
type PanelPrefs = { keepAwake?: boolean; largeText?: boolean; vibrate?: boolean }
function loadPrefs(): PanelPrefs {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(PREFS_KEY) ?? 'null')
    return parsed && typeof parsed === 'object' ? parsed as PanelPrefs : {}
  } catch {
    return {}
  }
}

const PULL_TRIGGER = 60

const LEVELS: Classroom['level'][] = ['Primaria', 'Secundaria']

/** En primaria se dice "grado" y en secundaria "año" (salvo que el aula ya lo diga). */
function gradeLabel(level: Classroom['level'], grade: string) {
  if (/grado|año/i.test(grade)) return grade
  return `${grade} ${level === 'Primaria' ? 'grado' : 'año'}`
}

type LateRow = { record: AttendanceRecord; student: Student; classroom: Classroom }
type LateLevelGroup = { level: Classroom['level']; total: number; grades: Array<{ grade: string; rows: LateRow[] }> }

function presentationLabels(record: PresentationRecord, attendanceLate: boolean) {
  const labels: string[] = []
  if (record.hairstyleViolation) labels.push('Peinado')
  if (record.uniformUsageViolation) labels.push('Uniforme incompleto')
  if (record.nonInstitutionalGarment) labels.push('Prenda no correspondiente')
  if (record.lateEntryViolation && !attendanceLate) labels.push('Tardanza')
  if (record.inappropriateConductViolation) labels.push('Conducta inapropiada')
  return labels
}

function loadLayout(key: string, fallback: LayoutCard[]): LayoutCard[] {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return fallback
    const parsed = JSON.parse(raw) as LayoutCard[]
    if (!Array.isArray(parsed) || parsed.length === 0) return fallback
    return parsed.filter((item) => CATALOG.some((card) => card.kind === item.kind))
      .map((item) => ({ id: String(item.id), kind: item.kind, size: item.size === 'sm' || item.size === 'lg' ? item.size : 'md' }))
  } catch {
    return fallback
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
  onRefresh,
}: Props) {
  const mobile = useMobileLayout()
  const [prefs, setPrefs] = useState<PanelPrefs>(loadPrefs)
  // La TV del patio siempre encendida; en el celular es opcional para no gastar batería.
  const keepAwake = prefs.keepAwake ?? !mobile
  const vibrateOnLate = prefs.vibrate ?? true
  const largeText = prefs.largeText ?? false
  useWakeLock(open && keepAwake)
  const sectionRef = useRef<HTMLElement | null>(null)
  const [fullscreen, setFullscreen] = useState(Boolean(document.fullscreenElement))
  const [editMode, setEditMode] = useState(false)
  // Celular y TV guardan su distribución por separado: cada dispositivo ve lo que armó para él.
  const [layouts, setLayouts] = useState(() => ({
    desktop: loadLayout(STORAGE_KEY, DEFAULT_LAYOUT),
    mobile: loadLayout(MOBILE_STORAGE_KEY, MOBILE_DEFAULT_LAYOUT),
  }))
  const mode = mobile ? 'mobile' : 'desktop'
  const layout = layouts[mode]
  const storageKey = mobile ? MOBILE_STORAGE_KEY : STORAGE_KEY
  const defaultLayout = mobile ? MOBILE_DEFAULT_LAYOUT : DEFAULT_LAYOUT
  const setLayout = useCallback((update: (current: LayoutCard[]) => LayoutCard[]) => {
    setLayouts((current) => ({ ...current, [mode]: update(current[mode]) }))
  }, [mode])
  const [tab, setTab] = useState<TabId>('tardanzas')
  const [draggedId, setDraggedId] = useState<string | null>(null)
  const [dropTargetId, setDropTargetId] = useState<string | null>(null)
  const [catalogOpen, setCatalogOpen] = useState(false)
  const [savedNotice, setSavedNotice] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  // 'open' se separa del id para que el contenido siga visible mientras la hoja baja al cerrarse.
  const [lastUpdate, setLastUpdate] = useState(() => Date.now())
  const [refreshing, setRefreshing] = useState(false)
  const [pull, setPull] = useState(0)
  const pullStart = useRef<number | null>(null)
  const [seenLate, setSeenLate] = useState<number | null>(null)
  const [sheet, setSheet] = useState<{ id: string; open: boolean } | null>(null)

  useEffect(() => {
    if (!open) return
    const handleFullscreen = () => setFullscreen(Boolean(document.fullscreenElement))
    document.addEventListener('fullscreenchange', handleFullscreen)
    return () => document.removeEventListener('fullscreenchange', handleFullscreen)
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

    // Tardanzas del día: primaria y secundaria por separado, por grado (y aula dentro del grado).
    const lateByLevel: LateLevelGroup[] = LEVELS.map((level) => {
      const byGrade = new Map<string, LateRow[]>()
      for (const { record, student } of lateStudents) {
        const classroom = classroomById.get(student.classroomId)
        if (!classroom || classroom.level !== level) continue
        byGrade.set(classroom.grade, [...(byGrade.get(classroom.grade) ?? []), { record, student, classroom }])
      }
      const grades = [...byGrade.entries()]
        .sort(([a], [b]) => a.localeCompare(b, 'es', { numeric: true }))
        .map(([grade, rows]) => ({
          grade,
          rows: rows.sort((a, b) => a.classroom.section.localeCompare(b.classroom.section, 'es') || `${a.student.lastName} ${a.student.firstName}`.localeCompare(`${b.student.lastName} ${b.student.firstName}`, 'es')),
        }))
      return { level, total: grades.reduce((sum, item) => sum + item.rows.length, 0), grades }
    })

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
      totalIncidents, recentEntries, lateStudents, lateByLevel, pendingStudents, enrichedIncidents,
      attendanceByStudent, studentById, incidents,
      topTypes, topStudents, classroomById, classroomSummary, incidentsByClassroom,
    }
  }, [attendanceRecords, classrooms, presentationRecords, students, today])

  useEffect(() => {
    if (editMode) localStorage.setItem(storageKey, JSON.stringify(layout))
  }, [editMode, layout, storageKey])

  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen()
      else await document.documentElement.requestFullscreen()
    } catch {
      // Algunos televisores/navegadores bloquean Fullscreen API.
    }
  }

  function saveLayout() {
    localStorage.setItem(storageKey, JSON.stringify(layout))
    setSavedNotice(true)
    window.setTimeout(() => setSavedNotice(false), 1800)
    setEditMode(false)
    setCatalogOpen(false)
  }

  function resetLayout() {
    setLayout(() => defaultLayout)
    localStorage.setItem(storageKey, JSON.stringify(defaultLayout))
  }

  function changeTab(next: TabId) {
    setTab(next)
    sectionRef.current?.scrollTo({ top: 0 })
  }

  function addCard(kind: CardKind) {
    if (layout.some((item) => item.kind === kind)) return
    const catalogCard = CATALOG.find((item) => item.kind === kind)
    if (!catalogCard) return
    setLayout((current) => [...current, { id: `${kind}-${Date.now()}`, kind, size: catalogCard.defaultSize }])
    // En celular la tarjeta nueva vive en su pestaña: se va a ella para que se vea que se añadió.
    if (mobile) {
      setCatalogOpen(false)
      changeTab(tabOfKind(kind))
    }
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

  /** Sube o baja una tarjeta dentro de su pestaña (en celular no se arrastra: el dedo hace scroll). */
  function moveCard(id: string, direction: -1 | 1) {
    setLayout((current) => {
      const index = current.findIndex((item) => item.id === id)
      if (index < 0) return current
      const tabId = tabOfKind(current[index].kind)
      let target = index + direction
      while (target >= 0 && target < current.length && tabOfKind(current[target].kind) !== tabId) target += direction
      if (target < 0 || target >= current.length) return current
      const next = [...current]
      ;[next[index], next[target]] = [next[target], next[index]]
      return next
    })
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
  const shownTabs = editMode ? TABS : TABS.filter((item) => layout.some((card) => tabOfKind(card.kind) === item.id))
  const activeTab = shownTabs.some((item) => item.id === tab) ? tab : (shownTabs[0]?.id ?? 'tardanzas')
  const mobileCards = layout.filter((item) => tabOfKind(item.kind) === activeTab)
  const canFullscreen = Boolean(document.fullscreenEnabled)
  const newLates = seenLate === null ? 0 : Math.max(0, data.late - seenLate)

  // Cada carga de datos (realtime, sincronización o refresco manual) renueva "Actualizado hace…".
  useEffect(() => { setLastUpdate(Date.now()) }, [attendanceRecords, presentationRecords, students])

  // Tardanza nueva: vibración corta y marca "nuevas" en la pestaña si se está mirando otra.
  const previousLate = useRef<number | null>(null)
  useEffect(() => {
    if (!open) { previousLate.current = null; return }
    if (mobile && vibrateOnLate && previousLate.current !== null && data.late > previousLate.current) navigator.vibrate?.(150)
    previousLate.current = data.late
  }, [data.late, open, mobile, vibrateOnLate])
  useEffect(() => {
    if (activeTab === 'tardanzas') setSeenLate(data.late)
    else setSeenLate((current) => (current !== null && data.late < current ? data.late : current))
  }, [activeTab, data.late])

  function updatePrefs(patch: PanelPrefs) {
    const next = { ...prefs, ...patch }
    setPrefs(next)
    try { localStorage.setItem(PREFS_KEY, JSON.stringify(next)) } catch { /* sin almacenamiento: la preferencia dura la sesión */ }
  }

  async function refresh() {
    if (!onRefresh || refreshing) return
    setRefreshing(true)
    try { await onRefresh() } finally { setRefreshing(false) }
  }

  // Jalar hacia abajo estando arriba del todo refresca (el navegador no lo hace dentro del panel).
  function onTouchStart(event: TouchEvent<HTMLElement>) {
    pullStart.current = mobile && !editMode && onRefresh && sectionRef.current?.scrollTop === 0 ? event.touches[0].clientY : null
  }
  function onTouchMove(event: TouchEvent<HTMLElement>) {
    if (pullStart.current === null) return
    const distance = event.touches[0].clientY - pullStart.current
    setPull(distance > 0 ? Math.min(distance * 0.5, 80) : 0)
  }
  function onTouchEnd() {
    if (pullStart.current !== null && pull >= PULL_TRIGGER) void refresh()
    pullStart.current = null
    setPull(0)
  }

  const connectionChip = (compact: boolean) => (
    <div className={`flex items-center gap-2 rounded-xl border font-black ${compact ? 'h-10 px-2.5 text-xs' : 'h-11 px-3 text-sm sm:px-4'} ${realtimeConnected ? 'border-emerald-400/20 bg-emerald-500/10 text-emerald-300' : 'border-amber-400/20 bg-amber-500/10 text-amber-300'}`}>
      {realtimeConnected ? <Wifi size={compact ? 15 : 17} /> : <WifiOff size={compact ? 15 : 17} />}
      <span className="sm:hidden">{realtimeConnected ? 'En vivo' : 'Reconectando…'}</span><span className="hidden sm:inline">{realtimeConnected ? 'Tiempo real conectado' : 'Reconectando…'}</span>
    </div>
  )

  return (
    <AnimatePresence>
      {open && (
        <motion.section
          ref={sectionRef}
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
          onTouchCancel={onTouchEnd}
          className="fixed inset-0 z-[100] overflow-y-auto overscroll-contain bg-[#050b16] text-white"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
        >
          <MotionConfig reducedMotion="user">
          <div style={mobile && largeText ? { zoom: 1.15 } : undefined} className={mobile ? 'min-h-full px-3 pb-[calc(5.5rem+env(safe-area-inset-bottom))]' : 'min-h-screen p-3 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-[calc(.75rem+env(safe-area-inset-top))] sm:p-6 xl:p-8'}>
            {mobile ? (
              <header className="sticky top-0 z-40 -mx-3 border-b border-white/10 bg-[#050b16]/95 px-3 pb-2.5 pt-[calc(.5rem+env(safe-area-inset-top))] backdrop-blur-xl">
                <div className="flex items-center gap-2">
                  {connectionChip(true)}
                  <LiveClock active={open} className="font-mono text-base font-black tabular-nums text-slate-100" />
                  <div className="ml-auto flex items-center gap-1.5">
                    <button type="button" onClick={() => setEditMode((value) => !value)} className={`grid h-10 w-10 place-items-center rounded-xl border ${editMode ? 'border-sky-400/50 bg-sky-400/15 text-sky-300' : 'border-white/10 bg-white/5 text-slate-300'}`} aria-label="Personalizar panel" aria-pressed={editMode}><SlidersHorizontal size={18} /></button>
                    <button type="button" onClick={() => setMenuOpen(true)} className="grid h-10 w-10 place-items-center rounded-xl border border-white/10 bg-white/5 text-slate-300" aria-label="Más opciones"><MoreHorizontal size={19} /></button>
                    <button type="button" onClick={onClose} className="grid h-10 w-10 place-items-center rounded-xl border border-white/10 bg-white/5 text-slate-300" aria-label="Cerrar panel"><X size={20} /></button>
                  </div>
                </div>
                <div className="mt-2 grid grid-cols-3 gap-2">
                  <HeaderStat label="Tardanzas" value={data.late} tone="amber" onClick={() => changeTab('tardanzas')} />
                  <HeaderStat label="Ingresaron" value={data.entered} tone="emerald" onClick={() => changeTab('resumen')} />
                  <HeaderStat label="Sin marcar" value={data.pending} tone="slate" onClick={() => changeTab('pendientes')} />
                </div>
                <div className="mt-1.5 flex items-center justify-between gap-2 text-[11px] font-semibold text-slate-500">
                  <UpdatedAgo since={lastUpdate} active={open} />
                  {onRefresh && <button type="button" onClick={() => void refresh()} disabled={refreshing} className="flex min-h-8 items-center gap-1.5 rounded-lg px-2 font-black text-slate-400 active:bg-white/10" aria-label="Actualizar datos"><RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />Actualizar</button>}
                </div>
              </header>
            ) : (
              <header className="flex flex-col gap-3 border-b border-white/10 pb-4 sm:gap-5 sm:pb-5 xl:flex-row xl:items-center xl:justify-between">
                <div>
                  <div className="flex items-center gap-3">
                    <div className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-white/10 text-sky-300 sm:h-12 sm:w-12"><Activity size={23} /></div>
                    <div className="min-w-0">
                      <p className="text-[11px] font-black uppercase tracking-[.24em] text-sky-300 sm:text-xs">Tesla Control Escolar</p>
                      <h1 className="mt-0.5 text-xl font-black tracking-tight sm:mt-1 sm:text-3xl">Panel en vivo</h1>
                    </div>
                  </div>
                  <LiveDate active={open} className="mt-2 text-xs font-semibold capitalize text-slate-400 sm:mt-3 sm:text-sm" />
                </div>

                <div className="flex flex-wrap items-center gap-2 sm:gap-2.5">
                  {connectionChip(false)}
                  <div className="flex h-11 items-center rounded-xl border border-white/10 bg-white/5 px-3 font-mono text-lg font-black tabular-nums text-slate-100 sm:px-4 sm:text-2xl"><LiveClock active={open} /></div>
                  <motion.button whileTap={{ scale: 0.96 }} type="button" onClick={() => setEditMode((value) => !value)} className={`grid h-11 w-11 place-items-center rounded-xl border ${editMode ? 'border-sky-400/50 bg-sky-400/15 text-sky-400' : 'border-white/10 bg-white/5 text-slate-300 hover:bg-white/10'}`} aria-label="Personalizar panel">
                    <SlidersHorizontal size={19} />
                  </motion.button>
                  <motion.button whileTap={{ scale: 0.96 }} type="button" onClick={() => void toggleFullscreen()} className="grid h-11 w-11 place-items-center rounded-xl border border-white/10 bg-white/5 text-slate-300 hover:bg-white/10" aria-label="Pantalla completa">
                    {fullscreen ? <Minimize size={20} /> : <Expand size={20} />}
                  </motion.button>
                  <motion.button whileTap={{ scale: 0.96 }} type="button" onClick={onClose} className="grid h-11 w-11 place-items-center rounded-xl border border-white/10 bg-white/5 text-slate-300 hover:bg-white/10" aria-label="Cerrar panel"><X size={21} /></motion.button>
                </div>
              </header>
            )}

            {mobile && (pull > 0 || refreshing) && (
              <div style={{ height: refreshing ? 36 : pull }} className="grid place-items-end justify-center overflow-hidden pt-2 text-sky-300" aria-hidden="true">
                <RefreshCw size={18} className={refreshing ? 'animate-spin' : ''} style={refreshing ? undefined : { transform: `rotate(${pull * 4}deg)`, opacity: Math.min(1, pull / PULL_TRIGGER) }} />
              </div>
            )}

            <AnimatePresence>
              {editMode && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                  className="mt-3 overflow-hidden rounded-3xl border border-sky-400/20 bg-gradient-to-r from-sky-400/[.10] via-white/[.04] to-transparent sm:mt-5"
                >
                  <div className="flex flex-col gap-4 p-4 sm:p-5 xl:flex-row xl:items-center xl:justify-between">
                    <div className="flex items-start gap-3">
                      <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-sky-400/15 text-sky-400"><GripVertical size={20} /></div>
                      <div>
                        <p className="font-black">Personaliza tu panel</p>
                        <p className="mt-1 max-w-2xl text-sm font-medium text-slate-400">{mobile
                          ? 'Mueve cada tarjeta con las flechas, quítala con el ojo o añade tarjetas nuevas. Cada una vive en su pestaña.'
                          : 'Arrastra cualquier tarjeta para cambiar su posición. Usa el tamaño para hacer una tarjeta de ancho completo y colocarla debajo o encima de otra.'}</p>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button type="button" onClick={() => setCatalogOpen((value) => !value)} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-black text-slate-200 hover:bg-white/10"><Plus size={16} /> Añadir tarjeta {catalogOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}</button>
                      <button type="button" onClick={resetLayout} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-black text-slate-300 hover:bg-white/10"><RotateCcw size={16} /> Restablecer</button>
                      <button type="button" onClick={saveLayout} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-black text-slate-950 shadow-lg hover:brightness-105"><Save size={16} /> Guardar</button>
                    </div>
                  </div>

                  <AnimatePresence>
                    {catalogOpen && (
                      <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }} className="border-t border-white/10">
                        <div className="grid gap-2 p-4 sm:grid-cols-2 xl:grid-cols-3">
                          {CATALOG.filter((card) => !activeKinds.has(card.kind)).map((card) => (
                            <button key={card.kind} type="button" onClick={() => addCard(card.kind)} className="group rounded-2xl border border-white/8 bg-white/[.035] p-4 text-left transition hover:-translate-y-0.5 hover:border-sky-400/20 hover:bg-white/[.06]">
                              <div className="flex items-start gap-3">
                                <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white/5 text-sky-400"><LayoutDashboard size={18} /></div>
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

            {mobile ? (
              <motion.div key={activeTab} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.18 }} className="mt-3 grid grid-cols-1 items-start gap-3 [@media(orientation:landscape)]:grid-cols-2">
                {mobileCards.length === 0 && <div className="[@media(orientation:landscape)]:col-span-2"><Empty text="Esta pestaña no tiene tarjetas. Pulsa Personalizar para añadir." /></div>}
                {mobileCards.map((item, index) => (
                  <div key={item.id} className="relative min-w-0">
                    {editMode && (
                      <div className="mb-1.5 flex items-center gap-1 rounded-2xl border border-sky-400/20 bg-sky-400/[.06] p-1.5">
                        <span className="min-w-0 flex-1 truncate pl-2 text-xs font-black uppercase tracking-wider text-slate-300">{CATALOG.find((card) => card.kind === item.kind)?.title}</span>
                        <button type="button" onClick={() => moveCard(item.id, -1)} disabled={index === 0} className="grid h-10 w-10 place-items-center rounded-xl text-slate-300 active:bg-white/10 disabled:opacity-30" aria-label="Subir tarjeta"><ArrowUp size={18} /></button>
                        <button type="button" onClick={() => moveCard(item.id, 1)} disabled={index === mobileCards.length - 1} className="grid h-10 w-10 place-items-center rounded-xl text-slate-300 active:bg-white/10 disabled:opacity-30" aria-label="Bajar tarjeta"><ArrowDown size={18} /></button>
                        <button type="button" onClick={() => removeCard(item.id)} className="grid h-10 w-10 place-items-center rounded-xl text-red-300 active:bg-red-500/15" aria-label="Quitar tarjeta"><EyeOff size={18} /></button>
                      </div>
                    )}
                    {renderCard(item.kind, data, students.length, true, (id) => setSheet({ id, open: true }))}
                  </div>
                ))}
              </motion.div>
            ) : (
              <motion.div layout className="mt-4 grid grid-cols-12 gap-3 sm:mt-6 sm:gap-4 xl:gap-5">
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
                            className={`pointer-events-none absolute inset-1 z-20 rounded-[28px] border-2 border-dashed ${dropTargetId === item.id ? 'border-sky-400/80 bg-sky-400/[.05]' : 'border-white/10'}`}
                          />
                        )}
                        {editMode && (
                          <div className="absolute right-3 top-3 z-30 flex items-center gap-1.5 rounded-xl border border-white/10 bg-[#081120]/95 p-1.5 shadow-2xl backdrop-blur-xl">
                            <button type="button" title="Arrastrar" className="grid h-8 w-8 cursor-grab place-items-center rounded-lg text-slate-400 hover:bg-white/10 hover:text-white"><GripVertical size={16} /></button>
                            <button type="button" title={`Cambiar tamaño: ${item.size.toUpperCase()}`} onClick={() => cycleSize(item.id)} className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 hover:bg-white/10 hover:text-white"><Maximize2 size={15} /></button>
                            <button type="button" title="Quitar tarjeta" onClick={() => removeCard(item.id)} className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 hover:bg-red-500/15 hover:text-red-300"><EyeOff size={15} /></button>
                          </div>
                        )}
                        {renderCard(item.kind, data, students.length, false)}
                        {editMode && <span className="absolute bottom-3 left-3 z-30 rounded-lg bg-black/35 px-2 py-1 text-[11px] font-black uppercase tracking-wider text-slate-400 backdrop-blur">{catalog?.title}</span>}
                      </motion.div>
                    )
                  })}
                </AnimatePresence>
              </motion.div>
            )}

            {mobile && (
              <nav aria-label="Secciones del panel" className="fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-[#07101d]/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl">
                <div className="mx-auto flex max-w-3xl">
                  {shownTabs.map((item) => {
                    const Icon = item.icon
                    const selected = item.id === activeTab
                    return (
                      <button key={item.id} type="button" onClick={() => changeTab(item.id)} aria-current={selected ? 'page' : undefined} className={`relative flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-black ${selected ? 'text-white' : 'text-slate-500 active:text-slate-300'}`}>
                        {selected && <span className="absolute inset-x-4 top-0 h-0.5 rounded-full bg-sky-400" />}
                        <Icon size={21} />
                        {item.label}
                        {item.id === 'tardanzas' && !selected && newLates > 0 && <span className="absolute right-[calc(50%-1.9rem)] top-1.5 grid h-5 min-w-5 place-items-center rounded-full bg-amber-400 px-1 text-[11px] font-black text-slate-950" aria-label={`${newLates} tardanzas nuevas`}>+{newLates}</span>}
                      </button>
                    )
                  })}
                </div>
              </nav>
            )}

            <AnimatePresence>
              {savedNotice && (
                <motion.div initial={{ opacity: 0, y: 12, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 12, scale: 0.98 }} transition={{ duration: 0.2 }} className={`fixed right-4 z-[120] flex items-center gap-2 rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-3 text-sm font-black text-emerald-300 shadow-2xl backdrop-blur-xl sm:right-6 ${mobile ? 'bottom-[calc(4.5rem+env(safe-area-inset-bottom))]' : 'bottom-[calc(1.5rem+env(safe-area-inset-bottom))]'}`}><CheckCircle2 size={17} /> Distribución guardada</motion.div>
              )}
            </AnimatePresence>

            {(() => {
              const sheetStudent = sheet ? data.studentById.get(sheet.id) : undefined
              return (
                <LiveSheet open={Boolean(sheet?.open && sheetStudent)} onClose={() => setSheet((current) => current && { ...current, open: false })} title={sheetStudent ? `${sheetStudent.firstName} ${sheetStudent.lastName}` : 'Alumno'} subtitle="Estado de hoy">
                  {sheetStudent && <StudentSheetBody student={sheetStudent} classroom={data.classroomById.get(sheetStudent.classroomId)} record={data.attendanceByStudent.get(sheetStudent.id)} incidents={data.incidents.filter((incident) => incident.studentId === sheetStudent.id)} />}
                </LiveSheet>
              )
            })()}

            <LiveSheet open={menuOpen} onClose={() => setMenuOpen(false)} title="Panel en vivo" subtitle="Opciones">
              <LiveDate active={menuOpen} className="px-1 pb-3 text-sm font-semibold capitalize text-slate-400" />
              <div className="space-y-1">
                <MenuAction icon={<SlidersHorizontal size={19} />} label="Personalizar panel" description="Añadir, quitar y ordenar tarjetas" onClick={() => { setMenuOpen(false); setEditMode(true) }} />
                <MenuToggle icon={<Sun size={19} />} label="Mantener pantalla encendida" description={keepAwake ? 'Activado: gasta más batería' : 'Desactivado: la pantalla se apaga sola'} checked={keepAwake} onChange={(value) => updatePrefs({ keepAwake: value })} />
                <MenuToggle icon={<Vibrate size={19} />} label="Vibrar con tardanza nueva" checked={vibrateOnLate} onChange={(value) => updatePrefs({ vibrate: value })} />
                <MenuToggle icon={<Type size={19} />} label="Texto grande" checked={largeText} onChange={(value) => updatePrefs({ largeText: value })} />
                {canFullscreen && <MenuAction icon={fullscreen ? <Minimize size={19} /> : <Expand size={19} />} label={fullscreen ? 'Salir de pantalla completa' : 'Pantalla completa'} onClick={() => { setMenuOpen(false); void toggleFullscreen() }} />}
              </div>
            </LiveSheet>
          </div>
          </MotionConfig>
        </motion.section>
      )}
    </AnimatePresence>
  )
}

function HeaderStat({ label, value, tone, onClick }: { label: string; value: number; tone: 'amber' | 'emerald' | 'slate'; onClick: () => void }) {
  const toneClass = tone === 'amber' ? 'border-amber-400/25 bg-amber-500/10 text-amber-300' : tone === 'emerald' ? 'border-emerald-400/20 bg-emerald-500/10 text-emerald-300' : 'border-white/10 bg-white/5 text-slate-200'
  return <button type="button" onClick={onClick} className={`min-w-0 rounded-xl border px-3 py-1.5 text-left active:brightness-125 ${toneClass}`}><span className="block text-2xl font-black leading-none tabular-nums">{value}</span><span className="mt-1 block truncate text-[11px] font-black uppercase tracking-wider opacity-80">{label}</span></button>
}

function MenuToggle({ icon, label, description, checked, onChange }: { icon: ReactNode; label: string; description?: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)} className="flex min-h-14 w-full items-center gap-3 rounded-2xl px-2 py-2 text-left active:bg-white/10">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white/5 text-sky-300">{icon}</span>
      <span className="min-w-0 flex-1"><span className="block text-[15px] font-bold">{label}</span>{description && <span className="mt-0.5 block text-xs font-medium text-slate-500">{description}</span>}</span>
      <span className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${checked ? 'bg-sky-500' : 'bg-white/15'}`}><span className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-all ${checked ? 'left-[1.4rem]' : 'left-0.5'}`} /></span>
    </button>
  )
}

function MenuAction({ icon, label, description, onClick }: { icon: ReactNode; label: string; description?: string; onClick: () => void }) {
  return <button type="button" onClick={onClick} className="flex min-h-14 w-full items-center gap-3 rounded-2xl px-2 py-2 text-left active:bg-white/10"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white/5 text-sky-300">{icon}</span><span className="min-w-0 flex-1"><span className="block text-[15px] font-bold">{label}</span>{description && <span className="mt-0.5 block text-xs font-medium text-slate-500">{description}</span>}</span></button>
}

type PanelData = ReturnType<typeof buildPanelDataShape>

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- solo existe para derivar el tipo PanelData
function buildPanelDataShape() {
  return {
    entered: 0, onTime: 0, late: 0, pending: 0, exited: 0, complianceChecked: 0, complianceOk: 0,
    attendancePercentage: 0, presentationPercentage: 0, totalIncidents: 0, recentEntries: [] as Array<{ record: AttendanceRecord; student: Student }>,
    lateStudents: [] as Array<{ record: AttendanceRecord; student: Student }>, lateByLevel: [] as LateLevelGroup[], pendingStudents: [] as Array<{ student: Student; classroom: Classroom | undefined }>,
    enrichedIncidents: [] as Array<IncidentEvent & { student: Student; classroom: Classroom | undefined }>,
    topTypes: [] as Array<{ label: string; count: number }>, topStudents: [] as Array<{ student: Student; count: number }>,
    classroomById: new Map<string, Classroom>(), classroomSummary: [] as Array<{ classroom: Classroom; total: number; entered: number; late: number; pending: number }>,
    incidentsByClassroom: [] as Array<{ classroom: Classroom; count: number }>,
    attendanceByStudent: new Map<string, AttendanceRecord>(), studentById: new Map<string, Student>(), incidents: [] as IncidentEvent[],
  }
}

function renderCard(kind: CardKind, data: PanelData, totalStudents: number, mobile: boolean, onSelect?: SelectStudent) {
  // En celular la página hace todo el scroll: una lista con scroll propio atrapa el dedo.
  const scroll30 = mobile ? '' : 'max-h-[30rem] overflow-auto pr-1'
  const scroll34 = mobile ? '' : 'max-h-[34rem] overflow-auto pr-1'
  switch (kind) {
    case 'metrics':
      return <MetricStrip data={data} totalStudents={totalStudents} />
    case 'recentEntries':
      return <TvCard title="Últimos ingresos" subtitle="Movimientos registrados hoy" icon={<LogIn size={20} />}><div className="space-y-2">{data.recentEntries.length === 0 ? <Empty text="Aún no hay ingresos registrados." /> : data.recentEntries.map(({ record, student }) => <StudentRow key={record.id ?? `${student.id}-${record.time}`} student={student} classroom={data.classroomById.get(student.classroomId)} time={record.time} status={record.status} icon={record.status === 'LATE' ? <AlertTriangle size={18} /> : <LogIn size={18} />} onSelect={onSelect} />)}</div></TvCard>
    case 'lateStudents':
      return <TvCard title="Alumnos con tardanza" subtitle={`${data.lateStudents.length} registrados hoy`} icon={<Clock3 size={20} />} strong><FilteredStudentList items={data.lateStudents.map(({ record, student }) => ({ record, student, classroom: data.classroomById.get(student.classroomId) }))} mobile={mobile} scrollClass={scroll30} empty={<Empty text="No hay tardanzas registradas hoy." />} keyOf={({ record, student }) => record.id ?? `${student.id}-${record.time}`} renderItem={({ record, student, classroom }) => <StudentRow student={student} classroom={classroom} time={record.time} status="LATE" icon={<AlertTriangle size={18} />} hideTime onSelect={onSelect} />} /></TvCard>
    case 'lateByGrade':
      return <TvCard title="Tardanzas por nivel y grado" subtitle={`${data.late} tardanzas hoy · actualización automática`} icon={<Clock3 size={20} />} strong><div className="grid gap-4 xl:grid-cols-2">{data.lateByLevel.map((group) => <LateLevelColumn key={group.level} group={group} mobile={mobile} onSelect={onSelect} />)}</div></TvCard>
    case 'lateByPrimaria':  
    case 'lateBySecundaria': {
      const level: Classroom['level'] = kind === 'lateByPrimaria' ? 'Primaria' : 'Secundaria'
      const group = data.lateByLevel.find((item) => item.level === level)
      return <TvCard title={`Tardanzas de ${level.toLowerCase()}`} subtitle={`${group?.total ?? 0} tardanzas hoy · actualización automática`} icon={<Clock3 size={20} />} strong>{group && <LateLevelColumn group={group} mobile={mobile} onSelect={onSelect} />}</TvCard>
    }
    case 'todayIncidents':
      return <TvCard title="Incidencias del día" subtitle={`${data.totalIncidents} incidencias registradas · actualización automática`} icon={<ShieldAlert size={20} />} strong><div className={`space-y-2 ${scroll34}`}>{data.enrichedIncidents.length === 0 ? <Empty text="No hay incidencias registradas hoy." /> : data.enrichedIncidents.map((event) => <div key={event.key} {...tap(onSelect, event.student.id)} className={`grid grid-cols-[auto_1fr_auto] items-center gap-3 rounded-2xl border p-3.5 ${onSelect ? TAP_CLASS : ''} ${event.severity === 'conduct' ? 'border-red-400/20 bg-red-500/[.07]' : event.severity === 'late' ? 'border-amber-400/20 bg-amber-500/[.07]' : 'border-orange-400/20 bg-orange-500/[.06]'}`}><div className={`grid h-11 w-11 place-items-center rounded-xl ${event.severity === 'conduct' ? 'bg-red-500/15 text-red-300' : event.severity === 'late' ? 'bg-amber-500/15 text-amber-300' : 'bg-orange-500/15 text-orange-300'}`}><AlertTriangle size={20}/></div><div className="min-w-0"><p className="truncate text-base font-black">{event.student.firstName} {event.student.lastName}</p><p className="mt-1 truncate text-sm font-bold text-slate-300">{event.labels.join(' · ')}</p><p className="mt-0.5 text-xs font-semibold text-slate-500">{event.classroom ? `${event.classroom.grade} ${event.classroom.section} · ${event.classroom.level}` : 'Aula no encontrada'}</p></div><div className="font-mono text-lg font-black tabular-nums text-slate-300">{event.time || '—'}</div></div>)}</div></TvCard>
    case 'topIncidents':
      return <TvCard title="Top incidencias" subtitle="Tipos más repetidos hoy" icon={<BarChart3 size={20} />}><div className="space-y-4">{data.topTypes.length === 0 ? <Empty text="Sin datos todavía." /> : data.topTypes.map((item) => <div key={item.label}><div className="mb-1.5 flex items-center justify-between gap-3 text-sm"><span className="font-bold text-slate-300">{item.label}</span><b className="text-lg">{item.count}</b></div><div className="h-2.5 overflow-hidden rounded-full bg-white/5"><motion.div initial={{ width: 0 }} animate={{ width: `${Math.max(8, (item.count / Math.max(1, ...data.topTypes.map((entry) => entry.count))) * 100)}%` }} transition={{ duration: .45, ease: [0.22, 1, 0.36, 1] }} className="h-full rounded-full bg-amber-400" /></div></div>)}</div></TvCard>
    case 'topStudents':
      return <TvCard title="Alumnos con más incidencias" subtitle="Ranking del día" icon={<Users size={20} />}><div className="space-y-2">{data.topStudents.length === 0 ? <Empty text="Sin incidencias hoy." /> : data.topStudents.map(({ student, count }, index) => <div key={student.id} {...tap(onSelect, student.id)} className={`flex items-center gap-3 rounded-xl bg-white/[.035] px-3 py-2.5 ${onSelect ? TAP_CLASS : ''}`}><span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-white/[.06] text-sm font-black text-slate-400">{index + 1}</span><div className="min-w-0 flex-1"><p className="truncate text-sm font-black">{student.firstName} {student.lastName}</p><p className="text-xs font-semibold text-slate-500">{data.classroomById.get(student.classroomId)?.grade ?? 'Aula'} {data.classroomById.get(student.classroomId)?.section ?? ''}</p></div><span className="rounded-lg bg-red-500/10 px-2.5 py-1 text-sm font-black text-red-300">{count}</span></div>)}</div></TvCard>
    case 'attendanceSummary':
      return <TvCard title="Resumen de asistencia" subtitle="Estado del día" icon={<BarChart3 size={20} />}><div className="grid grid-cols-2 gap-3"><MiniStat label="Ingresaron" value={data.entered} /> <MiniStat label="A tiempo" value={data.onTime} /> <MiniStat label="Tardanzas" value={data.late} /> <MiniStat label="Cobertura" value={`${data.attendancePercentage}%`} /></div></TvCard>
    case 'exitSummary':
      return <TvCard title="Salidas registradas" subtitle="Control de salida" icon={<LogOut size={20} />}><div className="flex items-end justify-between gap-4"><div><p className="text-4xl font-black tabular-nums">{data.exited}</p><p className="mt-1 text-xs font-bold uppercase tracking-widest text-slate-500">de {data.entered} ingresados</p></div><div className="rounded-2xl bg-white/5 p-4 text-emerald-300"><LogOut size={30} /></div></div></TvCard>
    case 'presentationCompliance':
      return <TvCard title="Cumplimiento de presentación" subtitle="Control del reglamento" icon={<CheckCircle2 size={20} />}><div className="flex items-center gap-5"><div className="relative grid h-24 w-24 shrink-0 place-items-center rounded-full" style={{ background: `conic-gradient(#d4a94f ${data.presentationPercentage * 3.6}deg, rgba(255,255,255,.07) 0deg)` }}><div className="grid h-16 w-16 place-items-center rounded-full bg-[#09111e] text-lg font-black">{data.presentationPercentage}%</div></div><div><p className="text-2xl font-black">{data.complianceOk}</p><p className="text-sm font-semibold text-slate-500">sin incidencias de presentación</p><p className="mt-2 text-xs font-bold text-slate-500">{data.complianceChecked} registros con incumplimiento</p></div></div></TvCard>
    case 'pendingStudents':
      return <TvCard title="Alumnos sin ingreso" subtitle={`${data.pendingStudents.length} pendientes de marcar`} icon={<Users size={20} />}><FilteredStudentList items={data.pendingStudents} mobile={mobile} scrollClass={scroll30} empty={<Empty text="Todos los alumnos tienen registro de ingreso." />} keyOf={({ student }) => student.id} renderItem={({ student, classroom }) => <div {...tap(onSelect, student.id)} className={`flex items-center gap-3 rounded-2xl border border-white/7 bg-white/[.035] p-3 ${onSelect ? TAP_CLASS : ''}`}><div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white/5 text-slate-400"><Clock3 size={17} /></div><div className="min-w-0 flex-1"><p className={mobile ? 'break-words font-black leading-tight' : 'truncate font-black'}>{student.firstName} {student.lastName}</p><p className="text-xs font-semibold text-slate-500">{classroom ? `${classroom.grade} ${classroom.section}` : 'Aula'}</p></div><span className="rounded-full bg-white/5 px-2 py-1 text-[11px] font-black uppercase tracking-wider text-slate-400">Pendiente</span></div>} /></TvCard>
    case 'classroomSummary':
      return <TvCard title="Resumen por aula" subtitle="Visión completa del colegio" icon={<LayoutDashboard size={20} />}><div className={`grid grid-cols-2 gap-2 ${scroll34}`}>{data.classroomSummary.map(({ classroom, total, entered, late, pending }) => <div key={classroom.id} className="rounded-2xl border border-white/7 bg-white/[.035] p-3.5"><div className="flex items-center justify-between gap-3"><div><p className="font-black">{classroom.grade} {classroom.section}</p><p className="text-xs font-semibold text-slate-500">{classroom.level}</p></div><span className="rounded-lg bg-white/5 px-2 py-1 text-xs font-black">{entered}/{total}</span></div><div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs"><div className="rounded-xl bg-emerald-500/8 px-2 py-2"><b className="block text-emerald-300">{Math.max(0, entered - late)}</b><span className="text-slate-500">a tiempo</span></div><div className="rounded-xl bg-amber-500/8 px-2 py-2"><b className="block text-amber-300">{late}</b><span className="text-slate-500">tarde</span></div><div className="rounded-xl bg-white/5 px-2 py-2"><b className="block text-slate-300">{pending}</b><span className="text-slate-500">pend.</span></div></div></div>)}</div></TvCard>
    case 'incidentsByClassroom':
      return <TvCard title="Incidencias por aula" subtitle="Dónde se concentran hoy" icon={<ShieldAlert size={20} />}><div className="space-y-2">{data.incidentsByClassroom.length === 0 ? <Empty text="Sin incidencias por aula." /> : data.incidentsByClassroom.map(({ classroom, count }) => <div key={classroom.id} className="flex items-center gap-3 rounded-xl bg-white/[.035] px-3 py-3"><div className="min-w-0 flex-1"><p className="truncate font-black">{classroom.grade} {classroom.section}</p><p className="text-xs font-semibold text-slate-500">{classroom.level}</p></div><span className={`rounded-lg px-2.5 py-1 text-sm font-black ${count ? 'bg-amber-500/10 text-amber-300' : 'bg-white/5 text-slate-500'}`}>{count}</span></div>)}</div></TvCard>
  }
}

function MetricStrip({ data, totalStudents }: { data: PanelData; totalStudents: number }) {
  return <div className="grid grid-cols-2 gap-2 sm:gap-3 md:grid-cols-5 [&>*:last-child]:col-span-2 md:[&>*:last-child]:col-span-1"><Metric icon={<Users size={21} />} label="Alumnos" value={totalStudents} /><Metric icon={<LogIn size={21} />} label="Ingresaron" value={data.entered} accent="emerald" /><Metric icon={<Clock3 size={21} />} label="A tiempo" value={data.onTime} accent="blue" /><Metric icon={<AlertTriangle size={21} />} label="Tardanzas" value={data.late} accent="amber" /><Metric icon={<Users size={21} />} label="Sin marcar" value={data.pending} accent="slate" /></div>
}

function StudentRow({ student, classroom, time, status, icon, showStatus = true, hideTime = false, onSelect }: { student: Student; classroom?: Classroom; time: string; status: 'ON_TIME' | 'LATE'; icon: ReactNode; showStatus?: boolean; hideTime?: boolean; onSelect?: SelectStudent }) {
  return <div {...tap(onSelect, student.id)} className={`flex items-center gap-2.5 rounded-2xl border border-white/7 bg-white/[.035] p-2.5 sm:gap-3 sm:p-3 ${onSelect ? TAP_CLASS : ''}`}><div className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl sm:h-10 sm:w-10 ${status === 'LATE' ? 'bg-amber-500/15 text-amber-300' : 'bg-emerald-500/15 text-emerald-300'}`}>{icon}</div><div className="min-w-0 flex-1"><p className="break-words font-black leading-tight sm:truncate">{student.firstName} {student.lastName}</p><p className="mt-0.5 text-xs font-semibold text-slate-500">{classroom ? `${classroom.grade} ${classroom.section} · ${classroom.level}` : 'Aula'}</p></div><div className="shrink-0 text-right">{hideTime ? <p className="text-[11px] font-black uppercase tracking-wider text-amber-300">Tardanza</p> : <p className="font-mono text-sm font-black sm:text-lg">{entryTimeLabel(time)}</p>}{showStatus && <p className={`text-[11px] font-black uppercase tracking-wider ${status === 'LATE' ? 'text-amber-300' : 'text-emerald-300'}`}>{status === 'LATE' ? 'Tardanza' : 'A tiempo'}</p>}</div></div>
}

function LateLevelColumn({ group, mobile, onSelect }: { group: LateLevelGroup; mobile: boolean; onSelect?: SelectStudent }) {
  // En celular los grados se pliegan; si hay pocas tardanzas arrancan abiertos.
  const startOpen = !mobile || group.total <= 8
  return (
    <div className="min-w-0 rounded-2xl border border-white/10 bg-white/[.02] p-3">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="text-lg font-black uppercase tracking-wider">{group.level}</h3>
        <span className="rounded-lg bg-amber-500/10 px-2.5 py-1 text-sm font-black text-amber-300">{group.total}</span>
      </div>
      {group.grades.length === 0 ? <Empty text={`Sin tardanzas en ${group.level.toLowerCase()} hoy.`} /> : (
        <div className={`space-y-3 ${mobile ? '' : 'max-h-[34rem] overflow-auto pr-1'}`}>
          {group.grades.map(({ grade, rows }) => <LateGradeGroup key={grade} level={group.level} grade={grade} rows={rows} collapsible={mobile} startOpen={startOpen} onSelect={onSelect} />)}
        </div>
      )}
    </div>
  )
}

function LateGradeGroup({ level, grade, rows, collapsible, startOpen, onSelect }: { level: Classroom['level']; grade: string; rows: LateRow[]; collapsible: boolean; startOpen: boolean; onSelect?: SelectStudent }) {
  const [open, setOpen] = useState(startOpen)
  const expanded = !collapsible || open
  const title = <><span>{gradeLabel(level, grade)}</span><span className="flex items-center gap-1.5">{rows.length}{collapsible && (expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />)}</span></>
  return (
    <div>
      {collapsible
        ? <button type="button" onClick={() => setOpen((value) => !value)} aria-expanded={expanded} className="mb-1.5 flex min-h-11 w-full items-center justify-between rounded-xl bg-white/[.04] px-3 text-xs font-black uppercase tracking-widest text-slate-300 active:bg-white/10">{title}</button>
        : <p className="mb-1.5 flex items-center justify-between text-xs font-black uppercase tracking-widest text-slate-400">{title}</p>}
      {expanded && (
        <div className="space-y-1.5">
          {rows.map(({ record, student, classroom }) => (
            <div key={record.id ?? student.id} {...tap(onSelect, student.id)} className={`flex items-center gap-3 rounded-xl border border-white/7 bg-white/[.035] px-3 py-2 ${onSelect ? TAP_CLASS : ''}`}>
              <span className="grid h-8 min-w-8 shrink-0 place-items-center rounded-lg bg-white/5 px-1.5 text-xs font-black text-slate-300" title="Sección">{classroom.section}</span>
              <p className={`min-w-0 flex-1 font-black ${collapsible ? 'break-words leading-tight' : 'truncate'}`}>{student.lastName}, {student.firstName}</p>
              {record.justified && <span className="rounded-md bg-sky-500/15 px-1.5 py-0.5 text-[11px] font-black uppercase tracking-wider text-sky-300">Justificada</span>}
              <span className="shrink-0 text-[11px] font-black uppercase tracking-wider text-amber-300">Tardanza</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function Metric({ icon, label, value, accent = 'slate' }: { icon: ReactNode; label: string; value: number; accent?: 'slate' | 'emerald' | 'blue' | 'amber' }) {
  const accentClass = accent === 'emerald' ? 'text-emerald-300 bg-emerald-500/10' : accent === 'blue' ? 'text-sky-300 bg-sky-500/10' : accent === 'amber' ? 'text-amber-300 bg-amber-500/10' : 'text-slate-300 bg-white/5'
  return <div className="min-w-0 rounded-2xl border border-white/10 bg-white/[.035] p-3 sm:p-4 xl:p-5"><div className={`inline-flex max-w-full items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-xs font-black uppercase tracking-wider sm:gap-2 sm:px-3 sm:py-2 sm:text-xs ${accentClass}`}><span className="shrink-0 [&>svg]:h-4 [&>svg]:w-4 sm:[&>svg]:h-5 sm:[&>svg]:w-5">{icon}</span><span className="truncate">{label}</span></div><p className="mt-3 text-3xl font-black tabular-nums sm:mt-4 sm:text-4xl xl:text-5xl">{value}</p></div>
}

function MiniStat({ label, value }: { label: string; value: number | string }) {
  return <div className="rounded-2xl bg-white/[.035] p-3"><p className="text-xl font-black tabular-nums">{value}</p><p className="mt-1 text-xs font-black uppercase tracking-widest text-slate-500">{label}</p></div>
}

function TvCard({ title, subtitle, icon, children, strong = false }: { title: string; subtitle: string; icon: ReactNode; children: ReactNode; strong?: boolean }) {
  return <section className={`h-full min-w-0 rounded-3xl border p-3 sm:p-4 xl:p-5 ${strong ? 'border-white/15 bg-white/[.045]' : 'border-white/10 bg-white/[.025]'}`}><div className="mb-4 flex items-start gap-3"><div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white/5 text-slate-300">{icon}</div><div className="min-w-0"><h2 className="text-lg font-black xl:text-xl">{title}</h2><p className="mt-0.5 text-xs font-semibold text-slate-500">{subtitle}</p></div></div>{children}</section>
}

function Empty({ text }: { text: string }) {
  return <div className="rounded-2xl border border-dashed border-white/10 px-4 py-8 text-center text-sm font-semibold text-slate-500">{text}</div>
}
