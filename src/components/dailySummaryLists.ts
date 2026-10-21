import type { AbsenceRecord, AttendanceRecord, Classroom, NotificationRecord, PresentationRecord, Student, StudentPermission } from '@/types'
import { presentationLabels } from '@/components/livetv/panelData'

/** Qué cifra del resumen diario se abrió para ver a los alumnos. */
export type SummaryListKind = 'students' | 'present' | 'onTime' | 'late' | 'absent' | 'incidents' | 'notifications'

export type SummaryRowTone = 'ok' | 'late' | 'absent' | 'info' | 'warn'

export type SummaryListRow = {
  student: Student
  classroom?: Classroom
  /** Estado o motivo que se muestra junto al alumno. */
  detail: string
  tone: SummaryRowTone
}

export type SummaryListInput = {
  date: string
  /** 'ALL' = todo el colegio. */
  classroomId: string
  students: Student[]
  classrooms: Classroom[]
  attendance: AttendanceRecord[]
  presentation: PresentationRecord[]
  absences: AbsenceRecord[]
  permissions: StudentPermission[]
  notifications: NotificationRecord[]
}

const NOTIFICATION_LABELS: Record<NotificationRecord['notificationType'], string> = {
  PRESENTATION: 'Presentación',
  LATE_ENTRY: 'Tardanza',
  INAPPROPRIATE_CONDUCT: 'Conducta inapropiada',
}

const nameOf = (student: Student) => `${student.lastName} ${student.firstName}`

function lateDetail(record: AttendanceRecord) {
  const base = record.time ? `Tardanza · ${record.time.slice(0, 5)}` : 'Tardanza'
  return record.justified ? `${base} · justificada` : base
}

/** Alumnos detrás de una cifra del resumen diario, ordenados por aula y apellido. */
export function buildSummaryList(kind: SummaryListKind, input: SummaryListInput): SummaryListRow[] {
  const { date, classroomId } = input
  const classroomById = new Map(input.classrooms.map((item) => [item.id, item]))
  const inScope = input.students.filter((student) => classroomId === 'ALL' || student.classroomId === classroomId)
  const scopedIds = new Set(inScope.map((student) => student.id))
  const studentById = new Map(inScope.map((student) => [student.id, student]))
  const attendanceByStudent = new Map(input.attendance.filter((record) => record.date === date && scopedIds.has(record.studentId)).map((record) => [record.studentId, record]))
  const absenceByStudent = new Map(input.absences.filter((item) => item.date === date).map((item) => [item.studentId, item]))
  const row = (student: Student, detail: string, tone: SummaryRowTone): SummaryListRow => ({ student, classroom: classroomById.get(student.classroomId), detail, tone })

  const absentRow = (student: Student): SummaryListRow => {
    const absence = absenceByStudent.get(student.id)
    if (absence?.status === 'PERMISSION') return row(student, 'Con permiso', 'info')
    if (absence?.status === 'JUSTIFIED') return row(student, 'Falta justificada', 'info')
    if (absence) return row(student, 'Falta', 'absent')
    const permission = input.permissions.find((item) => item.studentId === student.id && item.kind === 'ABSENCE' && item.dateFrom <= date && item.dateTo >= date)
    if (permission) return row(student, `Con permiso: ${permission.reason}`, 'info')
    return row(student, 'Sin marcar', 'warn')
  }
  const presentRow = (student: Student, record: AttendanceRecord) =>
    record.status === 'LATE' ? row(student, lateDetail(record), 'late') : row(student, `A tiempo${record.time ? ` · ${record.time.slice(0, 5)}` : ''}`, 'ok')

  const rows: SummaryListRow[] = []
  switch (kind) {
    case 'students':
      for (const student of inScope) {
        const record = attendanceByStudent.get(student.id)
        rows.push(record ? presentRow(student, record) : absentRow(student))
      }
      break
    case 'present':
    case 'onTime':
    case 'late':
      for (const [studentId, record] of attendanceByStudent) {
        const student = studentById.get(studentId)
        if (!student) continue
        if (kind === 'onTime' && record.status !== 'ON_TIME') continue
        if (kind === 'late' && record.status !== 'LATE') continue
        rows.push(presentRow(student, record))
      }
      break
    case 'absent':
      for (const student of inScope) if (!attendanceByStudent.has(student.id)) rows.push(absentRow(student))
      break
    case 'incidents':
      for (const record of input.presentation) {
        const student = studentById.get(record.studentId)
        if (record.date !== date || record.status !== 'NON_COMPLIANT' || !student) continue
        const labels = presentationLabels(record, attendanceByStudent.get(record.studentId)?.status === 'LATE')
        rows.push(row(student, labels.length ? labels.join(' · ') : 'Incumplimiento de presentación', record.inappropriateConductViolation ? 'absent' : 'warn'))
      }
      break
    case 'notifications':
      for (const item of input.notifications) {
        const student = studentById.get(item.studentId)
        if (item.date !== date || item.voided || !student) continue
        rows.push(row(student, `${NOTIFICATION_LABELS[item.notificationType]} · n.º ${item.notificationNumber}`, 'info'))
      }
      break
  }

  return rows.sort((a, b) => {
    const ca = a.classroom
    const cb = b.classroom
    return (ca?.level ?? '').localeCompare(cb?.level ?? '', 'es')
      || (ca?.grade ?? '').localeCompare(cb?.grade ?? '', 'es', { numeric: true })
      || (ca?.section ?? '').localeCompare(cb?.section ?? '', 'es')
      || nameOf(a.student).localeCompare(nameOf(b.student), 'es')
  })
}
