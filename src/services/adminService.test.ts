import { describe, expect, it, vi } from 'vitest'
import type { Classroom } from '@/types'

vi.mock('@/lib/supabase', () => ({ supabase: {} }))

const { generateTemporaryPassword, groupAppErrors, validatePassword } = await import('@/services/adminService')
const { buildRosterSheets } = await import('@/services/rosterExport')

describe('contraseñas', () => {
  it('exige 8 caracteres con letras y números', () => {
    expect(validatePassword('abc12')).toMatch(/8 caracteres/)
    expect(validatePassword('abcdefgh')).toMatch(/letras y números/)
    expect(validatePassword('tesla2026')).toBeNull()
  })

  it('la contraseña temporal siempre es válida y fácil de dictar', () => {
    for (let i = 0; i < 50; i++) {
      const password = generateTemporaryPassword()
      expect(validatePassword(password)).toBeNull()
      expect(password).not.toMatch(/[0O1lI]/)
    }
  })
})

describe('groupAppErrors', () => {
  const error = (id: string, message: string, userId: string, createdAt: string) => ({ id, createdAt, userId, module: 'Attendance', action: 'reportError', message, errorCode: null, details: {} })

  it('agrupa errores repetidos y ordena por frecuencia', () => {
    const groups = groupAppErrors([
      error('1', 'A', 'u1', '2026-10-12T08:00:00Z'),
      error('2', 'B', 'u1', '2026-10-12T09:00:00Z'),
      error('3', 'A', 'u2', '2026-10-12T10:00:00Z'),
    ])
    expect(groups.map((g) => [g.message, g.count, g.users])).toEqual([['A', 2, 2], ['B', 1, 1]])
    expect(groups[0].lastAt).toBe('2026-10-12T10:00:00Z')
  })
})

describe('buildRosterSheets', () => {
  const classrooms: Classroom[] = [{ id: 'c1', grade: '3°', section: 'A', level: 'Primaria', tutorName: '' }]
  const guardian = { id: 'g1', fullName: 'Rosa Pérez', dni: '11111111', phone: '999111222', relationship: 'Madre', isPrimary: true }
  const students = [
    { id: 's1', firstName: 'Ana', lastName: 'Quispe', classroomId: 'c1', dni: '22222222', guardianName: '', guardianDni: '', guardianPhone: '', guardians: [guardian] },
    { id: 's2', firstName: 'Luis', lastName: 'Rojas', classroomId: 'c1', dni: '22222222', guardianName: '', guardianDni: '', guardianPhone: '', guardians: [] },
    { id: 's3', firstName: 'Eva', lastName: 'Soto', classroomId: 'c1', guardianName: '', guardianDni: '', guardianPhone: '', isActive: false, inactiveReason: 'Traslado' },
  ]
  const guardians = [{ id: 'g1', fullName: 'Rosa Pérez', dni: '11111111', phone: '999111222', students: [{ studentId: 's1', relationship: 'Madre', isPrimary: true }] }]

  it('arma las hojas de alumnos, apoderados y aulas', () => {
    const sheets = buildRosterSheets(students, guardians, classrooms)
    expect(sheets.Alumnos).toHaveLength(3)
    expect(sheets.Alumnos[0]).toMatchObject({ Apellidos: 'Quispe', Grado: '3°', 'Apoderado principal': 'Rosa Pérez', Estado: 'Activo' })
    expect(sheets.Alumnos[2].Estado).toMatch(/Inhabilitado: Traslado/)
    expect(sheets.Apoderados[0]['Alumnos vinculados']).toContain('Quispe, Ana (3° A) · Madre · principal')
    expect(sheets.Aulas[0]).toMatchObject({ 'Alumnos activos': 2, Inhabilitados: 1, 'Sin apoderado': 1 })
  })

  it('lista los datos por revisar (DNI repetido, sin apoderado) sin incluir inhabilitados', () => {
    const problems = buildRosterSheets(students, guardians, classrooms)['Para revisar'].map((r) => `${r.Alumno}: ${r.Problema}`)
    expect(problems).toContain('Rojas, Luis: Sin apoderado vinculado')
    expect(problems).toContain('Quispe, Ana: DNI repetido (22222222)')
    expect(problems.some((p) => p.startsWith('Soto'))).toBe(false)
  })

  it('neutraliza fórmulas para que Excel no las ejecute', () => {
    const evil = [{ ...students[1], lastName: '=HYPERLINK("http://x")' }]
    const sheets = buildRosterSheets(evil, [], classrooms)
    expect(String(sheets.Alumnos[0].Apellidos).startsWith('=')).toBe(false)
  })
})
