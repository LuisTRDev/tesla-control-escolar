import type { AttendanceRecord, Classroom, PresentationRecord, Student } from '@/types'

export const MAX_NOTIFICATIONS_PER_PAGE = 3

export type NotificationPrintData = {
  student: Student
  classroom: Classroom
  presentation?: PresentationRecord
  attendance?: AttendanceRecord
  notificationNumber: number
}
