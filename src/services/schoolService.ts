import { supabase } from '@/lib/supabase'
import { trimTime } from '@/lib/dates'
import { lateEntryObservation } from '@/lib/displayLabels'
import { enqueueOperation, getSnapshot, listPendingOperations, removePendingOperationFor, setSnapshot } from '@/lib/offlineDb'
import type { AttendanceRecord, AttendanceStatus, Classroom, Guardian, PresentationRecord, Student } from '@/types'
import { fetchAllPages } from '@/lib/paging'
import { isPermanentServerError, NoticeError } from '@/lib/errorMessages'

const DEFAULT_LIMIT = '07:45'
const K = {
  classrooms: 'classrooms', students: 'students', entryLimit: 'entry_limit', tolerance: 'entry_tolerance',
  attendance: (from: string, to: string) => `attendance:${from}:${to}`,
  presentation: (from: string, to: string) => `presentation:${from}:${to}`,
}

const STUDENT_STATUS_COLUMNS = `
        is_active,
        inactive_reason,
        inactive_note,
        inactive_since,`

type DbClassroom = { id: number | string; grade: string; section: string; level: string; tutor_name: string | null }
type DbGuardian = {
  id: number | string
  fullName: string | null
  dni: string | null
  phone: string | null
}
type DbStudentGuardian = {
  relationship: string | null
  is_primary: boolean | null
  guardians: DbGuardian | DbGuardian[] | null
}
type DbStudent = {
  id: number
  classroom_id: number | null
  first_name: string
  last_name: string
  dni: string | null
  access_authorized: boolean | null
  access_note: string | null
  is_active?: boolean | null
  inactive_reason?: string | null
  inactive_note?: string | null
  inactive_since?: string | null
  student_guardians: DbStudentGuardian[] | null
}
type DbAttendance = { id: number | string; student_id: number | string; date: string; entry_time: string; status: AttendanceStatus; exit_time?: string | null; exit_recorded_at?: string | null; exit_recorded_by?: string | null; entry_recorded_at?: string | null; entry_recorded_by?: string | null; entry_source?: string | null; exit_source?: string | null; justified?: boolean | null; justification_reason?: string | null; justification_document?: string | null; justified_by_name?: string | null; justified_at?: string | null }

const ATTENDANCE_COLUMNS = 'id, student_id, date, entry_time, status, exit_time, exit_recorded_at, exit_recorded_by, entry_recorded_at, entry_recorded_by, entry_source, exit_source'
// Columnas de phase14 (tardanza justificada). Si aún no existen, se lee sin ellas.
const JUSTIFICATION_COLUMNS = ', justified, justification_reason, justification_document, justified_by_name, justified_at'

function mapAttendance(row: DbAttendance): AttendanceRecord {
  return {
    id: String(row.id), studentId: String(row.student_id), date: row.date, time: trimTime(row.entry_time), status: row.status,
    exitTime: trimTime(row.exit_time), exitRecordedAt: row.exit_recorded_at ?? null, exitRecordedBy: row.exit_recorded_by ?? null,
    entryRecordedAt: row.entry_recorded_at ?? null, entryRecordedBy: row.entry_recorded_by ?? null,
    entrySource: row.entry_source ?? null, exitSource: row.exit_source ?? null,
    justified: row.justified === true, justificationReason: row.justification_reason ?? null,
    justificationDocument: row.justification_document ?? null, justifiedByName: row.justified_by_name ?? null, justifiedAt: row.justified_at ?? null,
  }
}
type DbViolation = { violation_type: string }
type DbPresentation = { id: number | string; student_id: number | string; date: string; status: 'COMPLIANT' | 'NON_COMPLIANT'; other_description: string | null; checked_at: string | null; presentation_violations?: DbViolation[] | null }

/** Suma minutos a un horario "HH:MM" y devuelve otro "HH:MM" (recorta a 23:59, no da la vuelta al día siguiente). */
function addMinutesToTime(time: string, minutes: number): string {
  const [h, m] = time.split(':').map(Number)
  if (Number.isNaN(h) || Number.isNaN(m) || !minutes) return time
  const total = Math.min(23 * 60 + 59, h * 60 + m + minutes)
  const hh = String(Math.floor(total / 60)).padStart(2, '0')
  const mm = String(total % 60).padStart(2, '0')
  return `${hh}:${mm}`
}
function offlineId(prefix: string, studentId: string, date: string) { return `offline-${prefix}-${studentId}-${date}` }

async function overlayPendingAttendance(base: AttendanceRecord[], from: string, to: string) {
  const pending = await listPendingOperations()
  const merged = [...base]
  for (const item of pending.filter((x) => x.type === 'ATTENDANCE_UPSERT')) {
    const p = item.payload as Record<string, unknown>
    const date = String(p.date ?? '')
    if (date < from || date > to) continue
    const studentId = String(p.studentId ?? '')
    const record: AttendanceRecord = { id: offlineId('attendance', studentId, date), studentId, date, time: String(p.time ?? ''), status: String(p.status ?? 'ON_TIME') as AttendanceStatus, entryRecordedAt: typeof p.entryRecordedAt === 'string' ? p.entryRecordedAt : null }
    const index = merged.findIndex((r) => r.studentId === studentId && r.date === date)
    if (index >= 0) merged[index] = record; else merged.push(record)
  }
  return merged
}

async function overlayPendingPresentation(base: PresentationRecord[], from: string, to: string) {
  const pending = await listPendingOperations()
  const merged = [...base]
  for (const item of pending.filter((x) => x.type === 'PRESENTATION_UPSERT')) {
    const p = item.payload as unknown as PresentationRecord
    if (p.date < from || p.date > to) continue
    const record: PresentationRecord = { ...p, id: offlineId('presentation', p.studentId, p.date) }
    const index = merged.findIndex((r) => r.studentId === p.studentId && r.date === p.date)
    if (index >= 0) merged[index] = record; else merged.push(record)
  }
  return merged
}

export async function getClassrooms(): Promise<Classroom[]> {
  try {
    const { data, error } = await supabase.from('classrooms').select('id, grade, section, level, tutor_name').order('id')
    if (error) throw error
    const mapped = ((data ?? []) as DbClassroom[]).map((row) => ({ id: String(row.id), grade: row.grade, section: row.section, level: row.level as Classroom['level'], tutorName: row.tutor_name ?? 'Sin tutor asignado' }))
    await setSnapshot(K.classrooms, mapped)
    return mapped
  } catch (error) {
    const cached = await getSnapshot<Classroom[]>(K.classrooms)
    if (cached) return cached
    throw error
  }
}

export async function getStudents(): Promise<Student[]> {
  try {
    const select = (statusColumns: string) => supabase
      .from('students')
      .select(`
        id,
        classroom_id,
        first_name,
        last_name,
        dni,
        access_authorized,
        access_note,${statusColumns}
        student_guardians (
          relationship,
          is_primary,
          guardians (
            id,
            fullName:full_name,
            dni,
            phone
          )
        )
      `)
      .order('last_name', { ascending: true })

    let { data, error } = await select(STUDENT_STATUS_COLUMNS)
    // 42703 = columna inexistente: phase10_student_status.sql aún no se ejecutó.
    if (error?.code === '42703') ({ data, error } = await select(''))
    if (error) throw error

    const mapped = ((data ?? []) as unknown as DbStudent[]).map((row) => {
      const relationRows = (row.student_guardians ?? []).map((relation) => {
        const rawGuardian = relation.guardians
        const guardian = Array.isArray(rawGuardian) ? rawGuardian[0] : rawGuardian
        if (!guardian) return null
        return {
          id: String(guardian.id),
          fullName: guardian.fullName ?? '',
          dni: guardian.dni ?? '',
          phone: guardian.phone ?? '',
          relationship: relation.relationship ?? '',
          isPrimary: relation.is_primary === true,
        } satisfies Guardian
      }).filter((item): item is Guardian => item !== null)

      const guardians = [
        ...relationRows.filter((item) => item.isPrimary),
        ...relationRows.filter((item) => !item.isPrimary),
      ]
      const guardian = guardians[0]

      return {
        id: String(row.id),

        firstName: row.first_name ?? '',
        lastName: row.last_name ?? '',

        classroomId:
          row.classroom_id != null
            ? String(row.classroom_id)
            : '',

        dni: row.dni ?? '',

        accessAuthorized:
          row.access_authorized !== false,

        accessNote:
          row.access_note ?? '',

        isActive: row.is_active !== false,
        inactiveReason: row.inactive_reason ?? '',
        inactiveNote: row.inactive_note ?? '',
        inactiveSince: row.inactive_since ?? '',

        guardianName:
          guardian?.fullName ??
          'Sin apoderado registrado',

        guardianDni:
          guardian?.dni ??
          '',

        guardianPhone:
          guardian?.phone ??
          '',

        guardians,
      }
    })

    await setSnapshot(K.students, mapped)

    return mapped
  } catch (error) {
    const cached = await getSnapshot<Student[]>(K.students)

    if (cached) {
      return cached
    }

    throw error
  }
}

export async function getEntryLimit(): Promise<string> {
  try {
    const { data, error } = await supabase.from('school_settings').select('entry_limit_time').order('id').limit(1).maybeSingle()
    if (error) throw error
    const value = trimTime(data?.entry_limit_time) || DEFAULT_LIMIT
    await setSnapshot(K.entryLimit, value)
    return value
  } catch {
    return (await getSnapshot<string>(K.entryLimit)) ?? DEFAULT_LIMIT
  }
}

export type ToleranceSettings = { enabled: boolean; minutes: number }
const DEFAULT_TOLERANCE: ToleranceSettings = { enabled: false, minutes: 0 }

export async function getToleranceSettings(): Promise<ToleranceSettings> {
  try {
    const { data, error } = await supabase
      .from('school_settings')
      .select('tolerance_enabled, tolerance_minutes')
      .order('id')
      .limit(1)
      .maybeSingle()
    if (error) throw error
    const value: ToleranceSettings = {
      enabled: Boolean(data?.tolerance_enabled),
      minutes: Number(data?.tolerance_minutes ?? 0),
    }
    await setSnapshot(K.tolerance, value)
    return value
  } catch {
    return (await getSnapshot<ToleranceSettings>(K.tolerance)) ?? DEFAULT_TOLERANCE
  }
}

export async function saveToleranceSettings(settings: ToleranceSettings): Promise<void> {
  if (!navigator.onLine) throw new Error('La tolerancia solo puede modificarse con conexión a Internet.')
  if (settings.minutes < 0 || settings.minutes > 60) {
    throw new Error('La tolerancia debe estar entre 0 y 60 minutos.')
  }
  const { data: existing, error: readError } = await supabase.from('school_settings').select('id').order('id').limit(1).maybeSingle()
  if (readError) throw readError
  const payload = { tolerance_enabled: settings.enabled, tolerance_minutes: settings.minutes }
  if (existing?.id) {
    const { error } = await supabase.from('school_settings').update(payload).eq('id', existing.id)
    if (error) throw error
  } else {
    const { error } = await supabase.from('school_settings').insert(payload)
    if (error) throw error
  }
  await setSnapshot(K.tolerance, settings)
}

export async function saveEntryLimit(value: string): Promise<void> {
  if (!navigator.onLine) throw new Error('La hora límite solo puede modificarse con conexión a Internet.')
  const { data: existing, error: readError } = await supabase.from('school_settings').select('id').order('id').limit(1).maybeSingle()
  if (readError) throw readError
  if (existing?.id) {
    const { error } = await supabase.from('school_settings').update({ entry_limit_time: value }).eq('id', existing.id)
    if (error) throw error
  } else {
    const { error } = await supabase.from('school_settings').insert({ entry_limit_time: value })
    if (error) throw error
  }
  await setSnapshot(K.entryLimit, value)
}

/**
 * Compara la hora de ingreso contra la hora límite, aplicando la
 * tolerancia en minutos si está activada. Ej: límite 07:45 + tolerancia
 * de 5 min -> el límite real ese día es 07:50; a las 07:46 sigue siendo
 * ON_TIME.
 */
export function calculateStatus(time: string, entryLimit: string, tolerance?: ToleranceSettings): AttendanceStatus {
  // Sin hora = tardanza marcada sin hora (el auxiliar no sabe a qué hora entró).
  if (!time) return 'LATE'
  const effectiveLimit = tolerance?.enabled ? addMinutesToTime(entryLimit, tolerance.minutes) : entryLimit
  return time <= effectiveLimit ? 'ON_TIME' : 'LATE'
}

export async function getAttendanceRange(from: string, to: string): Promise<AttendanceRecord[]> {
  try {
    const select = (columns: string) => fetchAllPages<DbAttendance>((start, end) => supabase.from('attendance').select(columns).gte('date', from).lte('date', to).order('date', { ascending: false }).order('id').range(start, end) as unknown as PromiseLike<{ data: DbAttendance[] | null; error: unknown }>)
    let data: DbAttendance[]
    try { data = await select(ATTENDANCE_COLUMNS + JUSTIFICATION_COLUMNS) }
    catch (error) {
      // Sin phase14 no existen las columnas de justificación: se piden sin ellas.
      if ((error as { code?: string } | null)?.code !== '42703') throw error
      data = await select(ATTENDANCE_COLUMNS)
    }
    const mapped = data.map(mapAttendance)
    await setSnapshot(K.attendance(from, to), mapped)
    return overlayPendingAttendance(mapped, from, to)
  } catch (error) {
    const cached = await getSnapshot<AttendanceRecord[]>(K.attendance(from, to))
    if (cached) return overlayPendingAttendance(cached, from, to)
    throw error
  }
}

/**
 * `lateJustification`: si el alumno tiene permiso de llegar tarde ese día, la
 * tardanza se guarda ya justificada (sin notificación). Sin conexión se guarda
 * como tardanza normal y se puede justificar después.
 */
export async function registerAttendance(studentId: string, entryLimit: string, date: string, time: string, tolerance?: ToleranceSettings, lateJustification?: { reason: string; byName: string }): Promise<AttendanceRecord> {
  const status = calculateStatus(time, entryLimit, tolerance)
  // entryRecordedAt = momento real del toque; se conserva aunque se envíe más tarde.
  const optimistic: AttendanceRecord = { id: offlineId('attendance', studentId, date), studentId, date, time, status, entryRecordedAt: new Date().toISOString() }
  if (!navigator.onLine) {
    await enqueueOperation('ATTENDANCE_UPSERT', optimistic as unknown as Record<string, unknown>)
    return optimistic
  }
  try {
    const justification: { justified?: boolean; justification_reason?: string; justified_by_name?: string; justified_at?: string } = status === 'LATE' && lateJustification
      ? { justified: true, justification_reason: lateJustification.reason, justified_by_name: lateJustification.byName, justified_at: new Date().toISOString() }
      : {}
    const record: Record<string, unknown> = { student_id: Number(studentId), date, entry_time: time || null, status, ...justification }
    const { data, error } = await supabase.from('attendance').upsert(record, { onConflict: 'student_id,date', ignoreDuplicates: true }).select('id, student_id, date, entry_time, status, exit_time, exit_recorded_at, exit_recorded_by, entry_recorded_at, entry_recorded_by, entry_source, exit_source').maybeSingle()
    if (error) throw error
    if (!data) {
      const { data: existing, error: existingError } = await supabase.from('attendance').select('id, student_id, date, entry_time, status, exit_time, exit_recorded_at, exit_recorded_by, entry_recorded_at, entry_recorded_by, entry_source, exit_source').eq('student_id', Number(studentId)).eq('date', date).single()
      if (existingError) throw existingError
      return { id: String(existing.id), studentId: String(existing.student_id), date: existing.date, time: trimTime(existing.entry_time), status: existing.status, exitTime: trimTime(existing.exit_time), exitRecordedAt: existing.exit_recorded_at ?? null, exitRecordedBy: existing.exit_recorded_by ?? null, entryRecordedAt: existing.entry_recorded_at ?? null, entryRecordedBy: existing.entry_recorded_by ?? null, entrySource: existing.entry_source ?? null, exitSource: existing.exit_source ?? null }
    }
    return { ...mapAttendance(data as DbAttendance), justified: justification.justified === true, justificationReason: justification.justification_reason ?? null, justifiedByName: justification.justified_by_name ?? null, justifiedAt: justification.justified_at ?? null }
  } catch (error) {
    // Si el servidor rechazó la marca, guardarla en la cola solo escondería el error.
    if (isPermanentServerError(error)) throw error
    await enqueueOperation('ATTENDANCE_UPSERT', optimistic as unknown as Record<string, unknown>)
    return optimistic
  }
}

/**
 * Marca como ON_TIME a varios alumnos a la vez, usando la hora límite
 * (no la hora real del clic) como hora de ingreso registrada — porque
 * no se conoce el momento exacto en que cada uno entró, solo que fue
 * antes del límite. `ignoreDuplicates: true` protege a cualquier
 * alumno que YA tenga una asistencia registrada hoy (tardanza o a
 * tiempo individual): esos simplemente se ignoran, nunca se
 * sobrescriben.
 */
export async function registerBulkAttendance(studentIds: string[], entryLimit: string, date: string): Promise<AttendanceRecord[]> {
  if (studentIds.length === 0) return []
  const status: AttendanceStatus = 'ON_TIME'

  if (!navigator.onLine) {
    const results: AttendanceRecord[] = []
    for (const studentId of studentIds) {
      const optimistic: AttendanceRecord = { id: offlineId('attendance', studentId, date), studentId, date, time: entryLimit, status, entryRecordedAt: new Date().toISOString() }
      await enqueueOperation('ATTENDANCE_UPSERT', optimistic as unknown as Record<string, unknown>)
      results.push(optimistic)
    }
    return results
  }

  const rows = studentIds.map((studentId) => ({ student_id: Number(studentId), date, entry_time: entryLimit, status }))
  const { data, error } = await supabase
    .from('attendance')
    .upsert(rows, { onConflict: 'student_id,date', ignoreDuplicates: true })
    .select('id, student_id, date, entry_time, status, exit_time, exit_recorded_at, exit_recorded_by, entry_recorded_at, entry_recorded_by, entry_source, exit_source')

  if (error) throw error

  return (data ?? []).map((row) => ({
    id: String(row.id),
    studentId: String(row.student_id),
    date: row.date,
    time: trimTime(row.entry_time),
    status: row.status,
    exitTime: trimTime(row.exit_time),
    exitRecordedAt: row.exit_recorded_at ?? null,
    exitRecordedBy: row.exit_recorded_by ?? null,
    entryRecordedAt: row.entry_recorded_at ?? null,
    entryRecordedBy: row.entry_recorded_by ?? null,
    entrySource: row.entry_source ?? null,
    exitSource: row.exit_source ?? null,
  }))
}

export async function updateAttendanceEntryTime(
  record: AttendanceRecord,
  newTime: string,
  entryLimit: string,
  tolerance?: ToleranceSettings,
): Promise<AttendanceRecord> {
  // Hora vacía = convertir la marca en tardanza sin hora.
  if (newTime && !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(newTime)) {
    throw new Error('La hora de ingreso no es válida.')
  }

  const status = calculateStatus(newTime, entryLimit, tolerance)

  // Marca que aún está en la cola de este equipo: se corrige ahí mismo (funciona sin Internet).
  if (!record.id || record.id.startsWith('offline-')) {
    const pending = (await listPendingOperations()).find((item) => item.type === 'ATTENDANCE_UPSERT'
      && String(item.payload.studentId ?? '') === record.studentId && String(item.payload.date ?? '') === record.date)
    if (!pending) throw new NoticeError('Esta marca ya se envió al servidor. Actualiza la lista y vuelve a corregirla.')
    await enqueueOperation('ATTENDANCE_UPSERT', { ...pending.payload, time: newTime, status })
    return { ...record, time: newTime, status }
  }

  if (!navigator.onLine) {
    throw new NoticeError(
      'La corrección de la hora de ingreso requiere conexión a Internet.',
    )
  }
  const attendanceId = Number(record.id)

  const { data, error } = await supabase
    .from('attendance')
    .update({
      entry_time: newTime || null,
      status,
    })
    .eq('id', attendanceId)
    .select('id, student_id, date, entry_time, status, exit_time, exit_recorded_at, exit_recorded_by, entry_recorded_at, entry_recorded_by, entry_source, exit_source')
    .single()

  if (error) throw error

  const { data: lateNotification, error: notificationLookupError } = await supabase
    .from('notifications')
    .select('id')
    .eq('attendance_id', attendanceId)
    .eq('notification_type', 'LATE_ENTRY')
    .maybeSingle()

  if (notificationLookupError) throw notificationLookupError

  if (status === 'LATE') {
    if (lateNotification?.id) {
      const { error: notificationError } = await supabase
        .from('notifications')
        .update({
          observation: lateEntryObservation(newTime),
        })
        .eq('id', lateNotification.id)

      if (notificationError) throw notificationError
    }
  } else if (lateNotification?.id) {
    const { error: deleteNotificationError } = await supabase
      .from('notifications')
      .delete()
      .eq('id', lateNotification.id)

    if (deleteNotificationError) throw deleteNotificationError
  }

  return {
    id: String(data.id),
    studentId: String(data.student_id),
    date: data.date,
    time: trimTime(data.entry_time),
    status: data.status,
    exitTime: trimTime(data.exit_time),
    exitRecordedAt: data.exit_recorded_at ?? null,
    exitRecordedBy: data.exit_recorded_by ?? null,
    entryRecordedAt: data.entry_recorded_at ?? null,
    entryRecordedBy: data.entry_recorded_by ?? null,
    entrySource: data.entry_source ?? null,
    exitSource: data.exit_source ?? null,
  }
}

export async function registerExitAttendance(record: AttendanceRecord, time: string): Promise<AttendanceRecord> {
  if (!record.id || record.id.startsWith('offline-')) {
    throw new NoticeError('La entrada aún no está sincronizada; espera a que vuelva la conexión antes de marcar la salida.')
  }
  if (!navigator.onLine) throw new Error('La salida requiere conexión a Internet en esta versión.')

  const { data, error } = await supabase
    .from('attendance')
    .update({ exit_time: time, exit_recorded_at: new Date().toISOString(), exit_source: 'PDA' })
    .eq('id', Number(record.id))
    .select('id, student_id, date, entry_time, status, exit_time, exit_recorded_at, exit_recorded_by, entry_recorded_at, entry_recorded_by, entry_source, exit_source')
    .single()

  if (error) throw error
  return {
    id: String(data.id), studentId: String(data.student_id), date: data.date,
    time: trimTime(data.entry_time), status: data.status,
    exitTime: trimTime(data.exit_time), exitRecordedAt: data.exit_recorded_at ?? null,
    exitRecordedBy: data.exit_recorded_by ?? null, entryRecordedAt: data.entry_recorded_at ?? null,
    entryRecordedBy: data.entry_recorded_by ?? null, entrySource: data.entry_source ?? null,
    exitSource: data.exit_source ?? null,
  }
}

export async function recalculateAttendanceForDate(date: string, entryLimit: string): Promise<void> {
  if (!navigator.onLine) return
  const { data, error } = await supabase.from('attendance').select('id, entry_time').eq('date', date)
  if (error) throw error
  // Las tardanzas sin hora no se recalculan: siguen siendo tardanza.
  await Promise.all((data ?? []).filter((row: { entry_time: string | null }) => row.entry_time).map(async (row: { id: number | string; entry_time: string }) => { const status = calculateStatus(trimTime(row.entry_time), entryLimit); const { error: updateError } = await supabase.from('attendance').update({ status }).eq('id', row.id); if (updateError) throw updateError }))
}

/**
 * Quita lo que una marca generó automáticamente: la notificación de tardanza
 * (trigger trg_auto_late_notification) y las alertas que esa notificación
 * disparó. No se confía en el ON DELETE CASCADE porque en producción no
 * siempre está activo (ver phase12_attendance_cleanup.sql).
 */
async function deleteAttendanceTraces(attendanceId: number): Promise<void> {
  const { data: linked, error: findError } = await supabase.from('notifications').select('id, presentation_control_id').eq('attendance_id', attendanceId)
  if (findError) throw findError
  const rows = (linked ?? []) as Array<{ id: number | string; presentation_control_id: number | string | null }>

  // Si la notificación también pertenece a un control de "Revisar normas", es
  // historial propio de ese control: se conserva y solo se desvincula de la marca.
  if (rows.some((row) => row.presentation_control_id != null)) {
    const { error } = await supabase.from('notifications').update({ attendance_id: null })
      .eq('attendance_id', attendanceId).not('presentation_control_id', 'is', null)
    if (error) throw error
  }

  const ids = rows.filter((row) => row.presentation_control_id == null).map((row) => String(row.id))
  if (ids.length === 0) return

  // Las alertas de reincidencia que dejan de cumplirse las quita el trigger
  // trg_delete_alerts_of_notification (phase13): no guardan qué notificación las originó.
  const { error } = await supabase.from('notifications').delete().in('id', ids.map(Number))
  if (error) throw error
}

/**
 * Borra UNA marca de asistencia (deshacer un toque equivocado o corregir un
 * alumno mal marcado) junto con la notificación y alertas que generó, para
 * que no quede rastro en el expediente.
 */
export async function deleteAttendanceRecord(record: AttendanceRecord): Promise<void> {
  let attendanceId: number | null = null
  if (!record.id || record.id.startsWith('offline-')) {
    const removed = await removePendingOperationFor('ATTENDANCE_UPSERT', record.studentId, record.date)
    // Si ya no estaba en cola, la sincronización la subió entretanto: se borra en el servidor.
    if (removed || !navigator.onLine) return
    const { data, error } = await supabase.from('attendance').select('id').eq('student_id', Number(record.studentId)).eq('date', record.date).maybeSingle()
    if (error) throw error
    if (!data) return
    attendanceId = Number(data.id)
  } else {
    if (!navigator.onLine) throw new Error('Borrar una marca ya sincronizada requiere conexión a Internet.')
    attendanceId = Number(record.id)
  }
  await deleteAttendanceTraces(attendanceId)
  const { error } = await supabase.from('attendance').delete().eq('id', attendanceId)
  if (error) throw error
}

export async function deleteAttendanceForDate(date: string): Promise<void> {
  if (!navigator.onLine) throw new Error('Reiniciar el día requiere conexión para evitar pérdida de datos pendientes.')
  const { error } = await supabase.from('attendance').delete().eq('date', date)
  if (error) throw error
}

export async function getPresentationRange(from: string, to: string): Promise<PresentationRecord[]> {
  try {
    const data = await fetchAllPages<DbPresentation>((start, end) => supabase.from('presentation_controls').select('id, student_id, date, status, other_description, checked_at, presentation_violations(violation_type)').gte('date', from).lte('date', to).order('date', { ascending: false }).order('id').range(start, end) as unknown as PromiseLike<{ data: DbPresentation[] | null; error: unknown }>)
    const mapped = data.map(mapPresentation)
    await setSnapshot(K.presentation(from, to), mapped)
    return overlayPendingPresentation(mapped, from, to)
  } catch (error) {
    const cached = await getSnapshot<PresentationRecord[]>(K.presentation(from, to))
    if (cached) return overlayPendingPresentation(cached, from, to)
    throw error
  }
}

function mapPresentation(row: DbPresentation): PresentationRecord {
  const types = new Set((row.presentation_violations ?? []).map((v) => v.violation_type))
  return { id: String(row.id), studentId: String(row.student_id), date: row.date, status: row.status, hairstyleViolation: types.has('HAIRSTYLE'), uniformUsageViolation: types.has('UNIFORM_INCOMPLETE'), nonInstitutionalGarment: types.has('NON_INSTITUTIONAL_GARMENT'), lateEntryViolation: types.has('LATE_ENTRY'), inappropriateConductViolation: types.has('INAPPROPRIATE_CONDUCT'), observation: row.other_description ?? '', checkedAt: trimTime(row.checked_at) }
}

export async function savePresentation(record: PresentationRecord): Promise<PresentationRecord> {
  const optimistic = { ...record, id: record.id ?? offlineId('presentation', record.studentId, record.date) }
  if (!navigator.onLine) {
    await enqueueOperation('PRESENTATION_UPSERT', record as unknown as Record<string, unknown>)
    return optimistic
  }
  try {
    const payload = { student_id: Number(record.studentId), date: record.date, status: record.status, other_description: record.status === 'NON_COMPLIANT' && record.observation.trim() ? record.observation.trim() : null, checked_at: record.checkedAt }
    const { data: control, error: controlError } = await supabase.from('presentation_controls').upsert(payload, { onConflict: 'student_id,date' }).select('id, student_id, date, status, other_description, checked_at').single()
    if (controlError) throw controlError
    const { error: deleteError } = await supabase.from('presentation_violations').delete().eq('presentation_control_id', control.id)
    if (deleteError) throw deleteError
    const violations = [record.hairstyleViolation && 'HAIRSTYLE', record.uniformUsageViolation && 'UNIFORM_INCOMPLETE', record.nonInstitutionalGarment && 'NON_INSTITUTIONAL_GARMENT', record.lateEntryViolation && 'LATE_ENTRY', record.inappropriateConductViolation && 'INAPPROPRIATE_CONDUCT'].filter(Boolean) as string[]
    if (violations.length) { const { error: insertError } = await supabase.from('presentation_violations').insert(violations.map((violation_type) => ({ presentation_control_id: control.id, violation_type }))); if (insertError) throw insertError }
    return { ...record, id: String(control.id) }
  } catch (error) {
    if (isPermanentServerError(error)) throw error
    await enqueueOperation('PRESENTATION_UPSERT', record as unknown as Record<string, unknown>)
    return optimistic
  }
}

export async function deletePresentationForDate(date: string): Promise<void> {
  if (!navigator.onLine) throw new Error('Reiniciar el día requiere conexión para evitar pérdida de datos pendientes.')
  const { error } = await supabase.from('presentation_controls').delete().eq('date', date)
  if (error) throw error
}
