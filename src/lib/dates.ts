/**
 * Fechas "de calendario" en la hora LOCAL del dispositivo (Perú, UTC-5).
 *
 * No usar `date.toISOString().slice(0, 10)` para obtener el día: convierte a UTC
 * y desde las 19:00 devuelve la fecha de mañana.
 */

const pad = (value: number) => String(value).padStart(2, '0')

/** 'YYYY-MM-DD' de la fecha dada (por defecto hoy) en hora local. */
export function toDateKey(date: Date = new Date()): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/** Suma (o resta) días a una fecha 'YYYY-MM-DD' y devuelve otra 'YYYY-MM-DD'. */
export function addDaysToKey(dateKey: string, days: number): string {
  // Mediodía local: evita saltos por cambios de horario al sumar días.
  const date = new Date(`${dateKey}T12:00:00`)
  date.setDate(date.getDate() + days)
  return toDateKey(date)
}

/** Primer y último día del mes de la fecha dada, como 'YYYY-MM-DD'. */
export function monthRangeKeys(date: Date = new Date()): { from: string; to: string } {
  const y = date.getFullYear()
  const m = date.getMonth()
  return { from: toDateKey(new Date(y, m, 1)), to: toDateKey(new Date(y, m + 1, 0)) }
}

/** Último día del mes (month: 1-12) como 'YYYY-MM-DD'. */
export function lastDayOfMonthKey(year: number, month: number): string {
  return toDateKey(new Date(year, month, 0))
}

/** Recorta 'HH:MM:SS' de Postgres a 'HH:MM'. */
export function trimTime(value?: string | null): string {
  return (value ?? '').slice(0, 5)
}
