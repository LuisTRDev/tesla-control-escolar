import { describe, expect, it } from 'vitest'
import { extractDniCandidates, pickDni } from './dniScan'

describe('extractDniCandidates', () => {
  it('lee un DNI simple', () => {
    expect(extractDniCandidates('12345678')).toEqual(['12345678'])
  })
  it('lo encuentra dentro de un código 2D con más datos', () => {
    expect(extractDniCandidates('PE|12345678|PEREZ|JUAN|2010-05-01')).toEqual(['12345678'])
  })
  it('ignora números más largos o más cortos', () => {
    expect(extractDniCandidates('1234567 123456789')).toEqual([])
  })
  it('devuelve varios candidatos sin repetir', () => {
    expect(extractDniCandidates('11111111;22222222;11111111')).toEqual(['11111111', '22222222'])
  })
})

describe('pickDni', () => {
  it('prefiere el que existe en la base', () => {
    expect(pickDni('11111111;22222222', (d) => d === '22222222')).toBe('22222222')
  })
  it('usa el primero si ninguno existe', () => {
    expect(pickDni('11111111;22222222', () => false)).toBe('11111111')
  })
  it('devuelve null si no hay DNI', () => {
    expect(pickDni('hola', () => true)).toBeNull()
  })
})
