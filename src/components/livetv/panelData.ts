import type { AttendanceRecord, Classroom, PresentationRecord, Student } from '@/types'

export type IncidentEvent = {
  key: string
  studentId: string
  time: string
  labels: string[]
  severity: 'late' | 'presentation' | 'conduct'
}

const LEVELS: Classroom['level'][] = ['Primaria', 'Secundaria']

/** En primaria se dice "grado" y en secundaria "año" (salvo que el aula ya lo diga). */
export function gradeLabel(level: Classroom['level'], grade: string) {
  if (/grado|año/i.test(grade)) return grade
  return `${grade} ${level === 'Primaria' ? 'grado' : 'año'}`
}

export type LateRow = { record: AttendanceRecord; student: Student; classroom: Classroom }
export type LateLevelGroup = { level: Classroom['level']; total: number; grades: Array<{ grade: string; rows: LateRow[] }> }

function presentationLabels(record: PresentationRecord, attendanceLate: boolean) {
  const labels: string[] = []
  if (record.hairstyleViolation) labels.push('Peinado')
  if (record.uniformUsageViolation) labels.push('Uniforme incompleto')
  if (record.nonInstitutionalGarment) labels.push('Prenda no correspondiente')
  if (record.lateEntryViolation && !attendanceLate) labels.push('Tardanza')
  if (record.inappropriateConductViolation) labels.push('Conducta inapropiada')
  return labels
}

export type PanelInput = {
  students: Student[]
  classrooms: Classroom[]
  attendanceRecords: AttendanceRecord[]
  presentationRecords: PresentationRecord[]
  today: string
}

/** Todo lo que muestran las tarjetas del panel, calculado a partir de los datos del día. Sin React: se puede probar. */
export function buildPanelData({ students, classrooms, attendanceRecords, presentationRecords, today }: PanelInput) {
  const todayAttendance = attendanceRecords.filter((record) => record.date === today)
  const todayPresentation = presentationRecords.filter((record) => record.date === today && record.status === 'NON_COMPLIANT')
  const attendanceByStudent = new Map(todayAttendance.map((record) => [record.studentId, record]))
  const studentById = new Map(students.map((student) => [student.id, student]))
  const classroomById = new Map(classrooms.map((classroom) => [classroom.id, classroom]))
  const enteredStudentIds = new Set(todayAttendance.map((record) => record.studentId))

  const incidents: IncidentEvent[] = []
  for (const attendance of todayAttendance) {
    if (attendance.status !== 'LATE') continue
    incidents.push({ key: `late-${attendance.id ?? attendance.studentId}`, studentId: attendance.studentId, time: attendance.time, labels: ['Tardanza'], severity: 'late' })
  }
  for (const record of todayPresentation) {
    const attendanceLate = attendanceByStudent.get(record.studentId)?.status === 'LATE'
    const labels = presentationLabels(record, attendanceLate)
    if (labels.length === 0) continue
    incidents.push({ key: `presentation-${record.id ?? `${record.studentId}-${record.checkedAt}`}`, studentId: record.studentId, time: record.checkedAt || '00:00', labels, severity: record.inappropriateConductViolation ? 'conduct' : 'presentation' })
  }
  incidents.sort((a, b) => b.time.localeCompare(a.time))

  const typeCounts = new Map<string, number>()
  const studentCounts = new Map<string, number>()
  const classroomCounts = new Map<string, number>()
  let totalIncidents = 0
  for (const event of incidents) {
    for (const label of event.labels) {
      typeCounts.set(label, (typeCounts.get(label) ?? 0) + 1)
      totalIncidents += 1
    }
    studentCounts.set(event.studentId, (studentCounts.get(event.studentId) ?? 0) + event.labels.length)
    const classroomId = studentById.get(event.studentId)?.classroomId
    if (classroomId) classroomCounts.set(classroomId, (classroomCounts.get(classroomId) ?? 0) + event.labels.length)
  }

  const topTypes = [...typeCounts.entries()].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label)).slice(0, 6)
  const topStudents = [...studentCounts.entries()].map(([studentId, count]) => ({ student: studentById.get(studentId), count })).filter((item): item is { student: Student; count: number } => Boolean(item.student)).sort((a, b) => b.count - a.count || a.student.lastName.localeCompare(b.student.lastName)).slice(0, 8)

  const recentEntries = [...todayAttendance]
    .sort((a, b) => b.time.localeCompare(a.time))
    .slice(0, 10)
    .map((record) => ({ record, student: studentById.get(record.studentId) }))
    .filter((item): item is { record: AttendanceRecord; student: Student } => Boolean(item.student))

  const lateStudents = [...todayAttendance]
    .filter((record) => record.status === 'LATE')
    .sort((a, b) => a.time.localeCompare(b.time))
    .map((record) => ({ record, student: studentById.get(record.studentId) }))
    .filter((item): item is { record: AttendanceRecord; student: Student } => Boolean(item.student))

  // Tardanzas del día: primaria y secundaria por separado, por grado (y aula dentro del grado).
  const lateByLevel: LateLevelGroup[] = LEVELS.map((level) => {
    const byGrade = new Map<string, LateRow[]>()
    for (const { record, student } of lateStudents) {
      const classroom = classroomById.get(student.classroomId)
      if (!classroom || classroom.level !== level) continue
      byGrade.set(classroom.grade, [...(byGrade.get(classroom.grade) ?? []), { record, student, classroom }])
    }
    const grades = [...byGrade.entries()]
      .sort(([a], [b]) => a.localeCompare(b, 'es', { numeric: true }))
      .map(([grade, rows]) => ({
        grade,
        rows: rows.sort((a, b) => a.classroom.section.localeCompare(b.classroom.section, 'es') || `${a.student.lastName} ${a.student.firstName}`.localeCompare(`${b.student.lastName} ${b.student.firstName}`, 'es')),
      }))
    return { level, total: grades.reduce((sum, item) => sum + item.rows.length, 0), grades }
  })

  const pendingStudents = students
    .filter((student) => !enteredStudentIds.has(student.id))
    .map((student) => ({ student, classroom: classroomById.get(student.classroomId) }))
    .sort((a, b) => `${a.student.lastName} ${a.student.firstName}`.localeCompare(`${b.student.lastName} ${b.student.firstName}`))

  const enrichedIncidents = incidents.slice(0, 18).map((event) => {
    const student = studentById.get(event.studentId)
    const classroom = student ? classroomById.get(student.classroomId) : undefined
    return { ...event, student, classroom }
  }).filter((item): item is IncidentEvent & { student: Student; classroom: Classroom | undefined } => Boolean(item.student))

  const onTime = todayAttendance.filter((record) => record.status === 'ON_TIME').length
  const late = todayAttendance.filter((record) => record.status === 'LATE').length
  const entered = enteredStudentIds.size
  const exited = todayAttendance.filter((record) => Boolean(record.exitTime)).length
  const complianceChecked = todayPresentation.length
  const complianceOk = students.length > 0 ? Math.max(0, students.length - complianceChecked) : 0
  const attendancePercentage = students.length ? Math.round((entered / students.length) * 100) : 0
  const presentationPercentage = students.length ? Math.round((complianceOk / students.length) * 100) : 0

  const classroomSummary = classrooms.map((classroom) => {
    const classStudents = students.filter((student) => student.classroomId === classroom.id)
    const classIds = new Set(classStudents.map((student) => student.id))
    const records = todayAttendance.filter((record) => classIds.has(record.studentId))
    const classLate = records.filter((record) => record.status === 'LATE').length
    const classEntered = records.length
    return { classroom, total: classStudents.length, entered: classEntered, late: classLate, pending: Math.max(0, classStudents.length - classEntered) }
  }).sort((a, b) => a.classroom.level.localeCompare(b.classroom.level) || a.classroom.grade.localeCompare(b.classroom.grade) || a.classroom.section.localeCompare(b.classroom.section))

  const incidentsByClassroom = classrooms.map((classroom) => ({ classroom, count: classroomCounts.get(classroom.id) ?? 0 })).sort((a, b) => b.count - a.count || a.classroom.grade.localeCompare(b.classroom.grade)).slice(0, 10)

  return {
    entered, onTime, late, pending: Math.max(0, students.length - entered), exited,
    complianceChecked, complianceOk, attendancePercentage, presentationPercentage,
    totalIncidents, recentEntries, lateStudents, lateByLevel, pendingStudents, enrichedIncidents,
    attendanceByStudent, studentById, incidents,
    topTypes, topStudents, classroomById, classroomSummary, incidentsByClassroom,
  }
}

export type PanelData = ReturnType<typeof buildPanelData>
