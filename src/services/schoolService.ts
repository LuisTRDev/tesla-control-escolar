import { supabase } from '@/lib/supabase'
import { enqueueOperation, getSnapshot, listPendingOperations, setSnapshot } from '@/lib/offlineDb'
import type { AttendanceRecord, AttendanceStatus, Classroom, PresentationRecord, Student } from '@/types'

const DEFAULT_LIMIT = '07:45'
const K = {
  classrooms: 'classrooms', students: 'students', entryLimit: 'entry_limit',
  attendance: (from: string, to: string) => `attendance:${from}:${to}`,
  presentation: (from: string, to: string) => `presentation:${from}:${to}`,
}

type DbClassroom = { id: number | string; grade: string; section: string; level: string; tutor_name: string | null }
type DbGuardian = { full_name: string | null; dni: string | null; phone: string | null }
type DbStudent = { id: number | string; classroom_id: number | string; first_name: string; last_name: string; guardians?: DbGuardian[] | DbGuardian | null }
type DbAttendance = { id: number | string; student_id: number | string; date: string; entry_time: string; status: AttendanceStatus }
type DbViolation = { violation_type: string }
type DbPresentation = { id: number | string; student_id: number | string; date: string; status: 'COMPLIANT' | 'NON_COMPLIANT'; other_description: string | null; checked_at: string | null; presentation_violations?: DbViolation[] | null }

function trimTime(value?: string | null) { return (value ?? '').slice(0, 5) }
function offlineId(prefix: string, studentId: string, date: string) { return `offline-${prefix}-${studentId}-${date}` }

async function overlayPendingAttendance(base: AttendanceRecord[], from: string, to: string) {
  const pending = await listPendingOperations()
  const merged = [...base]
  for (const item of pending.filter((x) => x.type === 'ATTENDANCE_UPSERT')) {
    const p = item.payload as Record<string, unknown>
    const date = String(p.date ?? '')
    if (date < from || date > to) continue
    const studentId = String(p.studentId ?? '')
    const record: AttendanceRecord = { id: offlineId('attendance', studentId, date), studentId, date, time: String(p.time ?? ''), status: String(p.status ?? 'ON_TIME') as AttendanceStatus }
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
    const { data, error } = await supabase.from('students').select('id, classroom_id, first_name, last_name, guardians(full_name, dni, phone)').order('last_name')
    if (error) throw error
    const mapped = ((data ?? []) as DbStudent[]).map((row) => {
      const raw = row.guardians; const guardian = Array.isArray(raw) ? raw[0] : raw
      return { id: String(row.id), firstName: row.first_name, lastName: row.last_name, classroomId: String(row.classroom_id), guardianName: guardian?.full_name ?? 'Sin apoderado registrado', guardianDni: guardian?.dni ?? '', guardianPhone: guardian?.phone ?? '' }
    })
    await setSnapshot(K.students, mapped)
    return mapped
  } catch (error) {
    const cached = await getSnapshot<Student[]>(K.students)
    if (cached) return cached
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

export function calculateStatus(time: string, entryLimit: string): AttendanceStatus { return time <= entryLimit ? 'ON_TIME' : 'LATE' }

export async function getAttendanceRange(from: string, to: string): Promise<AttendanceRecord[]> {
  try {
    const { data, error } = await supabase.from('attendance').select('id, student_id, date, entry_time, status').gte('date', from).lte('date', to).order('date', { ascending: false })
    if (error) throw error
    const mapped = ((data ?? []) as DbAttendance[]).map((row) => ({ id: String(row.id), studentId: String(row.student_id), date: row.date, time: trimTime(row.entry_time), status: row.status }))
    await setSnapshot(K.attendance(from, to), mapped)
    return overlayPendingAttendance(mapped, from, to)
  } catch (error) {
    const cached = await getSnapshot<AttendanceRecord[]>(K.attendance(from, to))
    if (cached) return overlayPendingAttendance(cached, from, to)
    throw error
  }
}

export async function registerAttendance(studentId: string, entryLimit: string, date: string, time: string): Promise<AttendanceRecord> {
  const status = calculateStatus(time, entryLimit)
  const optimistic: AttendanceRecord = { id: offlineId('attendance', studentId, date), studentId, date, time, status }
  if (!navigator.onLine) {
    await enqueueOperation('ATTENDANCE_UPSERT', optimistic as unknown as Record<string, unknown>)
    return optimistic
  }
  try {
    const record = { student_id: Number(studentId), date, entry_time: time, status }
    const { data, error } = await supabase.from('attendance').upsert(record, { onConflict: 'student_id,date', ignoreDuplicates: true }).select('id, student_id, date, entry_time, status').maybeSingle()
    if (error) throw error
    if (!data) {
      const { data: existing, error: existingError } = await supabase.from('attendance').select('id, student_id, date, entry_time, status').eq('student_id', Number(studentId)).eq('date', date).single()
      if (existingError) throw existingError
      return { id: String(existing.id), studentId: String(existing.student_id), date: existing.date, time: trimTime(existing.entry_time), status: existing.status }
    }
    return { id: String(data.id), studentId: String(data.student_id), date: data.date, time: trimTime(data.entry_time), status: data.status }
  } catch {
    await enqueueOperation('ATTENDANCE_UPSERT', optimistic as unknown as Record<string, unknown>)
    return optimistic
  }
}

export async function recalculateAttendanceForDate(date: string, entryLimit: string): Promise<void> {
  if (!navigator.onLine) return
  const { data, error } = await supabase.from('attendance').select('id, entry_time').eq('date', date)
  if (error) throw error
  await Promise.all((data ?? []).map(async (row: { id: number | string; entry_time: string }) => { const status = calculateStatus(trimTime(row.entry_time), entryLimit); const { error: updateError } = await supabase.from('attendance').update({ status }).eq('id', row.id); if (updateError) throw updateError }))
}

export async function deleteAttendanceForDate(date: string): Promise<void> {
  if (!navigator.onLine) throw new Error('Reiniciar el día requiere conexión para evitar pérdida de datos pendientes.')
  const { error } = await supabase.from('attendance').delete().eq('date', date)
  if (error) throw error
}

export async function getPresentationRange(from: string, to: string): Promise<PresentationRecord[]> {
  try {
    const { data, error } = await supabase.from('presentation_controls').select('id, student_id, date, status, other_description, checked_at, presentation_violations(violation_type)').gte('date', from).lte('date', to).order('date', { ascending: false })
    if (error) throw error
    const mapped = ((data ?? []) as DbPresentation[]).map(mapPresentation)
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
  } catch {
    await enqueueOperation('PRESENTATION_UPSERT', record as unknown as Record<string, unknown>)
    return optimistic
  }
}

export async function deletePresentationForDate(date: string): Promise<void> {
  if (!navigator.onLine) throw new Error('Reiniciar el día requiere conexión para evitar pérdida de datos pendientes.')
  const { error } = await supabase.from('presentation_controls').delete().eq('date', date)
  if (error) throw error
}
