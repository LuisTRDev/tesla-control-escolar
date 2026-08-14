export type Classroom = {
  id: string
  grade: string
  section: string
  level: 'Primaria' | 'Secundaria'
}

export type Student = {
  id: string
  firstName: string
  lastName: string
  classroomId: string
  guardianName: string
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
