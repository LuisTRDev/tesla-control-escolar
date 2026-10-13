import { supabase } from '@/lib/supabase'
import { trimTime } from '@/lib/dates'
import { ensureNotificationForLateAttendance } from '@/services/notificationService'
import type { ToleranceSettings } from '@/services/schoolService'
import type {
  AbsenceRecord, AbsenceStatus, AttendanceRecord, AuthorizedPickup, CalendarDay, CalendarDayKind, Classroom,
  EarlyExit, LevelSchedule, PermissionKind, StudentPermission,
} from '@/types'

/**
 * Faltas, justificaciones, permisos, salidas anticipadas, calendario y horario
 * por nivel (Fase 14). Si phase14_absences_permissions.sql aún no se ejecutó,
 * las lecturas devuelven listas vacías y `available: false`, y la app oculta
 * estas funciones en vez de fallar.
 */

const DOCUMENT_BUCKET = 'justificaciones'
const MAX_DOCUMENT_BYTES = 5 * 1024 * 1024

type PgError = { code?: string; message?: string } | null

/** Tabla o columna inexistente: el SQL de la fase todavía no se ejecutó. */
export function isMissingSchema(error: PgError): boolean {
  return Boolean(error && (error.code === '42P01' || error.code === 'PGRST205' || error.code === '42703' || error.code === 'PGRST202' || error.code === '42883'))
}

function requireOnline(action: string) {
  if (!navigator.onLine) throw new Error(`${action} requiere conexión a Internet.`)
}

async function currentUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getSession()
  return data.session?.user.id ?? null
}

// ---------------------------------------------------------------------------
// Lectura del rango (mes actual)
// ---------------------------------------------------------------------------

type DbAbsence = { id: number; student_id: number; classroom_id: number | null; date: string; status: AbsenceStatus; justification_reason: string | null; justification_document: string | null; justified_by_name: string | null; justified_at: string | null }
type DbPermission = { id: number; student_id: number; date_from: string; date_to: string; kind: PermissionKind; reason: string; document_path: string | null; created_by_name: string | null }
type DbEarlyExit = { id: number; student_id: number; date: string; exit_time: string; picked_up_by_name: string; picked_up_by_dni: string | null; relationship: string | null; reason: string; is_authorized_person: boolean; recorded_by_name: string | null }
type DbLevelSchedule = { level: Classroom['level']; entry_limit: string; tolerance_enabled: boolean; tolerance_minutes: number }

const mapAbsence = (row: DbAbsence): AbsenceRecord => ({
  id: String(row.id), studentId: String(row.student_id), classroomId: row.classroom_id == null ? '' : String(row.classroom_id),
  date: row.date, status: row.status, justificationReason: row.justification_reason, justificationDocument: row.justification_document,
  justifiedByName: row.justified_by_name, justifiedAt: row.justified_at,
})
const mapPermission = (row: DbPermission): StudentPermission => ({
  id: String(row.id), studentId: String(row.student_id), dateFrom: row.date_from, dateTo: row.date_to, kind: row.kind,
  reason: row.reason, documentPath: row.document_path, createdByName: row.created_by_name,
})
const mapEarlyExit = (row: DbEarlyExit): EarlyExit => ({
  id: String(row.id), studentId: String(row.student_id), date: row.date, exitTime: trimTime(row.exit_time),
  pickedUpByName: row.picked_up_by_name, pickedUpByDni: row.picked_up_by_dni ?? '', relationship: row.relationship ?? '',
  reason: row.reason, isAuthorizedPerson: row.is_authorized_person, recordedByName: row.recorded_by_name,
})
const mapSchedule = (row: DbLevelSchedule): LevelSchedule => ({
  level: row.level, entryLimit: trimTime(row.entry_limit), toleranceEnabled: row.tolerance_enabled, toleranceMinutes: row.tolerance_minutes,
})

export type DayStatusData = {
  available: boolean
  absences: AbsenceRecord[]
  permissions: StudentPermission[]
  earlyExits: EarlyExit[]
  calendar: CalendarDay[]
  schedules: LevelSchedule[]
}

export const EMPTY_DAY_STATUS: DayStatusData = { available: false, absences: [], permissions: [], earlyExits: [], calendar: [], schedules: [] }

export async function getDayStatusData(from: string, to: string): Promise<DayStatusData> {
  if (!navigator.onLine) return EMPTY_DAY_STATUS
  const [absences, permissions, exits, calendar, schedules] = await Promise.all([
    supabase.from('student_absences').select('id, student_id, classroom_id, date, status, justification_reason, justification_document, justified_by_name, justified_at').gte('date', from).lte('date', to),
    // Permisos que se cruzan con el rango (incluye los que empiezan antes o terminan después).
    supabase.from('student_permissions').select('id, student_id, date_from, date_to, kind, reason, document_path, created_by_name').lte('date_from', to).gte('date_to', from).order('date_from'),
    supabase.from('early_exits').select('id, student_id, date, exit_time, picked_up_by_name, picked_up_by_dni, relationship, reason, is_authorized_person, recorded_by_name').gte('date', from).lte('date', to),
    supabase.from('school_calendar').select('date, kind, description').order('date'),
    supabase.from('level_schedules').select('level, entry_limit, tolerance_enabled, tolerance_minutes'),
  ])
  const results = [absences, permissions, exits, calendar, schedules]
  if (results.some((r) => isMissingSchema(r.error))) return EMPTY_DAY_STATUS
  const failed = results.find((r) => r.error)
  if (failed?.error) throw failed.error
  return {
    available: true,
    absences: ((absences.data ?? []) as DbAbsence[]).map(mapAbsence),
    permissions: ((permissions.data ?? []) as DbPermission[]).map(mapPermission),
    earlyExits: ((exits.data ?? []) as DbEarlyExit[]).map(mapEarlyExit),
    calendar: (calendar.data ?? []) as CalendarDay[],
    schedules: ((schedules.data ?? []) as DbLevelSchedule[]).map(mapSchedule),
  }
}

export type StudentDayHistory = {
  absences: AbsenceRecord[]
  permissions: StudentPermission[]
  earlyExits: EarlyExit[]
  /** Tardanzas justificadas: id de asistencia -> motivo. */
  justifiedLate: Map<string, string>
}

/** Historial de faltas, permisos, salidas y justificaciones de un alumno (para el expediente). */
export async function getStudentDayHistory(studentId: string): Promise<StudentDayHistory> {
  const id = Number(studentId)
  const [absences, permissions, exits, justified] = await Promise.all([
    supabase.from('student_absences').select('id, student_id, classroom_id, date, status, justification_reason, justification_document, justified_by_name, justified_at').eq('student_id', id).order('date', { ascending: false }).limit(200),
    supabase.from('student_permissions').select('id, student_id, date_from, date_to, kind, reason, document_path, created_by_name').eq('student_id', id).order('date_from', { ascending: false }).limit(100),
    supabase.from('early_exits').select('id, student_id, date, exit_time, picked_up_by_name, picked_up_by_dni, relationship, reason, is_authorized_person, recorded_by_name').eq('student_id', id).order('date', { ascending: false }).limit(100),
    supabase.from('attendance').select('id, justification_reason').eq('student_id', id).eq('justified', true).limit(200),
  ])
  const empty: StudentDayHistory = { absences: [], permissions: [], earlyExits: [], justifiedLate: new Map() }
  const results = [absences, permissions, exits, justified]
  if (results.some((r) => isMissingSchema(r.error))) return empty
  const failed = results.find((r) => r.error)
  if (failed?.error) throw failed.error
  return {
    absences: ((absences.data ?? []) as DbAbsence[]).map(mapAbsence),
    permissions: ((permissions.data ?? []) as DbPermission[]).map(mapPermission),
    earlyExits: ((exits.data ?? []) as DbEarlyExit[]).map(mapEarlyExit),
    justifiedLate: new Map((justified.data ?? []).map((row: { id: number; justification_reason: string | null }) => [String(row.id), row.justification_reason ?? ''])),
  }
}

// ---------------------------------------------------------------------------
// Reglas puras (sin red) — probadas en dayStatusService.test.ts
// ---------------------------------------------------------------------------

/** Horario efectivo de un nivel: el propio si existe, si no el general del colegio. */
export function getEffectiveSchedule(level: Classroom['level'] | undefined, schedules: LevelSchedule[], globalLimit: string, globalTolerance: ToleranceSettings): { entryLimit: string; tolerance: ToleranceSettings } {
  const own = level ? schedules.find((item) => item.level === level) : undefined
  if (!own) return { entryLimit: globalLimit, tolerance: globalTolerance }
  return { entryLimit: own.entryLimit, tolerance: { enabled: own.toleranceEnabled, minutes: own.toleranceMinutes } }
}

/** Permiso vigente de un alumno para una fecha y tipo. */
export function findPermission(permissions: StudentPermission[], studentId: string, date: string, kind?: PermissionKind): StudentPermission | undefined {
  return permissions.find((item) => item.studentId === studentId && item.dateFrom <= date && item.dateTo >= date && (!kind || item.kind === kind))
}

export const CALENDAR_KIND_LABELS: Record<CalendarDayKind, string> = {
  HOLIDAY: 'Feriado',
  VACATION: 'Vacaciones',
  NO_CLASSES: 'Sin clases',
}

export const JUSTIFICATION_REASONS = ['Salud / cita médica', 'Trámite familiar', 'Duelo', 'Transporte / tráfico', 'Actividad del colegio', 'Otro'] as const

// ---------------------------------------------------------------------------
// Justificaciones
// ---------------------------------------------------------------------------

export type JustificationInput = { reason: string; documentPath?: string | null; byName: string }

function cleanReason(reason: string) {
  const value = reason.trim().slice(0, 500)
  if (!value) throw new Error('Escribe el motivo de la justificación.')
  return value
}

/** Tardanza justificada: deja de contar como incidencia y se borra su notificación automática. */
export async function justifyLate(record: AttendanceRecord, input: JustificationInput): Promise<AttendanceRecord> {
  requireOnline('Justificar')
  if (!record.id || record.id.startsWith('offline-')) throw new Error('Esta entrada aún no está sincronizada; espera a que vuelva la conexión.')
  const patch = {
    justified: true,
    justification_reason: cleanReason(input.reason),
    justification_document: input.documentPath ?? null,
    justified_by: await currentUserId(),
    justified_by_name: input.byName,
    justified_at: new Date().toISOString(),
  }
  const { error } = await supabase.from('attendance').update(patch).eq('id', Number(record.id))
  if (error) throw error
  // Solo la notificación automática de la marca; si también es de "Revisar normas" se conserva.
  const { error: notificationError } = await supabase.from('notifications').delete()
    .eq('attendance_id', Number(record.id)).eq('notification_type', 'LATE_ENTRY').is('presentation_control_id', null)
  if (notificationError) throw notificationError
  return { ...record, justified: true, justificationReason: patch.justification_reason, justificationDocument: patch.justification_document, justifiedByName: patch.justified_by_name, justifiedAt: patch.justified_at }
}

/** Quita la justificación de una tardanza y vuelve a generar su notificación. */
export async function unjustifyLate(record: AttendanceRecord): Promise<AttendanceRecord> {
  requireOnline('Quitar la justificación')
  if (!record.id) throw new Error('La asistencia no tiene un id persistido.')
  const { error } = await supabase.from('attendance').update({
    justified: false, justification_reason: null, justification_document: null, justified_by: null, justified_by_name: null, justified_at: null,
  }).eq('id', Number(record.id))
  if (error) throw error
  const updated: AttendanceRecord = { ...record, justified: false, justificationReason: null, justificationDocument: null, justifiedByName: null, justifiedAt: null }
  if (updated.status === 'LATE') await ensureNotificationForLateAttendance(updated)
  return updated
}

export async function justifyAbsence(absence: AbsenceRecord, input: JustificationInput): Promise<AbsenceRecord> {
  requireOnline('Justificar')
  const patch = {
    status: 'JUSTIFIED' as const,
    justification_reason: cleanReason(input.reason),
    justification_document: input.documentPath ?? null,
    justified_by: await currentUserId(),
    justified_by_name: input.byName,
    justified_at: new Date().toISOString(),
  }
  const { error } = await supabase.from('student_absences').update(patch).eq('id', Number(absence.id))
  if (error) throw error
  return { ...absence, status: 'JUSTIFIED', justificationReason: patch.justification_reason, justificationDocument: patch.justification_document, justifiedByName: patch.justified_by_name, justifiedAt: patch.justified_at }
}

export async function unjustifyAbsence(absence: AbsenceRecord): Promise<AbsenceRecord> {
  requireOnline('Quitar la justificación')
  const { error } = await supabase.from('student_absences').update({
    status: 'UNJUSTIFIED', justification_reason: null, justification_document: null, justified_by: null, justified_by_name: null, justified_at: null,
  }).eq('id', Number(absence.id))
  if (error) throw error
  return { ...absence, status: 'UNJUSTIFIED', justificationReason: null, justificationDocument: null, justifiedByName: null, justifiedAt: null }
}

// ---------------------------------------------------------------------------
// Permisos anticipados
// ---------------------------------------------------------------------------

export async function createPermission(input: { studentId: string; dateFrom: string; dateTo: string; kind: PermissionKind; reason: string; documentPath?: string | null; byName: string }): Promise<StudentPermission> {
  requireOnline('Registrar un permiso')
  if (!input.dateFrom || !input.dateTo) throw new Error('Elige las fechas del permiso.')
  if (input.dateTo < input.dateFrom) throw new Error('La fecha final no puede ser anterior a la inicial.')
  const { data, error } = await supabase.from('student_permissions').insert({
    student_id: Number(input.studentId), date_from: input.dateFrom, date_to: input.dateTo, kind: input.kind,
    reason: cleanReason(input.reason), document_path: input.documentPath ?? null, created_by_name: input.byName,
  }).select('id, student_id, date_from, date_to, kind, reason, document_path, created_by_name').single()
  if (error) throw error
  return mapPermission(data as DbPermission)
}

export async function deletePermission(permissionId: string): Promise<void> {
  requireOnline('Borrar un permiso')
  const { error } = await supabase.from('student_permissions').delete().eq('id', Number(permissionId))
  if (error) throw error
}

// ---------------------------------------------------------------------------
// Salidas anticipadas y personas autorizadas
// ---------------------------------------------------------------------------

/** `null` si la tabla aún no existe (phase14 sin ejecutar). */
export async function getAuthorizedPickups(studentId: string): Promise<AuthorizedPickup[] | null> {
  const { data, error } = await supabase.from('authorized_pickups').select('id, student_id, full_name, dni, relationship, phone').eq('student_id', Number(studentId)).order('full_name')
  if (isMissingSchema(error)) return null
  if (error) throw error
  return (data ?? []).map((row) => ({ id: String(row.id), studentId: String(row.student_id), fullName: row.full_name, dni: row.dni ?? '', relationship: row.relationship ?? '', phone: row.phone ?? '' }))
}

export async function saveAuthorizedPickup(input: { studentId: string; fullName: string; dni: string; relationship: string; phone: string }): Promise<void> {
  requireOnline('Guardar una persona autorizada')
  const fullName = input.fullName.trim()
  if (!fullName) throw new Error('Escribe el nombre de la persona autorizada.')
  const dni = input.dni.replace(/\D/g, '')
  if (dni && dni.length !== 8) throw new Error('El DNI debe tener 8 dígitos.')
  const { error } = await supabase.from('authorized_pickups').insert({
    student_id: Number(input.studentId), full_name: fullName.slice(0, 160), dni: dni || null,
    relationship: input.relationship.trim().slice(0, 60) || null, phone: input.phone.replace(/[^\d+]/g, '').slice(0, 15) || null,
  })
  if (error) throw error
}

export async function deleteAuthorizedPickup(pickupId: string): Promise<void> {
  requireOnline('Quitar una persona autorizada')
  const { error } = await supabase.from('authorized_pickups').delete().eq('id', Number(pickupId))
  if (error) throw error
}

export async function registerEarlyExit(input: {
  studentId: string; date: string; exitTime: string; pickedUpByName: string; pickedUpByDni: string; relationship: string
  reason: string; isAuthorizedPerson: boolean; byName: string; attendance?: AttendanceRecord
}): Promise<EarlyExit> {
  requireOnline('Registrar una salida anticipada')
  const name = input.pickedUpByName.trim()
  if (!name) throw new Error('Indica quién recoge al alumno.')
  const dni = input.pickedUpByDni.replace(/\D/g, '')
  if (dni && dni.length !== 8) throw new Error('El DNI de quien recoge debe tener 8 dígitos.')
  const { data, error } = await supabase.from('early_exits').insert({
    student_id: Number(input.studentId), date: input.date, exit_time: input.exitTime, picked_up_by_name: name.slice(0, 160),
    picked_up_by_dni: dni || null, relationship: input.relationship.trim().slice(0, 60) || null, reason: cleanReason(input.reason),
    is_authorized_person: input.isAuthorizedPerson, recorded_by_name: input.byName,
  }).select('id, student_id, date, exit_time, picked_up_by_name, picked_up_by_dni, relationship, reason, is_authorized_person, recorded_by_name').single()
  if (error) throw error

  // Si tiene marca de entrada, la salida anticipada también queda como su salida del día.
  if (input.attendance?.id && !input.attendance.id.startsWith('offline-') && !input.attendance.exitTime) {
    const { error: exitError } = await supabase.from('attendance')
      .update({ exit_time: input.exitTime, exit_recorded_at: new Date().toISOString(), exit_source: 'EARLY_EXIT' })
      .eq('id', Number(input.attendance.id))
    if (exitError) throw exitError
  }
  return mapEarlyExit(data as DbEarlyExit)
}

// ---------------------------------------------------------------------------
// Calendario escolar y horario por nivel
// ---------------------------------------------------------------------------

export async function saveCalendarDay(day: CalendarDay): Promise<void> {
  requireOnline('Editar el calendario')
  const { error } = await supabase.from('school_calendar').upsert({ date: day.date, kind: day.kind, description: day.description.trim().slice(0, 160) })
  if (error) throw error
}

export async function deleteCalendarDay(date: string): Promise<void> {
  requireOnline('Editar el calendario')
  const { error } = await supabase.from('school_calendar').delete().eq('date', date)
  if (error) throw error
}

export async function saveLevelSchedule(schedule: LevelSchedule): Promise<void> {
  requireOnline('Cambiar el horario')
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(schedule.entryLimit)) throw new Error('Hora límite inválida.')
  const { error } = await supabase.from('level_schedules').upsert({
    level: schedule.level, entry_limit: schedule.entryLimit, tolerance_enabled: schedule.toleranceEnabled,
    tolerance_minutes: Math.max(0, Math.min(60, Math.round(schedule.toleranceMinutes))),
  })
  if (error) throw error
}

export async function deleteLevelSchedule(level: Classroom['level']): Promise<void> {
  requireOnline('Cambiar el horario')
  const { error } = await supabase.from('level_schedules').delete().eq('level', level)
  if (error) throw error
}

// ---------------------------------------------------------------------------
// Cierre del día
// ---------------------------------------------------------------------------

export async function closeAttendanceDay(date: string, classroomId: string | null): Promise<{ absences: number; permissions: number }> {
  requireOnline('Cerrar el día')
  const { data, error } = await supabase.rpc('close_attendance_day', { p_date: date, p_classroom_id: classroomId ? Number(classroomId) : null })
  if (error) throw error
  const row = (Array.isArray(data) ? data[0] : data) as { absences?: number; permissions?: number } | null
  return { absences: Number(row?.absences ?? 0), permissions: Number(row?.permissions ?? 0) }
}

export async function reopenAttendanceDay(date: string, classroomId: string | null): Promise<number> {
  requireOnline('Reabrir el día')
  const { data, error } = await supabase.rpc('reopen_attendance_day', { p_date: date, p_classroom_id: classroomId ? Number(classroomId) : null })
  if (error) throw error
  return Number(data ?? 0)
}

// ---------------------------------------------------------------------------
// Documentos de justificación (opcional: requiere el bloque 11 de phase14)
// ---------------------------------------------------------------------------

async function detectDocumentType(file: File): Promise<{ ext: string; mime: string }> {
  const head = new Uint8Array(await file.slice(0, 12).arrayBuffer())
  const ascii = (start: number, length: number) => String.fromCharCode(...head.slice(start, start + length))
  if (ascii(0, 5) === '%PDF-') return { ext: 'pdf', mime: 'application/pdf' }
  if (head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return { ext: 'jpg', mime: 'image/jpeg' }
  if (head[0] === 0x89 && ascii(1, 3) === 'PNG') return { ext: 'png', mime: 'image/png' }
  if (ascii(0, 4) === 'RIFF' && ascii(8, 4) === 'WEBP') return { ext: 'webp', mime: 'image/webp' }
  throw new Error('Solo se aceptan fotos (JPG, PNG, WEBP) o PDF.')
}

export async function uploadJustificationDocument(file: File, studentId: string): Promise<string> {
  requireOnline('Adjuntar un documento')
  if (file.size <= 0) throw new Error('El archivo está vacío.')
  if (file.size > MAX_DOCUMENT_BYTES) throw new Error('El documento supera el límite de 5 MB.')
  const type = await detectDocumentType(file)
  const path = `${Number(studentId)}/${new Date().toISOString().slice(0, 10)}-${crypto.randomUUID()}.${type.ext}`
  const { error } = await supabase.storage.from(DOCUMENT_BUCKET).upload(path, file, { contentType: type.mime, upsert: false })
  if (error) {
    if (/bucket not found|not found/i.test(error.message)) throw new Error('Adjuntar documentos aún no está activado. Ejecuta el bloque opcional 11 de phase14 o guarda solo el motivo.')
    throw error
  }
  return path
}

/** Enlace temporal (5 min) para ver un documento privado. */
export async function getDocumentUrl(path: string): Promise<string> {
  const { data, error } = await supabase.storage.from(DOCUMENT_BUCKET).createSignedUrl(path, 300)
  if (error) throw error
  return data.signedUrl
}
