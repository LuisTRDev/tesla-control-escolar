import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AttendanceRecord, PresentationRecord } from '@/types'

const { fake } = await vi.hoisted(async () => {
  const { FakeSupabase } = await import('@/test/fakeSupabase')
  return { fake: new FakeSupabase() }
})

vi.mock('@/lib/supabase', () => ({ supabase: fake }))
vi.mock('@/lib/offlineDb', () => ({ getSnapshot: vi.fn(async () => null), setSnapshot: vi.fn(async () => undefined) }))

const { ensureNotificationForLateAttendance, ensureNotificationForPresentation, getNextNotificationNumber, getNotificationLabel } = await import('@/services/notificationService')

const late = (id: string, date = '2026-10-12', time = '08:05'): AttendanceRecord => ({ id, studentId: '1', date, time, status: 'LATE' })

const presentation = (id: string, flags: Partial<PresentationRecord> = {}): PresentationRecord => ({
  id, studentId: '1', date: '2026-10-12', status: 'NON_COMPLIANT', observation: '', checkedAt: '07:50',
  hairstyleViolation: false, uniformUsageViolation: false, nonInstitutionalGarment: false, lateEntryViolation: false, inappropriateConductViolation: false,
  ...flags,
})

function seedNotifications(count: number) {
  fake.seed('notifications', Array.from({ length: count }, (_, i) => ({
    id: i + 1, student_id: 1, attendance_id: 100 + i, presentation_control_id: null, notification_number: i + 1,
    notification_type: 'LATE_ENTRY', observation: '', date: `2026-10-0${i + 1}`, generated_at: `2026-10-0${i + 1}T08:00:00Z`, voided: false, voided_reason: null,
  })))
}

beforeEach(() => {
  fake.tables = {}
  fake.calls = []
})

describe('notificaciones por tardanza', () => {
  it('la primera tardanza genera la notificación N°1', async () => {
    const result = await ensureNotificationForLateAttendance(late('200'))
    expect(result.notificationNumber).toBe(1)
    expect(result.notificationType).toBe('LATE_ENTRY')
    expect(result.observation).toContain('08:05')
  })

  it('no duplica la notificación de una misma tardanza', async () => {
    const first = await ensureNotificationForLateAttendance(late('200'))
    const second = await ensureNotificationForLateAttendance(late('200'))
    expect(second.id).toBe(first.id)
    expect(fake.rows('notifications')).toHaveLength(1)
  })

  it('numera según las notificaciones vigentes del alumno', async () => {
    seedNotifications(2)
    const result = await ensureNotificationForLateAttendance(late('300'))
    expect(result.notificationNumber).toBe(3)
  })

  it('las notificaciones anuladas no cuentan', async () => {
    seedNotifications(2)
    fake.rows('notifications')[0].voided = true
    expect(await getNextNotificationNumber('1')).toBe(2)
  })

  it('a la 4.ª tardanza no intenta una notificación N°4: crea una alerta de reincidencia', async () => {
    seedNotifications(3)
    const result = await ensureNotificationForLateAttendance(late('400'))
    expect(result.notificationNumber).toBe(3)
    expect(fake.rows('notifications')).toHaveLength(3)
    expect(fake.rows('alerts')).toHaveLength(1)
    expect(fake.rows('alerts')[0]).toMatchObject({ alert_type: 'REPEAT_OFFENDER', student_id: 1 })
  })

  it('no duplica la alerta de reincidencia si ya hay una abierta', async () => {
    seedNotifications(3)
    fake.seed('alerts', [{ id: 1, student_id: 1, alert_type: 'REPEAT_OFFENDER', status: 'OPEN' }])
    await ensureNotificationForLateAttendance(late('400'))
    expect(fake.rows('alerts')).toHaveLength(1)
  })

  it('rechaza registros que no son tardanzas', async () => {
    await expect(ensureNotificationForLateAttendance({ ...late('200'), status: 'ON_TIME' })).rejects.toThrow(/no corresponde a una tardanza/)
    await expect(ensureNotificationForLateAttendance({ ...late('200'), id: undefined })).rejects.toThrow(/id persistido/)
  })
})

describe('notificaciones por presentación', () => {
  it('solo conducta inapropiada se clasifica como tal', async () => {
    const result = await ensureNotificationForPresentation(presentation('50', { inappropriateConductViolation: true }))
    expect(result.notificationType).toBe('INAPPROPRIATE_CONDUCT')
  })

  it('uniforme o peinado se clasifican como presentación', async () => {
    const result = await ensureNotificationForPresentation(presentation('50', { uniformUsageViolation: true, inappropriateConductViolation: true }))
    expect(result.notificationType).toBe('PRESENTATION')
  })

  it('si el único motivo es la tardanza, reutiliza la notificación de esa tardanza', async () => {
    fake.seed('attendance', [{ id: 200, student_id: 1, date: '2026-10-12', entry_time: '08:05:00', status: 'LATE' }])
    const lateNotification = await ensureNotificationForLateAttendance(late('200'))
    const result = await ensureNotificationForPresentation(presentation('50', { lateEntryViolation: true }))
    expect(result.id).toBe(lateNotification.id)
    expect(fake.rows('notifications')).toHaveLength(1)
  })

  it('no genera notificaciones para controles conformes', async () => {
    await expect(ensureNotificationForPresentation({ ...presentation('50'), status: 'COMPLIANT' })).rejects.toThrow(/incumplimientos/)
  })
})

describe('getNotificationLabel', () => {
  it('nombra cada nivel', () => {
    expect(getNotificationLabel(1)).toBe('Primera notificación')
    expect(getNotificationLabel(3)).toMatch(/citación/)
    expect(getNotificationLabel(5)).toMatch(/N° 5/)
  })
})
