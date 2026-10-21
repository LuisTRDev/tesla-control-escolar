import { describe, expect, it } from 'vitest'
import type { AbsenceRecord, AttendanceRecord, Classroom, NotificationRecord, PresentationRecord, Student, StudentPermission } from '@/types'
import { buildSummaryList, type SummaryListInput } from './dailySummaryLists'

const DAY = '2026-10-21'
const classrooms: Classroom[] = [
  { id: 'c1', grade: '1.°', section: 'A', level: 'Primaria', tutorName: '' },
  { id: 'c2', grade: '2.°', section: 'B', level: 'Secundaria', tutorName: '' },
]
const student = (id: string, classroomId: string, lastName: string): Student => ({ id, firstName: 'N', lastName, classroomId, guardianName: '', guardianDni: '', guardianPhone: '' })
const students = [student('s1', 'c1', 'Zeta'), student('s2', 'c1', 'Alfa'), student('s3', 'c2', 'Beta'), student('s4', 'c2', 'Gama')]

const rec = (studentId: string, status: AttendanceRecord['status'], time = '07:50', extra: Partial<AttendanceRecord> = {}): AttendanceRecord => ({ id: studentId, studentId, date: DAY, time, status, ...extra })

const base: SummaryListInput = {
  date: DAY, classroomId: 'ALL', students, classrooms,
  attendance: [rec('s1', 'ON_TIME'), rec('s2', 'LATE', '08:10'), rec('s3', 'LATE', '', { justified: true })],
  presentation: [], absences: [], permissions: [], notifications: [],
}

const presentation = (studentId: string, status: PresentationRecord['status'], extra: Partial<PresentationRecord> = {}): PresentationRecord => ({
  id: `p-${studentId}`, studentId, date: DAY, status, observation: '', checkedAt: '08:00',
  hairstyleViolation: false, uniformUsageViolation: false, nonInstitutionalGarment: false, lateEntryViolation: false, inappropriateConductViolation: false, ...extra,
})

describe('buildSummaryList', () => {
  it('lista presentes, a tiempo y tardanzas', () => {
    expect(buildSummaryList('present', base)).toHaveLength(3)
    expect(buildSummaryList('onTime', base).map((r) => r.student.id)).toEqual(['s1'])
    expect(buildSummaryList('late', base).map((r) => r.student.id)).toEqual(['s2', 's3'])
  })

  it('muestra la hora de la tardanza solo si existe y marca las justificadas', () => {
    const rows = buildSummaryList('late', base)
    expect(rows[0].detail).toBe('Tardanza · 08:10')
    expect(rows[1].detail).toBe('Tardanza · justificada')
  })

  it('ordena por aula y apellido', () => {
    expect(buildSummaryList('students', base).map((r) => r.student.id)).toEqual(['s2', 's1', 's3', 's4'])
  })

  it('respeta el aula elegida', () => {
    const rows = buildSummaryList('students', { ...base, classroomId: 'c2' })
    expect(rows.map((r) => r.student.id)).toEqual(['s3', 's4'])
  })

  it('en sin ingreso distingue falta, justificada, permiso y sin marcar', () => {
    const absences: AbsenceRecord[] = [
      { id: 'a1', studentId: 's4', classroomId: 'c2', date: DAY, status: 'UNJUSTIFIED', justificationReason: null, justificationDocument: null, justifiedByName: null, justifiedAt: null },
    ]
    const rows = buildSummaryList('absent', { ...base, attendance: [rec('s1', 'ON_TIME')], absences })
    const byId = Object.fromEntries(rows.map((r) => [r.student.id, r.detail]))
    expect(byId).toEqual({ s2: 'Sin marcar', s3: 'Sin marcar', s4: 'Falta' })

    const permissions: StudentPermission[] = [{ id: 'p', studentId: 's2', dateFrom: DAY, dateTo: DAY, kind: 'ABSENCE', reason: 'Cita médica', documentPath: null, createdByName: null }]
    const withPermission = buildSummaryList('absent', { ...base, attendance: [rec('s1', 'ON_TIME')], absences, permissions })
    expect(withPermission.find((r) => r.student.id === 's2')?.detail).toBe('Con permiso: Cita médica')
  })

  it('incidencias: solo incumplimientos del día con sus motivos', () => {
    const rows = buildSummaryList('incidents', { ...base, presentation: [presentation('s1', 'NON_COMPLIANT', { hairstyleViolation: true }), presentation('s2', 'COMPLIANT')] })
    expect(rows).toHaveLength(1)
    expect(rows[0].detail).toBe('Peinado')
  })

  it('notificaciones: ignora anuladas y de otros días', () => {
    const notification = (id: string, studentId: string, extra: Partial<NotificationRecord> = {}): NotificationRecord => ({
      id, studentId, presentationControlId: null, attendanceId: null, notificationNumber: 2, notificationType: 'LATE_ENTRY', observation: '', date: DAY, generatedAt: '', voided: false, voidedReason: null, ...extra,
    })
    const rows = buildSummaryList('notifications', { ...base, notifications: [notification('n1', 's1'), notification('n2', 's2', { voided: true }), notification('n3', 's3', { date: '2026-10-20' })] })
    expect(rows.map((r) => r.detail)).toEqual(['Tardanza · n.º 2'])
  })
})
