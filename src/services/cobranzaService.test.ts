import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/supabase', () => ({ supabase: {} }))

const { computeDebtStatus } = await import('@/services/cobranzaService')

describe('computeDebtStatus', () => {
  const today = '2026-10-20'

  it('pagado siempre está al día', () => {
    expect(computeDebtStatus(true, '2026-09-30', today)).toBe('AL_DIA')
  })

  it('vencido y sin pagar es moroso', () => {
    expect(computeDebtStatus(false, '2026-10-19', today)).toBe('MOROSO')
  })

  it('el mismo día del vencimiento NO es moroso', () => {
    expect(computeDebtStatus(false, '2026-10-20', today)).toBe('POR_VENCER')
  })

  it('vence dentro de 5 días: por vencer (incluye el día 5)', () => {
    expect(computeDebtStatus(false, '2026-10-25', today)).toBe('POR_VENCER')
  })

  it('vence en más de 5 días: al día', () => {
    expect(computeDebtStatus(false, '2026-10-26', today)).toBe('AL_DIA')
  })

  it('cruza fin de mes correctamente', () => {
    expect(computeDebtStatus(false, '2026-11-02', '2026-10-28')).toBe('POR_VENCER')
  })
})
