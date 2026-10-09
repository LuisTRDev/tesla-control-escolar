import { beforeEach, describe, expect, it, vi } from 'vitest'

const studentRows: unknown[] = []

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        order: async () => ({ data: studentRows, error: null }),
      }),
    }),
  },
}))

vi.mock('@/lib/offlineDb', () => ({
  enqueueOperation: vi.fn(),
  getSnapshot: vi.fn(async () => null),
  listPendingOperations: vi.fn(async () => []),
  setSnapshot: vi.fn(async () => undefined),
}))

const { calculateStatus, getStudents } = await import('@/services/schoolService')

describe('calculateStatus', () => {
  it('a la hora límite exacta es puntual', () => {
    expect(calculateStatus('07:45', '07:45')).toBe('ON_TIME')
  })

  it('un minuto después es tardanza', () => {
    expect(calculateStatus('07:46', '07:45')).toBe('LATE')
  })

  it('la tolerancia activa extiende el límite', () => {
    const tolerance = { enabled: true, minutes: 10 }
    expect(calculateStatus('07:55', '07:45', tolerance)).toBe('ON_TIME')
    expect(calculateStatus('07:56', '07:45', tolerance)).toBe('LATE')
  })

  it('la tolerancia desactivada se ignora', () => {
    expect(calculateStatus('07:50', '07:45', { enabled: false, minutes: 10 })).toBe('LATE')
  })

  it('la tolerancia cruza la hora correctamente', () => {
    expect(calculateStatus('08:05', '07:55', { enabled: true, minutes: 15 })).toBe('ON_TIME')
  })

  it('la tolerancia no da la vuelta al día siguiente', () => {
    expect(calculateStatus('23:59', '23:50', { enabled: true, minutes: 30 })).toBe('ON_TIME')
  })
})

describe('getStudents (mapeo alumno ↔ apoderados)', () => {
  beforeEach(() => { studentRows.length = 0 })

  it('pone primero al apoderado principal y lo usa como apoderado del alumno', async () => {
    studentRows.push({
      id: 1, classroom_id: 3, first_name: 'Camila', last_name: 'Torres', dni: '12345678',
      access_authorized: null, access_note: null,
      student_guardians: [
        { relationship: 'Padre', is_primary: false, guardians: { id: 10, fullName: 'Carlos Torres', dni: '11111111', phone: '999111222' } },
        { relationship: 'Madre', is_primary: true, guardians: [{ id: 11, fullName: 'Rosa Mendoza', dni: '22222222', phone: '999333444' }] },
      ],
    })

    const [student] = await getStudents()
    expect(student.id).toBe('1')
    expect(student.classroomId).toBe('3')
    expect(student.guardianName).toBe('Rosa Mendoza')
    expect(student.guardianPhone).toBe('999333444')
    expect(student.guardians?.map((g) => g.fullName)).toEqual(['Rosa Mendoza', 'Carlos Torres'])
    expect(student.guardians?.[0]).toMatchObject({ relationship: 'Madre', isPrimary: true })
  })

  it('sin apoderado usa el texto por defecto', async () => {
    studentRows.push({
      id: 2, classroom_id: null, first_name: 'Mateo', last_name: 'Ramírez', dni: null,
      access_authorized: false, access_note: 'Deuda', student_guardians: [],
    })

    const [student] = await getStudents()
    expect(student.guardianName).toBe('Sin apoderado registrado')
    expect(student.guardians).toEqual([])
    expect(student.classroomId).toBe('')
    expect(student.accessAuthorized).toBe(false)
  })

  it('access_authorized null se interpreta como autorizado', async () => {
    studentRows.push({
      id: 3, classroom_id: 1, first_name: 'Luciana', last_name: 'Pérez', dni: null,
      access_authorized: null, access_note: null, student_guardians: null,
    })

    const [student] = await getStudents()
    expect(student.accessAuthorized).toBe(true)
  })

  it('mapea el estado inhabilitado con su motivo', async () => {
    studentRows.push({
      id: 4, classroom_id: 1, first_name: 'Diego', last_name: 'Salas', dni: null,
      access_authorized: null, access_note: null, student_guardians: null,
      is_active: false, inactive_reason: 'Suspensión', inactive_note: '5 días', inactive_since: '2026-10-09',
    })

    const [student] = await getStudents()
    expect(student).toMatchObject({ isActive: false, inactiveReason: 'Suspensión', inactiveNote: '5 días', inactiveSince: '2026-10-09' })
  })

  it('sin columna is_active (fase 10 sin ejecutar) el alumno queda activo', async () => {
    studentRows.push({
      id: 5, classroom_id: 1, first_name: 'Ana', last_name: 'Ríos', dni: null,
      access_authorized: null, access_note: null, student_guardians: null,
    })

    const [student] = await getStudents()
    expect(student.isActive).toBe(true)
  })
})
