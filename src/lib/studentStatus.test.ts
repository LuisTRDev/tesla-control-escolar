import { describe, expect, it } from 'vitest'
import { inactiveLabel, isActiveStudent, isInactive } from '@/lib/studentStatus'

describe('studentStatus', () => {
  it('solo is_active = false cuenta como inhabilitado', () => {
    expect(isInactive({ isActive: false })).toBe(true)
    expect(isInactive({ isActive: true })).toBe(false)
    expect(isInactive({})).toBe(false)
    expect(isActiveStudent({})).toBe(true)
  })

  it('arma el texto con motivo y detalle', () => {
    expect(inactiveLabel({ inactiveReason: 'Suspensión', inactiveNote: '5 días' })).toBe('Suspensión — 5 días')
    expect(inactiveLabel({ inactiveReason: 'Abandono', inactiveNote: '' })).toBe('Abandono')
    expect(inactiveLabel({})).toBe('Inhabilitado')
  })
})
