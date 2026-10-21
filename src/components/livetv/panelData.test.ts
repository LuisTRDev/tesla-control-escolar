import { describe, expect, it } from 'vitest'
import type { AttendanceRecord, Classroom, PresentationRecord, Student } from '@/types'
import { buildPanelData, gradeLabel } from './panelData'

const TODAY = '2026-10-21'

const classrooms: Classroom[] = [
  { id: 'c1', grade: '1.°', section: 'A', level: 'Primaria', tutorName: '' },
  { id: 'c2', grade: '2.°', section: 'B', level: 'Secundaria', tutorName: '' },
]

const student = (id: string, classroomId: string, firstName = id, lastName = 'Apellido'): Student => ({
  id, firstName, lastName, classroomId, guardianName: '', guardianDni: '', guardianPhone: '',
})

const students = [student('s1', 'c1'), student('s2', 'c2'), student('s3', 'c2')]

const attendance = (studentId: string, status: AttendanceRecord['status'], extra: Partial<AttendanceRecord> = {}): AttendanceRecord => ({
  id: `a-${studentId}`, studentId, date: TODAY, time: '07:55', status, ...extra,
})

const presentation = (studentId: string, status: PresentationRecord['status'], extra: Partial<PresentationRecord> = {}): PresentationRecord => ({
  id: `p-${studentId}`, studentId, date: TODAY, status, observation: '', checkedAt: '08:10',
  hairstyleViolation: false, uniformUsageViolation: false, nonInstitutionalGarment: false, lateEntryViolation: false, inappropriateConductViolation: false,
  ...extra,
})

const build = (attendanceRecords: AttendanceRecord[], presentationRecords: PresentationRecord[] = []) =>
  buildPanelData({ students, classrooms, attendanceRecords, presentationRecords, today: TODAY })

describe('buildPanelData', () => {
  it('cuenta ingresos, tardanzas y pendientes solo del día', () => {
    const data = build([
      attendance('s1', 'LATE'),
      attendance('s2', 'ON_TIME'),
      attendance('s3', 'LATE', { date: '2026-10-20' }),
    ])
    expect(data.entered).toBe(2)
    expect(data.late).toBe(1)
    expect(data.onTime).toBe(1)
    expect(data.pending).toBe(1)
    expect(data.pendingStudents.map((item) => item.student.id)).toEqual(['s3'])
  })

  it('agrupa las tardanzas por nivel y grado', () => {
    const data = build([attendance('s1', 'LATE'), attendance('s2', 'LATE'), attendance('s3', 'LATE')])
    const primaria = data.lateByLevel.find((group) => group.level === 'Primaria')
    const secundaria = data.lateByLevel.find((group) => group.level === 'Secundaria')
    expect(primaria?.total).toBe(1)
    expect(secundaria?.total).toBe(2)
    expect(secundaria?.grades.map((item) => item.grade)).toEqual(['2.°'])
  })

  it('une tardanzas e incidencias de presentación en una sola lista', () => {
    const data = build(
      [attendance('s1', 'LATE'), attendance('s2', 'ON_TIME')],
      [presentation('s2', 'NON_COMPLIANT', { hairstyleViolation: true, uniformUsageViolation: true })],
    )
    expect(data.incidents).toHaveLength(2)
    expect(data.totalIncidents).toBe(3)
    expect(data.topTypes.find((item) => item.label === 'Peinado')?.count).toBe(1)
  })

  it('no repite la tardanza de presentación si el ingreso ya es tardanza', () => {
    const data = build(
      [attendance('s1', 'LATE')],
      [presentation('s1', 'NON_COMPLIANT', { lateEntryViolation: true })],
    )
    expect(data.totalIncidents).toBe(1)
  })
})

describe('gradeLabel', () => {
  it('dice grado en primaria y año en secundaria', () => {
    expect(gradeLabel('Primaria', '3.°')).toBe('3.° grado')
    expect(gradeLabel('Secundaria', '3.°')).toBe('3.° año')
    expect(gradeLabel('Secundaria', '3.° año')).toBe('3.° año')
  })
})
