import { supabase } from '@/lib/supabase'
import type { AttendanceRecord, NotificationRecord, NotificationType, PresentationRecord } from '@/types'

type DbNotification = {
  id: number | string
  student_id: number | string
  presentation_control_id: number | string | null
  attendance_id: number | string | null
  notification_number: number
  notification_type: NotificationType | null
  observation: string | null
  date: string
  generated_at: string
}

const SELECT_FIELDS = 'id, student_id, presentation_control_id, attendance_id, notification_number, notification_type, observation, date, generated_at'

function mapNotification(row: DbNotification): NotificationRecord {
  return {
    id: String(row.id),
    studentId: String(row.student_id),
    presentationControlId: row.presentation_control_id == null ? null : String(row.presentation_control_id),
    attendanceId: row.attendance_id == null ? null : String(row.attendance_id),
    notificationNumber: Math.max(1, Number(row.notification_number) || 1),
    notificationType: row.notification_type ?? 'PRESENTATION',
    observation: row.observation ?? '',
    date: row.date,
    generatedAt: row.generated_at,
  }
}

export async function getNotifications(): Promise<NotificationRecord[]> {
  const { data, error } = await supabase
    .from('notifications')
    .select(SELECT_FIELDS)
    .order('date', { ascending: false })
    .order('generated_at', { ascending: false })

  if (error) throw error
  return ((data ?? []) as DbNotification[]).map(mapNotification)
}

export async function getStudentNotifications(studentId: string): Promise<NotificationRecord[]> {
  const { data, error } = await supabase
    .from('notifications')
    .select(SELECT_FIELDS)
    .eq('student_id', Number(studentId))
    .order('notification_number', { ascending: false })
    .order('generated_at', { ascending: false })

  if (error) throw error
  return ((data ?? []) as DbNotification[]).map(mapNotification)
}

async function getExistingByPresentation(presentationControlId: string): Promise<NotificationRecord | null> {
  const { data, error } = await supabase
    .from('notifications')
    .select(SELECT_FIELDS)
    .eq('presentation_control_id', Number(presentationControlId))
    .maybeSingle()
  if (error) throw error
  return data ? mapNotification(data as DbNotification) : null
}

async function getExistingByAttendance(attendanceId: string): Promise<NotificationRecord | null> {
  const { data, error } = await supabase
    .from('notifications')
    .select(SELECT_FIELDS)
    .eq('attendance_id', Number(attendanceId))
    .maybeSingle()
  if (error) throw error
  return data ? mapNotification(data as DbNotification) : null
}

export async function getNextNotificationNumber(studentId: string): Promise<number> {
  const { data, error } = await supabase
    .from('notifications')
    .select('notification_number')
    .eq('student_id', Number(studentId))
    .order('notification_number', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) throw error
  return Math.max(1, Number(data?.notification_number ?? 0) + 1)
}

function getPresentationNotificationType(record: PresentationRecord): NotificationType {
  const presentationReasons = record.hairstyleViolation || record.uniformUsageViolation || record.nonInstitutionalGarment
  if (!presentationReasons && record.inappropriateConductViolation) return 'INAPPROPRIATE_CONDUCT'
  if (!presentationReasons && !record.inappropriateConductViolation && record.lateEntryViolation) return 'LATE_ENTRY'
  return 'PRESENTATION'
}

/** Una sola notificación por control de reglamento. */
export async function ensureNotificationForPresentation(record: PresentationRecord): Promise<NotificationRecord> {
  if (!record.id) throw new Error('El control de reglamento no tiene un id persistido.')
  if (record.status !== 'NON_COMPLIANT') throw new Error('Solo se generan notificaciones para incumplimientos.')

  const existing = await getExistingByPresentation(record.id)
  if (existing) return existing

  const notificationNumber = await getNextNotificationNumber(record.studentId)
  const { data, error } = await supabase
    .from('notifications')
    .insert({
      student_id: Number(record.studentId),
      presentation_control_id: Number(record.id),
      attendance_id: null,
      notification_number: notificationNumber,
      notification_type: getPresentationNotificationType(record),
      observation: record.observation.trim() || null,
      date: record.date,
    })
    .select(SELECT_FIELDS)
    .single()

  if (error) {
    if (error.code === '23505') {
      const duplicate = await getExistingByPresentation(record.id)
      if (duplicate) return duplicate
    }
    throw error
  }

  return mapNotification(data as DbNotification)
}

/** Permite generar la nueva ficha oficial únicamente por tardanza. */
export async function ensureNotificationForLateAttendance(record: AttendanceRecord): Promise<NotificationRecord> {
  if (!record.id) throw new Error('La asistencia no tiene un id persistido.')
  if (record.status !== 'LATE') throw new Error('La asistencia no corresponde a una tardanza.')

  const existing = await getExistingByAttendance(record.id)
  if (existing) return existing

  const notificationNumber = await getNextNotificationNumber(record.studentId)
  const observation = `Tardanza en el ingreso. Hora registrada: ${record.time}.`
  const { data, error } = await supabase
    .from('notifications')
    .insert({
      student_id: Number(record.studentId),
      presentation_control_id: null,
      attendance_id: Number(record.id),
      notification_number: notificationNumber,
      notification_type: 'LATE_ENTRY',
      observation,
      date: record.date,
    })
    .select(SELECT_FIELDS)
    .single()

  if (error) {
    if (error.code === '23505') {
      const duplicate = await getExistingByAttendance(record.id)
      if (duplicate) return duplicate
    }
    throw error
  }

  return mapNotification(data as DbNotification)
}

export function getNotificationLabel(number: number): string {
  if (number === 1) return 'Primera notificación'
  if (number === 2) return 'Segunda notificación'
  if (number === 3) return 'Tercera notificación / citación'
  return `Notificación N° ${number} · seguimiento`
}
