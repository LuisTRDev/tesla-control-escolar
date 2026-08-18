import { supabase } from '@/lib/supabase'
import type { AttendanceRecord, AttendanceStatus, Classroom, PresentationRecord, Student } from '@/types'

const DEFAULT_LIMIT = '07:45'

type DbClassroom = { id: number | string; grade: string; section: string; level: string; tutor_name: string | null }
type DbGuardian = { full_name: string | null; dni: string | null; phone: string | null }
type DbStudent = { id: number | string; classroom_id: number | string; first_name: string; last_name: string; guardians?: DbGuardian[] | DbGuardian | null }
type DbAttendance = { student_id: number | string; date: string; entry_time: string; status: AttendanceStatus }
type DbViolation = { violation_type: string }
type DbPresentation = { id: number | string; student_id: number | string; date: string; status: 'COMPLIANT' | 'NON_COMPLIANT'; other_description: string | null; checked_at: string | null; presentation_violations?: DbViolation[] | null }

function trimTime(value?: string | null) {
  return (value ?? '').slice(0, 5)
}

export async function getClassrooms(): Promise<Classroom[]> {
  const { data, error } = await supabase
    .from('classrooms')
    .select('id, grade, section, level, tutor_name')
    .order('id')
  if (error) throw error
  return ((data ?? []) as DbClassroom[]).map((row) => ({
    id: String(row.id),
    grade: row.grade,
    section: row.section,
    level: row.level as Classroom['level'],
    tutorName: row.tutor_name ?? 'Sin tutor asignado',
  }))
}

export async function getStudents(): Promise<Student[]> {
  const { data, error } = await supabase
    .from('students')
    .select('id, classroom_id, first_name, last_name, guardians(full_name, dni, phone)')
    .order('last_name')
  if (error) throw error

  return ((data ?? []) as DbStudent[]).map((row) => {
    const raw = row.guardians
    const guardian = Array.isArray(raw) ? raw[0] : raw
    return {
      id: String(row.id),
      firstName: row.first_name,
      lastName: row.last_name,
      classroomId: String(row.classroom_id),
      guardianName: guardian?.full_name ?? 'Sin apoderado registrado',
      guardianDni: guardian?.dni ?? '',
      guardianPhone: guardian?.phone ?? '',
    }
  })
}

export async function getEntryLimit(): Promise<string> {
  const { data, error } = await supabase
    .from('school_settings')
    .select('entry_limit_time')
    .order('id')
    .limit(1)
    .maybeSingle()
  if (error) throw error
  return trimTime(data?.entry_limit_time) || DEFAULT_LIMIT
}

export async function saveEntryLimit(value: string): Promise<void> {
  const { data: existing, error: readError } = await supabase
    .from('school_settings')
    .select('id')
    .order('id')
    .limit(1)
    .maybeSingle()
  if (readError) throw readError

  if (existing?.id) {
    const { error } = await supabase.from('school_settings').update({ entry_limit_time: value }).eq('id', existing.id)
    if (error) throw error
  } else {
    const { error } = await supabase.from('school_settings').insert({ entry_limit_time: value })
    if (error) throw error
  }
}

export function calculateStatus(time: string, entryLimit: string): AttendanceStatus {
  return time <= entryLimit ? 'ON_TIME' : 'LATE'
}

export async function getAttendanceRange(from: string, to: string): Promise<AttendanceRecord[]> {
  const { data, error } = await supabase
    .from('attendance')
    .select('student_id, date, entry_time, status')
    .gte('date', from)
    .lte('date', to)
    .order('date', { ascending: false })
  if (error) throw error
  return ((data ?? []) as DbAttendance[]).map((row) => ({
    studentId: String(row.student_id),
    date: row.date,
    time: trimTime(row.entry_time),
    status: row.status,
  }))
}

export async function registerAttendance(studentId: string, entryLimit: string, date: string, time: string): Promise<AttendanceRecord> {
  const record = { student_id: Number(studentId), date, entry_time: time, status: calculateStatus(time, entryLimit) }
  const { data, error } = await supabase
    .from('attendance')
    .upsert(record, { onConflict: 'student_id,date', ignoreDuplicates: true })
    .select('student_id, date, entry_time, status')
    .maybeSingle()
  if (error) throw error

  if (!data) {
    const { data: existing, error: existingError } = await supabase
      .from('attendance')
      .select('student_id, date, entry_time, status')
      .eq('student_id', Number(studentId))
      .eq('date', date)
      .single()
    if (existingError) throw existingError
    return { studentId: String(existing.student_id), date: existing.date, time: trimTime(existing.entry_time), status: existing.status }
  }

  return { studentId: String(data.student_id), date: data.date, time: trimTime(data.entry_time), status: data.status }
}

export async function recalculateAttendanceForDate(date: string, entryLimit: string): Promise<void> {
  const { data, error } = await supabase.from('attendance').select('id, entry_time').eq('date', date)
  if (error) throw error
  await Promise.all((data ?? []).map(async (row) => {
    const status = calculateStatus(trimTime(row.entry_time), entryLimit)
    const { error: updateError } = await supabase.from('attendance').update({ status }).eq('id', row.id)
    if (updateError) throw updateError
  }))
}

export async function deleteAttendanceForDate(date: string): Promise<void> {
  const { error } = await supabase.from('attendance').delete().eq('date', date)
  if (error) throw error
}

export async function getPresentationRange(from: string, to: string): Promise<PresentationRecord[]> {
  const { data, error } = await supabase
    .from('presentation_controls')
    .select('id, student_id, date, status, other_description, checked_at, presentation_violations(violation_type)')
    .gte('date', from)
    .lte('date', to)
    .order('date', { ascending: false })
  if (error) throw error
  return ((data ?? []) as DbPresentation[]).map(mapPresentation)
}

function mapPresentation(row: DbPresentation): PresentationRecord {
  const types = new Set((row.presentation_violations ?? []).map((v) => v.violation_type))
  return {
    id: String(row.id),
    studentId: String(row.student_id),
    date: row.date,
    status: row.status,
    hairstyleViolation: types.has('HAIRSTYLE'),
    uniformUsageViolation: types.has('UNIFORM_INCOMPLETE'),
    nonInstitutionalGarment: types.has('NON_INSTITUTIONAL_GARMENT'),
    otherViolation: types.has('OTHER'),
    otherDescription: row.other_description ?? '',
    checkedAt: trimTime(row.checked_at),
  }
}

export async function savePresentation(record: PresentationRecord): Promise<PresentationRecord> {
  const payload = {
    student_id: Number(record.studentId),
    date: record.date,
    status: record.status,
    other_description: record.otherViolation ? record.otherDescription : null,
    checked_at: record.checkedAt,
  }

  const { data: control, error: controlError } = await supabase
    .from('presentation_controls')
    .upsert(payload, { onConflict: 'student_id,date' })
    .select('id, student_id, date, status, other_description, checked_at')
    .single()
  if (controlError) throw controlError

  const { error: deleteError } = await supabase
    .from('presentation_violations')
    .delete()
    .eq('presentation_control_id', control.id)
  if (deleteError) throw deleteError

  const violations = [
    record.hairstyleViolation && 'HAIRSTYLE',
    record.uniformUsageViolation && 'UNIFORM_INCOMPLETE',
    record.nonInstitutionalGarment && 'NON_INSTITUTIONAL_GARMENT',
    record.otherViolation && 'OTHER',
  ].filter(Boolean) as string[]

  if (violations.length) {
    const { error: insertError } = await supabase.from('presentation_violations').insert(
      violations.map((violation_type) => ({ presentation_control_id: control.id, violation_type })),
    )
    if (insertError) throw insertError
  }

  return { ...record, id: String(control.id) }
}

export async function deletePresentationForDate(date: string): Promise<void> {
  const { error } = await supabase.from('presentation_controls').delete().eq('date', date)
  if (error) throw error
}
