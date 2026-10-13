import { describe, expect, it } from 'vitest'
import { describeConflict, resolveEarliestTime, resolvePresentation, type PresentationSide, type SyncConflict } from '@/lib/syncConflicts'

describe('resolveEarliestTime', () => {
  it('gana la hora más temprana', () => {
    expect(resolveEarliestTime('07:30', '07:50')).toBe('KEEP_REMOTE')
    expect(resolveEarliestTime('07:50:00', '07:30')).toBe('USE_LOCAL')
  })

  it('con la misma hora se conserva lo que ya está en el servidor', () => {
    expect(resolveEarliestTime('07:40:00', '07:40')).toBe('KEEP_REMOTE')
  })

  it('una tardanza sin hora no reemplaza una marca con hora', () => {
    expect(resolveEarliestTime('08:10:00', '')).toBe('KEEP_REMOTE')
  })

  it('sin hora en el servidor usa la local', () => {
    expect(resolveEarliestTime(null, '07:40')).toBe('USE_LOCAL')
    expect(resolveEarliestTime('', '07:40')).toBe('USE_LOCAL')
  })
})

describe('resolvePresentation', () => {
  const ok: PresentationSide = { status: 'COMPLIANT', violations: [], observation: '' }
  const uniform: PresentationSide = { status: 'NON_COMPLIANT', violations: ['UNIFORM_INCOMPLETE'], observation: 'Sin corbata' }

  it('sin registro previo usa el local', () => {
    expect(resolvePresentation(null, ok).action).toBe('USE_LOCAL')
  })

  it('un conforme no borra una incidencia', () => {
    expect(resolvePresentation(uniform, ok)).toEqual({ action: 'KEEP_REMOTE', result: uniform })
  })

  it('una incidencia sí reemplaza a un conforme', () => {
    expect(resolvePresentation(ok, uniform)).toEqual({ action: 'USE_LOCAL', result: uniform })
  })

  it('dos incidencias distintas se unen sin repetir', () => {
    const hair: PresentationSide = { status: 'NON_COMPLIANT', violations: ['HAIRSTYLE', 'UNIFORM_INCOMPLETE'], observation: 'Cabello largo' }
    expect(resolvePresentation(uniform, hair)).toEqual({
      action: 'MERGE',
      result: { status: 'NON_COMPLIANT', violations: ['HAIRSTYLE', 'UNIFORM_INCOMPLETE'], observation: 'Sin corbata / Cabello largo' },
    })
  })

  it('si el local no aporta nada nuevo, se deja el del servidor', () => {
    const same: PresentationSide = { status: 'NON_COMPLIANT', violations: ['UNIFORM_INCOMPLETE'], observation: '' }
    expect(resolvePresentation(uniform, same).action).toBe('KEEP_REMOTE')
  })
})

describe('describeConflict', () => {
  const base: SyncConflict = { id: '1', at: '', kind: 'ENTRY', studentId: '1', date: '2026-10-12', resolution: 'KEEP_REMOTE', localValue: '07:50', remoteValue: '07:30' }

  it('explica qué hora se conservó', () => {
    expect(describeConflict(base)).toContain('07:30')
    expect(describeConflict({ ...base, resolution: 'USE_LOCAL' })).toMatch(/hora anterior \(07:50\)/)
  })

  it('explica la unión de incidencias', () => {
    expect(describeConflict({ ...base, kind: 'PRESENTATION', resolution: 'MERGE', localValue: 'Incidencia: peinado', remoteValue: 'Incidencia: uniforme' })).toMatch(/Se unieron/)
  })
})
