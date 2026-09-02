import { supabase } from '@/lib/supabase'

export type ApplicationErrorContext = {
  module?: string
  action?: string
  error?: unknown
  message?: string
  code?: string | null
  metadata?: Record<string, unknown>
}

let installed = false
let lastFingerprint = ''
let lastFingerprintAt = 0

function normalizeError(error: unknown) {
  if (error instanceof Error) {
    return { message: error.message, stack: error.stack ?? null }
  }

  if (typeof error === 'string') {
    return { message: error, stack: null }
  }

  if (error && typeof error === 'object') {
    const value = error as Record<string, unknown>
    return {
      message: typeof value.message === 'string' ? value.message : 'Error desconocido',
      stack: typeof value.stack === 'string' ? value.stack : null,
    }
  }

  return { message: 'Error desconocido', stack: null }
}

function getSupabaseError(error: unknown) {
  if (!error || typeof error !== 'object') return { code: null, message: null, details: null, hint: null }
  const value = error as Record<string, unknown>
  return {
    code: typeof value.code === 'string' ? value.code : null,
    message: typeof value.message === 'string' ? value.message : null,
    details: typeof value.details === 'string' ? value.details : null,
    hint: typeof value.hint === 'string' ? value.hint : null,
  }
}

function safeJsonMetadata(metadata?: Record<string, unknown>) {
  if (!metadata) return {}
  try {
    return JSON.parse(JSON.stringify(metadata, (_key, value) => {
      if (typeof value === 'string' && value.length > 2000) return value.slice(0, 2000) + '…'
      if (value instanceof File || value instanceof Blob) return `[${value.constructor.name}]`
      return value
    })) as Record<string, unknown>
  } catch {
    return { metadataSerialization: 'failed' }
  }
}

function fingerprint(context: ApplicationErrorContext, message: string) {
  return `${context.module ?? ''}|${context.action ?? ''}|${context.code ?? ''}|${message}`
}

export async function logApplicationError(context: ApplicationErrorContext) {
  const normalized = normalizeError(context.error)
  const supabaseError = getSupabaseError(context.error)
  const message = context.message?.trim() || supabaseError.message || normalized.message
  const code = context.code ?? supabaseError.code
  const now = Date.now()
  const fp = fingerprint(context, message)

  // Evita inundar audit_logs si un navegador repite el mismo error en un bucle.
  if (fp === lastFingerprint && now - lastFingerprintAt < 5000) return
  lastFingerprint = fp
  lastFingerprintAt = now

  const payload = {
    module: context.module ?? 'Aplicación',
    action: context.action ?? 'unknown',
    message,
    error_code: code,
    stack: normalized.stack,
    url: typeof window !== 'undefined' ? window.location.href : null,
    user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
    online: typeof navigator !== 'undefined' ? navigator.onLine : null,
    supabase_details: supabaseError.details,
    supabase_hint: supabaseError.hint,
    metadata: safeJsonMetadata(context.metadata),
  }

  try {
    const { error } = await supabase.rpc('log_application_error', {
      p_module: payload.module,
      p_action: payload.action,
      p_message: payload.message,
      p_error_code: payload.error_code,
      p_details: payload,
    })

    // El logger no debe provocar un bucle de errores si Supabase falla.
    if (error) console.warn('[Tesla] No se pudo guardar el error en audit_logs', error)
  } catch (loggerError) {
    console.warn('[Tesla] Error del logger', loggerError)
  }
}

export function installGlobalErrorLogging() {
  if (installed || typeof window === 'undefined') return
  installed = true

  window.addEventListener('error', (event) => {
    void logApplicationError({
      module: 'Frontend',
      action: 'window.error',
      error: event.error ?? event.message,
      metadata: {
        source: event.filename || null,
        line: event.lineno || null,
        column: event.colno || null,
      },
    })
  })

  window.addEventListener('unhandledrejection', (event) => {
    void logApplicationError({
      module: 'Frontend',
      action: 'unhandledrejection',
      error: event.reason,
    })
  })
}

export function installSupabaseErrorLogging() {
  // Intencionalmente vacío: los servicios pueden invocar logApplicationError en sus catch.
  installGlobalErrorLogging()
}
