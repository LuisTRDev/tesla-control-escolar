/**
 * Mapa de calor de llegadas: cuántos alumnos ingresan en cada franja horaria según
 * el día de la semana, para ver patrones (lunes más tarde, hora pico, etc.).
 */

export type ArrivalRecord = { date: string; time: string; status: 'ON_TIME' | 'LATE' }

export type HeatmapCell = { total: number; late: number }

export type ArrivalHeatmap = {
  /** Días con registros, de lunes (1) a domingo (7). */
  days: Array<{ weekday: number; label: string; total: number; late: number; schoolDays: number }>
  /** Inicio de cada franja en minutos desde medianoche. */
  buckets: number[]
  bucketMinutes: number
  /** cells[díaIndex][franjaIndex] */
  cells: HeatmapCell[][]
  max: number
  peak: { weekday: number; label: string; bucket: number; total: number } | null
  total: number
}

const WEEKDAY_LABELS = ['', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']
const MAX_COLUMNS = 24

function toMinutes(time: string): number | null {
  const match = /^(\d{2}):(\d{2})/.exec(time)
  if (!match) return null
  const minutes = Number(match[1]) * 60 + Number(match[2])
  return minutes >= 0 && minutes < 24 * 60 ? minutes : null
}

/** Día ISO (1 = lunes … 7 = domingo) de una fecha "AAAA-MM-DD", sin depender de la zona horaria. */
export function isoWeekday(date: string): number {
  const day = new Date(`${date}T12:00:00Z`).getUTCDay()
  return day === 0 ? 7 : day
}

export function formatMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `${h}:${String(m).padStart(2, '0')}`
}

/** Percentil sobre una lista ya ordenada. */
function percentile(sorted: number[], p: number) {
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor((sorted.length - 1) * p)))]
}

export function buildArrivalHeatmap(records: ArrivalRecord[]): ArrivalHeatmap {
  const valid = records
    .map((record) => ({ ...record, minutes: toMinutes(record.time), weekday: isoWeekday(record.date) }))
    .filter((record): record is ArrivalRecord & { minutes: number; weekday: number } => record.minutes !== null)

  if (!valid.length) return { days: [], buckets: [], bucketMinutes: 5, cells: [], max: 0, peak: null, total: 0 }

  // El rango ignora el 2 % de valores extremos (marcas corregidas a mano a las 12:00, etc.)
  // para que el mapa se concentre en el horario real de ingreso.
  const sorted = valid.map((r) => r.minutes).sort((a, b) => a - b)
  const low = percentile(sorted, 0.02)
  const high = percentile(sorted, 0.98)
  const span = Math.max(1, high - low + 1)
  const bucketMinutes = [5, 10, 15, 30, 60].find((size) => Math.ceil(span / size) <= MAX_COLUMNS) ?? 60
  const start = Math.floor(low / bucketMinutes) * bucketMinutes
  const count = Math.max(1, Math.ceil((high + 1 - start) / bucketMinutes))
  const buckets = Array.from({ length: count }, (_, i) => start + i * bucketMinutes)

  const weekdays = [...new Set(valid.map((r) => r.weekday))].sort((a, b) => a - b)
  const dayIndex = new Map(weekdays.map((weekday, index) => [weekday, index]))
  const cells: HeatmapCell[][] = weekdays.map(() => buckets.map(() => ({ total: 0, late: 0 })))
  const dates = weekdays.map(() => new Set<string>())
  const dayTotals = weekdays.map(() => ({ total: 0, late: 0 }))

  for (const record of valid) {
    const d = dayIndex.get(record.weekday)!
    // Los extremos se acumulan en la primera o última franja en vez de perderse.
    const b = Math.min(count - 1, Math.max(0, Math.floor((record.minutes - start) / bucketMinutes)))
    cells[d][b].total += 1
    dayTotals[d].total += 1
    if (record.status === 'LATE') { cells[d][b].late += 1; dayTotals[d].late += 1 }
    dates[d].add(record.date)
  }

  let max = 0
  let peak: ArrivalHeatmap['peak'] = null
  cells.forEach((row, d) => row.forEach((cell, b) => {
    if (cell.total > max) {
      max = cell.total
      peak = { weekday: weekdays[d], label: WEEKDAY_LABELS[weekdays[d]], bucket: buckets[b], total: cell.total }
    }
  }))

  return {
    days: weekdays.map((weekday, index) => ({ weekday, label: WEEKDAY_LABELS[weekday], ...dayTotals[index], schoolDays: dates[index].size })),
    buckets,
    bucketMinutes,
    cells,
    max,
    peak,
    total: valid.length,
  }
}
