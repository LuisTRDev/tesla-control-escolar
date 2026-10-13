import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/supabase', () => ({ supabase: {} }))
vi.mock('@/lib/offlineDb', () => ({ getSnapshot: vi.fn(), setSnapshot: vi.fn() }))

const { findPermission, getEffectiveSchedule, isMissingSchema } = await import('./dayStatusService')

const global = { enabled: true, minutes: 5 }

describe('getEffectiveSchedule', () => {
  const schedules = [{ level: 'Secundaria' as const, entryLimit: '07:30', toleranceEnabled: false, toleranceMinutes: 0 }]

  it('usa el horario propio del nivel si existe', () => {
    expect(getEffectiveSchedule('Secundaria', schedules, '07:45', global)).toEqual({ entryLimit: '07:30', tolerance: { enabled: false, minutes: 0 } })
  })

  it('usa el horario general si el nivel no tiene uno', () => {
    expect(getEffectiveSchedule('Primaria', schedules, '07:45', global)).toEqual({ entryLimit: '07:45', tolerance: global })
    expect(getEffectiveSchedule(undefined, schedules, '07:45', global).entryLimit).toBe('07:45')
  })
})

describe('findPermission', () => {
  const permissions = [
    { id: '1', studentId: '10', dateFrom: '2026-10-12', dateTo: '2026-10-14', kind: 'ABSENCE' as const, reason: 'Viaje', documentPath: null, createdByName: null },
    { id: '2', studentId: '10', dateFrom: '2026-10-20', dateTo: '2026-10-20', kind: 'LATE' as const, reason: 'Cita', documentPath: null, createdByName: null },
  ]

  it('encuentra el permiso vigente en el rango, incluidos los extremos', () => {
    expect(findPermission(permissions, '10', '2026-10-12')?.id).toBe('1')
    expect(findPermission(permissions, '10', '2026-10-14')?.id).toBe('1')
  })

  it('filtra por tipo y por alumno', () => {
    expect(findPermission(permissions, '10', '2026-10-13', 'LATE')).toBeUndefined()
    expect(findPermission(permissions, '10', '2026-10-20', 'LATE')?.id).toBe('2')
    expect(findPermission(permissions, '11', '2026-10-13')).toBeUndefined()
  })

  it('no aplica fuera del rango', () => {
    expect(findPermission(permissions, '10', '2026-10-15')).toBeUndefined()
  })
})

describe('isMissingSchema', () => {
  it('reconoce tablas o funciones aún no creadas', () => {
    expect(isMissingSchema({ code: '42P01' })).toBe(true)
    expect(isMissingSchema({ code: 'PGRST205' })).toBe(true)
    expect(isMissingSchema({ code: '23505' })).toBe(false)
    expect(isMissingSchema(null)).toBe(false)
  })
})
