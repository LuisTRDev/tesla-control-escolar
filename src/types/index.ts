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
}

export type AttendanceStatus = 'ON_TIME' | 'LATE'

export type AttendanceRecord = {
  studentId: string
  date: string
  time: string
  status: AttendanceStatus
}

export type AttendanceFilter = 'ALL' | 'ON_TIME' | 'LATE' | 'PENDING'

export type PresentationStatus = 'COMPLIANT' | 'NON_COMPLIANT'

export type PresentationRecord = {
  id?: string
  studentId: string
  date: string
  status: PresentationStatus
  hairstyleViolation: boolean
  uniformUsageViolation: boolean
  nonInstitutionalGarment: boolean
  otherViolation: boolean
  otherDescription: string
  checkedAt: string
}


export type NotificationRecord = {
  id: string
  studentId: string
  presentationControlId: string
  notificationNumber: 1 | 2 | 3
  date: string
  generatedAt: string
}

export type PresentationFilter = 'ALL' | 'COMPLIANT' | 'NON_COMPLIANT' | 'PENDING'

export type UserRole = 'AUXILIARY' | 'ADMIN' | 'MANAGEMENT' | string
