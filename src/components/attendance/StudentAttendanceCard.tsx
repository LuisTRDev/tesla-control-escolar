import { BookOpen, CalendarClock, Check, ClipboardCheck, Clock3, DoorOpen, Edit3, FileText, FolderOpen, LogOut, MessageCircle, ShieldCheck, Shirt, TriangleAlert, UserX } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
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

/** Tarjeta de un alumno en la lista diaria del aula (entrada, salida, presentación y avisos). */
export default function StudentAttendanceCard({ student, classroom, record, presentation, violations, recurrence, whatsAppOptions, canOpenWhatsApp, mark, markExit, openAttendanceEdit, openPresentation, openNotification, openWhatsAppModal, setCaseFileStudent, setHistoryStudent, dayStatusEnabled, absence, permission, earlyExit, onJustifyLate, onJustifyAbsence, onPermission, onEarlyExit }: Props) {
  const lateUnjustified = record?.status === 'LATE' && !record.justified
  return (
    <Card className="p-4 sm:p-5">
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
              ) : record.justified ? (
                <button type="button" onClick={() => onJustifyLate(student, record)} title={record.justificationReason ?? ''} className="flex min-w-44 items-center justify-center gap-2 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 font-bold text-sky-700 dark:border-sky-900/70 dark:bg-sky-950/45 dark:text-sky-300">
                  <ShieldCheck size={18} />
                  {record.time} · Tardanza justificada
                </button>
              ) : (
                <div className="flex min-w-44 items-center justify-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 font-bold text-amber-700 dark:border-amber-900/70 dark:bg-amber-950/45 dark:text-amber-300">
                  <TriangleAlert size={18} />
                  {record.time} · Tardanza
                </div>
              )
            ) : (
              <>
                {absence?.status === 'UNJUSTIFIED' && (
                  <div className="flex min-w-36 items-center justify-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 font-bold text-red-700 dark:border-red-900/70 dark:bg-red-950/45 dark:text-red-300">
                    <UserX size={18} /> Falta
                  </div>
                )}
                {absence?.status === 'JUSTIFIED' && (
                  <button type="button" onClick={() => onJustifyAbsence(student, absence)} title={absence.justificationReason ?? ''} className="flex min-w-36 items-center justify-center gap-2 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 font-bold text-sky-700 dark:border-sky-900/70 dark:bg-sky-950/45 dark:text-sky-300">
                    <ShieldCheck size={18} /> Falta justificada
                  </button>
                )}
                {(absence?.status === 'PERMISSION' || (!absence && permission?.kind === 'ABSENCE')) && (
                  <div title={permission?.reason ?? absence?.justificationReason ?? ''} className="flex min-w-36 items-center justify-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3 font-bold text-indigo-700 dark:border-indigo-900/70 dark:bg-indigo-950/45 dark:text-indigo-300">
                    <CalendarClock size={18} /> Con permiso
                  </div>
                )}
                {absence?.status === 'UNJUSTIFIED' && (
                  <Button variant="outline" className="w-full sm:w-auto" onClick={() => onJustifyAbsence(student, absence)}>
                    <ShieldCheck className="mr-2" size={18} /> Justificar
                  </Button>
                )}
                {/* Aunque tenga falta o permiso, si llega igual se puede marcar: la falta se borra sola. */}
                <Button className="h-14 w-full text-base sm:h-11 sm:w-auto sm:text-sm" onClick={() => void mark(student.id)}>
                  <Clock3 className="mr-2" size={18} />
                  {absence || permission?.kind === 'ABSENCE' ? 'Llegó: marcar' : 'Marcar entrada'}
                </Button>
              </>
            )}
            {record && (
              <>
                <Button
                  variant="outline"
                  className="w-full sm:w-auto"
                  onClick={() => openAttendanceEdit(record)}
                  title="Corregir hora de ingreso"
                >
                  <Edit3 className="mr-2" size={18} />
                  Editar ingreso
                </Button>

                {dayStatusEnabled && lateUnjustified && (
                  <Button variant="outline" className="w-full border-sky-200 text-sky-700 hover:bg-sky-50 dark:border-sky-900/70 dark:text-sky-300 dark:hover:bg-sky-950/40 sm:w-auto" onClick={() => onJustifyLate(student, record)}>
                    <ShieldCheck className="mr-2" size={18} /> Justificar
                  </Button>
                )}

                {earlyExit ? (
                  <div title={`Recogió: ${earlyExit.pickedUpByName} · ${earlyExit.reason}`} className={`flex items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-bold ${earlyExit.isAuthorizedPerson ? 'border-orange-200 bg-orange-50 text-orange-700 dark:border-orange-900/70 dark:bg-orange-950/40 dark:text-orange-300' : 'border-red-300 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300'}`}>
                    <DoorOpen size={17} /> Salida anticipada {earlyExit.exitTime}
                  </div>
                ) : (
                  <Button
                    variant="outline"
                    className="w-full sm:w-auto"
                    disabled={Boolean(record.exitTime)}
                    onClick={() => void markExit(student.id)}
                    title={record.exitTime ? `Salida registrada: ${record.exitTime}` : 'Registrar salida'}
                  >
                    <LogOut className="mr-2" size={18} />
                    {record.exitTime ? `Salida ${record.exitTime}` : 'Marcar salida'}
                  </Button>
                )}
                {dayStatusEnabled && !earlyExit && !record.exitTime && (
                  <Button variant="outline" className="w-full border-orange-200 text-orange-700 hover:bg-orange-50 dark:border-orange-900/70 dark:text-orange-300 dark:hover:bg-orange-950/40 sm:w-auto" onClick={() => onEarlyExit(student)}>
                    <DoorOpen className="mr-2" size={18} /> Salida anticipada
                  </Button>
                )}
              </>
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

            {permission && (record || permission.kind === 'LATE') && (
              <span title={permission.reason} className="rounded-lg bg-indigo-100 px-2.5 py-1 text-xs font-black text-indigo-800 dark:bg-indigo-950/60 dark:text-indigo-300">
                Permiso: {permission.kind === 'LATE' ? 'llega tarde' : 'inasistencia'}
              </span>
            )}

            {recurrence.total > 0 && recurrence.latest && (
              <span className="rounded-lg bg-amber-100 px-2.5 py-1 text-xs font-black text-amber-800 dark:bg-amber-950/60 dark:text-amber-300">
                Reincidencias: {recurrence.total} · {getNotificationLabel(recurrence.latest.notificationNumber)}
              </span>
            )}
          </div>

          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
            <Button variant="ghost" className="w-full sm:w-auto" onClick={() => setCaseFileStudent(student)}>
              <FolderOpen className="mr-2" size={17} /> Expediente
            </Button>
            <Button variant="ghost" className="w-full sm:w-auto" onClick={() => setHistoryStudent(student)}>
              <BookOpen className="mr-2" size={17} /> Historial
            </Button>
            {dayStatusEnabled && (
              <Button variant="ghost" className="w-full sm:w-auto" onClick={() => onPermission(student)}>
                <CalendarClock className="mr-2" size={17} /> Permiso
              </Button>
            )}
            {whatsAppOptions.length > 0 && (
              <Button
                variant="outline"
                className="w-full border-emerald-200 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-900/70 dark:text-emerald-300 dark:hover:bg-emerald-950/40 sm:w-auto"
                onClick={() => openWhatsAppModal(student)}
                disabled={!canOpenWhatsApp}
                title={canOpenWhatsApp ? 'Preparar mensaje para el apoderado' : 'El alumno no tiene un celular peruano válido registrado'}
              >
                <MessageCircle className="mr-2" size={17} /> WhatsApp
              </Button>
            )}
            {(presentation?.status === 'NON_COMPLIANT' || lateUnjustified) && (
              <Button variant="outline" className="w-full sm:w-auto" onClick={() => void openNotification(student)}>
                <FileText className="mr-2" size={17} /> Notificación
              </Button>
            )}
            <Button variant="outline" className="w-full sm:w-auto" onClick={() => openPresentation(student)}>
              {presentation ? <Edit3 className="mr-2" size={17} /> : <ClipboardCheck className="mr-2" size={17} />}
              {presentation ? 'Editar control' : 'Revisar normas'}
            </Button>
          </div>
        </div>
      </div>
    </Card>
  )
}
