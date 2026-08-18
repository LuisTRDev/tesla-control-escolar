import { supabase } from '@/lib/supabase'
import { getClassrooms, getStudents } from '@/services/schoolService'
import type { Classroom, Student } from '@/types'

export type AlertType = 'REPEAT_OFFENDER' | 'THIRD_NOTIFICATION' | 'FREQUENT_LATE' | 'ABSENCE'
export type AlertStatus = 'OPEN' | 'RESOLVED'

export type AlertRecord = {
  id: string
  studentId: string
  alertType: AlertType
  message: string
  status: AlertStatus
  sourceTable: string | null
  sourceId: string | null
  createdAt: string
  resolvedAt: string | null
  studentName: string
  classroomId: string
  classroomLabel: string
}

export type DailySummary = {
  totalStudents: number
  present: number
  onTime: number
  late: number
  absent: number
  incidents: number
  notifications: number
  openAlerts: number
}

export type SmartInsight = {
  id: string
  tone: 'positive' | 'warning' | 'info'
  title: string
  detail: string
  value?: string
}

export type AuditLogRecord = {
  id: string
  userId: string | null
  action: string
  entityType: string
  entityId: string | null
  details: Record<string, unknown> | null
  createdAt: string
}

export type StudentCaseFile = {
  student: Record<string, unknown> | null
  attendance: Array<Record<string, unknown>>
  presentation: Array<Record<string, unknown>>
  notifications: Array<Record<string, unknown>>
  alerts: Array<Record<string, unknown>>
  violationsByControl: Record<string, string[]>
}

function n(value: unknown) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function localIsoDate(date: Date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function shiftDays(date: Date, amount: number) {
  const copy = new Date(date)
  copy.setDate(copy.getDate() + amount)
  return copy
}

function classroomLabel(classroom?: Classroom) {
  return classroom ? `${classroom.grade} ${classroom.section} · ${classroom.level}` : 'Sin aula'
}

export async function getAlerts(params?: {
  status?: AlertStatus | 'ALL'
  classroomId?: string | null
}): Promise<AlertRecord[]> {
  const status = params?.status ?? 'OPEN'
  const [students, classrooms] = await Promise.all([getStudents(), getClassrooms()])
  const studentMap = new Map(students.map((item) => [item.id, item]))
  const classroomMap = new Map(classrooms.map((item) => [item.id, item]))

  let query = supabase
    .from('alerts')
    .select('id, student_id, alert_type, message, status, source_table, source_id, created_at, resolved_at')
    .order('created_at', { ascending: false })

  if (status !== 'ALL') query = query.eq('status', status)

  const { data, error } = await query
  if (error) throw error

  return (data ?? [])
    .map((row: Record<string, any>) => {
      const student = studentMap.get(String(row.student_id))
      const classroom = student ? classroomMap.get(student.classroomId) : undefined
      return {
        id: String(row.id),
        studentId: String(row.student_id),
        alertType: row.alert_type as AlertType,
        message: String(row.message ?? ''),
        status: row.status as AlertStatus,
        sourceTable: row.source_table == null ? null : String(row.source_table),
        sourceId: row.source_id == null ? null : String(row.source_id),
        createdAt: String(row.created_at),
        resolvedAt: row.resolved_at == null ? null : String(row.resolved_at),
        studentName: student ? `${student.firstName} ${student.lastName}` : `Alumno #${row.student_id}`,
        classroomId: student?.classroomId ?? '',
        classroomLabel: classroomLabel(classroom),
      } satisfies AlertRecord
    })
    .filter((row: AlertRecord) => !params?.classroomId || row.classroomId === params.classroomId)
}

export async function resolveAlert(alertId: string): Promise<void> {
  const { error } = await supabase
    .from('alerts')
    .update({ status: 'RESOLVED', resolved_at: new Date().toISOString() })
    .eq('id', Number(alertId))
  if (error) throw error
}

export async function getDailySchoolSummary(date: string, classroomId: string | null): Promise<DailySummary> {
  const { data, error } = await supabase.rpc('get_daily_school_summary', {
    p_date: date,
    p_classroom_id: classroomId ? Number(classroomId) : null,
  })
  if (error) throw error
  const row = Array.isArray(data) ? data[0] : data
  return {
    totalStudents: n(row?.total_students),
    present: n(row?.present),
    onTime: n(row?.on_time),
    late: n(row?.late),
    absent: n(row?.absent),
    incidents: n(row?.incidents),
    notifications: n(row?.notifications),
    openAlerts: n(row?.open_alerts),
  }
}

export async function isAttendanceClosed(classroomId: string, date: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('attendance_closures')
    .select('id')
    .eq('classroom_id', Number(classroomId))
    .eq('date', date)
    .maybeSingle()
  if (error) throw error
  return Boolean(data)
}

export async function closeClassroomAttendance(classroomId: string, date: string): Promise<void> {
  const { error } = await supabase.rpc('close_classroom_attendance', {
    p_classroom_id: Number(classroomId),
    p_date: date,
  })
  if (error) throw error
}

export async function getStudentCaseFile(studentId: string): Promise<StudentCaseFile> {
  const { data, error } = await supabase.rpc('get_student_case_file', {
    p_student_id: Number(studentId),
  })
  if (error) throw error

  const raw = (data ?? {}) as Record<string, unknown>
  const presentation = Array.isArray(raw.presentation) ? raw.presentation as Array<Record<string, unknown>> : []
  const controlIds = presentation.map((row: Record<string, any>) => Number(row.id)).filter(Number.isFinite)
  const violationsByControl: Record<string, string[]> = {}

  if (controlIds.length) {
    const { data: violationRows, error: violationError } = await supabase
      .from('presentation_violations')
      .select('presentation_control_id, violation_type')
      .in('presentation_control_id', controlIds)
    if (violationError) throw violationError
    for (const row of violationRows ?? []) {
      const key = String(row.presentation_control_id)
      ;(violationsByControl[key] ??= []).push(String(row.violation_type))
    }
  }

  return {
    student: raw.student && typeof raw.student === 'object' ? raw.student as Record<string, unknown> : null,
    attendance: Array.isArray(raw.attendance) ? raw.attendance as Array<Record<string, unknown>> : [],
    presentation,
    notifications: Array.isArray(raw.notifications) ? raw.notifications as Array<Record<string, unknown>> : [],
    alerts: Array.isArray(raw.alerts) ? raw.alerts as Array<Record<string, unknown>> : [],
    violationsByControl,
  }
}

export async function getAuditLogs(limit = 100): Promise<AuditLogRecord[]> {
  const { data, error } = await supabase
    .from('audit_logs')
    .select('id, user_id, action, entity_type, entity_id, details, created_at')
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  return (data ?? []).map((row: Record<string, any>) => ({
    id: String(row.id),
    userId: row.user_id == null ? null : String(row.user_id),
    action: String(row.action ?? ''),
    entityType: String(row.entity_type ?? ''),
    entityId: row.entity_id == null ? null : String(row.entity_id),
    details: row.details && typeof row.details === 'object' ? row.details as Record<string, unknown> : null,
    createdAt: String(row.created_at),
  }))
}

function percentChange(current: number, previous: number) {
  if (previous === 0) return current === 0 ? 0 : 100
  return Math.round(((current - previous) / previous) * 100)
}

export async function getSmartInsights(classroomId: string | null): Promise<SmartInsight[]> {
  const now = new Date()
  const currentFrom = localIsoDate(shiftDays(now, -6))
  const currentTo = localIsoDate(now)
  const previousFrom = localIsoDate(shiftDays(now, -13))
  const previousTo = localIsoDate(shiftDays(now, -7))

  const studentsResult = await supabase.from('students').select('id, classroom_id')
  if (studentsResult.error) throw studentsResult.error
  const studentIds = (studentsResult.data ?? [])
    .filter((row: Record<string, any>) => !classroomId || String(row.classroom_id) === classroomId)
    .map((row: Record<string, any>) => Number(row.id))

  if (!studentIds.length) return [{ id: 'empty', tone: 'info', title: 'Sin alumnos', detail: 'No hay alumnos para analizar en este alcance.' }]

  const [attendanceResult, presentationResult, alertsResult] = await Promise.all([
    supabase.from('attendance').select('student_id, date, status').in('student_id', studentIds).gte('date', previousFrom).lte('date', currentTo),
    supabase.from('presentation_controls').select('student_id, date, status').in('student_id', studentIds).gte('date', previousFrom).lte('date', currentTo),
    supabase.from('alerts').select('student_id, status, alert_type').in('student_id', studentIds).eq('status', 'OPEN'),
  ])
  if (attendanceResult.error) throw attendanceResult.error
  if (presentationResult.error) throw presentationResult.error
  if (alertsResult.error) throw alertsResult.error

  const attendance = attendanceResult.data ?? []
  const presentation = presentationResult.data ?? []
  const alerts = alertsResult.data ?? []

  const between = (value: string, from: string, to: string) => value >= from && value <= to
  const currentLate = attendance.filter((row: Record<string, any>) => row.status === 'LATE' && between(row.date, currentFrom, currentTo)).length
  const previousLate = attendance.filter((row: Record<string, any>) => row.status === 'LATE' && between(row.date, previousFrom, previousTo)).length
  const currentIncidents = presentation.filter((row: Record<string, any>) => row.status === 'NON_COMPLIANT' && between(row.date, currentFrom, currentTo)).length
  const previousIncidents = presentation.filter((row: Record<string, any>) => row.status === 'NON_COMPLIANT' && between(row.date, previousFrom, previousTo)).length
  const lateDelta = percentChange(currentLate, previousLate)
  const incidentDelta = percentChange(currentIncidents, previousIncidents)

  const insights: SmartInsight[] = []
  insights.push({
    id: 'lates',
    tone: lateDelta > 10 ? 'warning' : lateDelta < 0 ? 'positive' : 'info',
    title: lateDelta > 0 ? 'Tardanzas en aumento' : lateDelta < 0 ? 'Mejora en puntualidad' : 'Tardanzas estables',
    detail: `${currentLate} tardanzas en los últimos 7 días frente a ${previousLate} en los 7 días anteriores.`,
    value: `${lateDelta > 0 ? '+' : ''}${lateDelta}%`,
  })
  insights.push({
    id: 'incidents',
    tone: incidentDelta > 10 ? 'warning' : incidentDelta < 0 ? 'positive' : 'info',
    title: incidentDelta > 0 ? 'Incidencias en aumento' : incidentDelta < 0 ? 'Menos incidencias' : 'Incidencias estables',
    detail: `${currentIncidents} incidencias en los últimos 7 días frente a ${previousIncidents} en el periodo anterior.`,
    value: `${incidentDelta > 0 ? '+' : ''}${incidentDelta}%`,
  })
  insights.push({
    id: 'alerts',
    tone: alerts.length ? 'warning' : 'positive',
    title: alerts.length ? 'Atención requerida' : 'Sin alertas pendientes',
    detail: alerts.length ? `${alerts.length} alertas abiertas requieren revisión.` : 'No hay reglas automáticas pendientes de atención.',
    value: String(alerts.length),
  })
  return insights
}

export function findStudent(students: Student[], studentId: string) {
  return students.find((student) => student.id === studentId)
}
