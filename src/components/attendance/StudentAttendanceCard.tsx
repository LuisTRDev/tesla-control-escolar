import { BookOpen, Check, ClipboardCheck, Clock3, Edit3, FileText, FolderOpen, LogOut, MessageCircle, Shirt, TriangleAlert } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { getNotificationLabel } from '@/services/notificationService'
import type { WhatsAppMessageType } from '@/services/communicationService'
import type { AttendanceRecord, Classroom, NotificationRecord, PresentationRecord, Student } from '@/types'

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
}

/** Tarjeta de un alumno en la lista diaria del aula (entrada, salida, presentación y avisos). */
export default function StudentAttendanceCard({ student, classroom, record, presentation, violations, recurrence, whatsAppOptions, canOpenWhatsApp, mark, markExit, openAttendanceEdit, openPresentation, openNotification, openWhatsAppModal, setCaseFileStudent, setHistoryStudent }: Props) {
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
              ) : (
                <div className="flex min-w-44 items-center justify-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 font-bold text-amber-700 dark:border-amber-900/70 dark:bg-amber-950/45 dark:text-amber-300">
                  <TriangleAlert size={18} />
                  {record.time} · Tardanza
                </div>
              )
            ) : (
              <Button className="h-14 w-full text-base sm:h-11 sm:w-auto sm:text-sm" onClick={() => void mark(student.id)}>
                <Clock3 className="mr-2" size={18} />
                Marcar entrada
              </Button>
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
            {(presentation?.status === 'NON_COMPLIANT' || record?.status === 'LATE') && (
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
