import { describe, expect, it } from 'vitest'
import { buildPensionMessage, formatPensionMonths, formatSoles, type PensionDue } from '@/services/pensionMessages'

const aug: PensionDue = { year: 2026, month: 8, amount: 250, dueDate: '2026-08-31' }
const sep: PensionDue = { year: 2026, month: 9, amount: 250, dueDate: '2026-09-30' }

describe('formatPensionMonths', () => {
  it('un solo mes', () => {
    expect(formatPensionMonths([sep])).toBe('septiembre de 2026')
  })

  it('varios meses del mismo año, en orden', () => {
    expect(formatPensionMonths([sep, aug, { ...sep, month: 10 }])).toBe('agosto, septiembre y octubre de 2026')
  })

  it('cruzando de año', () => {
    expect(formatPensionMonths([{ ...aug, year: 2027, month: 1 }, { ...aug, month: 12 }])).toBe('diciembre de 2026 y enero de 2027')
  })
})

describe('formatSoles', () => {
  it('sin decimales si es entero', () => {
    expect(formatSoles(500)).toBe('S/500')
    expect(formatSoles(262.5)).toBe('S/262.50')
  })
})

describe('buildPensionMessage', () => {
  it('mora: meses vencidos y total acumulado', () => {
    const text = buildPensionMessage({ type: 'PENSION_OVERDUE', guardianName: 'María López', studentNames: ['Juan Pérez', 'Ana Pérez'], months: [sep, aug] })
    expect(text).toContain('Estimado(a) María López:')
    expect(text).toContain('*agosto y septiembre de 2026*')
    expect(text).toContain('*Juan Pérez y Ana Pérez*')
    expect(text).toContain('*S/500*')
  })

  it('recordatorio: incluye la fecha de vencimiento', () => {
    const text = buildPensionMessage({ type: 'PENSION_REMINDER', guardianName: 'María López', studentNames: ['Juan Pérez'], months: [sep] })
    expect(text).toContain('vence el *30/09/2026*')
  })

  it('usa la plantilla personalizada y no deja marcadores sin reemplazar', () => {
    const text = buildPensionMessage(
      { type: 'PENSION_OVERDUE', guardianName: '', studentNames: [], months: [aug] },
      { PENSION_OVERDUE: '{saludo} {alumnos} debe {cantidad_meses}: {total}' },
    )
    expect(text).toBe('Estimado padre, madre o apoderado: su menor hijo(a) debe 1 mes: S/250')
  })
})
