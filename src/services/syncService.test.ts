import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SyncQueueItem } from '@/lib/offlineDb'
import type { SyncConflict } from '@/lib/syncConflicts'

const state = vi.hoisted(() => ({
  queue: [] as SyncQueueItem[],
  conflicts: [] as SyncConflict[],
  meta: {} as Record<string, unknown>,
}))

const { fake } = await vi.hoisted(async () => {
  const { FakeSupabase } = await import('@/test/fakeSupabase')
  return { fake: new FakeSupabase() }
})

vi.mock('@/lib/supabase', () => ({ supabase: fake }))
vi.mock('@/lib/offlineDb', () => ({
  listPendingOperations: vi.fn(async () => [...state.queue]),
  removePendingOperation: vi.fn(async (id: string) => { state.queue = state.queue.filter((item) => item.id !== id) }),
  updatePendingOperation: vi.fn(async (item: SyncQueueItem) => { state.queue = state.queue.map((q) => (q.id === item.id ? item : q)) }),
  setMeta: vi.fn(async (key: string, value: unknown) => { state.meta[key] = value }),
  addSyncConflict: vi.fn(async (conflict: SyncConflict) => { state.conflicts.unshift(conflict) }),
  getSnapshot: vi.fn(async () => null),
  setSnapshot: vi.fn(async () => undefined),
}))

const { flushSyncQueue } = await import('@/services/syncService')

function op(type: SyncQueueItem['type'], payload: Record<string, unknown>, id = `${type}-${state.queue.length}`): SyncQueueItem {
  return { id, type, payload, createdAt: new Date().toISOString(), retryCount: 0 }
}

const entry = (time: string, status = 'ON_TIME', studentId = '1') => op('ATTENDANCE_UPSERT', { studentId, date: '2026-10-12', time, status })

beforeEach(() => {
  state.queue = []
  state.conflicts = []
  state.meta = {}
  fake.tables = {}
  fake.calls = []
  fake.seed('students', [{ id: 1, access_authorized: true }, { id: 2, access_authorized: false }])
  vi.stubGlobal('navigator', { onLine: true })
})

describe('flushSyncQueue — entradas', () => {
  it('sincroniza una tardanza sin hora con entry_time vacío', async () => {
    state.queue = [entry('', 'LATE')]
    const result = await flushSyncQueue()
    expect(result).toMatchObject({ sent: 1, failed: 0 })
    expect(fake.rows('attendance')[0]).toMatchObject({ student_id: 1, entry_time: null, status: 'LATE' })
  })

  it('rechaza una entrada sin hora que no sea tardanza', async () => {
    state.queue = [entry('', 'ON_TIME')]
    const result = await flushSyncQueue()
    expect(result.failed).toBe(1)
  })

  it('envía una entrada pendiente y la quita de la cola', async () => {
    state.queue = [entry('07:40')]
    const result = await flushSyncQueue()
    expect(result).toMatchObject({ sent: 1, failed: 0, remaining: 0, conflicts: 0 })
    expect(fake.rows('attendance')).toHaveLength(1)
    expect(fake.rows('attendance')[0]).toMatchObject({ student_id: 1, entry_time: '07:40', status: 'ON_TIME' })
    expect(state.meta.last_sync).toBeTruthy()
  })

  it('una tardanza sincronizada genera su notificación', async () => {
    state.queue = [entry('08:05', 'LATE')]
    await flushSyncQueue()
    const notifications = fake.rows('notifications')
    expect(notifications).toHaveLength(1)
    expect(notifications[0]).toMatchObject({ notification_type: 'LATE_ENTRY', notification_number: 1 })
  })

  it('si otro equipo marcó antes, conserva esa hora y registra el conflicto', async () => {
    fake.seed('attendance', [{ id: 10, student_id: 1, date: '2026-10-12', entry_time: '07:30:00', status: 'ON_TIME' }])
    state.queue = [entry('07:50', 'LATE')]
    const result = await flushSyncQueue()
    expect(result).toMatchObject({ sent: 1, conflicts: 1 })
    expect(fake.rows('attendance')[0]).toMatchObject({ entry_time: '07:30:00', status: 'ON_TIME' })
    expect(state.conflicts[0]).toMatchObject({ kind: 'ENTRY', resolution: 'KEEP_REMOTE', localValue: '07:50', remoteValue: '07:30' })
    expect(fake.rows('notifications')).toHaveLength(0)
  })

  it('si este equipo marcó antes, reemplaza la hora del servidor por la más temprana', async () => {
    fake.seed('attendance', [{ id: 10, student_id: 1, date: '2026-10-12', entry_time: '07:55:00', status: 'LATE' }])
    state.queue = [entry('07:35')]
    await flushSyncQueue()
    expect(fake.rows('attendance')[0]).toMatchObject({ entry_time: '07:35', status: 'ON_TIME' })
    expect(state.conflicts[0]).toMatchObject({ resolution: 'USE_LOCAL' })
  })

  it('la misma hora en ambos equipos no es un conflicto', async () => {
    fake.seed('attendance', [{ id: 10, student_id: 1, date: '2026-10-12', entry_time: '07:40:00', status: 'ON_TIME' }])
    state.queue = [entry('07:40')]
    const result = await flushSyncQueue()
    expect(result.conflicts).toBe(0)
    expect(state.queue).toHaveLength(0)
  })

  it('no sube la entrada de un alumno que quedó no autorizado y explica por qué', async () => {
    state.queue = [entry('07:40', 'ON_TIME', '2')]
    const result = await flushSyncQueue()
    expect(result).toMatchObject({ sent: 0, failed: 1, remaining: 1 })
    expect(state.queue[0].retryCount).toBe(1)
    expect(state.queue[0].lastError).toContain('NO AUTORIZADO')
    expect(state.queue[0].lastAttemptAt).toBeTruthy()
  })

  it('guarda como hora de registro el momento real del toque, no el del envío', async () => {
    state.queue = [op('ATTENDANCE_UPSERT', { studentId: '1', date: '2026-10-12', time: '07:40', status: 'ON_TIME', entryRecordedAt: '2026-10-12T12:40:05.000Z' })]
    await flushSyncQueue()
    expect(fake.rows('attendance')[0]).toMatchObject({ entry_recorded_at: '2026-10-12T12:40:05.000Z' })
  })

  it('un rechazo del servidor queda bloqueado y ya no se reintenta solo, pero sí a pedido', async () => {
    fake.failNext('attendance', 'upsert', { code: '23514', message: 'violates check constraint' })
    state.queue = [entry('08:15', 'LATE')]
    const first = await flushSyncQueue()
    expect(first).toMatchObject({ failed: 1, blocked: 1, remaining: 1 })
    expect(state.queue[0].blocked).toBe(true)

    const auto = await flushSyncQueue()
    expect(auto).toMatchObject({ sent: 0, failed: 0, remaining: 1 })

    const manual = await flushSyncQueue({ onlyIds: [state.queue[0].id] })
    expect(manual).toMatchObject({ sent: 1, remaining: 0 })
  })

  it('traduce errores técnicos de la base a un mensaje claro', async () => {
    fake.failNext('attendance', 'upsert', { code: '42501', message: 'new row violates row-level security policy' })
    state.queue = [entry('07:40')]
    await flushSyncQueue()
    expect(state.queue[0].lastError).toMatch(/permiso/i)
  })
})

describe('flushSyncQueue — salidas', () => {
  it('falla con un mensaje claro si no existe la entrada en el servidor', async () => {
    state.queue = [op('ATTENDANCE_EXIT_UPSERT', { studentId: '1', date: '2026-10-12', exitTime: '13:00' })]
    await flushSyncQueue()
    expect(state.queue[0].lastError).toMatch(/No existe una entrada/)
  })

  it('conserva la salida más temprana si otro equipo ya la marcó', async () => {
    fake.seed('attendance', [{ id: 10, student_id: 1, date: '2026-10-12', entry_time: '07:40:00', exit_time: '12:50:00', status: 'ON_TIME' }])
    state.queue = [op('ATTENDANCE_EXIT_UPSERT', { studentId: '1', date: '2026-10-12', exitTime: '13:10' })]
    const result = await flushSyncQueue()
    expect(result.conflicts).toBe(1)
    expect(fake.rows('attendance')[0].exit_time).toBe('12:50:00')
  })

  it('registra la salida cuando no había ninguna', async () => {
    fake.seed('attendance', [{ id: 10, student_id: 1, date: '2026-10-12', entry_time: '07:40:00', exit_time: null, status: 'ON_TIME' }])
    state.queue = [op('ATTENDANCE_EXIT_UPSERT', { studentId: '1', date: '2026-10-12', exitTime: '13:10' })]
    await flushSyncQueue()
    expect(fake.rows('attendance')[0].exit_time).toBe('13:10')
  })
})

describe('flushSyncQueue — presentación', () => {
  const presentation = (status: 'COMPLIANT' | 'NON_COMPLIANT', flags: Record<string, boolean> = {}, observation = '') =>
    op('PRESENTATION_UPSERT', { studentId: '1', date: '2026-10-12', status, observation, checkedAt: '07:45', ...flags })

  it('un "conforme" offline no borra una incidencia registrada por otro equipo', async () => {
    fake.seed('presentation_controls', [{ id: 50, student_id: 1, date: '2026-10-12', status: 'NON_COMPLIANT', other_description: 'Sin corbata' }])
    fake.seed('presentation_violations', [{ id: 1, presentation_control_id: 50, violation_type: 'UNIFORM_INCOMPLETE' }])
    state.queue = [presentation('COMPLIANT')]
    const result = await flushSyncQueue()
    expect(result.conflicts).toBe(1)
    expect(fake.rows('presentation_controls')[0].status).toBe('NON_COMPLIANT')
    expect(fake.rows('presentation_violations')).toHaveLength(1)
    expect(state.conflicts[0]).toMatchObject({ kind: 'PRESENTATION', resolution: 'KEEP_REMOTE' })
  })

  it('si ambos equipos registraron incidencias distintas, se unen', async () => {
    fake.seed('presentation_controls', [{ id: 50, student_id: 1, date: '2026-10-12', status: 'NON_COMPLIANT', other_description: 'Sin corbata' }])
    fake.seed('presentation_violations', [{ id: 1, presentation_control_id: 50, violation_type: 'UNIFORM_INCOMPLETE' }])
    state.queue = [presentation('NON_COMPLIANT', { hairstyleViolation: true }, 'Cabello largo')]
    await flushSyncQueue()
    const types = fake.rows('presentation_violations').map((v) => v.violation_type).sort()
    expect(types).toEqual(['HAIRSTYLE', 'UNIFORM_INCOMPLETE'])
    expect(fake.rows('presentation_controls')[0].other_description).toBe('Sin corbata / Cabello largo')
    expect(state.conflicts[0].resolution).toBe('MERGE')
  })

  it('sin registro previo guarda el control y sus incumplimientos', async () => {
    state.queue = [presentation('NON_COMPLIANT', { hairstyleViolation: true })]
    const result = await flushSyncQueue()
    expect(result).toMatchObject({ sent: 1, conflicts: 0 })
    expect(fake.rows('presentation_violations').map((v) => v.violation_type)).toEqual(['HAIRSTYLE'])
    expect(fake.rows('notifications')).toHaveLength(1)
  })
})

describe('flushSyncQueue — control', () => {
  it('sin conexión no envía nada', async () => {
    vi.stubGlobal('navigator', { onLine: false })
    state.queue = [entry('07:40')]
    const result = await flushSyncQueue()
    expect(result).toEqual({ sent: 0, failed: 0, remaining: 1, conflicts: 0, blocked: 0 })
    expect(fake.calls).toHaveLength(0)
  })

  it('dos pedidos simultáneos comparten la misma sincronización', async () => {
    state.queue = [entry('07:40')]
    const [a, b] = await Promise.all([flushSyncQueue(), flushSyncQueue()])
    expect(a).toBe(b)
    expect(fake.rows('attendance')).toHaveLength(1)
  })

  it('"Reintentar" procesa solo la operación elegida', async () => {
    state.queue = [entry('07:40', 'ON_TIME', '1'), op('ATTENDANCE_UPSERT', { studentId: '1', date: '2026-10-13', time: '07:41', status: 'ON_TIME' }, 'second')]
    const result = await flushSyncQueue({ onlyIds: ['second'] })
    expect(result.sent).toBe(1)
    expect(state.queue.map((item) => item.id)).not.toContain('second')
    expect(state.queue).toHaveLength(1)
  })

  it('un tipo de operación desconocido queda con error y no bloquea a las demás', async () => {
    state.queue = [op('OTRA_COSA' as SyncQueueItem['type'], {}), entry('07:40')]
    const result = await flushSyncQueue()
    expect(result).toMatchObject({ sent: 1, failed: 1 })
  })
})
