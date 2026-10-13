import { describe, expect, it } from 'vitest'
import { buildArrivalHeatmap, formatMinutes, isoWeekday, type ArrivalRecord } from '@/lib/heatmap'

const at = (date: string, time: string, status: ArrivalRecord['status'] = 'ON_TIME'): ArrivalRecord => ({ date, time, status })

describe('isoWeekday', () => {
  it('lunes es 1 y domingo es 7, sin depender de la zona horaria', () => {
    expect(isoWeekday('2026-10-12')).toBe(1) // lunes
    expect(isoWeekday('2026-10-16')).toBe(5) // viernes
    expect(isoWeekday('2026-10-18')).toBe(7) // domingo
  })
})

describe('buildArrivalHeatmap', () => {
  it('sin datos devuelve un mapa vacío', () => {
    expect(buildArrivalHeatmap([])).toMatchObject({ total: 0, days: [], peak: null })
  })

  it('agrupa por día de la semana y franjas de 5 minutos', () => {
    const map = buildArrivalHeatmap([
      at('2026-10-12', '07:31'), at('2026-10-12', '07:33'), at('2026-10-12', '07:47', 'LATE'),
      at('2026-10-13', '07:36'),
    ])
    expect(map.bucketMinutes).toBe(5)
    expect(map.days.map((d) => d.label)).toEqual(['Lunes', 'Martes'])
    expect(map.buckets[0]).toBe(7 * 60 + 30)
    expect(map.cells[0][0]).toEqual({ total: 2, late: 0 })
    expect(map.days[0]).toMatchObject({ total: 3, late: 1, schoolDays: 1 })
    expect(map.peak).toMatchObject({ label: 'Lunes', total: 2, bucket: 450 })
  })

  it('usa franjas más grandes si el horario es muy amplio', () => {
    const records = Array.from({ length: 50 }, (_, i) => at('2026-10-12', formatMinutes(7 * 60 + i * 6).padStart(5, '0')))
    const map = buildArrivalHeatmap(records)
    expect(map.bucketMinutes).toBeGreaterThan(5)
    expect(map.buckets.length).toBeLessThanOrEqual(24)
  })

  it('las horas extremas (correcciones manuales) no deforman el mapa', () => {
    const records = [...Array.from({ length: 99 }, () => at('2026-10-12', '07:40')), at('2026-10-12', '13:00')]
    const map = buildArrivalHeatmap(records)
    expect(map.bucketMinutes).toBe(5)
    expect(map.total).toBe(100)
  })

  it('ignora horas inválidas', () => {
    expect(buildArrivalHeatmap([at('2026-10-12', ''), at('2026-10-12', 'xx')]).total).toBe(0)
  })
})
