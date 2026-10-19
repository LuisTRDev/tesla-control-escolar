import { beforeEach, describe, expect, it, vi } from 'vitest'

/** Permisos anticipados: no se registran repetidos (dayStatusService.createPermission). */

const { fake } = await vi.hoisted(async () => {
  const { FakeSupabase } = await import('@/test/fakeSupabase')
  return { fake: new FakeSupabase() }
})

vi.mock('@/lib/supabase', () => ({ supabase: fake }))
vi.mock('@/lib/offlineDb', () => ({ getSnapshot: vi.fn(), setSnapshot: vi.fn() }))

const { createPermission, markAbsences, registerEarlyExit, removeAbsence } = await import('@/services/dayStatusService')

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

describe('registerEarlyExit', () => {
  const exit = { studentId: '10', date: '2026-10-19', exitTime: '09:28', pickedUpByName: 'Luchito', pickedUpByDni: '', relationship: 'Tío', reason: 'Salud / malestar', isAuthorizedPerson: false, byName: 'Auxiliar' }
  const attendance = { id: '5', studentId: '10', date: '2026-10-19', time: '07:40', status: 'ON_TIME' as const }

  it('marca la salida del día con un origen que la base acepta', async () => {
    fake.seed('attendance', [{ id: 5, student_id: 10, date: '2026-10-19', entry_time: '07:40', status: 'ON_TIME' }])
    await registerEarlyExit({ ...exit, attendance })
    expect(fake.rows('attendance')[0]).toMatchObject({ exit_time: '09:28', exit_source: 'MANUAL' })
  })

  it('no deja registrar dos salidas anticipadas el mismo día', async () => {
    await registerEarlyExit(exit)
    await expect(registerEarlyExit({ ...exit, pickedUpByName: 'Luchito 2' })).rejects.toThrow(/ya tiene una salida anticipada/)
    expect(fake.rows('early_exits')).toHaveLength(1)
  })

  it('si falla marcar la salida en la asistencia, no deja la salida a medias', async () => {
    fake.seed('attendance', [{ id: 5, student_id: 10, date: '2026-10-19', entry_time: '07:40', status: 'ON_TIME' }])
    fake.failNext('attendance', 'update', { code: '23514', message: 'violates check constraint' })
    await expect(registerEarlyExit({ ...exit, attendance })).rejects.toMatchObject({ code: '23514' })
    expect(fake.rows('early_exits')).toHaveLength(0)
  })
})

describe('markAbsences / removeAbsence', () => {
  const students = [{ id: '10', classroomId: '1' }, { id: '11', classroomId: '1' }, { id: '12', classroomId: '1' }]

  it('marca faltas sin justificar y omite a quien ya tiene ingreso o falta', async () => {
    fake.seed('attendance', [{ id: 1, student_id: 11, date: '2026-10-19', entry_time: '07:40', status: 'ON_TIME' }])
    fake.seed('student_absences', [{ id: 1, student_id: 12, classroom_id: 1, date: '2026-10-19', status: 'PERMISSION' }])
    const saved = await markAbsences({ students, date: '2026-10-19' })
    expect(saved).toHaveLength(1)
    expect(saved[0]).toMatchObject({ studentId: '10', status: 'UNJUSTIFIED' })
    expect(fake.rows('student_absences').find((r) => r.student_id === 12)).toMatchObject({ status: 'PERMISSION' })
  })

  it('puede marcarlas ya justificadas', async () => {
    Object.assign(fake, { auth: { getSession: async () => ({ data: { session: { user: { id: 'u-1' } } } }) } })
    const saved = await markAbsences({ students: students.slice(0, 2), date: '2026-10-19', justification: { reason: 'Salud / cita médica', byName: 'Auxiliar' } })
    expect(saved.map((a) => a.status)).toEqual(['JUSTIFIED', 'JUSTIFIED'])
    expect(saved[0]).toMatchObject({ justificationReason: 'Salud / cita médica', justifiedByName: 'Auxiliar' })
  })

  it('quita una falta marcada por error, pero no una de permiso previo', async () => {
    const [absence] = await markAbsences({ students: students.slice(0, 1), date: '2026-10-19' })
    await removeAbsence(absence)
    expect(fake.rows('student_absences')).toHaveLength(0)
    await expect(removeAbsence({ ...absence, status: 'PERMISSION' })).rejects.toThrow(/permiso previo/)
  })

  it('requiere conexión', async () => {
    vi.stubGlobal('navigator', { onLine: false })
    await expect(markAbsences({ students, date: '2026-10-19' })).rejects.toThrow(/conexión/)
  })
})
