import { describe, expect, it } from 'vitest'
import { addDaysToKey, lastDayOfMonthKey, monthRangeKeys, toDateKey, trimTime } from '@/lib/dates'

describe('toDateKey', () => {
  it('usa el día local aunque sea de noche (no salta al día siguiente como UTC)', () => {
    expect(toDateKey(new Date(2026, 9, 31, 20, 30))).toBe('2026-10-31')
    expect(toDateKey(new Date(2026, 9, 31, 23, 59))).toBe('2026-10-31')
  })

  it('rellena mes y día con cero', () => {
    expect(toDateKey(new Date(2026, 0, 5, 8, 0))).toBe('2026-01-05')
  })
})

describe('addDaysToKey', () => {
  it('cruza fin de mes y de año', () => {
    expect(addDaysToKey('2026-10-31', 1)).toBe('2026-11-01')
    expect(addDaysToKey('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDaysToKey('2026-03-01', -1)).toBe('2026-02-28')
  })

  it('suma varios días', () => {
    expect(addDaysToKey('2026-10-28', 5)).toBe('2026-11-02')
    expect(addDaysToKey('2026-10-09', -6)).toBe('2026-10-03')
  })
})

describe('monthRangeKeys / lastDayOfMonthKey', () => {
  it('devuelve el primer y último día del mes', () => {
    expect(monthRangeKeys(new Date(2026, 9, 15))).toEqual({ from: '2026-10-01', to: '2026-10-31' })
  })

  it('respeta años bisiestos', () => {
    expect(monthRangeKeys(new Date(2028, 1, 10))).toEqual({ from: '2028-02-01', to: '2028-02-29' })
    expect(lastDayOfMonthKey(2026, 2)).toBe('2026-02-28')
    expect(lastDayOfMonthKey(2026, 12)).toBe('2026-12-31')
  })
})

describe('trimTime', () => {
  it('recorta HH:MM:SS a HH:MM y tolera null', () => {
    expect(trimTime('07:45:12')).toBe('07:45')
    expect(trimTime(null)).toBe('')
    expect(trimTime(undefined)).toBe('')
  })
})
