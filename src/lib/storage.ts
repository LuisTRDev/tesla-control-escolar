import type { AttendanceRecord, AttendanceStatus } from '@/types'

const ATTENDANCE_KEY = 'tesla-control-attendance-v2'
const LEGACY_KEY = 'tesla-control-attendance-v1'
const LIMIT_KEY = 'tesla-control-entry-limit-v1'
const DEFAULT_LIMIT = '07:45'

export function getTodayKey() {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function getEntryLimit() {
  return localStorage.getItem(LIMIT_KEY) ?? DEFAULT_LIMIT
}

export function saveEntryLimit(value: string) {
  localStorage.setItem(LIMIT_KEY, value)
  return value
}

export function getAttendance(): AttendanceRecord[] {
  try {
    const saved = JSON.parse(localStorage.getItem(ATTENDANCE_KEY) ?? '[]') as AttendanceRecord[]
    if (saved.length) return saved

    // Migra registros de la Fase 1 si existen.
    const legacy = JSON.parse(localStorage.getItem(LEGACY_KEY) ?? '[]') as Array<Omit<AttendanceRecord, 'status'>>
    if (!legacy.length) return []
    const limit = getEntryLimit()
    const migrated = legacy.map((record) => ({ ...record, status: calculateStatus(record.time, limit) }))
    localStorage.setItem(ATTENDANCE_KEY, JSON.stringify(migrated))
    return migrated
  } catch {
    return []
  }
}

export function calculateStatus(time: string, entryLimit: string): AttendanceStatus {
  return time <= entryLimit ? 'ON_TIME' : 'LATE'
}

export function registerAttendance(studentId: string, entryLimit: string): AttendanceRecord[] {
  const current = getAttendance()
  const date = getTodayKey()
  if (current.some((item) => item.studentId === studentId && item.date === date)) return current

  const time = new Date().toLocaleTimeString('es-PE', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })

  const record: AttendanceRecord = {
    studentId,
    date,
    time,
    status: calculateStatus(time, entryLimit),
  }

  const next = [...current, record]
  localStorage.setItem(ATTENDANCE_KEY, JSON.stringify(next))
  return next
}

export function recalculateTodayAttendance(entryLimit: string): AttendanceRecord[] {
  const today = getTodayKey()
  const next = getAttendance().map((record) =>
    record.date === today
      ? { ...record, status: calculateStatus(record.time, entryLimit) }
      : record,
  )
  localStorage.setItem(ATTENDANCE_KEY, JSON.stringify(next))
  return next
}

export function clearTodayAttendance() {
  const today = getTodayKey()
  const filtered = getAttendance().filter((item) => item.date !== today)
  localStorage.setItem(ATTENDANCE_KEY, JSON.stringify(filtered))
  return filtered
}
