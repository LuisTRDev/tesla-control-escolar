import { afterEach, describe, expect, it, vi } from 'vitest'
import { ERROR_HINTS, friendlyError, isPermanentServerError, knownErrorHint } from '@/lib/errorMessages'

afterEach(() => { vi.unstubAllGlobals() })

describe('friendlyError', () => {
  it('sin conexión siempre explica que falta Internet', () => {
    vi.stubGlobal('navigator', { onLine: false })
    expect(friendlyError(new Error('lo que sea'))).toBe(ERROR_HINTS.offline)
  })

  it('reconoce los errores de red del navegador', () => {
    vi.stubGlobal('navigator', { onLine: true })
    expect(friendlyError(new TypeError('Failed to fetch'))).toBe(ERROR_HINTS.offline)
  })

  it('traduce los códigos de PostgreSQL más comunes', () => {
    vi.stubGlobal('navigator', { onLine: true })
    expect(friendlyError({ code: '42501', message: 'permission denied for table students' })).toBe(ERROR_HINTS.permission)
    expect(friendlyError({ code: '23505', message: 'duplicate key value violates unique constraint' })).toBe(ERROR_HINTS.duplicate)
    expect(friendlyError({ code: '23503', message: 'violates foreign key constraint' })).toBe(ERROR_HINTS.related)
    expect(friendlyError({ code: 'PGRST202', message: 'Could not find the function public.x' })).toBe(ERROR_HINTS.missingSql)
    expect(friendlyError({ code: '57014', message: 'canceling statement due to statement timeout' })).toBe(ERROR_HINTS.timeout)
  })

  it('reconoce la sesión vencida', () => {
    vi.stubGlobal('navigator', { onLine: true })
    expect(friendlyError({ message: 'JWT expired', code: 'PGRST301' })).toBe(ERROR_HINTS.session)
  })

  it('deja pasar los mensajes propios de la app, que ya son claros', () => {
    vi.stubGlobal('navigator', { onLine: true })
    expect(friendlyError(new Error('El alumno no tiene entrada registrada hoy.'))).toBe('El alumno no tiene entrada registrada hoy.')
  })

  it('un error técnico desconocido dice qué falló y qué hacer, sin mostrar el detalle interno', () => {
    vi.stubGlobal('navigator', { onLine: true })
    const message = friendlyError({ code: 'XX000', message: 'internal error in plpgsql function', details: 'x' }, 'No se pudo guardar la justificación.')
    expect(message).toContain('No se pudo guardar la justificación.')
    expect(message).toMatch(/administrador/)
    expect(message).not.toContain('plpgsql')
  })

  it('knownErrorHint devuelve null si no reconoce el error', () => {
    expect(knownErrorHint(new Error('algo raro'))).toBeNull()
    expect(knownErrorHint(null)).toBeNull()
  })
})

describe('isPermanentServerError', () => {
  it('un CHECK o un permiso rechazado por la base no se arregla reintentando', () => {
    vi.stubGlobal('navigator', { onLine: true })
    expect(isPermanentServerError({ code: '23514', message: 'violates check constraint' })).toBe(true)
    expect(isPermanentServerError({ code: '42501', message: 'permission denied' })).toBe(true)
  })

  it('la red, el tiempo agotado, la sesión y los errores HTTP sin código son pasajeros', () => {
    vi.stubGlobal('navigator', { onLine: true })
    expect(isPermanentServerError(new TypeError('Failed to fetch'))).toBe(false)
    expect(isPermanentServerError({ code: '', message: 'TypeError: Failed to fetch' })).toBe(false)
    expect(isPermanentServerError({ code: '57014', message: 'canceling statement due to statement timeout' })).toBe(false)
    expect(isPermanentServerError({ code: 'PGRST301', message: 'JWT expired' })).toBe(false)
    expect(isPermanentServerError({ status: 503, message: 'Service Unavailable' })).toBe(false)
    expect(isPermanentServerError(new Error('mensaje propio'))).toBe(false)
  })

  it('sin conexión nunca es permanente', () => {
    vi.stubGlobal('navigator', { onLine: false })
    expect(isPermanentServerError({ code: '23514', message: 'violates check constraint' })).toBe(false)
  })
})
