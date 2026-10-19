import { beforeEach, describe, expect, it, vi } from 'vitest'

/** Permisos anticipados: no se registran repetidos (dayStatusService.createPermission). */

const { fake } = await vi.hoisted(async () => {
  const { FakeSupabase } = await import('@/test/fakeSupabase')
  return { fake: new FakeSupabase() }
})

vi.mock('@/lib/supabase', () => ({ supabase: fake }))
vi.mock('@/lib/offlineDb', () => ({ getSnapshot: vi.fn(), setSnapshot: vi.fn() }))

const { createPermission } = await import('@/services/dayStatusService')

const input = { studentId: '10', dateFrom: '2026-10-19', dateTo: '2026-10-21', kind: 'ABSENCE' as const, reason: 'Salud / cita médica', byName: 'Auxiliar' }

beforeEach(() => {
  fake.tables = {}
  fake.calls = []
  vi.stubGlobal('navigator', { onLine: true })
})

describe('createPermission', () => {
  it('no deja registrar dos veces el mismo permiso', async () => {
    await createPermission(input)
    await expect(createPermission(input)).rejects.toThrow(/ya tiene un permiso/)
    expect(fake.rows('student_permissions')).toHaveLength(1)
  })

  it('tampoco si un permiso más largo ya cubre esas fechas', async () => {
    await createPermission(input)
    await expect(createPermission({ ...input, dateFrom: '2026-10-20', dateTo: '2026-10-20' })).rejects.toThrow(/ya tiene un permiso/)
  })

  it('sí deja registrar otro tipo, otro alumno o fechas que el anterior no cubre', async () => {
    await createPermission(input)
    await createPermission({ ...input, kind: 'LATE', dateTo: '2026-10-19' })
    await createPermission({ ...input, studentId: '11' })
    await createPermission({ ...input, dateFrom: '2026-10-21', dateTo: '2026-10-23' })
    expect(fake.rows('student_permissions')).toHaveLength(4)
  })
})
