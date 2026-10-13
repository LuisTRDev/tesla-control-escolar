import { useState, type ReactNode } from 'react'
import { BookOpen, CalendarClock, Check, ClipboardCheck, Clock3, DoorOpen, Edit3, FileText, FolderOpen, LogOut, MessageCircle, MoreHorizontal, ShieldCheck, Shirt, TriangleAlert, UserX } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { ActionSheet, type SheetAction } from '@/components/ui/ActionSheet'
import { getNotificationLabel } from '@/services/notificationService'
import type { WhatsAppMessageType } from '@/services/communicationService'
import type { AbsenceRecord, AttendanceRecord, Classroom, EarlyExit, NotificationRecord, PresentationRecord, Student, StudentPermission } from '@/types'

type Props = {
  student: Student
  classroom: Classroom
  record: AttendanceRecord | undefined
  presentation: PresentationRecord | undefined
  violations: number
  recurrence: { total: number; latest?: NotificationRecord }
  whatsAppOptions: Array<{ type: WhatsAppMessageType; label: string }>
  canOpenWhatsApp: boolean
  mark: (studentId: string) => Promise<void>
  markExit: (studentId: string) => Promise<void>
  openAttendanceEdit: (record: AttendanceRecord) => void
  openPresentation: (student: Student) => void
  openNotification: (student: Student) => Promise<void>
  openWhatsAppModal: (student: Student) => void
  setCaseFileStudent: (student: Student) => void
  setHistoryStudent: (student: Student) => void
  /** Fase 14: falta, permiso y salida anticipada de hoy. `dayStatusEnabled` false oculta estos botones. */
  dayStatusEnabled: boolean
  absence?: AbsenceRecord
  permission?: StudentPermission
  earlyExit?: EarlyExit
  onJustifyLate: (student: Student, record: AttendanceRecord) => void
  onJustifyAbsence: (student: Student, absence: AbsenceRecord) => void
  onPermission: (student: Student) => void
  onEarlyExit: (student: Student) => void
}

const pillBase = 'flex min-h-12 min-w-0 items-center justify-center gap-2 rounded-xl border px-3 py-2 text-sm font-bold'

/**
 * Estado del día como "pastilla". Con hora, en celular va en dos líneas (hora grande y
 * estado debajo) para que no se recorte. Si recibe onClick, tocarla abre la acción
 * relacionada (editar o justificar).
 */
function StatusPill({ tone, icon, label, time, onClick, title }: { tone: string; icon: ReactNode; label: string; time?: string; onClick?: () => void; title?: string }) {
  const content = time ? (
    <span className="flex min-w-0 flex-col items-start leading-tight lg:flex-row lg:items-center lg:gap-1">
      <span className="font-black tabular-nums">{time}</span>
      <span className="max-w-full truncate text-[11px] font-bold uppercase tracking-wide opacity-80 lg:text-sm lg:normal-case lg:tracking-normal lg:opacity-100"><span className="hidden lg:inline">· </span>{label}</span>
    </span>
  ) : <span className="truncate">{label}</span>
  if (!onClick) return <div title={title} className={`${pillBase} ${tone}`}>{icon}{content}</div>
  return (
    <button type="button" onClick={onClick} title={title} className={`${pillBase} ${tone} transition-transform active:scale-[.98]`}>
      {icon}{content}
    </button>
  )
}

const tones = {
  green: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/70 dark:bg-emerald-950/50 dark:text-emerald-300',
  amber: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/70 dark:bg-amber-950/45 dark:text-amber-300',
  sky: 'border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900/70 dark:bg-sky-950/45 dark:text-sky-300',
  red: 'border-red-200 bg-red-50 text-red-700 dark:border-red-900/70 dark:bg-red-950/45 dark:text-red-300',
  indigo: 'border-indigo-200 bg-indigo-50 text-indigo-700 dark:border-indigo-900/70 dark:bg-indigo-950/45 dark:text-indigo-300',
  orange: 'border-orange-200 bg-orange-50 text-orange-700 dark:border-orange-900/70 dark:bg-orange-950/40 dark:text-orange-300',
  slate: 'border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-300',
}

/**
 * Tarjeta de un alumno en la lista diaria del aula.
 * En celular muestra solo el estado, una acción principal (entrada o salida) y
 * tres botones (normas, WhatsApp, "Más"); el resto de acciones vive en la hoja "Más".
 * En pantallas anchas (lg) las acciones secundarias se ven en línea.
 */
export default function StudentAttendanceCard({ student, classroom, record, presentation, violations, recurrence, whatsAppOptions, canOpenWhatsApp, mark, markExit, openAttendanceEdit, openPresentation, openNotification, openWhatsAppModal, setCaseFileStudent, setHistoryStudent, dayStatusEnabled, absence, permission, earlyExit, onJustifyLate, onJustifyAbsence, onPermission, onEarlyExit }: Props) {
  const [moreOpen, setMoreOpen] = useState(false)
  const lateUnjustified = record?.status === 'LATE' && !record.justified
  const fullName = `${student.firstName} ${student.lastName}`
  const canEarlyExit = Boolean(dayStatusEnabled && record && !earlyExit && !record.exitTime)
  const needsNotification = presentation?.status === 'NON_COMPLIANT' || lateUnjustified

  // ---- Estado del día (pastilla) ----
  let status: ReactNode = null
  if (record) {
    if (record.status === 'ON_TIME') {
      status = <StatusPill tone={tones.green} icon={<Check size={18} className="shrink-0" />} onClick={() => openAttendanceEdit(record)} title="Corregir hora de ingreso" time={record.time} label="A tiempo" />
    } else if (record.justified) {
      status = <StatusPill tone={tones.sky} icon={<ShieldCheck size={18} className="shrink-0" />} onClick={() => onJustifyLate(student, record)} title={record.justificationReason ?? ''} time={record.time} label="Justificada" />
    } else {
      status = <StatusPill tone={tones.amber} icon={<TriangleAlert size={18} className="shrink-0" />} onClick={() => openAttendanceEdit(record)} title="Corregir hora de ingreso" time={record.time} label="Tardanza" />
    }
  } else if (absence?.status === 'UNJUSTIFIED') {
    status = <StatusPill tone={tones.red} icon={<UserX size={18} className="shrink-0" />} onClick={() => onJustifyAbsence(student, absence)} title="Justificar falta" label="Falta" />
  } else if (absence?.status === 'JUSTIFIED') {
    status = <StatusPill tone={tones.sky} icon={<ShieldCheck size={18} className="shrink-0" />} onClick={() => onJustifyAbsence(student, absence)} title={absence.justificationReason ?? ''} label="Falta justificada" />
  } else if (absence?.status === 'PERMISSION' || (!absence && permission?.kind === 'ABSENCE')) {
    status = <StatusPill tone={tones.indigo} icon={<CalendarClock size={18} className="shrink-0" />} title={permission?.reason ?? absence?.justificationReason ?? ''} label="Con permiso" />
  }

  // ---- Acción principal ----
  let primary: ReactNode
  if (!record) {
    // Aunque tenga falta o permiso, si llega igual se puede marcar: la falta se borra sola.
    primary = (
      <Button className="h-12 w-full text-base font-bold active:scale-[.98] lg:h-11 lg:w-auto lg:text-sm" onClick={() => void mark(student.id)}>
        <Clock3 className="mr-2 shrink-0" size={19} />
        {absence || permission?.kind === 'ABSENCE' ? 'Llegó: marcar' : 'Marcar entrada'}
      </Button>
    )
  } else if (earlyExit) {
    primary = <StatusPill tone={earlyExit.isAuthorizedPerson ? tones.orange : tones.red} icon={<DoorOpen size={17} className="shrink-0" />} title={`Recogió: ${earlyExit.pickedUpByName} · ${earlyExit.reason}`} time={earlyExit.exitTime} label="Salida anticipada" />
  } else if (record.exitTime) {
    primary = <StatusPill tone={tones.slate} icon={<LogOut size={17} className="shrink-0" />} title={`Salida registrada: ${record.exitTime}`} time={record.exitTime} label="Salida" />
  } else {
    primary = (
      <Button variant="outline" className="h-12 w-full active:scale-[.98] lg:h-11 lg:w-auto" onClick={() => void markExit(student.id)} title="Registrar salida">
        <LogOut className="mr-2 shrink-0" size={18} /> Marcar salida
      </Button>
    )
  }

  // ---- Acciones secundarias (hoja "Más" en celular, en línea en PC) ----
  const actions: SheetAction[] = []
  if (record) actions.push({ key: 'edit', label: 'Editar ingreso', description: record.time ? `Registrado a las ${record.time}` : 'Tardanza sin hora', icon: <Edit3 size={19} />, onSelect: () => openAttendanceEdit(record) })
  if (dayStatusEnabled && lateUnjustified && record) actions.push({ key: 'justify-late', label: 'Justificar tardanza', icon: <ShieldCheck size={19} />, tone: 'sky', onSelect: () => onJustifyLate(student, record) })
  if (absence?.status === 'UNJUSTIFIED') actions.push({ key: 'justify-absence', label: 'Justificar falta', icon: <ShieldCheck size={19} />, tone: 'sky', onSelect: () => onJustifyAbsence(student, absence) })
  if (canEarlyExit) actions.push({ key: 'early-exit', label: 'Salida anticipada', description: 'Retiro antes de la hora, con quién lo recoge', icon: <DoorOpen size={19} />, tone: 'orange', onSelect: () => onEarlyExit(student) })
  if (dayStatusEnabled) actions.push({ key: 'permission', label: 'Permiso', description: 'Llegada tarde o inasistencia autorizada', icon: <CalendarClock size={19} />, onSelect: () => onPermission(student) })
  if (needsNotification) actions.push({ key: 'notification', label: 'Notificación', description: 'Ficha para el apoderado (PDF / Word)', icon: <FileText size={19} />, onSelect: () => void openNotification(student) })
  actions.push({ key: 'case', label: 'Expediente', icon: <FolderOpen size={19} />, onSelect: () => setCaseFileStudent(student) })
  actions.push({ key: 'history', label: 'Historial', icon: <BookOpen size={19} />, onSelect: () => setHistoryStudent(student) })

  const presentationButtonLabel = presentation ? 'Editar control' : 'Revisar normas'
  const presentationIcon = presentation ? <Edit3 size={17} /> : <ClipboardCheck size={17} />
  const showWhatsApp = whatsAppOptions.length > 0
  const whatsAppTitle = canOpenWhatsApp ? 'Preparar mensaje para el apoderado' : 'El alumno no tiene un celular peruano válido registrado'
  const urgentInMore = (dayStatusEnabled && lateUnjustified) || absence?.status === 'UNJUSTIFIED'

  return (
    <Card className="p-4 sm:p-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:gap-4">
        <div className="min-w-0 flex-1">
          <h3 className="text-[15px] font-bold leading-snug sm:text-base">{fullName}</h3>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400 sm:text-sm">{classroom.grade} {classroom.section} · {classroom.level}</p>
        </div>

        <div className={`grid gap-2 lg:flex lg:items-center ${status ? 'grid-cols-2' : 'grid-cols-1'}`}>
          {status}
          {primary}
        </div>
      </div>

      {(presentation || permission || (recurrence.total > 0 && recurrence.latest)) && (
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          {presentation?.status === 'COMPLIANT' && (
            <span className="inline-flex items-center gap-1 rounded-lg bg-emerald-50 px-2 py-1 text-xs font-bold text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">
              <ClipboardCheck size={14} /> Presentación conforme · {presentation.checkedAt}
            </span>
          )}
          {presentation?.status === 'NON_COMPLIANT' && (
            <span className="inline-flex items-center gap-1 rounded-lg bg-amber-50 px-2 py-1 text-xs font-bold text-amber-700 dark:bg-amber-950/45 dark:text-amber-300">
              <TriangleAlert size={14} /> {violations} {violations === 1 ? 'incidencia' : 'incidencias'} · {presentation.checkedAt}
            </span>
          )}
          {permission && (record || permission.kind === 'LATE') && (
            <span title={permission.reason} className="rounded-lg bg-indigo-100 px-2 py-1 text-xs font-black text-indigo-800 dark:bg-indigo-950/60 dark:text-indigo-300">
              Permiso: {permission.kind === 'LATE' ? 'llega tarde' : 'inasistencia'}
            </span>
          )}
          {recurrence.total > 0 && recurrence.latest && (
            <span className="rounded-lg bg-amber-100 px-2 py-1 text-xs font-black text-amber-800 dark:bg-amber-950/60 dark:text-amber-300">
              Reincidencias: {recurrence.total} · {getNotificationLabel(recurrence.latest.notificationNumber)}
            </span>
          )}
        </div>
      )}

      {/* Celular y tablet: tres botones fijos; el resto en la hoja "Más". */}
      <div className={`mt-3 grid gap-2 border-t border-slate-100 pt-3 dark:border-slate-800 lg:hidden ${showWhatsApp ? 'grid-cols-3' : 'grid-cols-2'}`}>
        <Button variant="ghost" className="h-11 gap-1.5 px-2 text-[13px] active:scale-[.97]" onClick={() => openPresentation(student)}>
          {presentation ? presentationIcon : <Shirt size={17} />}<span className="truncate">{presentation ? 'Normas' : 'Revisar'}</span>
        </Button>
        {showWhatsApp && (
          <Button variant="ghost" className="h-11 gap-1.5 px-2 text-[13px] text-emerald-700 active:scale-[.97] dark:text-emerald-300" onClick={() => openWhatsAppModal(student)} disabled={!canOpenWhatsApp} title={whatsAppTitle}>
            <MessageCircle size={17} /><span className="truncate">WhatsApp</span>
          </Button>
        )}
        <Button variant="ghost" className="relative h-11 gap-1.5 px-2 text-[13px] active:scale-[.97]" onClick={() => setMoreOpen(true)} aria-haspopup="dialog">
          <MoreHorizontal size={18} /><span className="truncate">Más</span>
          {urgentInMore && <span className="absolute right-3 top-2 h-2 w-2 rounded-full bg-amber-500" aria-label="Hay una acción pendiente" />}
        </Button>
      </div>

      {/* PC: acciones en línea, compactas. */}
      <div className="mt-3 hidden flex-wrap items-center justify-end gap-2 border-t border-slate-100 pt-3 dark:border-slate-800 lg:flex">
        {actions.map((action) => (
          <Button
            key={action.key}
            variant={action.tone === 'sky' || action.tone === 'orange' ? 'outline' : 'ghost'}
            className={`h-9 min-h-9 px-3 ${action.tone === 'sky' ? 'border-sky-200 text-sky-700 hover:bg-sky-50 dark:border-sky-900/70 dark:text-sky-300 dark:hover:bg-sky-950/40' : action.tone === 'orange' ? 'border-orange-200 text-orange-700 hover:bg-orange-50 dark:border-orange-900/70 dark:text-orange-300 dark:hover:bg-orange-950/40' : ''}`}
            onClick={action.onSelect}
          >
            <span className="mr-1.5 [&>svg]:h-4 [&>svg]:w-4">{action.icon}</span>{action.label}
          </Button>
        ))}
        {showWhatsApp && (
          <Button variant="outline" className="h-9 min-h-9 border-emerald-200 px-3 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-900/70 dark:text-emerald-300 dark:hover:bg-emerald-950/40" onClick={() => openWhatsAppModal(student)} disabled={!canOpenWhatsApp} title={whatsAppTitle}>
            <MessageCircle className="mr-1.5" size={16} /> WhatsApp
          </Button>
        )}
        <Button variant="outline" className="h-9 min-h-9 px-3" onClick={() => openPresentation(student)}>
          <span className="mr-1.5 [&>svg]:h-4 [&>svg]:w-4">{presentationIcon}</span>{presentationButtonLabel}
        </Button>
      </div>

      <ActionSheet open={moreOpen} onClose={() => setMoreOpen(false)} title={fullName} subtitle={`${classroom.grade} ${classroom.section} · ${classroom.level}`} actions={actions} />
    </Card>
  )
}
