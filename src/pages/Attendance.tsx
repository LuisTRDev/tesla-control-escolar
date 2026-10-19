import { lazy, useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { supabase } from '@/lib/supabase'
import { reportError } from '@/lib/security'
import { useToast } from '@/lib/toast'
import { MotionConfig } from 'framer-motion'
import { isAdminRole } from '@/services/rosterService'
import {
  AlertTriangle, Ban, Bell, CalendarCheck2, CalendarOff, ChevronDown, Clock3, HelpCircle, Menu, MessageCircle, Monitor, Search, Settings2, Shirt, Users, UserX, X,
} from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { TimePicker } from '@/components/ui/TimePicker'
import { Tooltip } from '@/components/ui/Tooltip'
import { Card } from '@/components/ui/Card'
import { Deferred } from '@/components/ui/Deferred'
import { LiveClock } from '@/components/ui/LiveClock'
import Sidebar from '@/components/Sidebar'
import AlertCenter from '@/components/AlertCenter'
import DailySummary from '@/components/DailySummary'
import PdaMode from '@/components/PdaMode'
import QuickMode from '@/components/QuickMode'
import SyncStatus from '@/components/SyncStatus'
import MobileTabBar from '@/components/MobileTabBar'
import BulkMarkDialog from '@/components/BulkMarkDialog'
import MultiNotificationModal from '@/components/attendance/MultiNotificationModal'
import NotificationPreviewModal from '@/components/attendance/NotificationPreviewModal'
import PresentationDialog from '@/components/attendance/PresentationDialog'
import SettingsPanel from '@/components/attendance/SettingsPanel'
import StudentHistoryModal from '@/components/attendance/StudentHistoryModal'
import WhatsAppDialog from '@/components/attendance/WhatsAppDialog'
import { LateNoTimeBanner, LateNoTimeSwitch, useLateNoTimeMode } from '@/components/attendance/LateNoTimeSwitch'
import JustifyDialog, { type JustifyTarget } from '@/components/attendance/JustifyDialog'
import PermissionDialog from '@/components/attendance/PermissionDialog'
import EarlyExitDialog from '@/components/attendance/EarlyExitDialog'
import MarkAbsenceDialog from '@/components/attendance/MarkAbsenceDialog'
import ScheduleCalendarSettings from '@/components/attendance/ScheduleCalendarSettings'
import AttendanceEditDialog from '@/components/attendance/AttendanceEditDialog'
import StudentAttendanceCard from '@/components/attendance/StudentAttendanceCard'
import type { WhatsAppQueueItem } from '@/components/WhatsAppQueue'
import { useNetworkSync } from '@/hooks/useNetworkSync'
import { useSchoolRealtime } from '@/hooks/useSchoolRealtime'
import { usePwaInstall } from '@/hooks/usePwaInstall'
import { Input } from '@/components/ui/Input'
import { MAX_NOTIFICATIONS_PER_PAGE, type NotificationPrintData } from '@/lib/notificationTypes'
import { emptyPresentationDraft, getPresentationViolationLabels, getViolationCount, type PresentationDraft } from '@/lib/presentation'
import { playFeedback, type FeedbackKind } from '@/lib/feedback'
import { matchesQuery, studentMatches } from '@/lib/search'
import { hasOpenOverlay, isTypingTarget, pickEnterTarget } from '@/lib/shortcuts'
import { useOverlayScrollLock } from '@/lib/scrollLock'
import { useBackClose } from '@/lib/backClose'
import { requestPersistentStorage, setAppBadge } from '@/lib/nativeFeatures'
import { countAppErrorsSince } from '@/services/adminService'
import type { StartModule } from '@/App'
import { getCurrentTime, getPreferences, getTodayKey, savePreferences, type UserPreferences } from '@/lib/storage'
import { monthRangeKeys } from '@/lib/dates'
import { inactiveLabel, isActiveStudent, isInactive } from '@/lib/studentStatus'
import {
  deleteAttendanceForDate, deleteAttendanceRecord, deletePresentationForDate, getAttendanceRange, getEntryLimit, getPresentationRange, getStudents,
  registerAttendance, registerBulkAttendance, registerExitAttendance, saveEntryLimit, savePresentation as savePresentationRemote,
  getToleranceSettings, saveToleranceSettings, type ToleranceSettings,  updateAttendanceEntryTime,
} from '@/services/schoolService'
import {
  ensureNotificationForLateAttendance,
  ensureNotificationForPresentation,
  getNotifications,
} from '@/services/notificationService'
import {
  buildWhatsAppMessage,
  isValidPeruWhatsApp,
  sendWhatsApp,
  type WhatsAppMessageType,
  type WhatsAppTemplates,
} from '@/services/communicationService'
import { getWhatsAppTemplates, saveWhatsAppTemplates } from '@/services/whatsappTemplateService'
import { friendlyError } from '@/lib/errorMessages'
import {
  CALENDAR_KIND_LABELS, EMPTY_DAY_STATUS, findPermission, getDayStatusData, getEffectiveSchedule, removeAbsence, saveLevelSchedule,
  type DayStatusData,
} from '@/services/dayStatusService'
import type {
  AbsenceRecord, AttendanceFilter, AttendanceRecord, Classroom, EarlyExit, NotificationRecord, PresentationFilter,
  PresentationRecord, PresentationStatus, Student,
} from '@/types'

// Módulos pesados o de uso ocasional: se descargan recién al abrirlos.
const AdvancedReports = lazy(() => import('@/components/AdvancedReports'))
const AuditLog = lazy(() => import('@/components/AuditLog'))
const BackupCenter = lazy(() => import('@/components/BackupCenter'))
const Cobranza = lazy(() => import('@/components/Cobranza'))
const Dashboard = lazy(() => import('@/components/Dashboard'))
const HistoricalImport = lazy(() => import('@/components/HistoricalImport'))
const LiveTvPanel = lazy(() => import('@/components/LiveTvPanel'))
const RosterManager = lazy(() => import('@/components/RosterManager'))
const StudentCaseFile = lazy(() => import('@/components/StudentCaseFile'))
const WhatsAppQueue = lazy(() => import('@/components/WhatsAppQueue'))
const SyncPanel = lazy(() => import('@/components/SyncPanel'))
const HelpGuide = lazy(() => import('@/components/HelpGuide'))
const UserManager = lazy(() => import('@/components/UserManager'))
const ErrorMonitor = lazy(() => import('@/components/ErrorMonitor'))

type Props = {
  userName: string
  userRole: string
  classrooms: Classroom[]
  classroom: Classroom
  onClassroomChange: (classroom: Classroom) => void
  onLogout: () => void
  /** Módulo pedido por un acceso directo de la app instalada. */
  startModule?: StartModule
}

const attendanceFilters: Array<{ id: AttendanceFilter; label: string }> = [
  { id: 'ALL', label: 'Todos' }, { id: 'ON_TIME', label: 'A tiempo' }, { id: 'LATE', label: 'Tardanza' }, { id: 'PENDING', label: 'Pendientes' }, { id: 'ABSENT', label: 'Faltas y permisos' },
]
const presentationFilters: Array<{ id: PresentationFilter; label: string }> = [
  { id: 'ALL', label: 'Todos' }, { id: 'COMPLIANT', label: 'Conforme' }, { id: 'NON_COMPLIANT', label: 'Con incumplimiento' }, { id: 'PENDING', label: 'Sin revisar' },
]

/** La notificación de tardanza que generó esa marca (por id, o por alumno+fecha si la marca era offline). */
function isLateNotificationOf(item: NotificationRecord, rec: AttendanceRecord) {
  if (rec.id && item.attendanceId === rec.id) return true
  return item.notificationType === 'LATE_ENTRY' && item.studentId === rec.studentId && item.date === rec.date
}

const ERRORS_SEEN_KEY = 'tesla_errors_seen_at'

function readErrorsSeenAt() {
  try { return localStorage.getItem(ERRORS_SEEN_KEY) ?? new Date(Date.now() - 86_400_000).toISOString() } catch { return new Date(Date.now() - 86_400_000).toISOString() }
}

export default function Attendance({ userName, userRole, classrooms, classroom, onClassroomChange, onLogout, startModule = null }: Props) {
  const toast = useToast()
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<AttendanceFilter>('ALL')
  const [presentationFilter, setPresentationFilter] = useState<PresentationFilter>('ALL')
  const [students, setStudents] = useState<Student[]>([])
  const [records, setRecords] = useState<AttendanceRecord[]>([])
  const [presentationRecords, setPresentationRecords] = useState<PresentationRecord[]>([])
  const [notifications, setNotifications] = useState<NotificationRecord[]>([])
  const [entryLimit, setEntryLimit] = useState('07:45')
  const [toleranceSettings, setToleranceSettings] = useState<ToleranceSettings>({ enabled: false, minutes: 5 })
  const [loadingData, setLoadingData] = useState(true)
  const [dataError, setDataError] = useState('')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [dashboardOpen, setDashboardOpen] = useState(false)
  const [reportsOpen, setReportsOpen] = useState(false)
  const [cobranzaOpen, setCobranzaOpen] = useState(false)
  const [rosterOpen, setRosterOpen] = useState(false)
  const [alertsOpen, setAlertsOpen] = useState(false)
  const [dailySummaryOpen, setDailySummaryOpen] = useState(false)
  const [auditOpen, setAuditOpen] = useState(false)
  const [quickModeOpen, setQuickModeOpen] = useState(false)
  const [pdaModeOpen, setPdaModeOpen] = useState(false)
  const [backupOpen, setBackupOpen] = useState(false)
  const [historicalImportOpen, setHistoricalImportOpen] = useState(false)
  const [tvPanelOpen, setTvPanelOpen] = useState(false)
  const [caseFileStudent, setCaseFileStudent] = useState<Student | null>(null)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [now, setNow] = useState(() => new Date())
  const [presentationStudent, setPresentationStudent] = useState<Student | null>(null)
  const [notificationPreviewData, setNotificationPreviewData] = useState<NotificationPrintData | null>(null)
  const [multiNotificationOpen, setMultiNotificationOpen] = useState(false)
  const [selectedNotificationIds, setSelectedNotificationIds] = useState<string[]>([])
  const [notificationSearch, setNotificationSearch] = useState('')
  const [multiNotificationDate, setMultiNotificationDate] = useState(getTodayKey())
  const [bulkAttendanceOpen, setBulkAttendanceOpen] = useState(false)
  const [bulkAttendanceSelected, setBulkAttendanceSelected] = useState<Set<string>>(new Set())
  const [bulkAttendanceSaving, setBulkAttendanceSaving] = useState(false)
  const [historyStudent, setHistoryStudent] = useState<Student | null>(null)
  const [lateNoTime, setLateNoTime] = useLateNoTimeMode()
  const [whatsAppStudent, setWhatsAppStudent] = useState<Student | null>(null)
  const [whatsAppType, setWhatsAppType] = useState<WhatsAppMessageType>('LATE')
  const [whatsAppMessage, setWhatsAppMessage] = useState('')
  const [whatsAppError, setWhatsAppError] = useState('')
  const [openingWhatsApp, setOpeningWhatsApp] = useState(false)
  const [presentationDraft, setPresentationDraft] = useState<PresentationDraft>(emptyPresentationDraft)
  const [editingAttendance, setEditingAttendance] = useState<AttendanceRecord | null>(null)
  const [editingAttendanceTime, setEditingAttendanceTime] = useState('')
  const [savingAttendanceEdit, setSavingAttendanceEdit] = useState(false)
  const [preferences, setPreferences] = useState<UserPreferences>(() => getPreferences())
  const [whatsAppQueueOpen, setWhatsAppQueueOpen] = useState(false)
  const [waTemplates, setWaTemplates] = useState<WhatsAppTemplates>({})
  const [waTemplatesShared, setWaTemplatesShared] = useState(true)
  const [dayStatus, setDayStatus] = useState<DayStatusData>(EMPTY_DAY_STATUS)
  const [justifyTarget, setJustifyTarget] = useState<JustifyTarget | null>(null)
  const [permissionStudent, setPermissionStudent] = useState<Student | null>(null)
  const [earlyExitStudent, setEarlyExitStudent] = useState<Student | null>(null)
  /** Diálogo de faltas: un alumno (preseleccionado) o el aula (lista para elegir). */
  const [absenceDialog, setAbsenceDialog] = useState<{ students: Student[]; selected: string[] } | null>(null)
  const [syncPanelOpen, setSyncPanelOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const [usersOpen, setUsersOpen] = useState(false)
  const [errorsOpen, setErrorsOpen] = useState(false)
  const [errorCount, setErrorCount] = useState(0)
  const [searchHint, setSearchHint] = useState('')
  const searchRef = useRef<HTMLInputElement | null>(null)
  const isAdmin = isAdminRole(userRole)
  const today = getTodayKey()
  const [systemDark, setSystemDark] = useState(() => window.matchMedia('(prefers-color-scheme: dark)').matches)
  const darkMode = preferences.theme === 'dark' || (preferences.theme === 'system' && systemDark)
  const sizeClass = preferences.interfaceSize === 'large' ? 'text-[17px]' : ''

  const reloadData = useCallback(async (showLoading = true) => {
    if (showLoading) setLoadingData(true); setDataError('')
    try {
      const range = monthRangeKeys()
      const [studentData, attendanceData, presentationData, notificationData, limit, tolerance] = await Promise.all([
        getStudents(),
        getAttendanceRange(range.from, range.to),
        getPresentationRange(range.from, range.to),
        getNotifications(),
        getEntryLimit(),
        getToleranceSettings(),
      ])
      setStudents(studentData)
      setRecords(attendanceData)
      setPresentationRecords(presentationData)
      setNotifications(notificationData)
      setEntryLimit(limit)
      setToleranceSettings(tolerance)
      setDayStatus(await getDayStatusData(range.from, range.to).catch((error) => { reportError('Attendance', error); return EMPTY_DAY_STATUS }))
    } catch (error) {
      reportError('Attendance', error); setDataError(friendlyError(error, 'No se pudieron cargar los datos locales/remotos.'))
    } finally { if (showLoading) setLoadingData(false) }
  }, [])

  // Las sincronizaciones de fondo actualizan los datos sin desmontar ni bloquear la pantalla.
  const pullInBackground = useCallback(async () => { await reloadData(false) }, [reloadData])
  const syncState = useNetworkSync(pullInBackground)
  const realtimeState = useSchoolRealtime(pullInBackground)
  const { installAvailable, install } = usePwaInstall()

  // Acceso directo de la app instalada (mantener presionado el ícono): abre el módulo pedido.
  useEffect(() => {
    if (startModule === 'quick') setQuickModeOpen(true)
    else if (startModule === 'pda') setPdaModeOpen(true)
    else if (startModule === 'summary') setDailySummaryOpen(true)
    else if (startModule === 'whatsapp') setWhatsAppQueueOpen(true)
  }, [startModule])

  // Aviso cuando la sincronización resolvió conflictos o tiene operaciones que fallan.
  const lastSyncResult = syncState.lastResult
  useEffect(() => {
    if (!lastSyncResult) return
    if (lastSyncResult.conflicts > 0) {
      toast.show({
        title: `${lastSyncResult.conflicts} conflicto${lastSyncResult.conflicts === 1 ? '' : 's'} resuelto${lastSyncResult.conflicts === 1 ? '' : 's'} al sincronizar`,
        description: 'Otro equipo había registrado a los mismos alumnos. Se guardó la hora más temprana.',
        variant: 'info',
        duration: 8000,
        action: { label: 'Ver', onClick: () => setSyncPanelOpen(true) },
      })
    }
    if (lastSyncResult.blocked > 0) {
      toast.show({
        title: `El servidor rechazó ${lastSyncResult.blocked} marca${lastSyncResult.blocked === 1 ? '' : 's'}`,
        description: 'Ya no se reintentan solas. Avisa al administrador.',
        variant: 'error',
        duration: 10000,
        action: { label: 'Ver', onClick: () => setSyncPanelOpen(true) },
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo reacciona a un resultado nuevo, no a cambios de toast
  }, [lastSyncResult])

  // Monitoreo (solo admin): cantidad de errores nuevos desde la última revisión.
  const refreshErrorCount = useCallback(() => {
    if (!isAdmin) return
    void countAppErrorsSince(readErrorsSeenAt()).then((count) => setErrorCount(count ?? 0))
  }, [isAdmin])
  useEffect(() => {
    refreshErrorCount()
    const timer = window.setInterval(refreshErrorCount, 5 * 60_000)
    return () => window.clearInterval(timer)
  }, [refreshErrorCount])
  const markErrorsSeen = useCallback(() => {
    try { localStorage.setItem(ERRORS_SEEN_KEY, new Date().toISOString()) } catch { /* sin almacenamiento: el contador no se reinicia */ }
    setErrorCount(0)
  }, [])

  useEffect(() => {
    const handleRealtimeEvent = (event: Event) => {
      const detail = (event as CustomEvent).detail as { table?: string; event?: string; newRecord?: Record<string, unknown>; oldRecord?: Record<string, unknown> } | undefined
      if (!detail?.table) return
      const table = detail.table
      const incoming = detail.newRecord

      if (table === 'attendance' && incoming?.id != null && incoming.student_id != null && incoming.date) {
        const mapped: AttendanceRecord = {
          id: String(incoming.id),
          studentId: String(incoming.student_id),
          date: String(incoming.date),
          time: String(incoming.entry_time ?? '').slice(0, 5),
          status: String(incoming.status ?? 'ON_TIME') as AttendanceRecord['status'],
          exitTime: String(incoming.exit_time ?? '').slice(0, 5),
          exitRecordedAt: incoming.exit_recorded_at == null ? null : String(incoming.exit_recorded_at),
          exitRecordedBy: incoming.exit_recorded_by == null ? null : String(incoming.exit_recorded_by),
          entryRecordedAt: incoming.entry_recorded_at == null ? null : String(incoming.entry_recorded_at),
          entryRecordedBy: incoming.entry_recorded_by == null ? null : String(incoming.entry_recorded_by),
          entrySource: incoming.entry_source == null ? null : String(incoming.entry_source),
          exitSource: incoming.exit_source == null ? null : String(incoming.exit_source),
        }
        if (detail.event === 'DELETE') {
          setRecords((curr) => curr.filter((item) => !(item.studentId === mapped.studentId && item.date === mapped.date)))
        } else {
          setRecords((curr) => [...curr.filter((item) => !(item.studentId === mapped.studentId && item.date === mapped.date)), mapped])
        }
        return
      }

      if (table === 'notifications' && incoming?.id != null && incoming.student_id != null && incoming.date) {
        const mapped: NotificationRecord = {
          id: String(incoming.id),
          studentId: String(incoming.student_id),
          presentationControlId: incoming.presentation_control_id == null ? null : String(incoming.presentation_control_id),
          attendanceId: incoming.attendance_id == null ? null : String(incoming.attendance_id),
          notificationNumber: Math.max(1, Number(incoming.notification_number) || 1),
          notificationType: (incoming.notification_type ?? 'PRESENTATION') as NotificationRecord['notificationType'],
          observation: String(incoming.observation ?? ''),
          date: String(incoming.date),
          generatedAt: String(incoming.generated_at ?? new Date().toISOString()),
          voided: Boolean(incoming.voided),
          voidedReason: incoming.voided_reason == null ? null : String(incoming.voided_reason),
        }
        if (detail.event === 'DELETE') setNotifications((curr) => curr.filter((item) => item.id !== mapped.id))
        else setNotifications((curr) => [mapped, ...curr.filter((item) => item.id !== mapped.id)])
        return
      }

      if (table === 'presentation_controls' && incoming?.id != null && incoming.student_id != null && incoming.date) {
        const base = presentationRecords.find((item) => item.id === String(incoming.id))
        if (detail.event === 'DELETE') {
          setPresentationRecords((curr) => curr.filter((item) => item.id !== String(incoming.id)))
        } else if (base) {
          setPresentationRecords((curr) => [...curr.filter((item) => item.id !== base.id), { ...base, status: String(incoming.status ?? base.status) as PresentationRecord['status'], observation: String(incoming.other_description ?? base.observation), checkedAt: String(incoming.checked_at ?? base.checkedAt) }])
        }
      }
    }

    window.addEventListener('tesla-realtime-event', handleRealtimeEvent)
    return () => window.removeEventListener('tesla-realtime-event', handleRealtimeEvent)
  }, [presentationRecords])

  useEffect(() => { void reloadData(true) }, [reloadData])
  useEffect(() => {
    void getWhatsAppTemplates().then((result) => { setWaTemplates(result.templates); setWaTemplatesShared(result.shared) })
  }, [])
  // Modo bajo consumo: sin animaciones, transiciones ni desenfoques (ver index.css).
  useEffect(() => { document.documentElement.classList.toggle('low-power', preferences.lowPowerMode) }, [preferences.lowPowerMode])
  useEffect(() => { document.documentElement.classList.toggle('dark', darkMode); return () => document.documentElement.classList.remove('dark') }, [darkMode])
  // Barra del sistema (Android) del mismo color que la cabecera, como en una app nativa.
  useEffect(() => { document.querySelector('meta[name="theme-color"]')?.setAttribute('content', darkMode ? '#020617' : '#ffffff') }, [darkMode])
  useOverlayScrollLock()
  // Botón "atrás" de Android: cierra lo último que se abrió en vez de salir de la app.
  useBackClose(sidebarOpen, () => setSidebarOpen(false))
  useBackClose(settingsOpen, () => setSettingsOpen(false))
  useBackClose(dashboardOpen, () => setDashboardOpen(false))
  useBackClose(reportsOpen, () => setReportsOpen(false))
  useBackClose(cobranzaOpen, () => setCobranzaOpen(false))
  useBackClose(rosterOpen, () => setRosterOpen(false))
  useBackClose(alertsOpen, () => setAlertsOpen(false))
  useBackClose(dailySummaryOpen, () => setDailySummaryOpen(false))
  useBackClose(auditOpen, () => setAuditOpen(false))
  useBackClose(quickModeOpen, () => setQuickModeOpen(false))
  useBackClose(pdaModeOpen, () => setPdaModeOpen(false))
  useBackClose(backupOpen, () => setBackupOpen(false))
  useBackClose(historicalImportOpen, () => setHistoricalImportOpen(false))
  useBackClose(tvPanelOpen, () => setTvPanelOpen(false))
  useBackClose(whatsAppQueueOpen, () => setWhatsAppQueueOpen(false))
  useBackClose(syncPanelOpen, () => setSyncPanelOpen(false))
  useBackClose(helpOpen, () => setHelpOpen(false))
  useBackClose(usersOpen, () => setUsersOpen(false))
  useBackClose(errorsOpen, () => setErrorsOpen(false))
  useBackClose(multiNotificationOpen, () => setMultiNotificationOpen(false))
  useBackClose(bulkAttendanceOpen, () => setBulkAttendanceOpen(false))
  useBackClose(caseFileStudent !== null, () => setCaseFileStudent(null))
  useBackClose(presentationStudent !== null, () => setPresentationStudent(null))
  useBackClose(notificationPreviewData !== null, () => setNotificationPreviewData(null))
  useBackClose(historyStudent !== null, () => setHistoryStudent(null))
  useBackClose(whatsAppStudent !== null, () => setWhatsAppStudent(null))
  useBackClose(editingAttendance !== null, () => setEditingAttendance(null))
  useBackClose(justifyTarget !== null, () => setJustifyTarget(null))
  useBackClose(permissionStudent !== null, () => setPermissionStudent(null))
  useBackClose(earlyExitStudent !== null, () => setEarlyExitStudent(null))
  useBackClose(absenceDialog !== null, () => setAbsenceDialog(null))
  // App instalada: número de cambios sin sincronizar sobre el ícono, y almacenamiento
  // persistente para que Android no borre la cola offline.
  useEffect(() => { setAppBadge(syncState.pending) }, [syncState.pending])
  useEffect(() => { void requestPersistentStorage() }, [])
  useEffect(() => { const media=window.matchMedia('(prefers-color-scheme: dark)'); const update=(e:MediaQueryListEvent)=>setSystemDark(e.matches); media.addEventListener('change',update); return()=>media.removeEventListener('change',update) }, [])
  // Solo fecha y Dashboard dependen de now: basta refrescar cada 30 s (el reloj con segundos es LiveClock).
  useEffect(() => { const timer=window.setInterval(()=>setNow(new Date()),30000); return()=>window.clearInterval(timer) }, [])

  const formattedDate = now.toLocaleDateString('es-PE',{weekday:'short',day:'2-digit',month:'short',year:'numeric'})
  function updatePreferences(next: UserPreferences) { setPreferences(savePreferences(next)) }
  function feedback(kind: FeedbackKind) {
    playFeedback(kind, { sound: preferences.soundEnabled, vibration: preferences.vibrationEnabled })
  }
  function playConfirmation() { feedback('ok') }

  // Los inhabilitados (abandono, suspensión...) no cuentan en asistencia; se listan aparte en gris.
  const activeStudents = useMemo(() => students.filter(isActiveStudent), [students])
  const classroomStudents = useMemo(() => activeStudents.filter((student)=>student.classroomId===classroom.id), [activeStudents,classroom.id])
  const inactiveClassroomStudents = useMemo(() => students.filter((student)=>student.classroomId===classroom.id&&isInactive(student)), [students,classroom.id])
  const visibleInactiveStudents = filter==='ALL'&&presentationFilter==='ALL'
    ? inactiveClassroomStudents.filter((student)=>studentMatches(student, query))
    : []
  const todayRecords = useMemo(() => records.filter((r)=>r.date===today), [records, today])
  const todayPresentationRecords = useMemo(() => presentationRecords.filter((r)=>r.date===today), [presentationRecords, today])
  // Índices por alumno: cada búsqueda pasa de recorrer todos los registros a una consulta directa.
  const recordByStudent = useMemo(() => new Map(todayRecords.map((r) => [r.studentId, r])), [todayRecords])
  const presentationByStudent = useMemo(() => new Map(todayPresentationRecords.map((r) => [r.studentId, r])), [todayPresentationRecords])
  const notificationsByStudent = useMemo(() => {
    const map = new Map<string, NotificationRecord[]>()
    for (const item of notifications) {
      const list = map.get(item.studentId)
      if (list) list.push(item); else map.set(item.studentId, [item])
    }
    for (const list of map.values()) list.sort((a, b) => b.notificationNumber - a.notificationNumber || b.generatedAt.localeCompare(a.generatedAt))
    return map
  }, [notifications])
  const classroomMap = useMemo(() => new Map(classrooms.map((item) => [item.id, item])), [classrooms])
  const studentMap = useMemo(() => new Map(students.map((item) => [item.id, item])), [students])
  const absenceByStudent = useMemo(() => new Map(dayStatus.absences.filter((a) => a.date === today).map((a) => [a.studentId, a])), [dayStatus.absences, today])
  const earlyExitByStudent = useMemo(() => new Map(dayStatus.earlyExits.filter((e) => e.date === today).map((e) => [e.studentId, e])), [dayStatus.earlyExits, today])
  const todayPermissions = useMemo(() => dayStatus.permissions.filter((item) => item.dateFrom <= today && item.dateTo >= today), [dayStatus.permissions, today])
  const calendarToday = dayStatus.calendar.find((day) => day.date === today)
  // Horario efectivo del aula actual (propio del nivel o el general del colegio).
  const currentSchedule = getEffectiveSchedule(classroom.level, dayStatus.schedules, entryLimit, toleranceSettings)
  const currentLevelSchedule = dayStatus.schedules.find((item) => item.level === classroom.level)
  function scheduleForStudent(studentId: string) {
    const level = classroomMap.get(studentMap.get(studentId)?.classroomId ?? '')?.level
    return getEffectiveSchedule(level, dayStatus.schedules, entryLimit, toleranceSettings)
  }
  function upsertAbsence(absence: AbsenceRecord) {
    setDayStatus((curr) => ({ ...curr, absences: [...curr.absences.filter((a) => a.id !== absence.id), absence] }))
  }
  function addAbsences(saved: AbsenceRecord[]) {
    setDayStatus((curr) => ({ ...curr, absences: [...curr.absences.filter((a) => !saved.some((s) => s.id === a.id)), ...saved] }))
    if (saved.length === 0) { toast.info('No se registró ninguna falta', 'Esos alumnos ya tenían ingreso o falta hoy.'); return }
    const justifiedCount = saved.filter((a) => a.status === 'JUSTIFIED').length
    const single = saved.length === 1 ? studentMap.get(saved[0].studentId) : undefined
    toast.success(
      single ? `Falta registrada: ${single.firstName} ${single.lastName}` : `${saved.length} faltas registradas`,
      justifiedCount ? (justifiedCount === saved.length ? 'Justificada' + (saved.length === 1 ? '' : 's') : `${justifiedCount} justificadas`) : 'Se puede justificar desde la tarjeta del alumno',
    )
  }
  async function confirmRemoveAbsence(student: Student, absence: AbsenceRecord) {
    if (!confirm(`¿Quitar la falta de ${student.firstName} ${student.lastName}? Quedará como pendiente de marcar.`)) return
    try {
      await removeAbsence(absence)
      setDayStatus((curr) => ({ ...curr, absences: curr.absences.filter((a) => a.id !== absence.id) }))
      toast.info(`Falta quitada: ${student.firstName} ${student.lastName}`)
    } catch (error) {
      reportError('Attendance', error)
      toast.error('No se pudo quitar la falta', friendlyError(error))
    }
  }
  function openGroupAbsences() {
    const candidates = classroomStudents.filter((s) => !recordByStudent.has(s.id) && !absenceByStudent.has(s.id) && !findPermission(todayPermissions, s.id, today, 'ABSENCE'))
    setAbsenceDialog({ students: candidates, selected: [] })
  }
  function addEarlyExit(exit: EarlyExit) {
    setDayStatus((curr) => ({ ...curr, earlyExits: [...curr.earlyExits, exit] }))
    setRecords((curr) => curr.map((r) => (r.studentId === exit.studentId && r.date === exit.date && !r.exitTime ? { ...r, exitTime: exit.exitTime, exitSource: 'MANUAL' } : r)))
    toast.success('Salida anticipada registrada', exit.isAuthorizedPerson ? `Recogió: ${exit.pickedUpByName}` : `Recogió: ${exit.pickedUpByName} (no estaba en la lista)`)
  }
  async function reloadDayStatus() {
    const range = monthRangeKeys()
    setDayStatus(await getDayStatusData(range.from, range.to).catch(() => EMPTY_DAY_STATUS))
  }
  // Tiempo real de faltas/permisos/salidas en un canal propio, solo si phase14 ya existe
  // (suscribirse a tablas inexistentes podría afectar al canal principal).
  const reloadDayStatusRef = useRef(reloadDayStatus)
  reloadDayStatusRef.current = reloadDayStatus
  useEffect(() => {
    if (!dayStatus.available) return
    let timer: number | null = null
    let channel = supabase.channel('tesla-day-status')
    for (const table of ['student_absences', 'student_permissions', 'early_exits', 'school_calendar', 'level_schedules']) {
      channel = channel.on('postgres_changes', { event: '*', schema: 'public', table }, () => {
        if (timer !== null) window.clearTimeout(timer)
        timer = window.setTimeout(() => { timer = null; void reloadDayStatusRef.current() }, 200)
      })
    }
    channel.subscribe()
    return () => { if (timer !== null) window.clearTimeout(timer); void supabase.removeChannel(channel) }
  }, [dayStatus.available])

  const classroomRecords = classroomStudents.map((s) => recordByStudent.get(s.id)).filter((r): r is AttendanceRecord => Boolean(r))
  const classroomPresentationRecords = classroomStudents.map((s) => presentationByStudent.get(s.id)).filter((r): r is PresentationRecord => Boolean(r))
  const onTimeCount=classroomRecords.filter((r)=>r.status==='ON_TIME').length
  const lateCount=classroomRecords.filter((r)=>r.status==='LATE').length
  const absentCount = classroomStudents.filter((s) => !recordByStudent.has(s.id) && (absenceByStudent.has(s.id) || findPermission(todayPermissions, s.id, today, 'ABSENCE'))).length
  const pendingCount=classroomStudents.length-classroomRecords.length-absentCount
  const justifiedLateCount = classroomRecords.filter((r) => r.status === 'LATE' && r.justified).length
  const compliantCount=classroomPresentationRecords.filter((r)=>r.status==='COMPLIANT').length
  const nonCompliantCount=classroomPresentationRecords.filter((r)=>r.status==='NON_COMPLIANT').length
  const presentationPendingCount=classroomStudents.length-classroomPresentationRecords.length
  const filtered = useMemo(() => classroomStudents.filter((student)=>{
    if(!studentMatches(student, query)) return false
    const attendance=recordByStudent.get(student.id)
    if(filter==='ON_TIME'&&attendance?.status!=='ON_TIME')return false; if(filter==='LATE'&&attendance?.status!=='LATE')return false; if(filter==='PENDING'&&(attendance||absenceByStudent.has(student.id)||findPermission(todayPermissions, student.id, today, 'ABSENCE')))return false; if(filter==='ABSENT'&&(attendance||!(absenceByStudent.has(student.id)||findPermission(todayPermissions, student.id, today, 'ABSENCE'))))return false
    const presentation=presentationByStudent.get(student.id)
    if(presentationFilter==='COMPLIANT'&&presentation?.status!=='COMPLIANT')return false; if(presentationFilter==='NON_COMPLIANT'&&presentation?.status!=='NON_COMPLIANT')return false; if(presentationFilter==='PENDING'&&presentation)return false
    return true
  }), [classroomStudents, query, recordByStudent, presentationByStudent, filter, presentationFilter, absenceByStudent, todayPermissions, today])

  const unmarkedToday = classroomStudents.filter((student) => !recordByStudent.has(student.id))

  /** Enter en el buscador marca la entrada si queda un solo alumno sin marcar; Esc limpia. */
  function handleSearchKey(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Escape') {
      event.preventDefault()
      if (query) { setQuery(''); setSearchHint('') } else searchRef.current?.blur()
      return
    }
    if (event.key !== 'Enter' || !query.trim()) return
    event.preventDefault()
    const target = pickEnterTarget(filtered.filter((student) => !recordByStudent.has(student.id)))
    if (target.kind === 'mark') {
      void mark(target.item.id)
      setQuery('')
      setSearchHint('')
    } else {
      setSearchHint(target.kind === 'many' ? `${target.count} alumnos coinciden: sigue escribiendo hasta que quede uno.` : 'Ningún alumno sin marcar coincide con la búsqueda.')
    }
  }

  // Atajos globales de PC (no se activan mientras se escribe ni con un panel abierto).
  useEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey || isTypingTarget(event.target) || hasOpenOverlay()) return
      if (event.key === '/') { event.preventDefault(); searchRef.current?.focus() }
      else if (event.key === '?') { event.preventDefault(); setHelpOpen(true) }
      else if (event.key === 'q' || event.key === 'Q') { event.preventDefault(); setQuickModeOpen(true) }
      else if (event.key === 's' || event.key === 'S') { event.preventDefault(); setSyncPanelOpen(true) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  function openBulkAttendance() {
    // Todos pre-seleccionados por defecto: el auxiliar desmarca solo
    // a quienes sabe que faltaron hoy, en vez de tener que elegir uno
    // por uno a quién SÍ marcar.
    setBulkAttendanceSelected(new Set(unmarkedToday.map((s) => s.id)))
    setBulkAttendanceOpen(true)
  }

  async function bulkMarkStudents(ids: string[]): Promise<void> {
    if (ids.length === 0) return
    const byLimit = new Map<string, string[]>()
    for (const id of ids) {
      const limit = scheduleForStudent(id).entryLimit
      byLimit.set(limit, [...(byLimit.get(limit) ?? []), id])
    }
    const inserted = (await Promise.all([...byLimit].map(([limit, group]) => registerBulkAttendance(group, limit, today)))).flat()
    setRecords((curr) => [
      ...curr.filter((r) => !(r.date === today && ids.includes(r.studentId))),
      ...inserted,
    ])
    toast.success(`${inserted.length} alumno${inserted.length !== 1 ? 's' : ''} marcado${inserted.length !== 1 ? 's' : ''} a tiempo`, byLimit.size > 1 ? 'Hora registrada: la hora límite de cada nivel' : `Hora registrada: ${[...byLimit.keys()][0]} (hora límite)`)
  }

  async function confirmBulkAttendance() {
    const ids = Array.from(bulkAttendanceSelected)
    if (ids.length === 0) { setBulkAttendanceOpen(false); return }
    setBulkAttendanceSaving(true)
    try {
      await bulkMarkStudents(ids)
      setBulkAttendanceOpen(false)
    } catch (error) {
      toast.error('No se pudo completar el marcado masivo', friendlyError(error))
    } finally {
      setBulkAttendanceSaving(false)
    }
  }

  async function mark(studentId:string) {
    if (recordByStudent.has(studentId)) return
    const student = studentMap.get(studentId)
    if (student && isInactive(student)) {
      feedback('error')
      toast.error(`${student.firstName} ${student.lastName} está inhabilitado`, inactiveLabel(student))
      return
    }
    try {
      const schedule = scheduleForStudent(studentId)
      const latePermission = findPermission(todayPermissions, studentId, today, 'LATE')
      const rec=await registerAttendance(studentId,schedule.entryLimit,today,lateNoTime ? '' : getCurrentTime(),schedule.tolerance, latePermission ? { reason: `Permiso: ${latePermission.reason}`, byName: userName } : undefined)
      setRecords((curr)=>[...curr.filter((r)=>!(r.studentId===studentId&&r.date===today)),rec])
      feedback(rec.status === 'LATE' && !rec.justified ? 'late' : 'ok')
      const hadAbsence = absenceByStudent.has(studentId)
      // La base borra la falta sola al registrar el ingreso (trigger de phase14).
      if (hadAbsence) setDayStatus((curr) => ({ ...curr, absences: curr.absences.filter((a) => !(a.studentId === studentId && a.date === today)) }))
      const name = student ? `${student.firstName} ${student.lastName}` : 'Alumno'
      // Sin diálogo de confirmación: un toque marca y el aviso permite deshacer durante 5 s.
      toast.show({
        title: `${name} — ${rec.status === 'LATE' ? (rec.justified ? 'Tardanza con permiso' : 'Tardanza') : 'A tiempo'}`,
        description: `${rec.time ? `Hora registrada: ${rec.time}` : 'Sin hora registrada'}${hadAbsence ? ' · Se quitó su falta' : ''}`,
        variant: rec.status === 'LATE' ? 'warning' : 'success',
        duration: 5000,
        action: { label: 'Deshacer', onClick: () => void undoMark(rec, name) },
      })
    } catch(error){ feedback('error'); reportError('Attendance', error); setDataError(friendlyError(error, 'No se pudo registrar la entrada.')); toast.error('No se pudo registrar la entrada', friendlyError(error)) }
  }

  async function undoMark(rec: AttendanceRecord, name: string) {
    try {
      await deleteAttendanceRecord(rec)
      setRecords((curr) => curr.filter((r) => !(r.studentId === rec.studentId && r.date === rec.date)))
      setNotifications((curr) => curr.filter((item) => !isLateNotificationOf(item, rec)))
      feedback('undo')
      toast.info(`Marca deshecha: ${name}`)
    } catch (error) {
      feedback('error')
      reportError('Attendance', error)
      toast.error('No se pudo deshacer la marca', friendlyError(error))
    }
  }

  async function markExit(studentId: string) {
    const record = recordByStudent.get(studentId)
    if (!record) { setDataError('El alumno no tiene entrada registrada hoy, no se puede marcar salida.'); return }
    if (record.exitTime) return
    try {
      const updated = await registerExitAttendance(record, getCurrentTime())
      setRecords((curr) => [...curr.filter((r) => !(r.studentId === studentId && r.date === today)), updated])
      playConfirmation()
    } catch (error) {
      feedback('error')
      reportError('Attendance', error)
      setDataError(friendlyError(error, 'No se pudo registrar la salida.'))
    }
  }
  function openAttendanceEdit(record: AttendanceRecord) {
    setEditingAttendance(record)
    setEditingAttendanceTime(record.time || '')
    setDataError('')
  }

  /** `withoutTime`: deja la marca como tardanza sin hora (la hora registrada no era la real). */
  async function saveAttendanceEdit(withoutTime = false) {
    if (!editingAttendance) return

    const newTime = withoutTime ? '' : editingAttendanceTime.trim()

    if (!withoutTime && !/^([01]\d|2[0-3]):[0-5]\d$/.test(newTime)) {
      setDataError('Ingresa una hora válida en formato HH:MM.')
      return
    }

    try {
      setSavingAttendanceEdit(true)
      setDataError('')

      const editSchedule = scheduleForStudent(editingAttendance.studentId)
      const updated = await updateAttendanceEntryTime(
        editingAttendance,
        newTime,
        editSchedule.entryLimit,
        editSchedule.tolerance,
      )

      setRecords((curr) => [
        ...curr.filter(
          (item) => !(item.studentId === updated.studentId && item.date === updated.date),
        ),
        updated,
      ])

      setEditingAttendance(null)
      setEditingAttendanceTime('')
      playConfirmation()
    } catch (error) {
      reportError('Attendance', error)
      setDataError(
        friendlyError(error, 'No se pudo corregir la hora de ingreso.'),
      )
    } finally {
      setSavingAttendanceEdit(false)
    }
  }

  /** Para marcas hechas por error (alumno equivocado o que en realidad faltó). */
  async function deleteEditingAttendance() {
    if (!editingAttendance) return
    const student = studentMap.get(editingAttendance.studentId)
    const name = student ? `${student.firstName} ${student.lastName}` : 'este alumno'
    if (!confirm(`¿Borrar la marca de ingreso de ${name}? Quedará como pendiente y se eliminará su notificación de tardanza si la tiene.`)) return
    try {
      setSavingAttendanceEdit(true)
      setDataError('')
      const target = editingAttendance
      await deleteAttendanceRecord(target)
      setRecords((curr) => curr.filter((item) => !(item.studentId === target.studentId && item.date === target.date)))
      setNotifications((curr) => curr.filter((item) => !isLateNotificationOf(item, target)))
      setEditingAttendance(null)
      setEditingAttendanceTime('')
      feedback('undo')
      toast.info(`Marca borrada: ${name}`)
    } catch (error) {
      reportError('Attendance', error)
      setDataError(friendlyError(error, 'No se pudo borrar la marca.'))
    } finally {
      setSavingAttendanceEdit(false)
    }
  }

  async function resetToday() {
    if(!confirm('¿Borrar los registros de ingreso y presentación de hoy?')) return
    try {
      await Promise.all([deleteAttendanceForDate(today), deletePresentationForDate(today)])
      setRecords((r) => r.filter((x) => x.date !== today))
      setPresentationRecords((r) => r.filter((x) => x.date !== today))
      setNotifications((items) => items.filter((item) => item.date !== today))
    }
    catch(error){ reportError('Attendance', error); setDataError(friendlyError(error, 'No se pudo reiniciar el día.')) }
  }
  function changeClassroom(classroomId:string){ const selected=classrooms.find((i)=>i.id===classroomId); if(!selected)return; setQuery('');setFilter('ALL');setPresentationFilter('ALL');onClassroomChange(selected); if(preferences.rememberClassroom)updatePreferences({...preferences,lastClassroomId:selected.id}) }
  async function updateEntryLimit(value:string){
    if (currentLevelSchedule) {
      const next = { ...currentLevelSchedule, entryLimit: value }
      setDayStatus((curr) => ({ ...curr, schedules: curr.schedules.map((item) => (item.level === next.level ? next : item)) }))
      try { await saveLevelSchedule(next) }
      catch(error){ reportError('Attendance', error); setDataError(friendlyError(error, 'No se pudo actualizar la hora límite.')) }
      return
    }
    setEntryLimit(value)
    try { await saveEntryLimit(value) }
    catch(error){ reportError('Attendance', error); setDataError(friendlyError(error, 'No se pudo actualizar la hora límite.')) }
  }
  async function updateTolerance(next: ToleranceSettings){
    setToleranceSettings(next)
    try { await saveToleranceSettings(next) }
    catch(error){ reportError('Attendance', error); setDataError(friendlyError(error, 'No se pudo actualizar la tolerancia.')) }
  }
  function openPresentation(student:Student){
    const existing=presentationByStudent.get(student.id)
    const attendance=recordByStudent.get(student.id)
    setPresentationStudent(student)
    setPresentationDraft(existing ? {
      status: existing.status,
      hairstyleViolation: existing.hairstyleViolation,
      uniformUsageViolation: existing.uniformUsageViolation,
      nonInstitutionalGarment: existing.nonInstitutionalGarment,
      lateEntryViolation: existing.lateEntryViolation,
      inappropriateConductViolation: existing.inappropriateConductViolation,
      observation: existing.observation,
    } : {
      ...emptyPresentationDraft,
      status: attendance?.status === 'LATE' ? 'NON_COMPLIANT' : null,
      lateEntryViolation: attendance?.status === 'LATE',
    })
  }
  function setPresentationMode(status:PresentationStatus){ if(status==='COMPLIANT'){setPresentationDraft({...emptyPresentationDraft,status:'COMPLIANT'});return} setPresentationDraft((c)=>({...c,status:'NON_COMPLIANT'})) }
  async function savePresentation(){
    if(!presentationStudent||!presentationDraft.status)return
    if(presentationDraft.status==='NON_COMPLIANT'){
      const has=presentationDraft.hairstyleViolation||presentationDraft.uniformUsageViolation||presentationDraft.nonInstitutionalGarment||presentationDraft.lateEntryViolation||presentationDraft.inappropriateConductViolation
      if(!has)return
    }
    const currentStudent = presentationStudent
    const record:PresentationRecord={
      studentId:currentStudent.id,
      date:today,
      status:presentationDraft.status,
      hairstyleViolation:presentationDraft.status==='NON_COMPLIANT'&&presentationDraft.hairstyleViolation,
      uniformUsageViolation:presentationDraft.status==='NON_COMPLIANT'&&presentationDraft.uniformUsageViolation,
      nonInstitutionalGarment:presentationDraft.status==='NON_COMPLIANT'&&presentationDraft.nonInstitutionalGarment,
      lateEntryViolation:presentationDraft.status==='NON_COMPLIANT'&&presentationDraft.lateEntryViolation,
      inappropriateConductViolation:presentationDraft.status==='NON_COMPLIANT'&&presentationDraft.inappropriateConductViolation,
      observation:presentationDraft.status==='NON_COMPLIANT'?presentationDraft.observation.trim():'',
      checkedAt:getCurrentTime(),
    }

    try {
      const saved = await savePresentationRemote(record)
      setPresentationRecords((curr) => [
        ...curr.filter((r) => !(r.studentId === record.studentId && r.date === record.date)),
        saved,
      ])
      setPresentationStudent(null)
      setPresentationDraft(emptyPresentationDraft)
      playConfirmation()

      if (saved.status === 'NON_COMPLIANT' && !saved.id?.startsWith('offline-')) {
        try {
          const notification = await ensureNotificationForPresentation(saved)
          setNotifications((curr) => [notification, ...curr.filter((item) => item.id !== notification.id)])
        } catch (notificationError) {
          reportError('Attendance', notificationError)
          setDataError(notificationError instanceof Error
            ? `La presentación se guardó, pero no se pudo registrar la reincidencia: ${notificationError.message}`
            : 'La presentación se guardó, pero no se pudo registrar la reincidencia.')
        }
      }
    }
    catch(error){reportError('Attendance', error);setDataError(friendlyError(error, 'No se pudo guardar la presentación.'))}
  }
  const hasSelectedViolation=presentationDraft.hairstyleViolation||presentationDraft.uniformUsageViolation||presentationDraft.nonInstitutionalGarment||presentationDraft.lateEntryViolation||presentationDraft.inappropriateConductViolation
  const presentationSaveDisabled=!presentationDraft.status||(presentationDraft.status==='NON_COMPLIANT'&&!hasSelectedViolation)

  function getNotificationNumber(studentId: string, date: string, presentationId?: string, attendanceId?: string): number {
    if (presentationId) {
      const exact = notifications.find((item) => item.presentationControlId === presentationId)
      if (exact) return exact.notificationNumber
    }
    if (attendanceId) {
      const exact = notifications.find((item) => item.attendanceId === attendanceId)
      if (exact) return exact.notificationNumber
    }

    const prior = notifications
      .filter((item) => item.studentId === studentId && item.date <= date)
      .sort((a, b) => b.notificationNumber - a.notificationNumber || b.generatedAt.localeCompare(a.generatedAt))
    return prior[0]?.notificationNumber ?? 1
  }

  function buildNotificationData(student: Student, dateOverride?: string): NotificationPrintData | null {
    const targetDate = dateOverride ?? today
    const studentClassroom = classrooms.find((item) => item.id === student.classroomId)
    if (!studentClassroom) return null
    const presentation = presentationRecords.find((item) => item.studentId === student.id && item.date === targetDate && item.status === 'NON_COMPLIANT')
    const attendance = records.find((item) => item.studentId === student.id && item.date === targetDate && item.status === 'LATE')
    if (!presentation && !attendance) return null

    const exactNotification = presentation?.id
      ? notifications.find((item) => item.presentationControlId === presentation.id)
      : attendance?.id
        ? notifications.find((item) => item.attendanceId === attendance.id)
        : undefined

    return {
      student,
      classroom: studentClassroom,
      presentation,
      attendance,
      notificationNumber: exactNotification?.notificationNumber ?? getNotificationNumber(student.id, targetDate, presentation?.id, attendance?.id),
    }
  }

  /**
   * A diferencia de `buildNotificationData` (que busca "la" incidencia de un
   * alumno en una fecha), esta función parte de una notificación YA
   * EXISTENTE (ej. clic en el historial) y reconstruye su ficha exacta —
   * funciona para cualquier fecha pasada, no solo hoy, porque `records` y
   * `presentationRecords` ya traen el mes completo, no solo el día actual.
   */
  function buildNotificationDataFromNotification(student: Student, notification: NotificationRecord): NotificationPrintData | null {
    const studentClassroom = classrooms.find((item) => item.id === student.classroomId)
    if (!studentClassroom) return null
    const presentation = notification.presentationControlId
      ? presentationRecords.find((item) => item.id === notification.presentationControlId)
      : undefined
    const attendance = notification.attendanceId
      ? records.find((item) => item.id === notification.attendanceId)
      : undefined
    if (!presentation && !attendance) return null

    return {
      student,
      classroom: studentClassroom,
      presentation,
      attendance,
      notificationNumber: notification.notificationNumber,
    }
  }

  function studentNotificationStats(studentId: string) {
    const history = notificationsByStudent.get(studentId) ?? []
    return { total: history.length, latest: history[0], history }
  }

  async function ensureTodayNotification(student: Student): Promise<NotificationRecord | null> {
    const todayPresentation = presentationByStudent.get(student.id)
    const todayAttendance = recordByStudent.get(student.id)
    const presentation = todayPresentation?.status === 'NON_COMPLIANT' ? todayPresentation : undefined
    const attendance = todayAttendance?.status === 'LATE' ? todayAttendance : undefined

    if (presentation) {
      const notification = await ensureNotificationForPresentation(presentation)
      setNotifications((curr) => [notification, ...curr.filter((item) => item.id !== notification.id)])
      return notification
    }
    if (attendance) {
      const notification = await ensureNotificationForLateAttendance(attendance)
      setNotifications((curr) => [notification, ...curr.filter((item) => item.id !== notification.id)])
      return notification
    }
    return null
  }

  async function openNotification(student: Student) {
    try {
      const notification = await ensureTodayNotification(student)
      if (!notification) return
      const data = buildNotificationData(student)
      if (data) setNotificationPreviewData(data)
    } catch (error) {
      reportError('Attendance', error)
      setDataError(friendlyError(error, 'No se pudo registrar la notificación.'))
    }
  }

  const notificationCandidates = students.filter((student) => {
    const presentation = presentationRecords.find((item) => item.studentId === student.id && item.date === multiNotificationDate && item.status === 'NON_COMPLIANT')
    const attendance = records.find((item) => item.studentId === student.id && item.date === multiNotificationDate && item.status === 'LATE')
    if (!presentation && !attendance) return false
    const classroomInfo = classroomMap.get(student.classroomId)
    return matchesQuery([student.firstName, student.lastName, student.dni, classroomInfo?.grade, classroomInfo?.section, classroomInfo?.level], notificationSearch)
  })

  const selectedNotificationData = selectedNotificationIds
    .map((studentId) => {
      const student = studentMap.get(studentId)
      return student ? buildNotificationData(student, multiNotificationDate) : null
    })
    .filter((item): item is NotificationPrintData => Boolean(item))

  function toggleNotificationStudent(studentId: string) {
    setSelectedNotificationIds((current) => {
      if (current.includes(studentId)) return current.filter((id) => id !== studentId)
      if (current.length >= MAX_NOTIFICATIONS_PER_PAGE) return current
      return [...current, studentId]
    })
  }

  function openMultiNotification() {
    // Abrir este módulo es solo una acción de navegación.
    // No debe crear/consultar una notificación por cada alumno ni bloquear la operación diaria.
    setSelectedNotificationIds([])
    setNotificationSearch('')
    setMultiNotificationDate(today)
    setMultiNotificationOpen(true)
  }


  function getWhatsAppOptions(student: Student): Array<{ type: WhatsAppMessageType; label: string }> {
    const attendance = recordByStudent.get(student.id)
    const presentation = presentationByStudent.get(student.id)
    const recurrence = studentNotificationStats(student.id)
    const options: Array<{ type: WhatsAppMessageType; label: string }> = []

    const absence = absenceByStudent.get(student.id)
    if (!attendance && absence?.status === 'UNJUSTIFIED') options.push({ type: 'ABSENCE', label: 'Ausencia registrada' })

    if (attendance?.status === 'LATE' && !attendance.justified && !presentation?.lateEntryViolation) {
      options.push({ type: 'LATE', label: 'Tardanza en el ingreso' })
    }

    if (presentation?.status === 'NON_COMPLIANT') {
      if ((recurrence.latest?.notificationNumber ?? 0) >= 3) {
        options.push({ type: 'RECURRENCE_3', label: 'Tercera notificación / seguimiento' })
      } else if (recurrence.latest?.notificationNumber === 2) {
        options.push({ type: 'RECURRENCE_2', label: 'Segunda notificación' })
      } else if (presentation.inappropriateConductViolation && getPresentationViolationLabels(presentation).length === 1) {
        options.push({ type: 'INAPPROPRIATE_CONDUCT', label: 'Conducta inapropiada' })
      } else {
        options.push({ type: 'REGULATION', label: 'Incumplimiento de reglamento interno' })
      }
    }

    return options
  }

  function buildStudentWhatsAppMessage(student: Student, type: WhatsAppMessageType): string {
    const attendance = recordByStudent.get(student.id)
    const presentation = presentationByStudent.get(student.id)
    const recurrence = studentNotificationStats(student.id)

    return buildWhatsAppMessage({
      phone: student.guardianPhone,
      guardianName: student.guardianName,
      studentName: `${student.firstName} ${student.lastName}`,
      type,
      notificationNumber: recurrence.latest?.notificationNumber,
      date: today,
      time: attendance?.time,
      observation: presentation?.observation,
      violations: getPresentationViolationLabels(presentation),
    }, waTemplates)
  }

  /** Mensajes pendientes de hoy en todo el colegio, para la cola de envío en lote. */
  function buildWhatsAppQueueItems(): WhatsAppQueueItem[] {
    const items: WhatsAppQueueItem[] = []
    for (const student of activeStudents) {
      const options = getWhatsAppOptions(student)
      if (!options.length) continue
      const room = classroomMap.get(student.classroomId)
      const type = options[0].type
      items.push({
        key: `${student.id}:${type}`,
        student,
        classroomId: student.classroomId,
        classroomLabel: room ? `${room.grade} ${room.section} · ${room.level}` : 'Sin aula',
        type,
        message: buildStudentWhatsAppMessage(student, type),
        phoneValid: isValidPeruWhatsApp(student.guardianPhone),
      })
    }
    return items.sort((a, b) => a.classroomLabel.localeCompare(b.classroomLabel, 'es') || a.student.lastName.localeCompare(b.student.lastName, 'es'))
  }

  async function handleSaveTemplates(next: WhatsAppTemplates) {
    const shared = await saveWhatsAppTemplates(next)
    setWaTemplates(next)
    setWaTemplatesShared(shared)
    toast.success('Plantillas de WhatsApp guardadas', shared ? 'Ya las usan todos los auxiliares.' : 'Solo en este dispositivo hasta ejecutar phase11_whatsapp_templates.sql.')
  }

  function openWhatsAppModal(student: Student, forcedType?: WhatsAppMessageType) {
    const options = getWhatsAppOptions(student)
    if (!forcedType && !options.length) return
    const initialType = forcedType ?? options[0].type
    setWhatsAppStudent(student)
    setWhatsAppType(initialType)
    setWhatsAppMessage(buildStudentWhatsAppMessage(student, initialType))
    setWhatsAppError('')
  }

  function changeWhatsAppType(type: WhatsAppMessageType) {
    if (!whatsAppStudent) return
    setWhatsAppType(type)
    setWhatsAppMessage(buildStudentWhatsAppMessage(whatsAppStudent, type))
    setWhatsAppError('')
  }

  async function handleOpenWhatsApp() {
    if (!whatsAppStudent || !whatsAppMessage.trim()) return
    setOpeningWhatsApp(true)
    setWhatsAppError('')
    try {
      await sendWhatsApp({
        phone: whatsAppStudent.guardianPhone,
        message: whatsAppMessage.trim(),
      })
      setWhatsAppStudent(null)
    } catch (error) {
      reportError('Attendance', error)
      setWhatsAppError(friendlyError(error, 'No se pudo abrir WhatsApp.'))
    } finally {
      setOpeningWhatsApp(false)
    }
  }

  return (
    <MotionConfig reducedMotion={preferences.lowPowerMode ? 'always' : 'user'}>
    <main className={`${sizeClass} min-h-screen bg-slate-50 text-slate-950 transition-colors duration-200 dark:bg-slate-950 dark:text-slate-100`}>
      <Sidebar
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        userName={userName}
        userRole={userRole}
        formattedDate={formattedDate}
        active={usersOpen ? 'users' : errorsOpen ? 'errors' : helpOpen ? 'help' : rosterOpen ? 'roster' : tvPanelOpen ? 'tv' : historicalImportOpen ? 'historical' : backupOpen ? 'backup' : quickModeOpen ? 'quick' : auditOpen ? 'audit' : dailySummaryOpen ? 'summary' : alertsOpen ? 'alerts' : cobranzaOpen ? 'cobranza' : reportsOpen ? 'reports' : dashboardOpen ? 'dashboard' : 'home'}
        onHome={() => { setDashboardOpen(false); setReportsOpen(false); setAlertsOpen(false); setDailySummaryOpen(false); setAuditOpen(false); setCobranzaOpen(false); window.scrollTo({ top: 0, behavior: 'smooth' }) }}
        onDashboard={() => { setDashboardOpen(true); setReportsOpen(false); setAlertsOpen(false); setDailySummaryOpen(false); setAuditOpen(false); setCobranzaOpen(false) }}
        onReports={() => { setReportsOpen(true); setDashboardOpen(false); setAlertsOpen(false); setDailySummaryOpen(false); setAuditOpen(false); setCobranzaOpen(false) }}
        onCobranza={() => { setCobranzaOpen(true); setDashboardOpen(false); setReportsOpen(false); setAlertsOpen(false); setDailySummaryOpen(false); setAuditOpen(false) }}
        onNotifications={openMultiNotification}
        onAlerts={() => { setAlertsOpen(true); setDashboardOpen(false); setReportsOpen(false); setDailySummaryOpen(false); setAuditOpen(false); setCobranzaOpen(false) }}
        onDailySummary={() => { setDailySummaryOpen(true); setDashboardOpen(false); setReportsOpen(false); setAlertsOpen(false); setAuditOpen(false); setCobranzaOpen(false) }}
        onAudit={() => { setAuditOpen(true); setDashboardOpen(false); setReportsOpen(false); setAlertsOpen(false); setDailySummaryOpen(false); setCobranzaOpen(false) }}
        onQuickMode={() => setQuickModeOpen(true)}
        onPdaMode={() => setPdaModeOpen(true)}
        onWhatsAppQueue={() => setWhatsAppQueueOpen(true)}
        onTvPanel={() => setTvPanelOpen(true)}
        onBackups={() => setBackupOpen(true)}
        onHistoricalImport={() => setHistoricalImportOpen(true)}
        onRoster={isAdmin ? () => setRosterOpen(true) : undefined}
        onUsers={isAdmin ? () => setUsersOpen(true) : undefined}
        onErrors={isAdmin ? () => setErrorsOpen(true) : undefined}
        errorCount={errorCount}
        onHelp={() => setHelpOpen(true)}
        online={syncState.online}
        pendingSync={syncState.pending}
        onSettings={() => setSettingsOpen(true)}
        onResetToday={() => void resetToday()}
        onLogout={onLogout}
      />

      <div className="min-h-screen lg:pl-[260px]">
        <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur dark:border-slate-800 dark:bg-slate-950/95">
          <div className="flex h-16 items-center justify-between gap-2 px-3 sm:gap-4 sm:px-6 lg:px-8">
            <div className="flex min-w-0 items-center gap-3">
              <button
                type="button"
                onClick={() => setSidebarOpen(true)}
                className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-slate-200 bg-white text-slate-700 shadow-sm hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 lg:hidden"
                aria-label="Abrir menú"
              >
                <Menu size={20} />
              </button>
              <div className="min-w-0">
                <p className="hidden text-[10px] font-black uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400 sm:block">Control diario</p>
                <p className="truncate text-[15px] font-black leading-tight sm:text-base">{classroom.grade} {classroom.section} · {classroom.level}</p>
                <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-500 dark:text-slate-400 sm:hidden">
                  <LiveClock className="tabular-nums" /><span aria-hidden="true">·</span><span className="truncate capitalize">{formattedDate}</span>
                </div>
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-2 sm:gap-3">
              <div data-tour="sync">
                <SyncStatus
                  online={syncState.online}
                  syncing={syncState.syncing}
                  pending={syncState.pending}
                  lastSync={syncState.lastSync}
                  failing={syncState.failing}
                  conflicts={syncState.conflicts}
                  onOpen={() => setSyncPanelOpen(true)}
                  installAvailable={installAvailable}
                  onInstall={() => void install()}
                />
              </div>
              <button
                type="button"
                data-tour="help"
                onClick={() => setHelpOpen(true)}
                className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                aria-label="Guía de uso"
                title="Guía de uso (tecla ?)"
              >
                <HelpCircle size={19} />
              </button>
              <div className="hidden text-right xl:block">
                <LiveClock className="text-sm font-black tabular-nums" />
                <p className="text-[11px] capitalize text-slate-500 dark:text-slate-400">{formattedDate}</p>
              </div>
              <div className="hidden h-9 w-px bg-slate-200 dark:bg-slate-800 xl:block" />
              <div className="hidden max-w-[180px] text-right 2xl:block">
                <p className="truncate text-xs font-bold">{userName}</p>
                <p className="truncate text-[10px] uppercase tracking-wider text-slate-500 dark:text-slate-400">{userRole}</p>
              </div>
            </div>
          </div>
        </header>

        <section className="mx-auto w-full max-w-7xl px-4 pb-[calc(var(--tabbar-h)+env(safe-area-inset-bottom)+1.5rem)] pt-3 sm:px-6 sm:pt-5 lg:px-8 lg:py-7">
        {dataError && (
          <div role="alert" className="mb-4 flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300">
            <span className="flex-1">{dataError}</span>
            <button type="button" onClick={() => setDataError('')} className="-m-1 rounded-lg p-1 hover:bg-red-100 dark:hover:bg-red-900/40" aria-label="Cerrar aviso"><X size={16} /></button>
          </div>
        )}
        {syncState.failing > 0 && (
          <button type="button" onClick={() => setSyncPanelOpen(true)} className="mb-4 flex w-full items-center gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-left text-sm font-semibold text-red-700 active:scale-[0.99] dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300">
            <AlertTriangle size={18} className="shrink-0" />
            <span className="flex-1">
              {syncState.failing} marca{syncState.failing === 1 ? '' : 's'} de este equipo no se envi{syncState.failing === 1 ? 'ó' : 'aron'} al servidor
              {syncState.blocked > 0 ? ` (${syncState.blocked} rechazada${syncState.blocked === 1 ? '' : 's'}: avisa al administrador)` : ''}.
            </span>
            <span className="shrink-0 font-black underline">Ver</span>
          </button>
        )}
        {calendarToday && (
          <div className="mb-4 flex items-center gap-3 rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm font-semibold text-indigo-800 dark:border-indigo-900/60 dark:bg-indigo-950/40 dark:text-indigo-300">
            <CalendarOff size={18} className="shrink-0" />
            Hoy es día sin clases ({CALENDAR_KIND_LABELS[calendarToday.kind]}{calendarToday.description ? `: ${calendarToday.description}` : ''}). No se generarán faltas.
          </div>
        )}
        {loadingData && <div className="mb-4 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">Sincronizando datos con Supabase...</div>}
        {!syncState.online && <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-300">Modo offline activo. Puedes seguir marcando entradas y controles; {syncState.pending} cambio{syncState.pending===1?'':'s'} pendiente{syncState.pending===1?'':'s'} se enviarán al recuperar Internet.</div>}
        <div className="rounded-2xl border border-slate-200 bg-white p-3 text-slate-950 shadow-sm transition-colors dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100 sm:p-5">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="hidden sm:block">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Control diario</p>
              <h2 className="mt-1 text-2xl font-black tracking-tight">Lista de alumnos</h2>
              <p className="mt-1 max-w-xl text-sm text-slate-500 dark:text-slate-400">
                Registra la llegada, detecta tardanzas y controla la presentación institucional desde una sola vista.
              </p>
              <div className="mt-3 inline-flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 md:hidden dark:border-slate-800 dark:bg-slate-950/70">
                <Clock3 size={16} className="text-slate-500 dark:text-slate-400" />
                <div>
                  <LiveClock className="text-sm font-black tabular-nums" />
                  <p className="text-[11px] capitalize text-slate-500 dark:text-slate-400">{formattedDate}</p>
                </div>
              </div>
            </div>

            <div className="grid w-full grid-cols-[minmax(0,1fr)_8.5rem] gap-2 sm:flex sm:items-end sm:gap-3 lg:w-auto">
              <label className="block min-w-0 sm:w-56 sm:shrink-0" data-tour="classroom">
                <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 sm:mb-2 sm:text-xs">Aula</span>
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
                  <ChevronDown className="pointer-events-none absolute right-3 top-3.5 text-slate-500 dark:text-slate-400" size={20} />
                </div>
              </label>

              <label className="block min-w-0 sm:w-40 sm:shrink-0">
                <span className="mb-1.5 flex items-center gap-1.5 truncate text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 sm:mb-2 sm:text-xs">
                  <Settings2 size={14} className="shrink-0" /> Hora límite<span className="hidden sm:inline">{currentLevelSchedule ? ` · ${classroom.level}` : ''}</span>
                </span>
                <TimePicker
                  label={currentLevelSchedule ? `Hora límite · ${classroom.level}` : 'Hora límite'}
                  hint="Después de esta hora (más la tolerancia) la marca es tardanza"
                  value={currentSchedule.entryLimit}
                  onChange={(value) => void updateEntryLimit(value)}
                />
              </label>
            </div>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-end justify-between gap-3 sm:mt-5">
          <div className="hidden sm:block">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">{classroom.level}</p>
            <h3 className="text-2xl font-black">{classroom.grade} {classroom.section}</h3>
          </div>
          <div className="no-scrollbar -mx-4 flex w-[calc(100%+2rem)] items-center gap-2 overflow-x-auto px-4 sm:mx-0 sm:w-auto sm:flex-wrap sm:overflow-visible sm:px-0 [&>*]:shrink-0">
            <div className="hidden rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm text-slate-600 transition-colors dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 sm:block">
              Hora límite: <span className="font-black text-slate-950 dark:text-slate-100">{currentSchedule.entryLimit}</span>
              {currentSchedule.tolerance.enabled && currentSchedule.tolerance.minutes > 0 && (
                <span className="ml-1 text-xs text-emerald-600 dark:text-emerald-400">(+{currentSchedule.tolerance.minutes} min tolerancia)</span>
              )}
            </div>
            <Tooltip content="Para cuando entran muchos alumnos a la vez: marca a los que ya entraron y no fueron marcados individualmente">
              <Button variant="outline" onClick={openBulkAttendance} disabled={unmarkedToday.length === 0}>
                <Users className="mr-2" size={17} /> Marcar el resto a tiempo
              </Button>
            </Tooltip>
            {dayStatus.available && (
              <Tooltip content="Registra ahora a los alumnos que no vinieron, sin esperar al cierre del día">
                <Button variant="outline" onClick={openGroupAbsences} disabled={unmarkedToday.length === 0}>
                  <UserX className="mr-2" size={17} /> Marcar faltas
                </Button>
              </Tooltip>
            )}
            <Tooltip content="Marca asistencia de un alumno a la vez, ideal para la hora de ingreso">
              <Button data-tour="quick" onClick={() => setQuickModeOpen(true)} title="Modo rápido (tecla Q)">
                <Clock3 className="mr-2" size={17} /> Modo rápido
              </Button>
            </Tooltip>
            <Tooltip content="Muestra la asistencia del aula en una pantalla grande, en tiempo real">
              <Button variant="outline" onClick={() => setTvPanelOpen(true)}>
                <Monitor className="mr-2" size={17} /> Panel TV
              </Button>
            </Tooltip>
            <Button variant="outline" data-tour="summary" onClick={() => setDailySummaryOpen(true)}>
              <CalendarCheck2 className="mr-2" size={17} /> Resumen / cierre
            </Button>
            <Button variant="outline" onClick={() => setAlertsOpen(true)}>
              <Bell className="mr-2" size={17} /> Alertas
            </Button>
            <Tooltip content="Envía uno tras otro los avisos de WhatsApp pendientes de hoy">
              <Button variant="outline" data-tour="whatsapp" className="border-emerald-200 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-900/70 dark:text-emerald-300 dark:hover:bg-emerald-950/40" onClick={() => setWhatsAppQueueOpen(true)}>
                <MessageCircle className="mr-2" size={17} /> WhatsApp en lote
              </Button>
            </Tooltip>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-4 gap-2 sm:mt-4 sm:gap-3">
          <Card className="min-w-0 p-2.5 sm:p-4">
            <p className="truncate text-[11px] text-slate-500 dark:text-slate-400 sm:text-xs">Alumnos</p>
            <p className="mt-0.5 text-xl font-black tabular-nums sm:mt-1 sm:text-2xl">{classroomStudents.length}</p>
            {inactiveClassroomStudents.length > 0 && <p className="truncate text-[10px] leading-tight text-slate-500 dark:text-slate-400 sm:text-xs">+{inactiveClassroomStudents.length} <span className="sm:hidden">inhab.</span><span className="hidden sm:inline">inhabilitado{inactiveClassroomStudents.length !== 1 ? 's' : ''}</span></p>}
          </Card>
          <Card className="min-w-0 p-2.5 sm:p-4">
            <p className="truncate text-[11px] text-slate-500 dark:text-slate-400 sm:text-xs">A tiempo</p>
            <p className="mt-0.5 text-xl font-black tabular-nums text-emerald-700 dark:text-emerald-400 sm:mt-1 sm:text-2xl">{onTimeCount}</p>
          </Card>
          <Card className="min-w-0 p-2.5 sm:p-4">
            <p className="truncate text-[11px] text-slate-500 dark:text-slate-400 sm:text-xs">Tardanzas</p>
            <p className="mt-0.5 text-xl font-black tabular-nums text-amber-700 dark:text-amber-400 sm:mt-1 sm:text-2xl">{lateCount}</p>
            {justifiedLateCount > 0 && <p className="truncate text-[10px] leading-tight text-sky-600 dark:text-sky-400 sm:text-xs">{justifiedLateCount} <span className="sm:hidden">justif.</span><span className="hidden sm:inline">justificada{justifiedLateCount !== 1 ? 's' : ''}</span></p>}
          </Card>
          <Card className="min-w-0 p-2.5 sm:p-4">
            <p className="truncate text-[11px] text-slate-500 dark:text-slate-400 sm:text-xs">Pendientes</p>
            <p className="mt-0.5 text-xl font-black tabular-nums sm:mt-1 sm:text-2xl">{pendingCount}</p>
            {absentCount > 0 && <p className="truncate text-[10px] leading-tight text-red-600 dark:text-red-400 sm:text-xs">{absentCount} <span className="sm:hidden">falta/perm.</span><span className="hidden sm:inline">con falta o permiso</span></p>}
          </Card>
        </div>

        <Card className="mt-2 p-3 sm:mt-3 sm:p-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
            <div>
              <p className="flex items-center gap-2 text-sm font-black"><Shirt size={17} /> Presentación<span className="hidden sm:inline"> institucional</span></p>
              <p className="mt-1 hidden text-xs text-slate-500 dark:text-slate-400 sm:block">Estado del control de presentación para el aula seleccionada.</p>
            </div>
            <div className="grid grid-cols-3 gap-1.5 text-xs sm:flex sm:flex-wrap sm:gap-2 sm:text-sm">
              <span className="truncate rounded-lg bg-emerald-50 px-2 py-1.5 text-center font-bold text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300 sm:px-3">{compliantCount} conformes</span>
              <span className="truncate rounded-lg bg-amber-50 px-2 py-1.5 text-center font-bold text-amber-700 dark:bg-amber-950/45 dark:text-amber-300 sm:px-3">{nonCompliantCount} <span className="sm:hidden">incid.</span><span className="hidden sm:inline">con incidencia</span></span>
              <span className="truncate rounded-lg bg-slate-100 px-2 py-1.5 text-center font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300 sm:px-3">{presentationPendingCount} sin revisar</span>
            </div>
          </div>
        </Card>

        <div className="sticky top-16 z-20 -mx-4 mt-3 grid gap-2 border-b border-slate-200/70 bg-slate-50/95 px-4 py-2 backdrop-blur-md dark:border-slate-800/70 dark:bg-slate-950/95 sm:static sm:mx-0 sm:mt-6 sm:gap-3 sm:border-0 sm:bg-transparent sm:p-0 sm:backdrop-blur-none sm:dark:bg-transparent lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
          <div className="relative min-w-0" data-tour="search">
            <Search className="absolute left-4 top-3.5 text-slate-500 dark:text-slate-400" size={20} />
            <Input
              ref={searchRef}
              className="pl-12"
              placeholder={`Buscar en ${classroom.grade} ${classroom.section}: apellido, nombre o DNI`}
              value={query}
              onChange={(event) => { setQuery(event.target.value); setSearchHint('') }}
              onKeyDown={handleSearchKey}
              enterKeyHint="search"
              aria-describedby={searchHint ? 'search-hint' : undefined}
            />
            {query && <button type="button" onClick={() => { setQuery(''); setSearchHint('') }} className="absolute right-2 top-2 grid h-8 w-8 place-items-center rounded-lg text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800" aria-label="Limpiar búsqueda"><X size={18} /></button>}
            {searchHint && <p id="search-hint" role="status" className="mt-1 text-xs font-semibold text-amber-700 dark:text-amber-400">{searchHint}</p>}
          </div>

          <div className="no-scrollbar -mx-4 flex min-w-0 items-center gap-2 overflow-x-auto px-4 sm:mx-0 sm:px-0">
            <LateNoTimeSwitch active={lateNoTime} onChange={setLateNoTime} />
            <div className="flex shrink-0 gap-2">
              {attendanceFilters.map((item) => (
                <Button
                  key={item.id}
                  variant={filter === item.id ? 'default' : 'outline'}
                  className="h-9 min-h-9 whitespace-nowrap rounded-full px-3.5 sm:h-11 sm:min-h-11 sm:rounded-xl sm:px-4"
                  onClick={() => setFilter(item.id)}
                >
                  {item.label}
                </Button>
              ))}
            </div>
            <label className="relative w-52 shrink-0">
              <select
                value={presentationFilter}
                onChange={(event) => setPresentationFilter(event.target.value as PresentationFilter)}
                className="h-9 w-full appearance-none rounded-full sm:h-11 sm:rounded-xl border border-slate-300 bg-white px-3 pr-9 text-sm font-semibold text-slate-900 outline-none transition-colors dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              >
                {presentationFilters.map((item) => (
                  <option key={item.id} value={item.id}>Presentación: {item.label}</option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-3 top-2 text-slate-500 dark:text-slate-400 sm:top-3" size={18} />
            </label>
          </div>
        </div>

        {lateNoTime && <div className="mt-3"><LateNoTimeBanner active={lateNoTime} onChange={setLateNoTime} /></div>}

        <div className="mt-3 space-y-3 sm:mt-5">
          {filtered.map((student, index) => {
            const record = recordByStudent.get(student.id)
            const presentation = presentationByStudent.get(student.id)
            const whatsAppOptions = getWhatsAppOptions(student)
            return (
              <div key={student.id} data-tour={index === 0 ? 'student-card' : undefined}>
              <StudentAttendanceCard
                student={student}
                classroom={classroom}
                record={record}
                presentation={presentation}
                violations={getViolationCount(presentation)}
                recurrence={studentNotificationStats(student.id)}
                whatsAppOptions={whatsAppOptions}
                canOpenWhatsApp={whatsAppOptions.length > 0 && isValidPeruWhatsApp(student.guardianPhone)}
                mark={mark}
                markExit={markExit}
                openAttendanceEdit={openAttendanceEdit}
                openPresentation={openPresentation}
                openNotification={openNotification}
                openWhatsAppModal={openWhatsAppModal}
                setCaseFileStudent={setCaseFileStudent}
                dayStatusEnabled={dayStatus.available}
                absence={record ? undefined : absenceByStudent.get(student.id)}
                permission={findPermission(todayPermissions, student.id, today)}
                earlyExit={earlyExitByStudent.get(student.id)}
                onJustifyLate={(target, rec) => setJustifyTarget({ kind: 'LATE', student: target, record: rec })}
                onJustifyAbsence={(target, absence) => setJustifyTarget({ kind: 'ABSENCE', student: target, absence })}
                onPermission={setPermissionStudent}
                onEarlyExit={setEarlyExitStudent}
                onMarkAbsence={(target) => setAbsenceDialog({ students: [target], selected: [target.id] })}
                onRemoveAbsence={(target, absence) => void confirmRemoveAbsence(target, absence)}
                setHistoryStudent={setHistoryStudent}
              />
              </div>
            )
          })}

          {visibleInactiveStudents.map((student) => (
            <Card key={student.id} aria-disabled="true" title="Alumno inhabilitado: no se puede marcar" className="cursor-not-allowed select-none border-dashed bg-slate-100 p-4 opacity-70 grayscale dark:bg-slate-900/50 sm:p-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <h3 className="font-bold text-slate-500 line-through decoration-slate-400/60 dark:text-slate-400">{student.firstName} {student.lastName}</h3>
                  <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{classroom.grade} {classroom.section} · {classroom.level}{student.inactiveSince && ` · desde ${student.inactiveSince}`}</p>
                </div>
                <span className="inline-flex max-w-full items-center gap-2 rounded-xl border border-slate-300 bg-slate-200 px-3 py-2 text-sm font-bold text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
                  <Ban size={16} className="shrink-0" /><span className="truncate">Inhabilitado: {inactiveLabel(student)}</span>
                </span>
              </div>
            </Card>
          ))}

          {filtered.length === 0 && visibleInactiveStudents.length === 0 && (
            <div className="py-12 text-center text-sm text-slate-500 dark:text-slate-400">No hay alumnos que coincidan con estos filtros.</div>
          )}
        </div>
        </section>
      </div>

      <MobileTabBar
        pendingCount={pendingCount}
        onList={() => { setDashboardOpen(false); setReportsOpen(false); setAlertsOpen(false); setDailySummaryOpen(false); setAuditOpen(false); setCobranzaOpen(false); window.scrollTo({ top: 0, behavior: 'smooth' }) }}
        onQuick={() => setQuickModeOpen(true)}
        onSummary={() => setDailySummaryOpen(true)}
        onWhatsApp={() => setWhatsAppQueueOpen(true)}
        onRoster={isAdmin ? () => setRosterOpen(true) : undefined}
        onMenu={() => setSidebarOpen(true)}
      />

      <BulkMarkDialog
        open={bulkAttendanceOpen}
        onClose={() => setBulkAttendanceOpen(false)}
        students={unmarkedToday}
        selected={bulkAttendanceSelected}
        onSelectedChange={setBulkAttendanceSelected}
        saving={bulkAttendanceSaving}
        onConfirm={() => void confirmBulkAttendance()}
        description={<>Se guardará <b>{entryLimit}</b> (hora límite) como hora de ingreso. Desmarca a quien sepas que <b>faltó</b> hoy — el resto quedará con asistencia normal, igual que si se hubiera marcado uno por uno.</>}
      />

      <AttendanceEditDialog
        record={editingAttendance}
        student={editingAttendance ? studentMap.get(editingAttendance.studentId) : undefined}
        time={editingAttendanceTime}
        onTimeChange={setEditingAttendanceTime}
        entryLimit={entryLimit}
        saving={savingAttendanceEdit}
        onClose={() => setEditingAttendance(null)}
        onSave={() => void saveAttendanceEdit()}
        onSaveWithoutTime={() => void saveAttendanceEdit(true)}
        onDelete={() => void deleteEditingAttendance()}
      />

      <QuickMode
        open={quickModeOpen}
        onClose={() => setQuickModeOpen(false)}
        classrooms={classrooms}
        students={activeStudents}
        records={todayRecords}
        onMark={mark}
        onExit={markExit}
        online={syncState.online}
        entryLimit={entryLimit}
        onBulkMark={bulkMarkStudents}
        lateNoTime={lateNoTime}
        onLateNoTimeChange={setLateNoTime}
      />

      <PdaMode
      open={pdaModeOpen}
      onClose={() => setPdaModeOpen(false)}
      students={students}
      classrooms={classrooms}
      records={todayRecords}
      online={syncState.online}
      onEntry={mark}
      onExit={markExit}
      />

      <Deferred when={backupOpen}><BackupCenter open={backupOpen} onClose={() => setBackupOpen(false)} online={syncState.online} isAdmin={isAdmin} /></Deferred>

      <PresentationDialog
        presentationStudent={presentationStudent}
        setPresentationStudent={setPresentationStudent}
        presentationDraft={presentationDraft}
        setPresentationDraft={setPresentationDraft}
        setPresentationMode={setPresentationMode}
        savePresentation={savePresentation}
        presentationSaveDisabled={presentationSaveDisabled}
        todayRecords={todayRecords}
        classroom={classroom}
      />

      <NotificationPreviewModal
        notificationPreviewData={notificationPreviewData}
        setNotificationPreviewData={setNotificationPreviewData}
        today={today}
      />

      <MultiNotificationModal
        multiNotificationOpen={multiNotificationOpen}
        setMultiNotificationOpen={setMultiNotificationOpen}
        records={records}
        presentationRecords={presentationRecords}
        classrooms={classrooms}
        today={today}
        selectedNotificationIds={selectedNotificationIds}
        setSelectedNotificationIds={setSelectedNotificationIds}
        notificationSearch={notificationSearch}
        setNotificationSearch={setNotificationSearch}
        multiNotificationDate={multiNotificationDate}
        setMultiNotificationDate={setMultiNotificationDate}
        getNotificationNumber={getNotificationNumber}
        notificationCandidates={notificationCandidates}
        selectedNotificationData={selectedNotificationData}
        toggleNotificationStudent={toggleNotificationStudent}
      />

      <StudentHistoryModal
        historyStudent={historyStudent}
        setHistoryStudent={setHistoryStudent}
        records={records}
        presentationRecords={presentationRecords}
        notifications={notifications}
        setNotificationPreviewData={setNotificationPreviewData}
        buildNotificationDataFromNotification={buildNotificationDataFromNotification}
      />


      <WhatsAppDialog
        whatsAppStudent={whatsAppStudent}
        setWhatsAppStudent={setWhatsAppStudent}
        whatsAppType={whatsAppType}
        whatsAppMessage={whatsAppMessage}
        setWhatsAppMessage={setWhatsAppMessage}
        whatsAppError={whatsAppError}
        openingWhatsApp={openingWhatsApp}
        getWhatsAppOptions={getWhatsAppOptions}
        buildStudentWhatsAppMessage={buildStudentWhatsAppMessage}
        changeWhatsAppType={changeWhatsAppType}
        handleOpenWhatsApp={handleOpenWhatsApp}
      />

      <AlertCenter
        open={alertsOpen}
        onClose={() => setAlertsOpen(false)}
        classrooms={classrooms}
        currentClassroom={classroom}
        students={students}
        onOpenCaseFile={(student) => { setAlertsOpen(false); setCaseFileStudent(student) }}
        onOpenWhatsApp={(student, alertType) => {
          setAlertsOpen(false)
          const type: WhatsAppMessageType = alertType === 'ABSENCE' ? 'ABSENCE' : alertType === 'FREQUENT_LATE' ? 'FREQUENT_LATE' : alertType === 'THIRD_NOTIFICATION' ? 'RECURRENCE_3' : 'RECURRENCE_2'
          openWhatsAppModal(student, type)
        }}
      />

      <DailySummary
        open={dailySummaryOpen}
        onClose={() => setDailySummaryOpen(false)}
        classrooms={classrooms}
        currentClassroom={classroom}
        today={today}
        onOpenAlerts={() => { setDailySummaryOpen(false); setAlertsOpen(true) }}
        refreshKey={realtimeState.revision}
        dayStatusEnabled={dayStatus.available}
        calendarToday={calendarToday}
        onDayChanged={() => void reloadDayStatus()}
        onOpenWhatsAppQueue={() => { setDailySummaryOpen(false); setWhatsAppQueueOpen(true) }}
      />

      <JustifyDialog
        target={justifyTarget}
        userName={userName}
        onClose={() => setJustifyTarget(null)}
        onLateSaved={(rec) => {
          setRecords((curr) => curr.map((r) => (r.id === rec.id ? rec : r)))
          if (rec.justified) setNotifications((curr) => curr.filter((item) => !(item.attendanceId === rec.id && item.notificationType === 'LATE_ENTRY' && !item.presentationControlId)))
          else void getNotifications().then(setNotifications).catch((error) => reportError('Attendance', error))
          toast.success(rec.justified ? 'Tardanza justificada' : 'Justificación quitada')
        }}
        onAbsenceSaved={(absence) => { upsertAbsence(absence); toast.success(absence.status === 'JUSTIFIED' ? 'Falta justificada' : 'Justificación quitada') }}
      />

      <PermissionDialog
        student={permissionStudent}
        permissions={dayStatus.permissions}
        today={today}
        userName={userName}
        onClose={() => setPermissionStudent(null)}
        onChanged={() => { void reloadDayStatus(); toast.success('Permisos actualizados') }}
      />

      <MarkAbsenceDialog
        students={absenceDialog?.students ?? null}
        initialSelected={absenceDialog?.selected}
        date={today}
        userName={userName}
        onClose={() => setAbsenceDialog(null)}
        onSaved={addAbsences}
      />

      <EarlyExitDialog
        student={earlyExitStudent}
        attendance={earlyExitStudent ? recordByStudent.get(earlyExitStudent.id) : undefined}
        today={today}
        userName={userName}
        isAdmin={isAdminRole(userRole)}
        onClose={() => setEarlyExitStudent(null)}
        onSaved={addEarlyExit}
      />

      <Deferred when={caseFileStudent !== null}>
        <StudentCaseFile
          student={caseFileStudent}
          classroom={caseFileStudent ? classrooms.find((item) => item.id === caseFileStudent.classroomId) : undefined}
          onClose={() => setCaseFileStudent(null)}
          onOpenWhatsApp={(student) => { setCaseFileStudent(null); openWhatsAppModal(student) }}
        />
      </Deferred>

      <Deferred when={historicalImportOpen}>
        <HistoricalImport
          open={historicalImportOpen}
          onClose={() => setHistoricalImportOpen(false)}
          students={students}
          classrooms={classrooms}
          refreshKey={realtimeState.revision}
        />
      </Deferred>

      <Deferred when={auditOpen}><AuditLog open={auditOpen} onClose={() => setAuditOpen(false)} refreshKey={realtimeState.revision} /></Deferred>

      <Deferred when={reportsOpen}>
        <AdvancedReports
          open={reportsOpen}
          onClose={() => setReportsOpen(false)}
          classrooms={classrooms}
          refreshKey={realtimeState.revision}
        />
      </Deferred>

      <Deferred when={cobranzaOpen}><Cobranza open={cobranzaOpen} onClose={() => setCobranzaOpen(false)} isAdmin={isAdmin} templates={waTemplates} templatesShared={waTemplatesShared} onSaveTemplates={handleSaveTemplates} /></Deferred>

      <Deferred when={rosterOpen}>
        <RosterManager
          open={rosterOpen}
          onClose={() => setRosterOpen(false)}
          classrooms={classrooms}
          students={students}
          defaultClassroomId={classroom.id}
          onChanged={() => reloadData(false)}
        />
      </Deferred>

      <Deferred when={tvPanelOpen}>
        <LiveTvPanel
          open={tvPanelOpen}
          onClose={() => setTvPanelOpen(false)}
          students={activeStudents}
          classrooms={classrooms}
          attendanceRecords={records}
          presentationRecords={presentationRecords}
          today={today}
          realtimeConnected={realtimeState.connected}
        />
      </Deferred>

      <Deferred when={dashboardOpen}>
        <Dashboard
          open={dashboardOpen}
          classroom={classroom}
          onClose={() => setDashboardOpen(false)}
          onClassroomChange={changeClassroom}
          classrooms={classrooms}
          students={activeStudents}
          attendanceRecords={records}
          presentationRecords={presentationRecords}
          today={today}
          now={now}
        />
      </Deferred>

      <Deferred when={whatsAppQueueOpen}>
        <WhatsAppQueue
          open={whatsAppQueueOpen}
          onClose={() => setWhatsAppQueueOpen(false)}
          items={whatsAppQueueOpen ? buildWhatsAppQueueItems() : []}
          today={today}
          currentClassroomId={classroom.id}
          currentClassroomLabel={`${classroom.grade} ${classroom.section}`}
          isAdmin={isAdminRole(userRole)}
          templates={waTemplates}
          templatesShared={waTemplatesShared}
          onSaveTemplates={handleSaveTemplates}
        />
      </Deferred>

      <Deferred when={syncPanelOpen}><SyncPanel open={syncPanelOpen} onClose={() => setSyncPanelOpen(false)} sync={syncState} students={students} classrooms={classrooms} /></Deferred>
      <Deferred when={helpOpen}><HelpGuide open={helpOpen} onClose={() => setHelpOpen(false)} /></Deferred>
      <Deferred when={usersOpen}><UserManager open={usersOpen} onClose={() => setUsersOpen(false)} /></Deferred>
      <Deferred when={errorsOpen}><ErrorMonitor open={errorsOpen} onClose={() => setErrorsOpen(false)} onSeen={markErrorsSeen} /></Deferred>

      <SettingsPanel
        settingsOpen={settingsOpen}
        setSettingsOpen={setSettingsOpen}
        entryLimit={entryLimit}
        toleranceSettings={toleranceSettings}
        updateTolerance={updateTolerance}
        preferences={preferences}
        setPreferences={setPreferences}
        updatePreferences={updatePreferences}
        classroom={classroom}
        extraSections={dayStatus.available ? (
          <ScheduleCalendarSettings
            schedules={dayStatus.schedules}
            calendar={dayStatus.calendar}
            globalLimit={entryLimit}
            globalTolerance={toleranceSettings}
            isAdmin={isAdminRole(userRole)}
            onChanged={() => void reloadDayStatus()}
          />
        ) : undefined}
      />
    </main>
    </MotionConfig>
  )
}
