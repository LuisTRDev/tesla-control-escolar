import { describe, expect, it } from 'vitest'
import { matchesQuery, normalizeText, studentMatches } from './search'

const student = { firstName: 'José Ángel', lastName: 'Núñez Rodríguez', dni: '71234567' }

describe('normalizeText', () => {
  it('quita tildes, mayúsculas y espacios extra', () => {
    expect(normalizeText('  JOSÉ   Núñez ')).toBe('jose nunez')
  })
})

describe('studentMatches', () => {
  it('encuentra sin tildes y en cualquier orden', () => {
    expect(studentMatches(student, 'nunez jose')).toBe(true)
    expect(studentMatches(student, 'ANGEL')).toBe(true)
  })

  it('encuentra por inicio de apellido', () => {
    expect(studentMatches(student, 'nu')).toBe(true)
  })

  it('tolera un error de tipeo en palabras largas', () => {
    expect(studentMatches(student, 'rodrigez')).toBe(true)
    expect(studentMatches(student, 'rodrigues')).toBe(true)
  })

  it('no acepta dos errores de tipeo', () => {
    expect(studentMatches(student, 'rodriges')).toBe(false)
  })

  it('no tolera errores en palabras cortas', () => {
    expect(studentMatches(student, 'jse')).toBe(false)
  })

  it('busca por DNI parcial', () => {
    expect(studentMatches(student, '1234')).toBe(true)
    expect(studentMatches(student, '9999')).toBe(false)
  })

  it('exige que todas las palabras coincidan', () => {
    expect(studentMatches(student, 'jose perez')).toBe(false)
  })

  it('una búsqueda vacía coincide con todos', () => {
    expect(matchesQuery(['x'], '   ')).toBe(true)
  })
})
