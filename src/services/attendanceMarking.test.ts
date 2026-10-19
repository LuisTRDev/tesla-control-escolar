import { beforeEach, describe, expect, it, vi } from 'vitest'

/** Marcado de asistencia: en línea, sin conexión y con permisos (schoolService). */

const { fake, queue } = await vi.hoisted(async () => {
  const { FakeSupabase } = await import('@/test/fakeSupabase')
  return { fake: new FakeSupabase(), queue: [] as Array<{ type: string; payload: Record<string, unknown> }> }
})

vi.mock('@/lib/supabase', () => ({ supabase: fake }))
vi.mock('@/lib/offlineDb', () => ({
  enqueueOperation: vi.fn(async (type: string, payload: Record<string, unknown>) => { queue.push({ type, payload }) }),
  getSnapshot: vi.fn(async () => null),
  setSnapshot: vi.fn(async () => undefined),
  listPendingOperations: vi.fn(async () => []),
  removePendingOperationFor: vi.fn(async () => false),
}))

const { registerAttendance, registerBulkAttendance, getAttendanceRange, updateAttendanceEntryTime } = await import('@/services/schoolService')

beforeEach(() => {
  fake.tables = {}
  fake.calls = []
  queue.length = 0
  vi.stubGlobal('navigator', { onLine: true })
})

describe('registerAttendance', () => {
  it('antes de la hora límite queda a tiempo', async () => {
    const rec = await registerAttendance('1', '07:45', '2026-10-12', '07:44')
    expect(rec.status).toBe('ON_TIME')
    expect(fake.rows('attendance')).toHaveLength(1)
  })

  it('después de la hora límite queda como tardanza', async () => {
    const rec = await registerAttendance('1', '07:45', '2026-10-12', '07:50')
    expect(rec.status).toBe('LATE')
  })

  it('con tolerancia activa, unos minutos tarde sigue siendo a tiempo', async () => {
    const rec = await registerAttendance('1', '07:45', '2026-10-12', '07:50', { enabled: true, minutes: 5 })
    expect(rec.status).toBe('ON_TIME')
  })

  it('una segunda marca el mismo día no reemplaza a la primera', async () => {
    await registerAttendance('1', '07:45', '2026-10-12', '07:40')
    const second = await registerAttendance('1', '07:45', '2026-10-12', '08:10')
    expect(fake.rows('attendance')).toHaveLength(1)
    expect(String(fake.rows('attendance')[0].entry_time)).toBe('07:40')
    expect(second.time).toBe('07:40')
  })

  it('con permiso de llegar tarde, la tardanza se guarda ya justificada', async () => {
    const rec = await registerAttendance('1', '07:45', '2026-10-12', '08:20', undefined, { reason: 'Permiso: cita médica', byName: 'Auxiliar' })
    expect(rec).toMatchObject({ status: 'LATE', justified: true, justificationReason: 'Permiso: cita médica' })
    expect(fake.rows('attendance')[0]).toMatchObject({ justified: true, justified_by_name: 'Auxiliar' })
  })

  it('sin conexión guarda la marca en la cola local con su estado calculado', async () => {
    vi.stubGlobal('navigator', { onLine: false })
    const rec = await registerAttendance('1', '07:45', '2026-10-12', '07:55')
    expect(rec.id).toMatch(/^offline-/)
    expect(rec.status).toBe('LATE')
    expect(queue).toEqual([{ type: 'ATTENDANCE_UPSERT', payload: expect.objectContaining({ studentId: '1', time: '07:55', status: 'LATE' }) }])
    expect(fake.calls).toHaveLength(0)
  })

  it('si el servidor falla, la marca no se pierde: queda en la cola', async () => {
    fake.failNext('attendance', 'upsert', { message: 'Failed to fetch' })
    const rec = await registerAttendance('1', '07:45', '2026-10-12', '07:40')
    expect(rec.id).toMatch(/^offline-/)
    expect(queue).toHaveLength(1)
    expect(queue[0].payload.entryRecordedAt).toEqual(expect.any(String))
  })

  it('si el servidor rechaza la marca (CHECK), avisa en el momento y no la esconde en la cola', async () => {
    fake.failNext('attendance', 'upsert', { code: '23514', message: 'new row violates check constraint "notifications_notification_number_check"' })
    await expect(registerAttendance('1', '07:45', '2026-10-12', '08:15')).rejects.toMatchObject({ code: '23514' })
    expect(queue).toHaveLength(0)
  })
})

describe('registerBulkAttendance', () => {
  it('marca a tiempo con la hora límite y respeta a quien ya tenía marca', async () => {
    fake.seed('attendance', [{ id: 1, student_id: 2, date: '2026-10-12', entry_time: '08:00', status: 'LATE' }])
    await registerBulkAttendance(['1', '2', '3'], '07:45', '2026-10-12')
    const rows = fake.rows('attendance')
    expect(rows).toHaveLength(3)
    expect(rows.find((r) => r.student_id === 2)).toMatchObject({ entry_time: '08:00', status: 'LATE' })
    expect(rows.find((r) => r.student_id === 1)).toMatchObject({ entry_time: '07:45', status: 'ON_TIME' })
  })
})

describe('getAttendanceRange', () => {
  it('trae todas las filas aunque pasen de 1000 (pide por páginas)', async () => {
    fake.seed('attendance', Array.from({ length: 2345 }, (_, i) => ({
      id: i + 1, student_id: (i % 450) + 1, date: `2026-10-${String((i % 28) + 1).padStart(2, '0')}`, entry_time: '07:40:00', status: 'ON_TIME',
    })))
    const records = await getAttendanceRange('2026-10-01', '2026-10-31')
    expect(records).toHaveLength(2345)
    expect(fake.calls.filter((c) => c.table === 'attendance').length).toBe(3)
  })
})

describe('updateAttendanceEntryTime con una marca aún en la cola', () => {
  it('corrige la hora en la cola local, aun sin Internet', async () => {
    vi.stubGlobal('navigator', { onLine: false })
    const { listPendingOperations } = await import('@/lib/offlineDb')
    vi.mocked(listPendingOperations).mockResolvedValueOnce([{
      id: 'op-1', type: 'ATTENDANCE_UPSERT', createdAt: '2026-10-12T13:15:00.000Z', retryCount: 27, lastError: 'x', blocked: true,
      payload: { studentId: '1', date: '2026-10-12', time: '08:15', status: 'LATE', entryRecordedAt: '2026-10-12T13:15:00.000Z' },
    }])
    const rec = await updateAttendanceEntryTime({ id: 'offline-attendance-1-2026-10-12', studentId: '1', date: '2026-10-12', time: '08:15', status: 'LATE' }, '07:15', '07:45')
    expect(rec).toMatchObject({ time: '07:15', status: 'ON_TIME' })
    expect(queue).toEqual([{ type: 'ATTENDANCE_UPSERT', payload: expect.objectContaining({ time: '07:15', status: 'ON_TIME', entryRecordedAt: '2026-10-12T13:15:00.000Z' }) }])
    expect(fake.calls).toHaveLength(0)
  })

  it('si la marca ya salió de la cola, pide actualizar la lista', async () => {
    await expect(updateAttendanceEntryTime({ id: 'offline-attendance-1-2026-10-12', studentId: '1', date: '2026-10-12', time: '08:15', status: 'LATE' }, '07:15', '07:45'))
      .rejects.toThrow(/ya se envió/)
  })
})
