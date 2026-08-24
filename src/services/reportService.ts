import { jsPDF } from 'jspdf'
import * as XLSX from 'xlsx'
import { supabase } from '@/lib/supabase'
import { spreadsheetSafeObject, spreadsheetSafeText } from '@/lib/csvSecurity'

export type ReportSummary = {
  totalStudents: number
  totalEntries: number
  onTime: number
  late: number
  presentationIncidents: number
  notifications: number
  repeatOffenders: number
}

export type ViolationReportItem = {
  type: string
  label: string
  total: number
}

export type RepeatOffenderItem = {
  studentId: string
  studentName: string
  classroomId: string
  notificationCount: number
}

export type DailyTrendPoint = {
  date: string
  onTime: number
  late: number
  incidents: number
  notifications: number
}

export type AttendanceDetail = {
  studentName: string
  classroom: string
  date: string
  time: string
  status: 'ON_TIME' | 'LATE'
}

export type IncidentDetail = {
  studentName: string
  classroom: string
  date: string
  violations: string
  observation: string
}

export type NotificationDetail = {
  studentName: string
  classroom: string
  date: string
  notificationNumber: number
  notificationType: string
  observation: string
}

export type AdvancedReport = {
  from: string
  to: string
  classroomId: string | null
  summary: ReportSummary
  violations: ViolationReportItem[]
  repeatOffenders: RepeatOffenderItem[]
  dailyTrend: DailyTrendPoint[]
  attendanceDetails: AttendanceDetail[]
  incidentDetails: IncidentDetail[]
  notificationDetails: NotificationDetail[]
}


type DbStudentReport = { id: number | string; classroom_id: number | string; first_name: string; last_name: string }
type DbClassroomReport = { id: number | string; grade: string; section: string; level: string }
type DbAttendanceReport = { student_id: number | string; date: string; entry_time: string | null; status: string }
type DbViolationReport = { violation_type: string }
type DbPresentationReport = { id: number | string; student_id: number | string; date: string; status: string; other_description: string | null; presentation_violations?: DbViolationReport[] | null }
type DbNotificationReport = { student_id: number | string; date: string; notification_number: number | string | null; notification_type: string | null; observation: string | null }

const violationLabels: Record<string, string> = {
  HAIRSTYLE: 'Peinado',
  UNIFORM_INCOMPLETE: 'Uniforme incompleto',
  NON_INSTITUTIONAL_GARMENT: 'Prenda no institucional',
  LATE_ENTRY: 'Tardanza en el ingreso',
  INAPPROPRIATE_CONDUCT: 'Conducta inapropiada',
  OTHER: 'Otro',
}

function n(value: unknown) {
  return Number(value ?? 0)
}

function formatClassroom(grade?: string, section?: string, level?: string) {
  return [grade, section].filter(Boolean).join(' ') + (level ? ` · ${level}` : '')
}

function isoDatesBetween(from: string, to: string) {
  const dates: string[] = []
  const current = new Date(`${from}T12:00:00`)
  const end = new Date(`${to}T12:00:00`)
  while (current <= end) {
    dates.push(current.toISOString().slice(0, 10))
    current.setDate(current.getDate() + 1)
  }
  return dates
}

async function getSummary(from: string, to: string, classroomId: string | null): Promise<ReportSummary> {
  const { data, error } = await supabase.rpc('get_school_report_summary', {
    p_start_date: from,
    p_end_date: to,
    p_classroom_id: classroomId ? Number(classroomId) : null,
  })
  if (error) throw error
  const row = Array.isArray(data) ? data[0] : data
  return {
    totalStudents: n(row?.total_students),
    totalEntries: n(row?.total_entries),
    onTime: n(row?.on_time),
    late: n(row?.late),
    presentationIncidents: n(row?.presentation_incidents),
    notifications: n(row?.notifications),
    repeatOffenders: n(row?.repeat_offenders),
  }
}

async function getViolations(from: string, to: string, classroomId: string | null): Promise<ViolationReportItem[]> {
  const { data, error } = await supabase.rpc('get_violation_report', {
    p_start_date: from,
    p_end_date: to,
    p_classroom_id: classroomId ? Number(classroomId) : null,
  })
  if (error) throw error
  return (data ?? []).map((row: { violation_type: string; total: number | string }) => ({
    type: row.violation_type,
    label: violationLabels[row.violation_type] ?? row.violation_type,
    total: n(row.total),
  }))
}

async function getRepeatOffenders(from: string, to: string, classroomId: string | null): Promise<RepeatOffenderItem[]> {
  const { data, error } = await supabase.rpc('get_repeat_offenders_report', {
    p_start_date: from,
    p_end_date: to,
    p_classroom_id: classroomId ? Number(classroomId) : null,
    p_limit: 10,
  })
  if (error) throw error
  return (data ?? []).map((row: Record<string, unknown>) => ({
    studentId: String(row.student_id ?? ''),
    studentName: String(row.student_name ?? 'Alumno'),
    classroomId: String(row.classroom_id ?? ''),
    notificationCount: n(row.notification_count),
  }))
}

async function getDetails(from: string, to: string, classroomId: string | null) {
  const [studentsRes, classroomsRes, attendanceRes, presentationRes, notificationsRes] = await Promise.all([
    supabase.from('students').select('id, classroom_id, first_name, last_name'),
    supabase.from('classrooms').select('id, grade, section, level'),
    supabase.from('attendance').select('student_id, date, entry_time, status').gte('date', from).lte('date', to).order('date'),
    supabase.from('presentation_controls').select('id, student_id, date, status, other_description, presentation_violations(violation_type)').gte('date', from).lte('date', to).order('date'),
    supabase.from('notifications').select('student_id, date, notification_number, notification_type, observation').gte('date', from).lte('date', to).order('date'),
  ])
  for (const result of [studentsRes, classroomsRes, attendanceRes, presentationRes, notificationsRes]) {
    if (result.error) throw result.error
  }

  const classroomRows = (classroomsRes.data ?? []) as DbClassroomReport[]
  const studentRows = (studentsRes.data ?? []) as DbStudentReport[]
  const attendanceRows = (attendanceRes.data ?? []) as DbAttendanceReport[]
  const presentationRows = (presentationRes.data ?? []) as DbPresentationReport[]
  const notificationRows = (notificationsRes.data ?? []) as DbNotificationReport[]

  const classrooms = new Map(classroomRows.map((row) => [String(row.id), row]))
  const students = new Map(studentRows.map((row) => [String(row.id), row]))
  const allowedStudentIds = new Set(
    studentRows
      .filter((row) => !classroomId || String(row.classroom_id) === classroomId)
      .map((row) => String(row.id)),
  )

  const studentInfo = (studentId: string) => {
    const student = students.get(studentId)
    const classroom = student ? classrooms.get(String(student.classroom_id)) : undefined
    return {
      studentName: student ? `${student.first_name} ${student.last_name}` : 'Alumno',
      classroom: classroom ? formatClassroom(classroom.grade, classroom.section, classroom.level) : 'Sin aula',
    }
  }

  const attendanceDetails: AttendanceDetail[] = attendanceRows
    .filter((row) => allowedStudentIds.has(String(row.student_id)))
    .map((row) => ({
      ...studentInfo(String(row.student_id)),
      date: row.date,
      time: String(row.entry_time ?? '').slice(0, 5),
      status: row.status as 'ON_TIME' | 'LATE',
    }))

  const incidentDetails: IncidentDetail[] = presentationRows
    .filter((row) => row.status === 'NON_COMPLIANT' && allowedStudentIds.has(String(row.student_id)))
    .map((row) => {
      const violationRows = (row.presentation_violations ?? []) as Array<{ violation_type: string }>
      return {
        ...studentInfo(String(row.student_id)),
        date: row.date,
        violations: violationRows.map((item) => violationLabels[item.violation_type] ?? item.violation_type).join(', '),
        observation: row.other_description ?? '',
      }
    })

  const notificationDetails: NotificationDetail[] = notificationRows
    .filter((row) => allowedStudentIds.has(String(row.student_id)))
    .map((row) => ({
      ...studentInfo(String(row.student_id)),
      date: row.date,
      notificationNumber: n(row.notification_number),
      notificationType: String(row.notification_type ?? ''),
      observation: row.observation ?? '',
    }))

  const dates = isoDatesBetween(from, to)
  const dailyTrend: DailyTrendPoint[] = dates.map((date) => ({
    date,
    onTime: attendanceDetails.filter((item) => item.date === date && item.status === 'ON_TIME').length,
    late: attendanceDetails.filter((item) => item.date === date && item.status === 'LATE').length,
    incidents: incidentDetails.filter((item) => item.date === date).length,
    notifications: notificationDetails.filter((item) => item.date === date).length,
  }))

  return { attendanceDetails, incidentDetails, notificationDetails, dailyTrend }
}

export async function getAdvancedReport(from: string, to: string, classroomId: string | null): Promise<AdvancedReport> {
  const [summary, violations, repeatOffenders, details] = await Promise.all([
    getSummary(from, to, classroomId),
    getViolations(from, to, classroomId),
    getRepeatOffenders(from, to, classroomId),
    getDetails(from, to, classroomId),
  ])

  return { from, to, classroomId, summary, violations, repeatOffenders, ...details }
}

function safeFilenamePart(value: string) {
  return value.replace(/[^a-zA-Z0-9-_]/g, '-')
}

export function exportAdvancedReportExcel(report: AdvancedReport) {
  const workbook = XLSX.utils.book_new()
  const summaryRows = [
    ['Reporte Tesla', spreadsheetSafeText(`${report.from} a ${report.to}`)],
    ['Total alumnos', report.summary.totalStudents],
    ['Ingresos', report.summary.totalEntries],
    ['A tiempo', report.summary.onTime],
    ['Tardanzas', report.summary.late],
    ['Incidencias', report.summary.presentationIncidents],
    ['Notificaciones', report.summary.notifications],
    ['Reincidentes', report.summary.repeatOffenders],
  ]
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(summaryRows), 'Resumen')
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(report.attendanceDetails.map((r) => spreadsheetSafeObject({ Alumno: r.studentName, Aula: r.classroom, Fecha: r.date, Hora: r.time, Estado: r.status === 'LATE' ? 'Tardanza' : 'A tiempo' }))), 'Asistencia')
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(report.incidentDetails.map((r) => spreadsheetSafeObject({ Alumno: r.studentName, Aula: r.classroom, Fecha: r.date, Incumplimientos: r.violations, Observacion: r.observation }))), 'Incidencias')
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(report.notificationDetails.map((r) => spreadsheetSafeObject({ Alumno: r.studentName, Aula: r.classroom, Fecha: r.date, Numero: r.notificationNumber, Tipo: r.notificationType, Observacion: r.observation }))), 'Notificaciones')
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(report.repeatOffenders.map((r) => spreadsheetSafeObject({ Alumno: r.studentName, Notificaciones: r.notificationCount }))), 'Reincidencias')
  XLSX.writeFile(workbook, `Reporte-Tesla-${safeFilenamePart(report.from)}-${safeFilenamePart(report.to)}.xlsx`)
}

function addPdfHeader(doc: jsPDF, title: string, subtitle: string) {
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(16)
  doc.text(title, 14, 16)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.text(subtitle, 14, 22)
  doc.setDrawColor(200)
  doc.line(14, 26, 196, 26)
}

export function exportAdvancedReportPdf(report: AdvancedReport) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' })
  addPdfHeader(doc, 'IEPr Nikola Tesla - Reporte avanzado', `Periodo: ${report.from} al ${report.to}`)
  const metrics = [
    ['Total alumnos', report.summary.totalStudents], ['Ingresos', report.summary.totalEntries], ['A tiempo', report.summary.onTime],
    ['Tardanzas', report.summary.late], ['Incidencias', report.summary.presentationIncidents], ['Notificaciones', report.summary.notifications], ['Reincidentes', report.summary.repeatOffenders],
  ] as const
  let y = 34
  doc.setFontSize(9)
  metrics.forEach(([label, value], index) => {
    const col = index % 2
    const row = Math.floor(index / 2)
    const x = 14 + col * 92
    const yy = y + row * 10
    doc.setFont('helvetica', 'bold'); doc.text(label, x, yy)
    doc.setFont('helvetica', 'normal'); doc.text(String(value), x + 55, yy)
  })
  y += 44
  doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.text('Incumplimientos por tipo', 14, y)
  y += 6; doc.setFontSize(8.5)
  report.violations.forEach((item) => { doc.setFont('helvetica', 'normal'); doc.text(item.label, 16, y); doc.text(String(item.total), 110, y); y += 5 })
  y += 5
  doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.text('Alumnos con más reincidencias', 14, y)
  y += 6; doc.setFontSize(8.5)
  report.repeatOffenders.slice(0, 10).forEach((item, index) => { doc.setFont('helvetica', 'normal'); doc.text(`${index + 1}. ${item.studentName}`, 16, y); doc.text(String(item.notificationCount), 150, y); y += 5 })

  doc.addPage()
  addPdfHeader(doc, 'Detalle de asistencia', `${report.from} al ${report.to}`)
  y = 33
  doc.setFontSize(7.5)
  for (const row of report.attendanceDetails) {
    if (y > 282) { doc.addPage(); addPdfHeader(doc, 'Detalle de asistencia', `${report.from} al ${report.to}`); y = 33 }
    doc.text(row.date, 14, y)
    doc.text(row.time, 38, y)
    doc.text(row.status === 'LATE' ? 'Tardanza' : 'A tiempo', 54, y)
    doc.text(row.studentName.slice(0, 42), 82, y)
    doc.text(row.classroom.slice(0, 28), 152, y)
    y += 4.5
  }
  doc.save(`Reporte-Tesla-${safeFilenamePart(report.from)}-${safeFilenamePart(report.to)}.pdf`)
}
