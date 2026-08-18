import { supabase } from '@/lib/supabase'
import { listPendingOperations, removePendingOperation, setMeta, updatePendingOperation, type SyncQueueItem } from '@/lib/offlineDb'
import { ensureNotificationForLateAttendance, ensureNotificationForPresentation } from '@/services/notificationService'
import type { AttendanceRecord, PresentationRecord } from '@/types'

export type SyncResult = { sent: number; failed: number; remaining: number }

function trimTime(value?: string | null) { return (value ?? '').slice(0, 5) }

async function syncAttendance(item: SyncQueueItem) {
  const p = item.payload
  const payload = {
    student_id: Number(p.studentId),
    date: String(p.date),
    entry_time: String(p.time),
    status: String(p.status),
  }
  const { data, error } = await supabase
    .from('attendance')
    .upsert(payload, { onConflict: 'student_id,date' })
    .select('id, student_id, date, entry_time, status')
    .single()
  if (error) throw error
  const record: AttendanceRecord = {
    id: String(data.id), studentId: String(data.student_id), date: data.date,
    time: trimTime(data.entry_time), status: data.status,
  }
  if (record.status === 'LATE') await ensureNotificationForLateAttendance(record)
}

async function syncPresentation(item: SyncQueueItem) {
  const record = item.payload as unknown as PresentationRecord
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
      if (item.type === 'PRESENTATION_UPSERT') await syncPresentation(item)
      await removePendingOperation(item.id)
      sent += 1
    } catch (error) {
      failed += 1
      await updatePendingOperation({
        ...item,
        retryCount: item.retryCount + 1,
        lastError: error instanceof Error ? error.message : 'Error de sincronización',
      })
    }
  }
  const remaining = (await listPendingOperations()).length
  if (remaining === 0) await setMeta('last_sync', new Date().toISOString())
  return { sent, failed, remaining }
}
