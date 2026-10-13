/**
 * Traduce errores técnicos (Supabase/PostgreSQL, red, sesión) a mensajes que dicen
 * qué pasó y qué hacer. Los mensajes propios de la app (new Error('...') en los
 * servicios) ya están redactados para el usuario y se muestran tal cual.
 */

type Rule = { test: (text: string, code: string) => boolean; message: string }

export const ERROR_HINTS = {
  offline: 'No hay conexión con el servidor. Revisa el Wi-Fi o los datos móviles y vuelve a intentar.',
  session: 'Tu sesión expiró. Cierra sesión y vuelve a entrar con tu usuario.',
  permission: 'No tienes permiso para hacer esto. Pide al administrador que lo haga o que revise tu rol.',
  duplicate: 'Ya existe un registro igual (por ejemplo, el mismo DNI o la misma marca del día). Revisa la lista antes de volver a guardar.',
  related: 'No se puede completar porque el registro está ligado a otros datos (asistencias, apoderados u otros). Inhabilítalo en lugar de borrarlo.',
  missingSql: 'La base de datos no está actualizada para esta función. Pide al administrador que ejecute los scripts SQL pendientes en Supabase.',
  invalid: 'Algún dato no tiene un valor permitido. Revisa los campos e inténtalo otra vez.',
  timeout: 'El servidor tardó demasiado en responder. Espera unos segundos y vuelve a intentar.',
  rateLimit: 'Se hicieron demasiados intentos seguidos. Espera un minuto y vuelve a intentar.',
} as const

const RULES: Rule[] = [
  { test: (t) => /failed to fetch|networkerror|network request failed|load failed|fetch failed|err_internet|offline/.test(t), message: ERROR_HINTS.offline },
  { test: (t, c) => /jwt|refresh token|session (expired|missing|not found)|invalid claim/.test(t) || c === 'PGRST301', message: ERROR_HINTS.session },
  { test: (t, c) => c === '42501' || /row-level security|permission denied/.test(t), message: ERROR_HINTS.permission },
  { test: (t, c) => c === '23505' || /duplicate key/.test(t), message: ERROR_HINTS.duplicate },
  { test: (t, c) => c === '23503' || /foreign key/.test(t), message: ERROR_HINTS.related },
  { test: (t, c) => ['42P01', '42883', '42703', 'PGRST202', 'PGRST204', 'PGRST205'].includes(c) || /does not exist|could not find the (function|table|column)|schema cache/.test(t), message: ERROR_HINTS.missingSql },
  { test: (t, c) => c === '23514' || c === '22P02' || c === '22007' || /violates check constraint|invalid input syntax/.test(t), message: ERROR_HINTS.invalid },
  { test: (t, c) => c === '57014' || /timeout|timed out|statement timeout/.test(t), message: ERROR_HINTS.timeout },
  { test: (t, c) => c === '429' || /rate limit|too many requests/.test(t), message: ERROR_HINTS.rateLimit },
]

function errorParts(error: unknown): { message: string; code: string; isAppError: boolean } {
  if (typeof error === 'string') return { message: error, code: '', isAppError: true }
  if (error && typeof error === 'object') {
    const value = error as Record<string, unknown>
    const message = typeof value.message === 'string' ? value.message : ''
    const code = typeof value.code === 'string' ? value.code : typeof value.status === 'number' ? String(value.status) : ''
    // Los errores de Supabase traen code/details/hint; los propios de la app no.
    const isAppError = error instanceof Error && !('code' in value) && !('details' in value) && !('hint' in value)
    return { message, code, isAppError }
  }
  return { message: '', code: '', isAppError: false }
}

/** Mensaje técnico reconocido → instrucción clara. Devuelve null si no se reconoce. */
export function knownErrorHint(error: unknown): string | null {
  const { message, code } = errorParts(error)
  const text = message.toLowerCase()
  if (!text && !code) return null
  return RULES.find((rule) => rule.test(text, code))?.message ?? null
}

/**
 * Mensaje para mostrar al usuario. `fallback` describe la acción que falló
 * ("No se pudo registrar la entrada."); se completa con qué hacer.
 */
export function friendlyError(error: unknown, fallback = 'No se pudo completar la acción.'): string {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return ERROR_HINTS.offline
  const hint = knownErrorHint(error)
  if (hint) return hint
  const { message, isAppError } = errorParts(error)
  if (isAppError && message.trim()) return message.trim().slice(0, 300)
  return `${fallback} Vuelve a intentarlo; si se repite, avisa al administrador.`
}
