export type Classroom = {
  id: string
  grade: string
  section: string
  level: 'Primaria' | 'Secundaria'
  tutorName: string
}

export type Student = {
  id: string
  firstName: string
  lastName: string
  classroomId: string
  guardianName: string
  guardianDni: string
  guardianPhone: string
  /** Optional PDA/access fields; kept optional until the corresponding DB columns are added. */
  dni?: string
  accessAuthorized?: boolean
  accessNote?: string
}

export type AttendanceStatus = 'ON_TIME' | 'LATE'

export type AttendanceRecord = {
  id?: string
  studentId: string
  date: string
  time: string
  status: AttendanceStatus
  exitTime?: string
  exitRecordedAt?: string | null
  exitRecordedBy?: string | null
  entryRecordedAt?: string | null
  entryRecordedBy?: string | null
  entrySource?: string | null
  exitSource?: string | null
}

export type AttendanceFilter = 'ALL' | 'ON_TIME' | 'LATE' | 'PENDING'

export type PresentationStatus = 'COMPLIANT' | 'NON_COMPLIANT'

/**
 * Conservamos el nombre PresentationRecord por compatibilidad con Fase 4,
 * pero desde Fase 5.1.1 representa el control de incumplimientos del
 * reglamento interno que alimenta la nueva notificación oficial.
 */
export type PresentationRecord = {
  id?: string
  studentId: string
  date: string
  status: PresentationStatus
  hairstyleViolation: boolean
  uniformUsageViolation: boolean
  nonInstitutionalGarment: boolean
  lateEntryViolation: boolean
  inappropriateConductViolation: boolean
  observation: string
  checkedAt: string
}

export type NotificationType = 'PRESENTATION' | 'LATE_ENTRY' | 'INAPPROPRIATE_CONDUCT'

export type NotificationRecord = {
  id: string
  studentId: string
  presentationControlId: string | null
  attendanceId: string | null
  notificationNumber: number
  notificationType: NotificationType
  observation: string
  date: string
  generatedAt: string
}

export type PresentationFilter = 'ALL' | 'COMPLIANT' | 'NON_COMPLIANT' | 'PENDING'

export type UserRole = 'AUXILIARY' | 'ADMIN' | 'MANAGEMENT' | string
