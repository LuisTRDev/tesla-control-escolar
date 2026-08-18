import { supabase } from '@/lib/supabase'
import type { NotificationRecord, PresentationRecord } from '@/types'

type DbNotification = {
  id: number | string
  student_id: number | string
  presentation_control_id: number | string
  notification_number: number
  date: string
  generated_at: string
}

function mapNotification(row: DbNotification): NotificationRecord {
  const rawNumber = Number(row.notification_number)
  const notificationNumber = Math.min(3, Math.max(1, rawNumber)) as 1 | 2 | 3
  return {
    id: String(row.id),
    studentId: String(row.student_id),
    presentationControlId: String(row.presentation_control_id),
    notificationNumber,
    date: row.date,
    generatedAt: row.generated_at,
  }
}

export async function getNotifications(): Promise<NotificationRecord[]> {
  const { data, error } = await supabase
    .from('notifications')
    .select('id, student_id, presentation_control_id, notification_number, date, generated_at')
    .order('date', { ascending: false })
    .order('generated_at', { ascending: false })

  if (error) throw error
  return ((data ?? []) as DbNotification[]).map(mapNotification)
}

export async function getStudentNotifications(studentId: string): Promise<NotificationRecord[]> {
  const { data, error } = await supabase
    .from('notifications')
    .select('id, student_id, presentation_control_id, notification_number, date, generated_at')
    .eq('student_id', Number(studentId))
    .order('date', { ascending: false })
    .order('generated_at', { ascending: false })

  if (error) throw error
  return ((data ?? []) as DbNotification[]).map(mapNotification)
}

async function getExistingNotification(presentationControlId: string): Promise<NotificationRecord | null> {
  const { data, error } = await supabase
    .from('notifications')
    .select('id, student_id, presentation_control_id, notification_number, date, generated_at')
    .eq('presentation_control_id', Number(presentationControlId))
    .maybeSingle()

  if (error) throw error
  return data ? mapNotification(data as DbNotification) : null
}

export async function getNextNotificationNumber(studentId: string): Promise<1 | 2 | 3> {
  const { count, error } = await supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('student_id', Number(studentId))

  if (error) throw error
  return Math.min((count ?? 0) + 1, 3) as 1 | 2 | 3
}

/**
 * Garantiza una sola notificación por control de presentación.
 * Si el usuario vuelve a editar el mismo control, devuelve la notificación ya existente
 * y no incrementa nuevamente la reincidencia.
 */
export async function ensureNotificationForPresentation(record: PresentationRecord): Promise<NotificationRecord> {
  if (!record.id) throw new Error('El control de presentación no tiene un id persistido.')
  if (record.status !== 'NON_COMPLIANT') throw new Error('Solo se generan notificaciones para incumplimientos.')

  const existing = await getExistingNotification(record.id)
  if (existing) return existing

  const notificationNumber = await getNextNotificationNumber(record.studentId)
  const { data, error } = await supabase
    .from('notifications')
    .insert({
      student_id: Number(record.studentId),
      presentation_control_id: Number(record.id),
      notification_number: notificationNumber,
      date: record.date,
    })
    .select('id, student_id, presentation_control_id, notification_number, date, generated_at')
    .single()

  if (error) {
    // Si dos acciones intentaron crear la misma notificación casi al mismo tiempo,
    // la restricción UNIQUE(presentation_control_id) gana. Recuperamos la ya creada.
    if (error.code === '23505') {
      const duplicate = await getExistingNotification(record.id)
      if (duplicate) return duplicate
    }
    throw error
  }

  return mapNotification(data as DbNotification)
}

export function getNotificationLabel(number: 1 | 2 | 3): string {
  if (number === 1) return 'Primera notificación'
  if (number === 2) return 'Segunda notificación'
  return 'Tercera notificación / citación'
}
