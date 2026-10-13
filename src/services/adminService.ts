import { supabase } from '@/lib/supabase'
import { cleanSingleLine } from '@/lib/security'
import { ERROR_HINTS, knownErrorHint } from '@/lib/errorMessages'

/**
 * Funciones de administración que dependen de supabase/phase15_users_monitoring_backups.sql:
 * usuarios, monitoreo de errores y copias automáticas. Todas exigen rol ADMIN en la base.
 */

export const PHASE15_MISSING = 'Falta ejecutar supabase/phase15_users_monitoring_backups.sql en Supabase > SQL Editor.'

/** Mismos valores que ya usa profiles.role (ver README › Usuarios y roles). */
export const USER_ROLES = [
  { id: 'AUXILIARY', label: 'Auxiliar' },
  { id: 'ADMIN', label: 'Administrador' },
  { id: 'MANAGEMENT', label: 'Dirección' },
] as const
export type UserRole = (typeof USER_ROLES)[number]['id']

export type AppUser = {
  id: string
  email: string
  fullName: string
  role: string
  active: boolean
  lastSignInAt: string | null
  createdAt: string
}

export type AppErrorRecord = {
  id: string
  createdAt: string
  userId: string | null
  module: string
  action: string
  message: string
  errorCode: string | null
  details: Record<string, unknown>
}

export type BackupSnapshotInfo = {
  id: string
  takenAt: string
  kind: 'AUTO' | 'MANUAL'
  rowCounts: Record<string, number>
}

/** Mensajes de las funciones SQL (raise exception) ya vienen en español; el resto se traduce. */
function adminError(error: unknown): Error {
  const hint = knownErrorHint(error)
  if (hint === ERROR_HINTS.missingSql) return new Error(PHASE15_MISSING)
  if (hint) return new Error(hint)
  const message = error && typeof error === 'object' && 'message' in error ? String((error as { message: unknown }).message) : ''
  return new Error(message ? cleanSingleLine(message, 220) : 'No se pudo completar la acción.')
}

function requireOnline() {
  if (!navigator.onLine) throw new Error('Sin conexión. Esta acción requiere Internet.')
}

const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

export function validatePassword(password: string): string | null {
  if (password.length < 8) return 'La contraseña debe tener al menos 8 caracteres.'
  if (!/[a-zA-Z]/.test(password) || !/\d/.test(password)) return 'Usa letras y números en la contraseña.'
  return null
}

/** Contraseña temporal legible para dictarla o enviarla al auxiliar (sin 0/O ni 1/l). */
export function generateTemporaryPassword(): string {
  const letters = 'abcdefghjkmnpqrstuvwxyz'
  const digits = '23456789'
  const random = new Uint32Array(8)
  crypto.getRandomValues(random)
  const part = (alphabet: string, from: number, count: number) =>
    Array.from(random.slice(from, from + count), (n) => alphabet[n % alphabet.length]).join('')
  return `${part(letters, 0, 1).toUpperCase()}${part(letters, 1, 4)}-${part(digits, 5, 3)}`
}

// ---------------------------------------------------------------- Usuarios

export async function listUsers(): Promise<AppUser[]> {
  requireOnline()
  const { data, error } = await supabase.rpc('admin_list_users')
  if (error) throw adminError(error)
  return ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
    id: String(row.id),
    email: String(row.email ?? ''),
    fullName: String(row.full_name ?? ''),
    role: String(row.role ?? ''),
    active: Boolean(row.active),
    lastSignInAt: row.last_sign_in_at == null ? null : String(row.last_sign_in_at),
    createdAt: String(row.created_at ?? ''),
  }))
}

export async function createUser(input: { email: string; password: string; fullName: string; role: UserRole }): Promise<string> {
  requireOnline()
  const email = input.email.trim().toLowerCase()
  const fullName = cleanSingleLine(input.fullName, 120)
  if (!fullName) throw new Error('Escribe el nombre completo.')
  if (!EMAIL_PATTERN.test(email)) throw new Error('Escribe un correo válido (ejemplo: auxiliar@colegio.pe).')
  const passwordError = validatePassword(input.password)
  if (passwordError) throw new Error(passwordError)
  const { data, error } = await supabase.rpc('admin_create_user', { p_email: email, p_password: input.password, p_full_name: fullName, p_role: input.role })
  if (error) throw adminError(error)
  return String(data)
}

export async function updateUser(userId: string, input: { fullName: string; role: UserRole }): Promise<void> {
  requireOnline()
  const fullName = cleanSingleLine(input.fullName, 120)
  if (!fullName) throw new Error('Escribe el nombre completo.')
  const { error } = await supabase.rpc('admin_update_user', { p_user_id: userId, p_full_name: fullName, p_role: input.role })
  if (error) throw adminError(error)
}

export async function resetUserPassword(userId: string, password: string): Promise<void> {
  requireOnline()
  const passwordError = validatePassword(password)
  if (passwordError) throw new Error(passwordError)
  const { error } = await supabase.rpc('admin_set_user_password', { p_user_id: userId, p_password: password })
  if (error) throw adminError(error)
}

export async function setUserActive(userId: string, active: boolean): Promise<void> {
  requireOnline()
  const { error } = await supabase.rpc('admin_set_user_active', { p_user_id: userId, p_active: active })
  if (error) throw adminError(error)
}

// ---------------------------------------------------------------- Monitoreo de errores

export async function getAppErrors(sinceIso: string, limit = 300): Promise<AppErrorRecord[]> {
  requireOnline()
  const { data, error } = await supabase
    .from('app_errors')
    .select('id, created_at, user_id, module, action, message, error_code, details')
    .gte('created_at', sinceIso)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw adminError(error)
  return (data ?? []).map((row: Record<string, unknown>) => ({
    id: String(row.id),
    createdAt: String(row.created_at),
    userId: row.user_id == null ? null : String(row.user_id),
    module: String(row.module ?? ''),
    action: String(row.action ?? ''),
    message: String(row.message ?? ''),
    errorCode: row.error_code == null ? null : String(row.error_code),
    details: row.details && typeof row.details === 'object' ? row.details as Record<string, unknown> : {},
  }))
}

/** Cantidad de errores desde una fecha (para el aviso del menú). null si phase15 no está. */
export async function countAppErrorsSince(sinceIso: string): Promise<number | null> {
  if (!navigator.onLine) return null
  const { count, error } = await supabase.from('app_errors').select('id', { count: 'exact', head: true }).gte('created_at', sinceIso)
  if (error) return null
  return count ?? 0
}

export async function clearAppErrors(beforeIso: string): Promise<void> {
  requireOnline()
  const { error } = await supabase.from('app_errors').delete().lte('created_at', beforeIso)
  if (error) throw adminError(error)
}

export type ErrorGroup = { key: string; module: string; message: string; count: number; lastAt: string; users: number; sample: AppErrorRecord }

/** Agrupa errores repetidos (mismo módulo y mensaje) para ver primero los más frecuentes. */
export function groupAppErrors(errors: AppErrorRecord[]): ErrorGroup[] {
  const groups = new Map<string, { group: ErrorGroup; users: Set<string> }>()
  for (const item of errors) {
    const key = `${item.module}|${item.message}`
    const entry = groups.get(key)
    if (entry) {
      entry.group.count += 1
      if (item.createdAt > entry.group.lastAt) entry.group.lastAt = item.createdAt
      if (item.userId) entry.users.add(item.userId)
      entry.group.users = entry.users.size
    } else {
      const users = new Set(item.userId ? [item.userId] : [])
      groups.set(key, { group: { key, module: item.module, message: item.message, count: 1, lastAt: item.createdAt, users: users.size, sample: item }, users })
    }
  }
  return [...groups.values()].map((entry) => entry.group).sort((a, b) => b.count - a.count || b.lastAt.localeCompare(a.lastAt))
}

// ---------------------------------------------------------------- Copias automáticas

export async function listBackupSnapshots(): Promise<BackupSnapshotInfo[]> {
  requireOnline()
  const { data, error } = await supabase
    .from('backup_snapshots')
    .select('id, taken_at, kind, row_counts')
    .order('taken_at', { ascending: false })
  if (error) throw adminError(error)
  return (data ?? []).map((row: Record<string, unknown>) => ({
    id: String(row.id),
    takenAt: String(row.taken_at),
    kind: row.kind === 'MANUAL' ? 'MANUAL' : 'AUTO',
    rowCounts: (row.row_counts && typeof row.row_counts === 'object' ? row.row_counts : {}) as Record<string, number>,
  }))
}

export async function getBackupSnapshotData(id: string): Promise<Record<string, unknown[]>> {
  requireOnline()
  const { data, error } = await supabase.from('backup_snapshots').select('data').eq('id', id).single()
  if (error) throw adminError(error)
  return (data?.data ?? {}) as Record<string, unknown[]>
}

export async function takeBackupSnapshot(): Promise<void> {
  requireOnline()
  const { error } = await supabase.rpc('take_backup_snapshot', { p_kind: 'MANUAL' })
  if (error) throw adminError(error)
}
