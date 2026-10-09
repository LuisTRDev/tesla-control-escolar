import type { Student } from '@/types'

/** Alumno inhabilitado (abandono, suspensión...): se muestra en gris y no se marca asistencia. */
export function isInactive(student: Pick<Student, 'isActive'>): boolean {
  return student.isActive === false
}

export function isActiveStudent(student: Pick<Student, 'isActive'>): boolean {
  return student.isActive !== false
}

/** "Suspensión — 5 días por resolución N° 012" */
export function inactiveLabel(student: Pick<Student, 'inactiveReason' | 'inactiveNote'>): string {
  return [student.inactiveReason || 'Inhabilitado', student.inactiveNote].filter(Boolean).join(' — ')
}
