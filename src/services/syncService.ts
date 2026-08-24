import { supabase } from '@/lib/supabase'
import { listPendingOperations, removePendingOperation, setMeta, updatePendingOperation, type SyncQueueItem } from '@/lib/offlineDb'
import { cleanText, positiveInteger, safeUserMessage, validIsoDate, validTime } from '@/lib/security'
import { ensureNotificationForLateAttendance, ensureNotificationForPresentation } from '@/services/notificationService'
import type { AttendanceRecord, AttendanceStatus, PresentationRecord } from '@/types'

export type SyncResult = { sent: number; failed: number; remaining: number }

function trimTime(value?: string | null) { return (value ?? '').slice(0, 5) }

function validatedAttendance(item: SyncQueueItem) {
  const p = item.payload
  const studentId = positiveInteger(p.studentId, 'Alumno')
  const date = String(p.date ?? '')
  const time = String(p.time ?? '')
  const status = String(p.status ?? '') as AttendanceStatus
  const source = String(p.source ?? 'WEB') as 'WEB' | 'PDA' | 'MANUAL'
  const deviceLabel = cleanText(p.deviceLabel, 120)
  if (!validIsoDate(date)) throw new Error('Fecha de asistencia inválida en la cola local.')
  if (!validTime(time)) throw new Error('Hora de asistencia inválida en la cola local.')
  if (status !== 'ON_TIME' && status !== 'LATE') throw new Error('Estado de asistencia inválido en la cola local.')
  return { studentId, date, time: time.slice(0, 5), status, source, deviceLabel }
}

function validatedExit(item: SyncQueueItem) {
  const p = item.payload
  const studentId = positiveInteger(p.studentId, 'Alumno')
  const date = String(p.date ?? '')
  const exitTime = String(p.exitTime ?? '')
  const source = String(p.source ?? 'WEB') as 'WEB' | 'PDA' | 'MANUAL'
  const deviceLabel = cleanText(p.deviceLabel, 120)
  if (!validIsoDate(date)) throw new Error('Fecha de salida inválida en la cola local.')
  if (!validTime(exitTime)) throw new Error('Hora de salida inválida en la cola local.')
  return { studentId, date, exitTime: exitTime.slice(0, 5), source, deviceLabel }
}

function validatedPresentation(item: SyncQueueItem): PresentationRecord {
  const raw = item.payload as Record<string, unknown>
  const studentId = String(positiveInteger(raw.studentId, 'Alumno'))
  const date = String(raw.date ?? '')
  if (!validIsoDate(date)) throw new Error('Fecha de control inválida en la cola local.')
  const status = String(raw.status ?? '')
  if (status !== 'COMPLIANT' && status !== 'NON_COMPLIANT') throw new Error('Estado de control inválido en la cola local.')

  return {
    id: String(raw.id ?? `offline-${studentId}-${date}`),
    studentId,
    date,
    status,
    observation: cleanText(raw.observation, 1200),
    checkedAt: typeof raw.checkedAt === 'string' ? raw.checkedAt : new Date().toISOString(),
    hairstyleViolation: Boolean(raw.hairstyleViolation),
    uniformUsageViolation: Boolean(raw.uniformUsageViolation),
    nonInstitutionalGarment: Boolean(raw.nonInstitutionalGarment),
    lateEntryViolation: Boolean(raw.lateEntryViolation),
    inappropriateConductViolation: Boolean(raw.inappropriateConductViolation),
  }
}

async function logAccessEvent(studentId: number, eventType: 'ENTRY' | 'EXIT', source: string, deviceLabel: string) {
  const { error } = await supabase.from('access_events').insert({
    student_id: studentId, event_type: eventType, source, device_label: deviceLabel || null,
  })
  if (error && import.meta.env.DEV) console.warn('No se pudo registrar access_event al sincronizar', error)
}

async function syncAttendance(item: SyncQueueItem) {
  const recordInput = validatedAttendance(item)
  const { data: access, error: accessError } = await supabase.from('students').select('access_authorized').eq('id', recordInput.studentId).single()
  if (accessError) throw accessError
  if (access?.access_authorized === false) throw new Error('El alumno quedó NO AUTORIZADO antes de sincronizar la entrada.')

  const payload = {
    student_id: recordInput.studentId,
    date: recordInput.date,
    entry_time: recordInput.time,
    status: recordInput.status,
    entry_source: recordInput.source,
    entry_recorded_at: new Date().toISOString(),
  }
  const { data, error } = await supabase
    .from('attendance')
    .upsert(payload, { onConflict: 'student_id,date' })
    .select('id, student_id, date, entry_time, exit_time, status')
    .single()
  if (error) throw error
  const record: AttendanceRecord = {
    id: String(data.id), studentId: String(data.student_id), date: data.date,
    time: trimTime(data.entry_time), exitTime: trimTime(data.exit_time) || undefined, status: data.status,
  }
  await logAccessEvent(recordInput.studentId, 'ENTRY', recordInput.source, recordInput.deviceLabel)
  if (record.status === 'LATE') await ensureNotificationForLateAttendance(record)
}

async function syncExit(item: SyncQueueItem) {
  const input = validatedExit(item)
  const { data, error } = await supabase.from('attendance')
    .update({ exit_time: input.exitTime, exit_source: input.source, exit_recorded_at: new Date().toISOString() })
    .eq('student_id', input.studentId).eq('date', input.date)
    .select('id').maybeSingle()
  if (error) throw error
  if (!data) throw new Error('No existe una entrada remota para sincronizar esta salida.')
  await logAccessEvent(input.studentId, 'EXIT', input.source, input.deviceLabel)
}

async function syncPresentation(item: SyncQueueItem) {
  const record = validatedPresentation(item)
  const payload = {
    student_id: Number(record.studentId), date: record.date, status: record.status,
    other_description: record.status === 'NON_COMPLIANT' && record.observation?.trim() ? record.observation.trim() : null,
    checked_at: record.checkedAt,
  }
  const { data: control, error: controlError } = await supabase
    .from('presentation_controls')
    .upsert(payload, { onConflict: 'student_id,date' })
    .select('id, student_id, date, status, other_description, checked_at')
    .single()
  if (controlError) throw controlError

  const { error: deleteError } = await supabase.from('presentation_violations').delete().eq('presentation_control_id', control.id)
  if (deleteError) throw deleteError
  const violations = [
    record.hairstyleViolation && 'HAIRSTYLE',
    record.uniformUsageViolation && 'UNIFORM_INCOMPLETE',
    record.nonInstitutionalGarment && 'NON_INSTITUTIONAL_GARMENT',
    record.lateEntryViolation && 'LATE_ENTRY',
    record.inappropriateConductViolation && 'INAPPROPRIATE_CONDUCT',
  ].filter(Boolean) as string[]
  if (violations.length) {
    const { error } = await supabase.from('presentation_violations').insert(
      violations.map((violation_type) => ({ presentation_control_id: control.id, violation_type })),
    )
    if (error) throw error
  }
  if (record.status === 'NON_COMPLIANT') {
    await ensureNotificationForPresentation({ ...record, id: String(control.id) })
  }
}

export async function flushSyncQueue(): Promise<SyncResult> {
  if (!navigator.onLine) {
    const pending = await listPendingOperations()
    return { sent: 0, failed: 0, remaining: pending.length }
  }
  const pending = await listPendingOperations()
  let sent = 0
  let failed = 0
  for (const item of pending) {
    try {
      if (item.type === 'ATTENDANCE_UPSERT') await syncAttendance(item)
      else if (item.type === 'ATTENDANCE_EXIT_UPSERT') await syncExit(item)
      else if (item.type === 'PRESENTATION_UPSERT') await syncPresentation(item)
      else throw new Error('Tipo de operación local no reconocido.')
      await removePendingOperation(item.id)
      sent += 1
    } catch (error) {
      failed += 1
      await updatePendingOperation({
        ...item,
        retryCount: Math.min(item.retryCount + 1, 999),
        lastError: safeUserMessage(error, 'La operación pendiente no pudo sincronizarse.').slice(0, 220),
      })
    }
  }
  const remaining = (await listPendingOperations()).length
  if (remaining === 0) await setMeta('last_sync', new Date().toISOString())
  return { sent, failed, remaining }
}
