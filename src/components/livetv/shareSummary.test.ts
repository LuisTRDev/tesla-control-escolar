import { describe, expect, it } from 'vitest'
import type { AttendanceRecord, Classroom, Student } from '@/types'
import { buildPanelData } from './panelData'
import { buildSummary, summaryToText } from './shareSummary'

const classrooms: Classroom[] = [
  { id: 'c1', grade: '1.°', section: 'A', level: 'Primaria', tutorName: '' },
  { id: 'c2', grade: '2.°', section: 'B', level: 'Secundaria', tutorName: '' },
]
const students: Student[] = [
  { id: 's1', firstName: 'Luz', lastName: 'Ramos', classroomId: 'c1', guardianName: '', guardianDni: '', guardianPhone: '' },
  { id: 's2', firstName: 'Ana', lastName: 'Vega', classroomId: 'c2', guardianName: '', guardianDni: '', guardianPhone: '' },
  { id: 's3', firstName: 'Leo', lastName: 'Paz', classroomId: 'c2', guardianName: '', guardianDni: '', guardianPhone: '' },
]
const late = (studentId: string, extra: Partial<AttendanceRecord> = {}): AttendanceRecord => ({ id: studentId, studentId, date: '2026-10-21', time: '', status: 'LATE', ...extra })

describe('resumen para compartir', () => {
  const data = buildPanelData({ students, classrooms, attendanceRecords: [late('s1'), late('s2', { justified: true })], presentationRecords: [], today: '2026-10-21' })
  const text = summaryToText(buildSummary(data, students.length, new Date(2026, 9, 21, 8, 5)))

  it('incluye cifras, total con justificadas y la hora', () => {
    expect(text).toContain('Alumnos: 3')
    expect(text).toContain('Tardanzas de hoy:* 2 tardanzas (1 justificada)')
    expect(text).toContain('08:05')
  })

  it('lista por nivel y grado con la sección y marca las justificadas', () => {
    expect(text).toContain('*PRIMARIA* (1)')
    expect(text).toContain('• Ramos, Luz (A)')
    expect(text).toContain('*SECUNDARIA* (1)')
    expect(text).toContain('• Vega, Ana (B) - justificada')
  })

  it('no inventa filas si un nivel no tiene tardanzas', () => {
    const empty = buildPanelData({ students, classrooms, attendanceRecords: [], presentationRecords: [], today: '2026-10-21' })
    expect(summaryToText(buildSummary(empty, 3))).toContain('Sin tardanzas.')
  })
})
