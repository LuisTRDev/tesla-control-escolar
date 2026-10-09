import { supabase } from '@/lib/supabase'
import { cleanSingleLine, positiveInteger } from '@/lib/security'

/**
 * Gestión del padrón (alumnos, apoderados y vínculos) desde la app.
 * Las escrituras requieren rol ADMIN: lo valida RLS con public.is_admin()
 * (supabase/phase9_admin_roster.sql), no solo la interfaz.
 */

export type RosterGuardian = {
  id: string
  fullName: string
  dni: string
  phone: string
  students: { studentId: string; relationship: string; isPrimary: boolean }[]
}

export type StudentInput = { firstName: string; lastName: string; dni: string; classroomId: string }
export type GuardianInput = { fullName: string; dni: string; phone: string }

export const INACTIVE_REASONS = ['Abandono', 'Suspensión', 'Traslado', 'Retiro voluntario', 'Expulsión', 'Otro']

export type StudentStatusInput = { reason: string; note: string; since: string }

export const RELATIONSHIP_OPTIONS = ['Madre', 'Padre', 'Tutor legal', 'Abuelo(a)', 'Tío(a)', 'Hermano(a)', 'Otro']

const DNI_PATTERN = /^\d{8}$/
const PHONE_PATTERN = /^\+?\d{6,15}$/

export function isAdminRole(role: string) {
  return role.trim().toUpperCase() === 'ADMIN'
}

function friendlyError(error: unknown): Error {
  const message = error instanceof Error ? error.message : typeof error === 'object' && error && 'message' in error ? String((error as { message: unknown }).message) : ''
  const text = message.toLowerCase()
  if (text.includes('row-level security') || text.includes('permission denied')) return new Error('No tienes permisos de administrador para modificar el padrón.')
  if (text.includes('is_active') || text.includes('admin_delete_student')) return new Error('Falta ejecutar supabase/phase10_student_status.sql en Supabase.')
  if (text.includes('duplicate key')) return new Error('Ya existe un registro con esos datos (DNI o vínculo duplicado).')
  if (text.includes('fetch') || text.includes('network')) return new Error('Sin conexión con el servidor. Esta acción requiere Internet.')
  return new Error(message ? cleanSingleLine(message, 220) : 'No se pudo guardar el cambio.')
}

function requireOnline() {
  if (!navigator.onLine) throw new Error('Sin conexión. Los cambios del padrón requieren Internet.')
}

function validateStudent(input: StudentInput) {
  const firstName = cleanSingleLine(input.firstName, 80)
  const lastName = cleanSingleLine(input.lastName, 120)
  const dni = cleanSingleLine(input.dni, 8)
  if (!firstName) throw new Error('Ingresa los nombres del alumno.')
  if (!lastName) throw new Error('Ingresa los apellidos del alumno.')
  if (dni && !DNI_PATTERN.test(dni)) throw new Error('El DNI del alumno debe tener 8 dígitos.')
  return {
    first_name: firstName,
    last_name: lastName,
    dni: dni || null,
    classroom_id: positiveInteger(input.classroomId, 'Aula'),
  }
}

function validateGuardian(input: GuardianInput) {
  const fullName = cleanSingleLine(input.fullName, 160)
  const dni = cleanSingleLine(input.dni, 8)
  const phone = cleanSingleLine(input.phone, 16).replace(/[\s-]/g, '')
  if (!fullName) throw new Error('Ingresa el nombre completo del apoderado.')
  if (dni && !DNI_PATTERN.test(dni)) throw new Error('El DNI del apoderado debe tener 8 dígitos.')
  if (phone && !PHONE_PATTERN.test(phone)) throw new Error('El teléfono solo debe contener números (ej. 999111222).')
  return { full_name: fullName, dni: dni || null, phone: phone || null }
}

export async function getRosterGuardians(): Promise<RosterGuardian[]> {
  const [{ data: guardians, error: gError }, { data: links, error: lError }] = await Promise.all([
    supabase.from('guardians').select('id, full_name, dni, phone').order('full_name', { ascending: true }),
    supabase.from('student_guardians').select('student_id, guardian_id, relationship, is_primary'),
  ])
  if (gError) throw friendlyError(gError)
  if (lError) throw friendlyError(lError)

  const byGuardian = new Map<string, RosterGuardian['students']>()
  for (const row of (links ?? []) as Record<string, unknown>[]) {
    const gid = String(row.guardian_id)
    const list = byGuardian.get(gid) ?? []
    list.push({ studentId: String(row.student_id), relationship: String(row.relationship ?? ''), isPrimary: row.is_primary === true })
    byGuardian.set(gid, list)
  }

  return ((guardians ?? []) as Record<string, unknown>[]).map((g) => ({
    id: String(g.id),
    fullName: String(g.full_name ?? ''),
    dni: String(g.dni ?? ''),
    phone: String(g.phone ?? ''),
    students: byGuardian.get(String(g.id)) ?? [],
  }))
}

export async function createStudent(input: StudentInput): Promise<string> {
  requireOnline()
  const payload = validateStudent(input)
  const { data, error } = await supabase.from('students').insert(payload).select('id').single()
  if (error) throw friendlyError(error)
  return String(data.id)
}

export async function updateStudent(studentId: string, input: StudentInput): Promise<void> {
  requireOnline()
  const payload = validateStudent(input)
  const { error } = await supabase.from('students').update(payload).eq('id', positiveInteger(studentId, 'Alumno'))
  if (error) throw friendlyError(error)
}

/** Inhabilita al alumno: se conserva su historial pero no se puede marcar asistencia. */
export async function deactivateStudent(studentId: string, input: StudentStatusInput): Promise<void> {
  requireOnline()
  const reason = cleanSingleLine(input.reason, 40)
  if (!reason) throw new Error('Indica el motivo (abandono, suspensión, etc.).')
  const note = cleanSingleLine(input.note, 300)
  if (reason === 'Otro' && !note) throw new Error('Describe el motivo en el detalle.')
  const { error } = await supabase.from('students').update({
    is_active: false,
    inactive_reason: reason,
    inactive_note: note || null,
    inactive_since: input.since || null,
  }).eq('id', positiveInteger(studentId, 'Alumno'))
  if (error) throw friendlyError(error)
}

export async function reactivateStudent(studentId: string): Promise<void> {
  requireOnline()
  const { error } = await supabase.from('students').update({
    is_active: true,
    inactive_reason: null,
    inactive_note: null,
    inactive_since: null,
  }).eq('id', positiveInteger(studentId, 'Alumno'))
  if (error) throw friendlyError(error)
}

/** Borrado definitivo del alumno y todo su historial (RPC admin_delete_student, solo ADMIN). */
export async function deleteStudent(studentId: string): Promise<void> {
  requireOnline()
  const { error } = await supabase.rpc('admin_delete_student', { p_student_id: positiveInteger(studentId, 'Alumno') })
  if (error) throw friendlyError(error)
}

export async function createGuardian(input: GuardianInput): Promise<string> {
  requireOnline()
  const payload = validateGuardian(input)
  const { data, error } = await supabase.from('guardians').insert(payload).select('id').single()
  if (error) throw friendlyError(error)
  return String(data.id)
}

export async function updateGuardian(guardianId: string, input: GuardianInput): Promise<void> {
  requireOnline()
  const payload = validateGuardian(input)
  const { error } = await supabase.from('guardians').update(payload).eq('id', positiveInteger(guardianId, 'Apoderado'))
  if (error) throw friendlyError(error)
}

/** Un alumno tiene a lo sumo un apoderado principal: marcar uno desmarca los demás. */
async function clearPrimary(studentId: number) {
  const { error } = await supabase.from('student_guardians').update({ is_primary: false }).eq('student_id', studentId).eq('is_primary', true)
  if (error) throw friendlyError(error)
}

export async function linkGuardian(studentId: string, guardianId: string, relationship: string, isPrimary: boolean): Promise<void> {
  requireOnline()
  const sid = positiveInteger(studentId, 'Alumno')
  const gid = positiveInteger(guardianId, 'Apoderado')
  const rel = cleanSingleLine(relationship, 40)
  if (!rel) throw new Error('Indica el parentesco (Madre, Padre, etc.).')

  const { data: existing, error: existingError } = await supabase.from('student_guardians').select('guardian_id').eq('student_id', sid)
  if (existingError) throw friendlyError(existingError)
  if ((existing ?? []).some((row) => String(row.guardian_id) === String(gid))) throw new Error('Ese apoderado ya está vinculado al alumno.')

  // El primer apoderado vinculado queda como principal automáticamente.
  const primary = isPrimary || (existing ?? []).length === 0
  if (primary) await clearPrimary(sid)
  const { error } = await supabase.from('student_guardians').insert({ student_id: sid, guardian_id: gid, relationship: rel, is_primary: primary })
  if (error) throw friendlyError(error)
}

export async function setPrimaryGuardian(studentId: string, guardianId: string): Promise<void> {
  requireOnline()
  const sid = positiveInteger(studentId, 'Alumno')
  await clearPrimary(sid)
  const { error } = await supabase.from('student_guardians').update({ is_primary: true }).eq('student_id', sid).eq('guardian_id', positiveInteger(guardianId, 'Apoderado'))
  if (error) throw friendlyError(error)
}

export async function unlinkGuardian(studentId: string, guardianId: string): Promise<void> {
  requireOnline()
  const { error } = await supabase.from('student_guardians').delete()
    .eq('student_id', positiveInteger(studentId, 'Alumno'))
    .eq('guardian_id', positiveInteger(guardianId, 'Apoderado'))
  if (error) throw friendlyError(error)
}
