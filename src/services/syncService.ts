import { supabase } from '@/lib/supabase'
import { trimTime } from '@/lib/dates'
import { addSyncConflict, listPendingOperations, removePendingOperation, setMeta, updatePendingOperation, type SyncQueueItem } from '@/lib/offlineDb'
import { resolveEarliestTime, resolvePresentation, type SyncConflict } from '@/lib/syncConflicts'
import { cleanText, positiveInteger, safeUserMessage, validIsoDate, validTime } from '@/lib/security'
import { ensureNotificationForLateAttendance, ensureNotificationForPresentation } from '@/services/notificationService'
import type { AttendanceRecord, AttendanceStatus, PresentationRecord } from '@/types'

export type SyncResult = { sent: number; failed: number; remaining: number; conflicts: number }

const VIOLATION_LABELS: Record<string, string> = {
  HAIRSTYLE: 'peinado', UNIFORM_INCOMPLETE: 'uniforme', NON_INSTITUTIONAL_GARMENT: 'prenda no institucional',
  LATE_ENTRY: 'tardanza', INAPPROPRIATE_CONDUCT: 'conducta', OTHER: 'otro',
}

function presentationLabel(status: string, violations: string[]) {
  if (status !== 'NON_COMPLIANT') return 'Conforme'
  return violations.length ? `Incidencia: ${violations.map((v) => VIOLATION_LABELS[v] ?? v).join(', ')}` : 'Con incidencia'
}

async function recordConflict(conflict: Omit<SyncConflict, 'id' | 'at'>, counter: { conflicts: number }) {
  counter.conflicts += 1
  await addSyncConflict({ ...conflict, id: crypto.randomUUID(), at: new Date().toISOString() })
}

function validatedAttendance(item: SyncQueueItem) {
  const p = item.payload
  const studentId = positiveInteger(p.studentId, 'Alumno')
  const date = String(p.date ?? '')
  const time = String(p.time ?? '')
  const status = String(p.status ?? '') as AttendanceStatus
  const source = String(p.source ?? 'WEB') as 'WEB' | 'PDA' | 'MANUAL'
  const deviceLabel = cleanText(p.deviceLabel, 120)
  if (!validIsoDate(date)) throw new Error('Fecha de asistencia inválida en la cola local.')
  // Hora vacía = tardanza marcada sin hora.
  if (time ? !validTime(time) : status !== 'LATE') throw new Error('Hora de asistencia inválida en la cola local.')
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

async function syncAttendance(item: SyncQueueItem, counter: { conflicts: number }) {
  const recordInput = validatedAttendance(item)
  const { data: access, error: accessError } = await supabase.from('students').select('access_authorized').eq('id', recordInput.studentId).single()
  if (accessError) throw accessError
  if (access?.access_authorized === false) throw new Error('El alumno quedó NO AUTORIZADO antes de sincronizar la entrada.')

  // Otro dispositivo pudo marcar al mismo alumno mientras este estaba sin conexión:
  // se conserva la hora de llegada más temprana en vez de sobrescribir a ciegas.
  const { data: existing, error: existingError } = await supabase.from('attendance')
    .select('id, entry_time, status').eq('student_id', recordInput.studentId).eq('date', recordInput.date).maybeSingle()
  if (existingError) throw existingError
  if (existing) {
    const remoteTime = trimTime(existing.entry_time)
    const resolution = resolveEarliestTime(remoteTime, recordInput.time)
    if (remoteTime !== recordInput.time) {
      await recordConflict({ kind: 'ENTRY', studentId: String(recordInput.studentId), date: recordInput.date, resolution, localValue: recordInput.time, remoteValue: remoteTime }, counter)
    }
    if (resolution === 'KEEP_REMOTE') return
  }

  const payload = {
    student_id: recordInput.studentId,
    date: recordInput.date,
    entry_time: recordInput.time || null,
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

async function syncExit(item: SyncQueueItem, counter: { conflicts: number }) {
  const input = validatedExit(item)
  const { data: existing, error: existingError } = await supabase.from('attendance')
    .select('id, exit_time').eq('student_id', input.studentId).eq('date', input.date).maybeSingle()
  if (existingError) throw existingError
  if (!existing) throw new Error('No existe una entrada en el servidor para esta salida. Sincroniza primero la entrada o vuelve a marcarla.')
  const remoteExit = trimTime(existing.exit_time)
  if (remoteExit) {
    const resolution = resolveEarliestTime(remoteExit, input.exitTime)
    if (remoteExit !== input.exitTime) {
      await recordConflict({ kind: 'EXIT', studentId: String(input.studentId), date: input.date, resolution, localValue: input.exitTime, remoteValue: remoteExit }, counter)
    }
    if (resolution === 'KEEP_REMOTE') return
  }
  const { data, error } = await supabase.from('attendance')
    .update({ exit_time: input.exitTime, exit_source: input.source, exit_recorded_at: new Date().toISOString() })
    .eq('student_id', input.studentId).eq('date', input.date)
    .select('id').maybeSingle()
  if (error) throw error
  if (!data) throw new Error('No existe una entrada remota para sincronizar esta salida.')
  await logAccessEvent(input.studentId, 'EXIT', input.source, input.deviceLabel)
}

function violationsOf(record: PresentationRecord): string[] {
  return [
    record.hairstyleViolation && 'HAIRSTYLE',
    record.uniformUsageViolation && 'UNIFORM_INCOMPLETE',
    record.nonInstitutionalGarment && 'NON_INSTITUTIONAL_GARMENT',
    record.lateEntryViolation && 'LATE_ENTRY',
    record.inappropriateConductViolation && 'INAPPROPRIATE_CONDUCT',
  ].filter(Boolean) as string[]
}

async function syncPresentation(item: SyncQueueItem, counter: { conflicts: number }) {
  const record = validatedPresentation(item)
  const local = { status: record.status, violations: violationsOf(record), observation: record.observation ?? '' }

  const { data: existing, error: existingError } = await supabase.from('presentation_controls')
    .select('id, status, other_description, presentation_violations(violation_type)')
    .eq('student_id', Number(record.studentId)).eq('date', record.date).maybeSingle()
  if (existingError) throw existingError
  const remote = existing ? {
    status: existing.status as 'COMPLIANT' | 'NON_COMPLIANT',
    violations: ((existing.presentation_violations ?? []) as Array<{ violation_type: string }>).map((v) => v.violation_type),
    observation: existing.other_description ?? '',
  } : null
  const { action, result } = resolvePresentation(remote, local)
  if (remote && action !== 'USE_LOCAL') {
    await recordConflict({
      kind: 'PRESENTATION', studentId: record.studentId, date: record.date, resolution: action,
      localValue: presentationLabel(local.status, local.violations), remoteValue: presentationLabel(remote.status, remote.violations),
    }, counter)
  }
  if (action === 'KEEP_REMOTE') return

  const payload = {
    student_id: Number(record.studentId), date: record.date, status: result.status,
    other_description: result.status === 'NON_COMPLIANT' && result.observation.trim() ? result.observation.trim() : null,
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
  const violations = result.violations
  if (violations.length) {
    const { error } = await supabase.from('presentation_violations').insert(
      violations.map((violation_type) => ({ presentation_control_id: control.id, violation_type })),
    )
    if (error) throw error
  }
  if (result.status === 'NON_COMPLIANT') {
    await ensureNotificationForPresentation({ ...record, status: result.status, observation: result.observation, id: String(control.id) })
  }
}

let running: Promise<SyncResult> | null = null

/**
 * Envía la cola local al servidor. Si ya hay una sincronización en curso, devuelve
 * esa misma (el intervalo, el botón y el panel pueden pedirla a la vez).
 * `onlyIds` reintenta solo esas operaciones (botón "Reintentar" del panel).
 */
export function flushSyncQueue(options: { onlyIds?: string[] } = {}): Promise<SyncResult> {
  if (running) return running
  running = runFlush(options).finally(() => { running = null })
  return running
}

/** Los mensajes propios (new Error('...')) ya son claros; los técnicos se traducen. */
function queueErrorMessage(error: unknown) {
  if (error instanceof Error && !('code' in error)) return cleanText(error.message, 220)
  return safeUserMessage(error, 'La operación pendiente no pudo sincronizarse.').slice(0, 220)
}

async function runFlush({ onlyIds }: { onlyIds?: string[] }): Promise<SyncResult> {
  const all = await listPendingOperations()
  if (!navigator.onLine) return { sent: 0, failed: 0, remaining: all.length, conflicts: 0 }
  const pending = onlyIds ? all.filter((item) => onlyIds.includes(item.id)) : all
  let sent = 0
  let failed = 0
  const counter = { conflicts: 0 }
  for (const item of pending) {
    try {
      if (item.type === 'ATTENDANCE_UPSERT') await syncAttendance(item, counter)
      else if (item.type === 'ATTENDANCE_EXIT_UPSERT') await syncExit(item, counter)
      else if (item.type === 'PRESENTATION_UPSERT') await syncPresentation(item, counter)
      else throw new Error('Tipo de operación local no reconocido.')
      await removePendingOperation(item.id)
      sent += 1
    } catch (error) {
      failed += 1
      await updatePendingOperation({
        ...item,
        retryCount: Math.min(item.retryCount + 1, 999),
        lastError: queueErrorMessage(error),
        lastAttemptAt: new Date().toISOString(),
      })
    }
  }
  const remaining = (await listPendingOperations()).length
  if (remaining === 0) await setMeta('last_sync', new Date().toISOString())
  return { sent, failed, remaining, conflicts: counter.conflicts }
}
